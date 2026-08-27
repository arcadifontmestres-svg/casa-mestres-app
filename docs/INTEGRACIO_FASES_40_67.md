# Integració del paquet de millores

El fitxer `markdown.md enganxat` contenia codi executable per a les fases 40–61 i descripcions funcionals per a les fases 62–67. El codi no es podia enganxar directament perquè esperava un `api.js` inexistent, col·locava panells fora de la pantalla i mostrava indicadors generats amb `Math.random()`.

Les funcions s’han adaptat a l’arquitectura real publicada a Render:

- `public/app.js` conserva els mòduls originals i les dades existents.
- `public/js/arcadi-runtime.js` aporta un únic sistema de càrrega, guardat i formularis.
- `public/js/arcadi-modules.js` integra totes les àrees noves.
- `data.json` incorpora les col·leccions noves sense duplicar les existents.

| Fase | Contingut original | Integració real |
|---:|---|---|
| 40 | APPCC | Enllaçat amb `controlNormatiu.records` existent |
| 41 | Manteniment | `maintenanceRecords` amb altes, edició i estat |
| 42 | Analítica | Indicadors calculats amb productes, plats, reserves i TPV |
| 43 | Comunicacions | `communications` amb canal, destinatari i seguiment |
| 44 | CRM | `crmContacts`, preferències i segmentació |
| 45 | Reserves avançades | Reutilitza `reservations`; no crea una segona agenda |
| 46 | Carta digital | Reutilitza `dishes` i `documents` |
| 47 | Màrqueting | `marketingCampaigns`; cap xarxa publica automàticament |
| 48 | Grups | `groupEvents`, menú, pax, import i estat |
| 49 | Experiències | `experiences`, aforament, preu i publicació |
| 50 | Fidelització | `loyaltyAccounts`, punts, nivell i recompensa |
| 51 | Proveïdors | Reutilitza `suppliers` i afegeix comandes GS-COMP |
| 52 | Logística | Recepcions GS-REC i `traceabilityRecords` |
| 53 | Costos | Escandalls, stock i venda real; sense xifres aleatòries |
| 54 | Inventari avançat | Stock mínim, alertes i valor real |
| 55 | Producció | `productionRecords` amb partida, quantitat i estat |
| 56 | Sala avançada | Reutilitza taules, comandes TPV i reserves |
| 57 | Economia avançada | Vendes tancades, fiances i stock valorat |
| 58 | RRHH avançat | Reutilitza empleats, horaris i fitxatges |
| 59 | Seguretat i normativa | Visió conjunta d’APPCC, lots i manteniment |
| 60 | Backoffice | Estat de col·leccions, actualització i backups |
| 61 | IA corporativa | Panell preparat però aparcat, per decisió d’Arcadi |
| 62 | Multi-restaurant | `restaurants`, amb Casa Mestres com a centre principal |
| 63 | Multi-plataforma | `platformProfiles`; connexions externes explícites |
| 64 | Mini apps | Catàleg dels accessos de reserves i fitxatges existents |
| 65 | Exportació | JSON complet i CSV per productes, plats, reserves i RRHH |
| 66 | Sistema | Configuració global i estat Windows/Render |
| 67 | Finalització | Control estructural de les àrees integrades |

## Principis aplicats

- Tot indicador prové de dades guardades o mostra zero.
- Cap mòdul s’amaga a milers de píxels fora de la pantalla.
- Cap guardat depèn d’Internet.
- Les fases 62–67 no es presenten com a integracions externes ja connectades: només fan el que les dades actuals permeten de manera real.
- Windows i Render consumeixen els mateixos fitxers.

