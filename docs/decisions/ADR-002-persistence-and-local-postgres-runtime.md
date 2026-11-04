# ADR-002 — persistance PostgreSQL / Prisma, Redis et exécution locale reproductible

- **Statut** : accepté
- **Date** : 2026-11-04
- **Contexte** : l'application utilise PostgreSQL et Prisma pour la persistance transactionnelle durable et Redis pour la présence et la coordination, orchestrés par `docker-compose.yml`. Sur certains postes de développement, Docker Desktop peut être éteint (`Stopped`), empêchant le démon conteneurisé de répondre.

## Décision

Afin de ne faire **aucun compromis** sur l'utilisation réelle de PostgreSQL, des migrations SQL Prisma et des transactions ACID tout en garantissant l'exécution complète des migrations, de l'amorçage, du serveur temps réel et des tests d'intégration et E2E dans tout environnement :

1. **Infrastructure Docker Compose complète (`docker-compose.yml`)** :
   - Fournit `postgres:16-alpine` (port `5432`, volume persistant, contrôle `pg_isready`) et `redis:7-alpine` (port `6379`, volume persistant, contrôle `redis-cli ping`), ainsi que les services applicatifs `web` et `realtime` sous le profil `app`.
2. **Démon PostgreSQL 16 local embarqué (`scripts/pg-daemon.mjs`) basé sur `@electric-sql/pglite` et `@electric-sql/pglite-socket`** :
   - PGlite exécute le **véritable moteur PostgreSQL compilé en WebAssembly** avec persistance disque durable dans `.data/postgres` et expose le protocole filaire TCP PostgreSQL standard sur `127.0.0.1:5432`.
   - Lorsque `docker compose up -d` tourne déjà sur `5432`, les scripts utilisent directement le conteneur Docker PostgreSQL.
   - Lorsque le port `5432` est libre (service Docker arrêté ou CI légère), le démon PostgreSQL local démarre automatiquement et permet à **Prisma (`prisma migrate deploy`, `prisma db seed`, `@prisma/client` `$transaction`)** de fonctionner à l'identique contre un vrai moteur SQL PostgreSQL persistant sur disque (y compris la reprise après redémarrage du serveur Node.js).
3. **Adaptateur de coordination Redis (`apps/realtime/src/infra/redis-coordinator.ts`)** :
   - Connecte `ioredis` à `REDIS_URL` (`redis://127.0.0.1:6379`) par défaut.
   - Lorsque `REDIS_OPTIONAL_FALLBACK="true"` (en développement local sans démon Redis actif), bascule proprement sur un adaptateur mémoire implémentant exactement la même interface avec journalisation explicite au démarrage. En production (`NODE_ENV=production` et `REDIS_OPTIONAL_FALLBACK=false`), la connexion Redis est obligatoire.

## Conséquences

- Les développeurs disposant de Docker Desktop actif utilisent `docker compose up -d` de manière standard.
- Les tests d'intégration SQL, les migrations Prisma, le chargement des 3 packs et les tests E2E Playwright multi-navigateurs s'exécutent réellement contre PostgreSQL avec persistance disque complète même lorsque le démon Docker hôte est éteint.
