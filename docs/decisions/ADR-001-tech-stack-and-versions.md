# ADR-001 — matrice de compatibilité logicielle et versions figées

- **Statut** : accepté
- **Date** : 2026-11-04
- **Contexte** : l'architecture technique de Capital City repose sur un socle moderne (Next.js 16.x, React 19.3.x, Tailwind CSS 4.x, Socket.IO 4.x, PostgreSQL, Prisma stable, Redis, Zod, Zustand, Vitest, Playwright, ESLint, Prettier) en ne retenant que des versions stables publiées et compatibles avec l'environnement d'exécution, à l'exclusion de toute préversion (`alpha`, `beta` ou `rc`).

## Audit de l'environnement et du registre npm (04/11/2026)

L'inspection du poste d'exécution révèle :

- **Node.js installé sur l'hôte** : `v20.12.2` (`npm 10.8.3`)
- **Git** : `2.43.0`
- **Docker CLI / Compose** : `28.5.1` / `v2.40.0`

L'audit des champs `engines` sur le registre officiel npm donne les résultats suivants :

| Dépendance            | Dernière version vue                | Contrainte `engines.node`                                                                                | Choix retenu et justification                                                                                                                                                                                                     |
| --------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Next.js**           | `16.4.5`                            | `>=20.9.0`                                                                                               | **`16.4.5`** — version stable de la branche 16.x, compatible avec Node.js 20.12.2 et Node.js 22/26 LTS.                                                                                                                           |
| **React / React DOM** | `19.3.1`                            | `>=0.10.0`                                                                                               | **`19.3.1`** — version stable de la branche 19.3.x.                                                                                                                                                                               |
| **Tailwind CSS**      | `4.3.4` / `4.2.4`                   | `4.3.4` exige `require(esm)` (`Node >=20.19` via `magic-string@1.x`) ; `4.2.4` compatible `Node >=20.12` | **`4.2.4`** (`tailwindcss` + `@tailwindcss/postcss`) — version 4.x stable compatible avec `Node v20.12.2` et `Next.js 16.4.5`.                                                                                                    |
| **Socket.IO**         | `4.8.4`                             | `>=10.2.0`                                                                                               | **`4.8.4`** (`socket.io` + `socket.io-client`) — version 4.x stable.                                                                                                                                                              |
| **Prisma ORM**        | `8.0.0-rc.30` / `7.10.1` / `6.19.3` | v8 est RC (exclue) ; v7 exige `^20.19 \|\| ^22.12 \|\| >=24.0` ; v6 accepte `>=18.18`                    | **`6.19.3`** — la branche 8 est en préversion et la branche `7.10.1` requiert `Node >= 20.19`. `prisma@6.19.3` est la version stable 100 % compatible à la fois avec `Node v20.12.2` sur l'hôte et `Node 22/26 LTS` en conteneur. |
| **TypeScript**        | `5.9.3` (et `7.0.2`)                | `>=16.20.0`                                                                                              | **`5.9.3`** — mode `strict: true` intégral ; compatibilité native complète avec `eslint-config-next@16.4.5`, Prisma et Vitest.                                                                                                    |
| **Zod**               | `3.24.2` / `4.6.7`                  | Compatible Node >=18                                                                                     | **`3.24.2`** — version stable éprouvée dans tout l'écosystème TypeScript strict.                                                                                                                                                  |
| **Zustand**           | `5.0.16`                            | `>=12.20.0`                                                                                              | **`5.0.16`** — dernière version stable compatible React 19.                                                                                                                                                                       |
| **Vitest**            | `5.1.0` / `4.1.12`                  | v5 exige `^22.12.0` ; v4 accepte `^20.0.0 \|\| ^22.0.0 \|\| >=24.0.0`                                    | **`4.1.12`** (`vitest` + `@vitest/coverage-v8`) — version stable compatible avec `Node v20.12.2` et `Node >=22`.                                                                                                                  |
| **Playwright**        | `1.64.1`                            | `>=20`                                                                                                   | **`1.64.1`** (`@playwright/test`).                                                                                                                                                                                                |
| **ESLint**            | `10.14.0` / `9.39.5`                | v10 exige `^20.19.0` ; v9 accepte `^18.18.0 \|\| ^20.9.0 \|\| >=21.1.0`                                  | **`9.39.5`** — compatible `Node v20.12.2` et `eslint-config-next@16.4.5`.                                                                                                                                                         |
| **Prettier**          | `3.9.10`                            | `>=14`                                                                                                   | **`3.9.10`**.                                                                                                                                                                                                                     |
| **Client Redis**      | `ioredis@5.11.1`                    | `>=12.22.0`                                                                                              | **`5.11.1`** — stable, éprouvé et typé nativement.                                                                                                                                                                                |

## Décision

1. Utiliser **exclusivement les espaces de travail `npm`** sur tout le monorepo et versionner `package-lock.json`.
2. Figer toutes les versions ci-dessus sans plages flottantes (`^` ou `~`) dans les `package.json` du projet.
3. Configurer `engines.node` à `>=20.12.0` dans les manifestes locaux et utiliser une image Node.js LTS récente dans les `Dockerfile` de déploiement.
