# Synthèse d'architecture — Capital City

Ce document complète [ARCHITECTURE.md](../ARCHITECTURE.md) en précisant les frontières techniques, les contrats de données et la stratégie d'observabilité.

## 1. Frontières des modules

1. **`@capital-city/shared` (`packages/shared`)**
   - Unique source de vérité pour les types TypeScript et les schémas `zod`.
   - Définit les 8 pions officiels de Capital City, les profils de règles (`RulesetConfig`), les événements domaine (`DomainEvent`), les commandes client vers serveur (`ClientCommand`) et les instantanés publics envoyés aux clients.
2. **`@capital-city/board-packs` (`board-packs/`)**
   - Contient les 3 packs versionnés (`asteria-city`, `riviera-district`, `nova-frontier`).
   - Chaque pack expose exactement 40 cases indexées de `0` à `39`, 16 cartes d'événement, 16 cartes de communauté, une palette de thème et ses métadonnées visuelles.
3. **`@capital-city/game-engine` (`packages/game-engine`)**
   - Fonctions pures : création d'état initial, validation d'actions autorisées, registre monétaire centralisé (`transferCredits`), résolution des dés, déplacements et cases, enchères, constructions équilibrées, hypothèques, échanges, gestion de dette, faillite et calcul de patrimoine.
   - Ne réalise aucun appel réseau, horloge globale non injectée ni requête SQL.
4. **`@capital-city/ui` (`packages/ui`)**
   - Jetons graphiques (couleurs, ombres, rayons, typographies tabulaires) et primitives accessibles réutilisables (boutons avec info-bulle d'état désactivé, dialogues modaux avec piège de focus, cartes, badges, affichage monétaire).
5. **`@capital-city/realtime` (`apps/realtime`)**
   - Serveur HTTP et Socket.IO 4 persistant.
   - Authentifie les connexions via jeton HMAC signé (`SESSION_SECRET`), orchestre les salles en mémoire synchronisées avec PostgreSQL (Prisma) et Redis (`ioredis`), gère les minuteurs d'enchères et de déconnexion, expose `/health` et `/metrics`.
6. **`@capital-city/web` (`apps/web`)**
   - Application Next.js 16 (App Router) avec React 19 et Tailwind CSS 4.
   - Expose les routes API HTTP (`/api/session`, `/api/rooms`, `/api/board-packs`, `/api/health`) et l'ensemble des 17 interfaces joueur adaptatives.

## 2. Modèle transactionnel et concurrence

- **Verrouillage par salle en mémoire et verrou distribué Redis** : sérialise les commandes concurrentes arrivant simultanément (ex. deux enchères parallèles).
- **Verrouillage optimiste SQL (`Game.version`)** : chaque mutation incrémente `version` dans une transaction Prisma (`prisma.$transaction`). Si `expectedVersion` est obsolète, le serveur renvoie une erreur typée `STALE_STATE` accompagnée du dernier état autoritaire.
- **Idempotence (`commandId`)** : une commande portant un `commandId` déjà exécuté pour cette partie ne ré-applique pas la transition et renvoie le résultat acquitté sans double dépense.

## 3. Observabilité

- Journaux structurés JSON (`timestamp`, `level`, `msg`, `roomId`, `gameId`, `actorId`, `correlationId`, `durationMs`) sans jamais journaliser de secret ni de jeton brut.
- Point d'entrée `/metrics` exposant les compteurs temps réel : connexions actives, salles ouvertes, parties actives, commandes traitées, erreurs métier, reconnexions et latence moyenne d'exécution.
