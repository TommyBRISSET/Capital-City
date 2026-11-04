# Architecture détaillée des sous-systèmes

## 1. Flux temps réel Socket.IO (`apps/realtime`)

Chaque connexion WebSocket présente un jeton signé HMAC dans `socket.handshake.auth.token` (ou cookie `cc_session`). Le serveur vérifie la signature cryptographique et attache `socket.data.session = { userId, displayName }`.

### Commandes client vers serveur

- `room:create`, `room:join`, `room:leave`, `room:select-token`, `room:ready`, `room:update-rules`
- `game:start`, `game:resume`, `game:pause`, `game:unpause`
- `turn:roll`, `turn:end`
- `property:buy`, `property:decline`
- `auction:bid`, `auction:pass`
- `asset:build`, `asset:sell`, `asset:mortgage`, `asset:redeem`
- `trade:propose`, `trade:accept`, `trade:reject`, `trade:cancel`
- `jail:pay`, `jail:use-card`
- `debt:settle`, `player:declare-bankruptcy`
- `chat:send`

### Événements serveur vers client

- `room:updated`, `room:player-joined`, `room:player-left`
- `game:started`, `game:snapshot`, `game:ended`
- `turn:updated`, `dice:rolled`, `movement:resolved`
- `asset:updated`, `money:transferred`
- `auction:updated`, `trade:created`, `trade:updated`, `trade:completed`
- `card:revealed`, `jail:updated`, `player:bankrupt`
- `chat:message`, `presence:updated`, `error:domain`

## 2. Synchronisation du modèle relationnel Prisma

Lors de chaque commande validée sur une partie active :

1. Le moteur produit `{ state: nextState, events }`.
2. Une transaction `prisma.$transaction` :
   - Vérifie et incrémente `Game.version` (`expectedVersion -> expectedVersion + 1`).
   - Met à jour `Game` (`currentPlayerId`, `currentPhase`, `turnNumber`, `status`, `stateSnapshot`).
   - Synchronise les soldes, positions, états de prison et faillite des `Player`.
   - Synchronise `AssetOwnership` (`ownerPlayerId`, `isMortgaged`, `houseCount`, `hotelCount`).
   - Synchronise `TradeOffer` et l'état des cartes conservées (`CardDeck`).
   - Insère les nouvelles lignes immuables dans `GameEvent` (`sequence` monotone).
   - Insère un `GameSnapshot` tous les `N` événements (et sur début et fin de partie).
