import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const SCREENSHOTS_DIR = path.resolve(process.cwd(), 'docs', 'screenshots');

test.beforeAll(() => {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
});

async function dismissCardIfVisible(page: Page) {
  const dismissBtn = page.getByTestId('btn-dismiss-card');
  if (await dismissBtn.isVisible({ timeout: 400 }).catch(() => false)) {
    await dismissBtn.click();
  }
}

test.describe('Capital City — E2E Multi-Navigateurs, Plateaux, Tutoriel & Responsive', () => {
  test('1. Tutoriel premier lancement, Atlas des 3 plateaux et Responsive Mobile sans débordement', async ({
    page,
  }) => {
    let homeDocLoads = 0;
    const pageErrors: string[] = [];
    page.on('request', (req) => {
      if (
        req.isNavigationRequest() &&
        req.resourceType() === 'document' &&
        new URL(req.url()).pathname === '/'
      ) {
        homeDocLoads += 1;
      }
    });
    page.on('pageerror', (err) => {
      pageErrors.push(err.message);
    });

    await page.goto('/');
    const bootMarker = await page.evaluate(() => {
      const id = `boot-${Math.random().toString(36).slice(2)}`;
      (window as unknown as { __ccBootMarker?: string }).__ccBootMarker = id;
      return id;
    });

    // L'animation d'ouverture de jeu s'affiche dès l'arrivée hors partie
    const arrivalIntro = page.getByTestId('game-arrival-intro');
    await expect(arrivalIntro).toBeVisible({ timeout: 4000 });
    await page.waitForTimeout(450);
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, '00-arrival-intro.png'),
      fullPage: false,
    });
    await expect(arrivalIntro).toBeHidden({ timeout: 5000 });

    // Le tutoriel interactif s'ouvre automatiquement juste après l'animation d'arrivée
    const tutorial = page.getByTestId('tutorial-modal');
    await expect(tutorial).toBeVisible({ timeout: 8000 });
    await expect(tutorial).toContainText('Étape 1 / 11');

    // Aucune boucle de rechargement de page pendant l'animation d'ouverture et le showcase
    const currentBootMarker = await page.evaluate(
      () => (window as unknown as { __ccBootMarker?: string }).__ccBootMarker,
    );
    expect(currentBootMarker).toBe(bootMarker);
    expect(homeDocLoads).toBe(1);
    expect(pageErrors).toEqual([]);

    // Avancer dans le tutoriel puis le passer
    await tutorial.getByRole('button', { name: 'Suivant' }).click();
    await expect(tutorial).toContainText('Étape 2 / 11');
    await tutorial.getByRole('button', { name: 'Passer le tutoriel' }).click();
    await expect(tutorial).toBeHidden();

    // Le mini-plateau animé en direct est actif sur l'accueil hors partie
    await expect(page.getByTestId('live-board-showcase')).toBeVisible();

    // Capture Accueil Desktop (avec le plateau animé en direct)
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, '01-home-desktop.png'),
      fullPage: false,
    });

    // Possibilité de relancer et passer l'intro à la demande
    await page.getByTestId('btn-replay-intro').click();
    await expect(arrivalIntro).toBeVisible();
    await page.getByTestId('btn-skip-intro').click();
    await expect(arrivalIntro).toBeHidden();

    // Réouverture du tutoriel depuis la barre de navigation
    await page.getByTestId('nav-tutorial').click();
    await expect(tutorial).toBeVisible();
    await tutorial.getByRole('button', { name: 'Passer le tutoriel' }).click();

    // Exploration de l'Atlas des 3 plateaux (40 cases chacun)
    await page.getByTestId('nav-boards').click();
    await expect(page).toHaveURL(/\/boards/);
    await expect(page.getByTestId('game-board')).toBeVisible();
    await expect(page.getByTestId('board-cell-0')).toBeVisible();
    await expect(page.getByTestId('board-cell-39')).toBeVisible();

    // 1) Asteria City
    await page.getByTestId('board-cell-39').click();
    await expect(page.locator('main')).toContainText('Tour Horizon');
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, '02-board-asteria-city.png'),
    });

    // 2) Riviera District
    await page.getByTestId('select-pack-riviera-district').click();
    await expect(page.locator('main')).toContainText('Villa Azur');
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, '03-board-riviera-district.png'),
    });

    // 3) Nova Frontier
    await page.getByTestId('select-pack-nova-frontier').click();
    await expect(page.locator('main')).toContainText('Station Solstice');
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, '04-board-nova-frontier.png'),
    });

    // Vérification Responsive Mobile (390x844) sans débordement horizontal
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await expect(page.getByTestId('cta-create-room')).toBeVisible();
    const overflowHome = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    expect(overflowHome).toBe(false);
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, '05-home-mobile.png'),
    });
  });

  test('2. Partie multijoueur complète à 2 navigateurs : Salon, Pions, Dés, Enchères/Achats, Échanges, Patrimoine & Reconnexion', async ({
    browser,
  }) => {
    const hostContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const guestContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });

    const preseedPrefs = () => {
      window.localStorage.setItem(
        'capital-city-ui-prefs-v1',
        JSON.stringify({
          state: {
            displayName: '',
            preferredToken: 'skyline-tower',
            selectedPreviewPack: 'asteria-city',
            reducedMotion: true,
            soundEnabled: false,
            tutorialCompleted: true,
            tutorialStep: 0,
            recentRoomCodes: [],
          },
          version: 0,
        }),
      );
    };

    await hostContext.addInitScript(preseedPrefs);
    await guestContext.addInitScript(preseedPrefs);

    const hostPage = await hostContext.newPage();
    const guestPage = await guestContext.newPage();

    try {
      // 1. Hôte (Alice) crée une salle privée sur Asteria City
      await hostPage.goto('/create');
      await hostPage.getByTestId('input-player-name').fill('Alice');
      await hostPage.getByTestId('input-room-name').fill('Salon Prestige E2E');
      await hostPage.getByTestId('token-option-skyline-tower').click();
      await hostPage.getByTestId('submit-create-room').click();

      await expect(hostPage.getByTestId('lobby-view')).toBeVisible({ timeout: 15_000 });
      const roomCode = (await hostPage.getByTestId('lobby-room-code').innerText()).trim();
      expect(roomCode).toMatch(/^AST-[A-Z0-9]{4}$/);

      // 2. Invité (Bruno) rejoint via la page /join avec le code d'invitation
      await guestPage.goto('/join');
      await guestPage.getByTestId('join-player-name').fill('Bruno');
      await guestPage.getByTestId('join-room-code').fill(roomCode);
      await guestPage.getByTestId('submit-join-room').click();

      await expect(guestPage.getByTestId('lobby-view')).toBeVisible({ timeout: 15_000 });

      // Vérifier la présence synchronisée des 2 joueurs dans les deux navigateurs
      await expect(hostPage.getByTestId('lobby-player-Alice')).toBeVisible();
      await expect(hostPage.getByTestId('lobby-player-Bruno')).toBeVisible();
      await expect(guestPage.getByTestId('lobby-player-Alice')).toBeVisible();
      await expect(guestPage.getByTestId('lobby-player-Bruno')).toBeVisible();

      // Le pion choisi par Alice doit être verrouillé chez Bruno
      await expect(guestPage.getByTestId('lobby-token-skyline-tower')).toBeDisabled();
      await guestPage.getByTestId('lobby-token-maglev-train').click();

      // Bruno se déclare prêt
      await guestPage.getByTestId('lobby-ready-btn').click();
      await expect(hostPage.getByTestId('lobby-start-btn')).toBeEnabled();

      await hostPage.screenshot({
        path: path.join(SCREENSHOTS_DIR, '06-lobby-multiplayer.png'),
      });

      // 3. Alice lance la partie -> synchronisation immédiate des 2 navigateurs
      await hostPage.getByTestId('lobby-start-btn').click();
      await expect(hostPage.getByTestId('game-screen')).toBeVisible({ timeout: 15_000 });
      await expect(guestPage.getByTestId('game-screen')).toBeVisible({ timeout: 15_000 });

      await hostPage.screenshot({
        path: path.join(SCREENSHOTS_DIR, '07-game-desktop.png'),
      });

      // Capture Mobile de l'écran de jeu en direct sur l'invité puis retour Desktop
      await guestPage.setViewportSize({ width: 390, height: 844 });
      const overflowGameMobile = await guestPage.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth + 1,
      );
      expect(overflowGameMobile).toBe(false);
      await guestPage.screenshot({
        path: path.join(SCREENSHOTS_DIR, '08-game-mobile.png'),
      });
      await guestPage.setViewportSize({ width: 1440, height: 900 });

      // 4. Jouer jusqu'à déclencher une opportunité d'achat / enchère (max 12 lancers)
      let auctionTested = false;
      let auctionWinnerPage: Page = guestPage;
      for (let step = 0; step < 12; step++) {
        await dismissCardIfVisible(hostPage);
        await dismissCardIfVisible(guestPage);

        const hostCanRoll = await hostPage
          .getByTestId('btn-roll-dice')
          .isEnabled()
          .catch(() => false);
        const activePage = hostCanRoll ? hostPage : guestPage;
        const otherPage = hostCanRoll ? guestPage : hostPage;

        if (
          await activePage
            .getByTestId('btn-roll-dice')
            .isEnabled()
            .catch(() => false)
        ) {
          await activePage.getByTestId('btn-roll-dice').click();
        }

        // Attendre la stabilisation de la transition serveur
        await activePage.waitForTimeout(350);
        await dismissCardIfVisible(hostPage);
        await dismissCardIfVisible(guestPage);

        const canDecline = await activePage
          .getByTestId('btn-decline-property')
          .isVisible()
          .catch(() => false);

        if (canDecline && !auctionTested) {
          // Déclencher une enchère temps réel !
          await activePage.getByTestId('btn-decline-property').click();
          await expect(activePage.getByTestId('auction-modal')).toBeVisible({ timeout: 8000 });
          await expect(otherPage.getByTestId('auction-modal')).toBeVisible({ timeout: 8000 });

          await otherPage.screenshot({
            path: path.join(SCREENSHOTS_DIR, '09-auction-modal.png'),
          });

          // L'autre joueur place une offre puis le premier passe -> adjudication !
          await otherPage.getByTestId('auction-quick-bid-15').click();
          await activePage.getByTestId('btn-auction-pass').click();

          await expect(activePage.getByTestId('auction-modal')).toBeHidden({ timeout: 8000 });
          auctionWinnerPage = otherPage;
          auctionTested = true;
          break;
        } else if (canDecline) {
          await activePage.getByTestId('btn-buy-property').click();
        }

        const endTurnVisible = await activePage
          .getByTestId('btn-end-turn')
          .isEnabled()
          .catch(() => false);
        if (endTurnVisible) {
          await activePage.getByTestId('btn-end-turn').click();
        }
      }
      expect(auctionTested).toBe(true);

      // 5. Ouverture du gestionnaire de Patrimoine sur l'acquéreur (Constructions & Hypothèques)
      await auctionWinnerPage.getByTestId('btn-open-assets').click();
      await expect(auctionWinnerPage.getByTestId('asset-manager-modal')).toBeVisible();
      await auctionWinnerPage.screenshot({
        path: path.join(SCREENSHOTS_DIR, '10-asset-manager.png'),
      });
      await auctionWinnerPage.keyboard.press('Escape');
      await expect(auctionWinnerPage.getByTestId('asset-manager-modal')).toBeHidden();

      // 6. Échange complet entre Alice et Bruno (Proposition -> Aperçu obligatoire -> Envoi -> Acceptation confirmée)
      await hostPage.getByTestId('btn-open-trades').click();
      await expect(hostPage.getByTestId('trade-modal')).toBeVisible();
      await hostPage.getByTestId('trade-offered-cash').fill('50');
      await hostPage.getByTestId('btn-preview-trade').click();
      await expect(hostPage.getByTestId('trade-preview-step')).toBeVisible();

      await hostPage.screenshot({
        path: path.join(SCREENSHOTS_DIR, '11-trade-preview.png'),
      });

      await hostPage.getByTestId('btn-send-trade').click();
      await hostPage.keyboard.press('Escape');

      // Bruno voit le badge d'offre entrante "(1)", ouvre la modale et accepte avec confirmation
      await expect(guestPage.getByTestId('btn-open-trades')).toContainText('(1)');
      await guestPage.getByTestId('btn-open-trades').click();
      await expect(guestPage.getByTestId('trade-modal')).toBeVisible();
      await guestPage.locator('[data-testid^="btn-accept-trade-"]').first().click();
      await guestPage.locator('[data-testid^="btn-confirm-accept-trade-"]').first().click();
      await guestPage.keyboard.press('Escape');

      // Le journal d'activité sur les deux navigateurs atteste de l'accord conclu
      await expect(hostPage.getByTestId('activity-log-entries')).toContainText(
        'Bruno accepte l’échange proposé par Alice !',
      );
      await expect(guestPage.getByTestId('activity-log-entries')).toContainText(
        'Bruno accepte l’échange proposé par Alice !',
      );

      // 7. Rechargement complet de la page de Bruno -> reconnexion transparente et état intact
      await guestPage.reload();
      await expect(guestPage.getByTestId('game-screen')).toBeVisible({ timeout: 15_000 });
      await expect(guestPage.getByTestId('activity-log-entries')).toContainText(
        'Bruno accepte l’échange proposé par Alice !',
      );
    } finally {
      await hostContext.close();
      await guestContext.close();
    }
  });
});
