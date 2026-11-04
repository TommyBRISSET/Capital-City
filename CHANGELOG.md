# Journal des modifications

Toutes les modifications notables du projet **Capital City** sont documentées dans ce fichier.

Le format suit [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/) et le projet adhère au [Semantic Versioning](https://semver.org/lang/fr/).

## [1.1.1] - 2026-11-04

### Corrigé

- **Stabilisation HMR de la page d'accueil (`apps/web`, `packages/shared`, `scripts/`)** :
  - Isolation stricte des répertoires de compilation Next.js dans `apps/web/next.config.ts` (`PHASE_DEVELOPMENT_SERVER` vers `.next-dev` contre `.next` pour `next build` et `next start`), empêchant `npm run build` d'écraser le manifeste d'un serveur `next dev` actif.
  - Découplage des fonctions serveur `signSessionToken` et `verifySessionToken` (`node:crypto`) vers le sous-chemin dédié `@capital-city/shared/session` afin d'exclure tout module natif Node.js des paquets clients React.
  - Exécution du serveur de développement via `next dev --webpack` sous Windows, stabilisation par référence (`onCompleteRef` / `useCallback`) du minuteur de `GameArrivalIntro` et ajout d'un garde-fou anti-rechargement dans `tests/e2e/game.spec.ts`.
  - Ajout de `scripts/prisma-generate-safe.mjs` pour éviter les erreurs Windows `EPERM` sur le binaire Prisma lorsque les serveurs locaux sont déjà actifs.

## [1.1.0] - 2026-11-04

### Ajouté

- **Animation d'ouverture et plateau vivant hors partie (`GameArrivalIntro` et `LiveBoardShowcase`)** :
  - Séquence cinématique d'arrivée sur l'accueil (`apps/web/src/components/home/GameArrivalIntro.tsx`) : couronne de 12 cases illuminées en cascade, lancer animé d'un double 6, entrée des pions originaux et badge `+200 Cr`, passable instantanément et respectant `prefers-reduced-motion`.
  - Scène de jeu animée en continu dans la section principale de l'accueil hors partie (`apps/web/src/components/home/LiveBoardShowcase.tsx`) : mini-plateau `5×5` interactif commutable entre **Asteria City**, **Riviera District** et **Nova Frontier**, déplacement fluide des 3 pions, lancers de dés, apparitions de maisons et d'hôtels, bandeaux d'événements et bouton de relecture de l'introduction.

## [1.0.0] - 2026-11-04

### Ajouté

- **Validation E2E multi-navigateurs et publication v1 (`tests/e2e/game.spec.ts`)** :
  - Parcours automatisés Playwright couvrant le tutoriel interactif de premier lancement (11 étapes), l'atlas interactif des 3 plateaux originaux (**Asteria City**, **Riviera District**, **Nova Frontier**), l'absence de débordement horizontal sur mobile (`390×844`), la création et la jonction de salle privée à 2 navigateurs simultanés, l'exclusivité des pions, les dés serveur, les enchères ouvertes temps réel, le gestionnaire de patrimoine, les échanges avec aperçu obligatoire et confirmation d'acceptation, ainsi que la reconnexion transparente après rechargement.
  - Génération et inspection visuelle des captures de référence ordinateur et mobile dans `docs/screenshots/`.

### Corrigé

- **Système graphique et affichage adaptatif mobile** :
  - Ajout de la directive Tailwind CSS v4 `@source "../../../../packages/ui/src";` dans `apps/web/src/app/globals.css` et montage des modales via `createPortal(..., document.body)` dans `packages/ui/src/primitives.tsx`.
  - Grille `11×11` stricte `minmax(0, 1fr)` sur `GameBoard` et en-tête compact `AppHeader` garantissant un plateau carré et zéro débordement horizontal dès `390px` de largeur.
  - Lancement direct des processus Node.js (`tsx/cli` et `next`) et écoute `0.0.0.0` dans `scripts/dev-orchestrator.mjs`.

## [0.9.0-rc.1] - 2026-11-04

### Ajouté

- **Sécurité, accessibilité et finition** :
  - En-têtes HTTP de sécurité dans `next.config.ts` (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`) et garde CSRF `Origin`/`Host` avec plafond de 16 Ko sur les mutations HTTP (`verifyMutationSecurity`).
  - Accessibilité clavier renforcée (lien d'évitement vers le contenu principal, synchronisation `html[data-reduced-motion='true']` couplée à `prefers-reduced-motion`).
  - Synchronisation ordonnée de l'orchestrateur local (`dev-orchestrator.mjs`) garantissant la disponibilité de PostgreSQL et Socket.IO avant le serveur web.

## [0.7.0] - 2026-11-04

### Ajouté

- **Expérience de jeu complète temps réel (`/room/[code]`)** :
  - `LobbyView` : code court et lien d'invitation copiables en un clic, accueil direct invité sans session préalable, sélection interactive des 8 pions avec verrouillage des pions pris, configuration des règles par l'hôte, états prêt/lancer et discussion de salle.
  - `GameScreen` adaptatif ordinateur et mobile : plateau central de 40 cases, `DiceDisplay` animé, indicateur de tour et d'action attendue, fiche de propriété inspectable, barre d'actions mobile accessible au pouce, bannière de connexion/reconnexion non destructive et retours sonores Web Audio.
  - Modales métier complètes : `BuyDecisionPanel`, `AuctionModal` avec compte à rebours serveur, `AssetManagerModal` (constructions et ventes équilibrées, stocks de la banque, hypothèques et levées avec confirmations), `TradeModal` (aperçu obligatoire avant envoi, acceptation confirmée, refus, annulation, contre-proposition), `CardRevealModal`, `ActivityLogPanel` filtrable et `GameOverModal` avec revanche.

## [0.5.0] - 2026-11-04

### Ajouté

- **Serveur temps réel autoritaire (`@capital-city/realtime`)** :
  - Authentification WebSocket stricte via jeton signé HMAC (`verifySessionToken`) dans le middleware Socket.IO.
  - Orchestration complète des salles et parties (`RoomManager`) : verrous asynchrones par salle, minuteurs serveur d'expiration d'enchères et de délai de grâce de déconnexion, assainissement systématique des paquets de cartes secrets (`toPublicGameState`).
  - Coordinateur Redis (`RealtimeCoordinator` sous `ioredis`) pour la présence temps réel et la limitation de débit par joueur, avec repli mémoire automatique documenté en développement et test local.
  - Prise en charge de l'ensemble du protocole d'événements temps réel (`game:command` et alias directs, `room:*`, `game:start`, `game:resume`, `game:rematch`, `chat:send`).
- **Tests d'intégration multi-clients Socket.IO** : scénario temps réel à 3 joueurs dans `tests/integration/realtime-multiplayer.test.ts` (authentification, salon, enchère, échange, déconnexion/reconnexion et redémarrage complet du serveur).

## [0.4.0] - 2026-11-04

### Ajouté

- **Persistance transactionnelle et reprise (`GameRepository`)** :
  - Gestion relationnelle complète des salles (`GameRoom`), transfert automatique de l'hôte en cas de départ dans le salon, unicité stricte des pions et préparation de revanche (`resetRoomForRematch`).
  - Transactions atomiques Prisma synchronisant `Game`, `Player`, `AssetOwnership`, `CardDeck`, `TradeOffer`, journal immuable `GameEvent` et instantanés périodiques `GameSnapshot`.
  - Garantie d'idempotence via `ProcessedCommand` (`gameId` + `commandId`), verrouillage optimiste sur `Game.version` (`STALE_STATE`) et reprise automatique au démarrage serveur (`recoverActiveGames`).
- **Tests d'intégration PostgreSQL** : validation de bout en bout dans `tests/integration/persistence-recovery.test.ts`.

## [0.3.0] - 2026-11-04

### Ajouté

- **Moteur de règles pur (`@capital-city/game-engine`)** :
  - Registre financier transactionnel centralisé (`transferCredits`) garantissant l'intégrité des montants entiers, la solvabilité, la journalisation et le passage en résolution de dette (`DEBT_RESOLUTION`).
  - Boucle de tour complète : lancer de deux dés avec injection d'aléatoire (`RngFn`), doubles, triple double vers la prison, passage et arrêt sur la case départ.
  - Calcul exact des loyers (terrains nus, bonus ×2 de groupe complet, 1–4 maisons, hôtel, 4 transports progressifs, 2 services indexés sur les dés, suspension sous hypothèque).
  - Enchères ouvertes atomiques (`auction:bid`, `auction:pass`, expiration serveur, file d'attente d'actifs saisis).
  - Construction et vente équilibrées avec contrôle des stocks de la banque (32 maisons, 12 hôtels), hypothèque (50 %) et levée (+10 %).
  - Gestion complète de la prison (4 modes de sortie), des 11 effets de cartes discriminés (dont les cartes conservées de sortie de prison) et des échanges simultanés (`trade:propose`, `accept`, `reject`, `cancel`).
  - Liquidation de faillite (envers un joueur créancier ou envers la banque), politiques de déconnexion (`PAUSE`, `AUTO_PASS`, `ABANDON`) et victoire (dernier solvable ou patrimoine net à l'échéance).
- **Tests unitaires et invariants** : suites déterministes et simulation multi-tours couvrant plus de 85 % du moteur.

## [0.2.0] - 2026-11-04

### Ajouté

- **Système graphique (`@capital-city/ui`)** : primitives accessibles (`Button` avec explication d'indisponibilité, `Modal` avec piège de focus et navigation clavier, `Badge`, `MoneyDisplay` tabulaire, `PropertyDeedCard`).
- **Illustrations et identité graphique** : logo original Capital City, 8 pions vectoriels distincts et illustrations centrales SVG pour les 3 univers.
- **3 packs de plateaux complets (`@capital-city/board-packs`)** : **Asteria City**, **Riviera District** et **Nova Frontier** (40 cases équilibrées, 16 cartes d'événement et 16 cartes de communauté chacun, soit 120 cases et 96 cartes originales chargées en base via `db:seed`).
- **Parcours frontend et navigation** : accueil en thème sombre, création de salle (`/create`), accès à une salle (`/join`), atlas interactif des 3 plateaux (`/boards`), règles, paramètres (animations réduites, effets sonores Web Audio) et tutoriel interactif en 11 étapes.
- **Session sécurisée et API HTTP** : signature HMAC `HttpOnly` (`/api/session`), liste des packs (`/api/board-packs`) et gestion des salles (`/api/rooms`).

## [0.1.0] - 2026-11-04

### Ajouté

- **Socle monorepo npm** : structuration modulaire en 6 espaces de travail (`@capital-city/shared`, `@capital-city/board-packs`, `@capital-city/game-engine`, `@capital-city/ui`, `@capital-city/realtime`, `@capital-city/web`).
- **Contrats typés et validation** : définition dans `@capital-city/shared` des 8 pions originaux, des profils de règles configurables (`RulesetConfig`), des types d'état serveur et public (`GameState` / `PublicGameState`) et des schémas Zod d'enveloppe de commande (`GameCommandEnvelopeSchema`).
- **Persistance PostgreSQL et Prisma** : schéma relationnel complet (`User`, `BoardPack`, `BoardSpace`, `GameRoom`, `Game`, `Player`, `AssetOwnership`, `CardDeck`, `TradeOffer`, `GameEvent`, `GameSnapshot`, `ProcessedCommand`), migration SQL initiale reproductible et script d'amorçage.
- **Infrastructure et exécution locale** : `docker-compose.yml` (PostgreSQL 16, Redis 7, profils conteneurisés `web`/`realtime`), `Dockerfile` de déploiement et démon PostgreSQL 16 local embarqué (`PGlite` TCP) pour les environnements sans démon Docker actif.
- **Qualité et intégration continue** : configuration ESLint 9, Prettier 3, TypeScript 5.9 (`strict`), Vitest 4 avec seuils de couverture V8 (`>= 80 %`), Playwright et flux GitHub Actions (`.github/workflows/ci.yml`).
- **Documentation et décisions d'architecture** : `ARCHITECTURE.md`, `README.md`, `docs/architecture.md`, `ADR-001`, `ADR-002`, `ADR-003`, `docs/gameplay/rules.md` et `docs/deployment/runbook.md`.
