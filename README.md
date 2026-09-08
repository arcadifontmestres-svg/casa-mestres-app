# ARCADI GESTIO RESTAURANT

Projecte únic de gestió integral per a Casa Mestres. La mateixa base de codi té dues sortides:

- **Windows:** aplicació d’escriptori `ARCADI_GESTIO_RESTAURANT.exe`.
- **Render:** aplicació web privada, connectada al disc persistent existent.

No són dues versions del programa. Les pantalles, la lògica i el model de dades són els mateixos.

## Àrees incorporades

- Sala / TPV, articles de venda i taules.
- Productes, proveïdors, stock i OCR.
- Bases de cuina, fitxes de plats i escandalls.
- Cartes, menús, pressupostos i carta digital.
- Compres GS-COMP, recepcions GS-REC i traçabilitat.
- APPCC, neteja, temperatures, incidències, PRL i manteniment.
- Reserves, CRM, grups, experiències, fidelització i comunicacions.
- Producció, sala avançada, RRHH, analítica, costos i economia.
- Exportacions, còpies de seguretat, multi-restaurant, plataformes i mini apps.

La gestió continua sent autònoma: cap funció del programa necessita una API key. La connexió opcional amb ChatGPT només actua quan Arcadi la selecciona i inicia sessió.

## Connexió privada amb ChatGPT

El servidor exposa `/mcp` mitjançant MCP Streamable HTTP. La comprovació
`get_system_status` és pública i no accedeix a dades del restaurant. Totes les
eines operatives exigeixen OAuth 2.1 amb PKCE i utilitzen el mateix usuari i
contrasenya configurats per al Back Office.

Eines disponibles:

- `get_daily_status`: resum de reserves, grups, compres, recepcions i controls d’un dia.
- `list_reservations`: consulta de reserves dins un interval.
- `list_purchases`: consulta de GS-COMP i GS-REC dins un interval.
- `create_purchase_order`: crea i desa una GS-COMP amb productes reals i prepara automàticament la GS-REC, la GS-TRAC i el registre APPCC de recepció, sense duplicats.
- `update_purchase_order`: actualitza l’estat, el responsable o les observacions d’una GS-COMP existent.
- `list_products` i `upsert_product`: consulta, alta i actualització del magatzem.
- `list_kitchen_bases` i `upsert_kitchen_base`: consulta, alta i actualització de bases i fitxes tècniques.
- `record_daily_entry`: alta idempotent d’obertura, tancament, caixa, facturació, compres, incidències, tasques i previsions.
- `update_daily_entry`: canvi d’estat i tancament d’un control existent.

Les eines només retornen els camps necessaris. No exposen tokens de gestió,
identificadors de pagament, secrets de Stripe ni credencials. La contrasenya es
valida al servidor d’ARCADI i no es lliura a ChatGPT.

## Dades consolidades

La seed actual conserva les dades de treball recuperades:

- 460 productes.
- 21 bases de cuina.
- 51 fitxes de plats.
- 204 articles de venda.
- 3 documents comercials.
- 2 reserves.

Les comandes i registres posteriors es conserven al `data.json` viu de cada instal·lació. L’arrencada afegeix les col·leccions noves que faltin sense substituir les dades existents.

Els registres creats des de ChatGPT es guarden a la col·lecció real que correspon
(`purchaseOrders`, `products`, `bases` o `dailyOperations`) dins aquest mateix
`data.json`, amb còpia prèvia automàtica i un `requestId` que evita altes duplicades
si una petició es repeteix.

`seed/catalog.json` aporta el catàleg consolidat a una instal·lació nova de Windows. En un Render que ja té `DATA_DIR`, aquest catàleg no substitueix el fitxer viu.

Els mòduls nous utilitzen el mateix `data.json`; no creen un segon inventari, una segona llista de plats ni unes segones reserves.

### Cadena automàtica de compra i APPCC

Quan una llista es crea des de ChatGPT, el programa desa una única cadena vinculada:

`GS-COMP` → `GS-REC` pendent → `GS-TRAC` pendent per producte → formulari `APPCC-REC-01` pendent de completar i validar.

Crear la llista no marca mai la mercaderia com a rebuda. Lot, caducitat, temperatura, estat de l’envàs, conformitat, incidències i accions correctives es completen quan arriba el proveïdor.

## Executable de Windows

El programa d’escriptori utilitza Electron només com a finestra de Windows. A dins arrenca el mateix `server.js` que utilitza Render.

Les dades del Windows es guarden fora de l’executable, dins la carpeta de dades de l’usuari, en un subdirectori `dades`. Abans de cada escriptura es conserva una còpia automàtica.

### Crear l’executable

El workflow `.github/workflows/windows-exe.yml` crea un únic artefacte:

```text
ARCADI_GESTIO_RESTAURANT.exe
```

Es pot executar manualment des de GitHub Actions amb **Crear executable Windows → Run workflow**. També s’executa quan es publica una etiqueta `windows-*`.

Per construir-lo directament en un Windows de desenvolupament:

```powershell
npm install
npm run check
npm test
npm run build:windows
```

El resultat queda a `dist-windows/ARCADI_GESTIO_RESTAURANT.exe`.

## Execució web o desenvolupament

Requisit: Node.js 20 o superior.

```bash
npm install
npm start
```

La versió web requereix `ADMIN_USER` i `ADMIN_PASSWORD`. Copia `.env.example` com a `.env`, posa-hi credencials pròpies i obre `http://127.0.0.1:3210`.

Per obrir la finestra d’escriptori durant el desenvolupament:

```bash
npm run desktop
```

## Render

`render.yaml` continua arrencant aquest mateix projecte amb `npm start`. Per no perdre dades cal mantenir:

- `DATA_DIR=/var/data`.
- el disc persistent muntat a `/var/data`.
- `ADMIN_USER` i `ADMIN_PASSWORD` configurats com a secrets.
- `APP_BASE_URL` amb l’adreça pública real.

Stripe és opcional. Només cal configurar-lo si s’han de cobrar fiances online.

## Estructura principal

```text
desktop/main.cjs              finestra Windows i servidor local
server.js                     API, persistència, reserves i Stripe
data.json                     dades inicials consolidades
seed/catalog.json             catàleg complet per a una instal·lació nova
public/app.js                 aplicació original publicada a Render
public/js/arcadi-runtime.js   guardat i formularis de la gestió integral
public/js/arcadi-modules.js   fases funcionals 40–67 adaptades
public/arcadi.css             estil dels nous panells
public/control_normatiu.html  registres APPCC i PRL
tests/                        comprovacions automàtiques
tools/build-catalog.mjs       reconstrucció mecànica del catàleg inicial
```

## Verificació

```bash
npm run check
npm test
```

Les proves comproven la sintaxi, l’estructura de les fases, les dades mestres, l’accés privat, les reserves, els duplicats, Stripe en mode simulat, el webhook i la persistència.

## Seguretat

- No es guarda cap clau privada al repositori.
- `.env` està exclòs de Git.
- A Windows, el servidor només escolta `127.0.0.1` i accepta l’aplicació local.
- A Render, el Back Office i les API de gestió continuen protegits amb autenticació.
- Les eines de ChatGPT que llegeixen o escriuen dades exigeixen OAuth 2.1, PKCE S256, tokens signats amb caducitat, verificació d’audiència i permisos separats de lectura i escriptura.
- Canviar `ADMIN_PASSWORD` invalida també els tokens actius del connector.
