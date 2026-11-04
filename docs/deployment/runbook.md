# Guide de déploiement, exploitation, sauvegarde et retour arrière

## 1. Déploiement par conteneurs (Docker Compose)

Pour démarrer l'ensemble de l'infrastructure (PostgreSQL, Redis, migrations, serveur temps réel et application web) en mode conteneurisé :

```bash
cp .env.example .env
# Éditer .env : définir un SESSION_SECRET fort (>= 32 octets aléatoires), POSTGRES_PASSWORD et les URL publiques
docker compose --profile app up -d --build
docker compose ps
```

### Vérifications de santé

- **Application web Next.js** : `GET http://localhost:3000/api/health` -> `200 OK`
- **Serveur temps réel Socket.IO** : `GET http://localhost:4000/health` -> `200 OK`
- **Métriques temps réel** : `GET http://localhost:4000/metrics`

## 2. Configuration réseau et serveur mandataire inverse (production)

Placer un serveur mandataire inverse TLS (Nginx, Caddy ou Traefik) devant `web` (`:3000`) et `realtime` (`:4000`) :

- Activer HTTPS (TLS 1.2/1.3) et `NODE_ENV=production` (active automatiquement l'attribut `Secure` sur le cookie `cc_session`).
- Configurer `CORS_ALLOWED_ORIGINS` avec la liste stricte des domaines autorisés.
- Pour Socket.IO, autoriser les en-têtes `Upgrade: websocket` et `Connection: upgrade` avec un `proxy_read_timeout` >= `120s`.

## 3. Sauvegarde et restauration PostgreSQL

### Créer une sauvegarde logique

```bash
docker compose exec -T postgres pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc > backup_$(date +%Y%m%d_%H%M%S).dump
```

### Restaurer une sauvegarde

```bash
docker compose exec -T postgres pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists < backup_YYYYMMDD_HHMMSS.dump
```

## 4. Procédure de retour arrière d'une version Git

1. Identifier l'étiquette stable précédente : `git tag -l --sort=-v:refname`
2. Basculer sur l'étiquette cible : `git checkout v1.0.0` (ou déployer l'image correspondante).
3. Si une migration destructive a été appliquée entre-temps, restaurer l'archive PostgreSQL prise avant la bascule (section 3 ci-dessus).
4. Redémarrer les services `realtime` et `web` : `docker compose --profile app up -d --build`. Les parties en cours seront automatiquement réhydratées depuis leur dernier `GameSnapshot`.
