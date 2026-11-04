# ADR-003 — règles métier détaillées et résolution des cas limites

- **Statut** : accepté
- **Date** : 2026-11-04
- **Contexte** : le moteur économique de Capital City assure une gestion exhaustive des règles immobilières et des cas limites sans simplification implicite. Plusieurs interactions classiques nécessitent une convention explicite et déterministe.

## Décisions métier

1. **Unité monétaire entière** :
   - Tous les montants sont stockés et manipulés en entiers positifs ou nuls (**crédits**, symbole `Cr`). Les arrondis éventuels (ex. intérêts d'hypothèque à 10 %) utilisent `Math.ceil` pour garantir un entier déterministe.
2. **Bonus de groupe complet et hypothèques** :
   - Un propriétaire détenant tous les terrains d'un groupe `G1`–`G8` perçoit **le double du loyer nu** sur chaque terrain **non construit et non hypothéqué** de ce groupe, même si un autre terrain du même groupe est hypothéqué.
   - En revanche, **aucune construction** n'est autorisée sur un groupe tant qu'au moins un terrain du groupe est hypothéqué, et **aucune mise en hypothèque** n'est autorisée tant qu'au moins un bâtiment subsiste dans le groupe.
3. **Phase de résolution de dette (`DEBT_RESOLUTION`) avant faillite** :
   - Lorsqu'un paiement obligatoire (loyer, taxe, carte, amende du 3e tour de prison) excède la trésorerie disponible du joueur, le moteur n'élimine pas brutalement un joueur solvable en actifs : il place le tour en phase `DEBT_RESOLUTION` avec `pendingDebt` (`amount`, `creditorId | 'BANK'`, `reason`).
   - Tant que la dette n'est pas réglée, le joueur peut vendre des bâtiments, hypothéquer ses propriétés ou conclure un échange pour réunir les fonds, puis exécuter `debt:settle` (ou se déclarer en faillite via `player:declare-bankruptcy` s'il ne dispose plus d'aucune liquidité suffisante).
4. **Liquidation en cas de faillite** :
   - **Envers un joueur créancier** : tous les bâtiments du débiteur sont d'abord vendus à la banque à 50 % (ajoutés aux liquidités transférées), puis la totalité de la trésorerie restante, les propriétés (conservant leur statut d'hypothèque éventuel) et les cartes de sortie de prison sont transférées au créancier.
   - **Envers la banque** : les bâtiments retournent au stock, les hypothèques sont levées, les cartes conservées retournent sous leur paquet respectif, et les propriétés redevenues libres sont proposées aux enchères successives (sauf si un seul joueur non failli subsiste, déclenchant immédiatement la victoire).
5. **Enchères ouvertes atomiques** :
   - Déclenchées automatiquement sur `property:decline` (ou si l'acheteur choisit de passer aux enchères faute de trésorerie suffisante).
   - Tous les joueurs non en faillite (y compris celui qui a décliné l'achat) peuvent enchérir (`auction:bid`) avec un incrément minimal configurable (`auctionMinIncrement`, défaut `10 Cr`) dans la limite de leur trésorerie courante, ou se retirer (`auction:pass`).
   - L'enchère se clôture dès que tous les joueurs éligibles sauf le meilleur offrant ont passé (ou à l'expiration du délai `auctionTimeoutSeconds`). Si personne n'enchérit, la propriété demeure libre à la banque.
6. **Politique de déconnexion et pause** :
   - Un joueur déconnecté conserve sa place pendant `disconnectGraceSeconds` (120 s par défaut). À l'expiration de ce délai pendant son tour, le serveur applique la politique configurée dans la salle (`PAUSE` met la partie en pause réversible ; `AUTO_PASS` exécute l'action minimale sûre : lancer, décliner l'achat, clore le tour ; `ABANDON` déclare la faillite envers la banque).
7. **Limite de durée et départage** :
   - Si `maxDurationMinutes` est défini par l'hôte, la partie se conclut à la fin du tour en cours une fois l'échéance atteinte. Le classement final départage les joueurs actifs selon leur **patrimoine net total** : `trésorerie + valeur nominale des actifs non hypothéqués + valeur d'hypothèque des actifs hypothéqués + valeur de revente (50 %) des bâtiments construits` (puis trésorerie disponible en second critère).
