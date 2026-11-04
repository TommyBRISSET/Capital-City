# Référentiel des règles et de l'économie — Capital City

## 1. Géométrie canonique des 40 cases

Les trois plateaux (**Asteria City**, **Riviera District**, **Nova Frontier**) partagent exactement la même géométrie et le même équilibre économique afin de garantir une équité compétitive parfaite :

| Index                 | Catégorie                      | Groupe / détail                                         | Prix d'achat         | Coût bâtiment |
| --------------------- | ------------------------------ | ------------------------------------------------------- | -------------------- | ------------- |
| `0`                   | Départ (`START`)               | Prime de passage : `200 Cr` (configurable)              | —                    | —             |
| `1`, `3`              | Propriétés (`PROPERTY`)        | Groupe `G1` (2 terrains)                                | `60 Cr` / `60 Cr`    | `50 Cr`       |
| `2`, `17`, `33`       | Communauté (`COMMUNITY`)       | Tirage du paquet de communauté (16 cartes)              | —                    | —             |
| `4`                   | Taxe (`TAX`)                   | Taxe civique (`200 Cr`)                                 | —                    | —             |
| `5`, `15`, `25`, `35` | Transports (`TRANSPORT`)       | Loyers : `25 / 50 / 100 / 200 Cr`                       | `200 Cr`             | —             |
| `6`, `8`, `9`         | Propriétés (`PROPERTY`)        | Groupe `G2` (3 terrains)                                | `100 / 100 / 120 Cr` | `50 Cr`       |
| `7`, `22`, `36`       | Événement (`EVENT`)            | Tirage du paquet d'événement (16 cartes)                | —                    | —             |
| `10`                  | Prison / visite (`JAIL`)       | Simple visite ou détention                              | —                    | —             |
| `11`, `13`, `14`      | Propriétés (`PROPERTY`)        | Groupe `G3` (3 terrains)                                | `140 / 140 / 160 Cr` | `100 Cr`      |
| `12`, `28`            | Services (`UTILITY`)           | Loyers : `4x dés` (1 service) ou `10x dés` (2 services) | `150 Cr`             | —             |
| `16`, `18`, `19`      | Propriétés (`PROPERTY`)        | Groupe `G4` (3 terrains)                                | `180 / 180 / 200 Cr` | `100 Cr`      |
| `20`                  | Parking / pause (`PARKING`)    | Neutre (ou cagnotte si règle optionnelle activée)       | —                    | —             |
| `21`, `23`, `24`      | Propriétés (`PROPERTY`)        | Groupe `G5` (3 terrains)                                | `220 / 220 / 240 Cr` | `150 Cr`      |
| `26`, `27`, `29`      | Propriétés (`PROPERTY`)        | Groupe `G6` (3 terrains)                                | `260 / 260 / 280 Cr` | `150 Cr`      |
| `30`                  | Aller en prison (`GO_TO_JAIL`) | Envoi direct en case `10` sans prime de départ          | —                    | —             |
| `31`, `32`, `34`      | Propriétés (`PROPERTY`)        | Groupe `G7` (3 terrains)                                | `300 / 300 / 320 Cr` | `200 Cr`      |
| `37`, `39`            | Propriétés (`PROPERTY`)        | Groupe `G8` (2 terrains de prestige)                    | `350 / 400 Cr`       | `200 Cr`      |
| `38`                  | Taxe (`TAX`)                   | Taxe de prestige (`100 Cr`)                             | —                    | —             |

## 2. Les trois univers originaux

1. **Asteria City** (`asteria-city`) : quartiers métropolitains nocturnes, pôles de métro express, réseaux énergétiques urbains, tours contemporaines en verre et acier.
2. **Riviera District** (`riviera-district`) : ports de plaisance méditerranéens, promenades côtières, villas panoramiques, navettes maritimes et solaires.
3. **Nova Frontier** (`nova-frontier`) : secteurs orbitaux, astroports maglev, réacteurs à fusion et dômes technologiques néon.

## 3. Types d'effets de cartes (union discriminée)

Chaque carte déclare un `effect` typé parmi :

- `MOVE_TO` (`targetIndex`, `collectStartBonus`)
- `MOVE_STEPS` (`steps`, ex. `-3`)
- `COLLECT_FROM_BANK` (`amount`)
- `PAY_BANK` (`amount`)
- `COLLECT_FROM_EACH` (`amountPerPlayer`)
- `PAY_EACH` (`amountPerPlayer`)
- `REPAIR_BUILDINGS` (`perHouse`, `perHotel`)
- `GET_OUT_OF_JAIL` (conservée par le joueur jusqu'à usage ou échange)
- `GO_TO_JAIL`
- `MOVE_TO_NEAREST_TRANSPORT` (`rentMultiplier`, ex. `2`)
- `MOVE_TO_NEAREST_UTILITY` (`diceMultiplier`, ex. `10`)
