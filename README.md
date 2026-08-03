# Casa Mestres · App de gestió i reserves

Aplicació Node.js única (sense framework) que centralitza la gestió del restaurant
**Casa Mestres**: Back Office protegit, mini app pública de reserves amb Stripe,
fitxatges GPS, OCR de productes i Control Normatiu.

---

## Què hi ha dins

| Mòdul | Descripció |
|---|---|
| **Configuració** | Empresa, logotip, dades fiscals, zona GPS de fitxatge |
| **Magatzem** | Proveïdors, productes (codi, preu, unitat, família, stock), OCR |
| **Cuina** | Bases de cuina, fitxes de plats amb escandall i cost |
| **Control de Qualitat** | APPCC, zones, neteja, temperatures, incidències, PRL, EPIs, formació |
| **Reserves** | Calendari mensual, clients, menús, fiances i pagaments Stripe |
| **RRHH** | Empleats, horaris, registre GPS de fitxatges (ENTRADA / PAUSA / TORNAR / SORTIDA) |
| **Còpies** | Backup JSON complet i restauració integrada |

---

## Estructura del projecte

```
.
├─ server.js              # Servidor HTTP + API REST + Stripe + auth
├─ package.json           # scripts: start / check / test
├─ render.yaml            # Blueprint per a deploy amb un clic a Render
├─ data.json              # Seed inicial (es copia a DATA_DIR al primer arrencada)
├─ .env.example           # Plantilla de configuració local
├─ .gitignore
├─ public/
│  ├─ index.html          # Back Office (protegit amb Basic Auth)
│  ├─ app.js              # SPA del Back Office
│  ├─ styles.css
│  ├─ reserves.html       # Mini app pública de reserves (Stripe Checkout)
│  ├─ fitxatges.html      # Mini app pública de fitxatge GPS
│  ├─ ocr.html            # Lector OCR (Tesseract.js, offline)
│  ├─ control_normatiu.html
│  ├─ control_initial.js
│  └─ vendor/tesseract/   # Binaris de Tesseract.js (cat + spa)
└─ tests/
   └─ integration.test.js # Tests d'integració (auth, Stripe mock, webhook, represa)
```

---

## Prova en local

### Requisits
- Node.js 24 LTS recomanat (compatible amb Node.js >= 20)

### Passos
1. Copia `.env.example` com a `.env`:
   ```bash
   cp .env.example .env
   ```
2. Edita `.env` i escriu un usuari i contrasenya propis a `ADMIN_USER` i `ADMIN_PASSWORD`.
3. (Opcional) Si vols provar Stripe en local, posa una clau de prova `sk_test_...` a `STRIPE_SECRET_KEY`.
4. Arrenca:
   ```bash
   npm install
   npm start
   ```
   O a Windows, fes doble clic a `INICIAR_CASA_MESTRES.bat`.
5. Obre **http://127.0.0.1:3210** i identifica't amb les credencials que has escrit.

### Comprovacions ràpides
- `npm test` → tests d'integració (auth, Stripe mock, webhook, represa)
- `npm run check` → validació de sintaxi de `server.js` i `public/app.js`

---

## Pujar a GitHub

Aquesta carpeta és la **carpeta canònica**: només conté la identitat i les funcions
de Casa Mestres, sense cap clau privada.

```bash
cd CASA_MESTRES_APP_FINAL_v2

# Inicialitza el repositori (si no ho està)
git init
git branch -M main

# Primer commit (verifica que .env NO s'hi puja)
git add .
git status                    # comprova que NO apareix .env
git commit -m "Casa Mestres · app consolidada v2"

# Connecta al teu repo de GitHub (casa'l previament a github.com/new)
git remote add origin https://github.com/EL_TEU_USUARI/Casa-mestres-restaurant.git
git push -u origin main
```

> Seguretat: el `.gitignore` exclou `.env`, `.env.*`, `backups/`, `node_modules/`
> i `data.json.tmp`. Si en algun moment veus que `.env` apareix al `git status`,
> **atura't** i revisa'l abans de fer commit.

---

## Deploy a Render (recomanat)

### Opció A · Blueprint amb un sol clic (recomanada)

1. Puja el projecte a GitHub (veure apartat anterior).
2. Ves a <https://dashboard.render.com> → **New** → **Blueprint**.
3. Selecciona el repo `Casa-mestres-restaurant`.
4. Render detecta `render.yaml` i crea el servei `casa-mestres` automàticament
   amb el disc persistent i les variables sense valor (`sync: false`).
5. Abans de fer el primer deploy, ves a **Environment** del servei i omple:
   - `ADMIN_USER` (triïs tu)
   - `ADMIN_PASSWORD` (tria una contrasenya forta)
   - `APP_BASE_URL` → `https://casa-mestres.onrender.com`
     (substitueix pel subdomini real que t'assigni Render)
6. Fes **Manual Deploy** → **Deploy latest commit**.
7. Quan el health check passi, obre la URL pública i prova el login.

### Opció B · Web Service manual

Si prefereixes crear el servei pas a pas:

1. Render → **New** → **Web Service** → connecta el repo GitHub.
2. Configuració:
   - **Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Health Check Path**: `/api/health`
   - **Plan**: Starter (mínim per tenir disc persistent)
   - **Region**: Frankfurt (o la més propera al restaurant)
3. Variables d'entorn (apartat **Environment**):
   - `ADMIN_USER` = (el teu usuari)
   - `ADMIN_PASSWORD` = (contrasenya forta)
   - `APP_BASE_URL` = `https://casa-mestres.onrender.com`
   - `DATA_DIR` = `/var/data`
   - `HOST` = `0.0.0.0`
4. Disc persistent (apartat **Disks**):
   - **Name**: `casa-mestres-data`
   - **Mount Path**: `/var/data`
   - **Size**: 1 GB
5. **Create Web Service**. El primer deploy arrenca en 1-2 minuts.

---

## Activar Stripe (quan estiguis a punt)

L'app i el Back Office poden arrencar **sense Stripe**, però la mini app pública
no accepta una reserva amb una fiança superior a 0 fins que `STRIPE_SECRET_KEY`
està configurada. Els menús amb fiança 0 es poden confirmar sense pagament.
Quan vulguis cobrar fiances online:

1. Crea un compte a <https://stripe.com> (es pot començar en mode test).
2. Copia la clau secreta:
   - Mode test: `sk_test_...`
   - Mode live: `sk_live_...`
3. A Render → **Environment** del servei → afegeix `STRIPE_SECRET_KEY` amb la clau.
4. Comprova que `APP_BASE_URL` té la URL pública exacta, **sense barra final**.
5. Fes un deploi nou. Al Back Office → Reserves, l'estat de Stripe ha de dir **ACTIVAT**.
6. Crea una reserva de prova per validar el flux complet.

### Webhook de Stripe (recomanat)

Perquè la reserva es confirmi sola encara que el client tanqui el navegador abans
del retorn:

1. Stripe Dashboard → **Developers** → **Webhooks** → **Add endpoint**.
2. URL de l'endpoint:
   ```
   https://EL_TEU_DOMINI/api/stripe/webhook
   ```
3. Esdeveniments a escoltar:
   - `checkout.session.completed`
   - `checkout.session.async_payment_succeeded`
4. Copia el secret `whsec_...` → Render → **Environment** → `STRIPE_WEBHOOK_SECRET`.
5. Fes un deploy nou.

---

## Persistència i seguretat

### Persistència
- Render **perd els fitxers locals** als reinicis si no hi ha disc persistent.
- Aquest projecte configura `DATA_DIR=/var/data` i un disc de 1 GB al `render.yaml`.
- Tots els canvis (reserves, fitxatges, Back Office) es guarden a `data.json`
  dins el disc, i abans de cada escriptura es fa una còpia automàtica a `backups/`.
- L'escriptura està serialitzada amb una cua de mutacions per evitar col·lisions
  entre dues reserves simultànies.

### Seguretat
- **Mai** pugis `.env` ni cap fitxer que contingui `sk_test_`, `sk_live_` o `whsec_`.
- El Back Office i totes les API de gestió estan protegits amb HTTP Basic Auth
  (`ADMIN_USER` + `ADMIN_PASSWORD`, comparació constant-time).
- Les mini apps `/reserves.html` i `/fitxatges.html` són públiques per disseny.
- Headers de seguretat: `X-Content-Type-Options`, `X-Frame-Options: DENY`,
  `Referrer-Policy`, `Permissions-Policy` restringint camera/microphone/geolocation.
- El webhook de Stripe es verifica amb HMAC SHA-256 i tolerància de 5 minuts.

---

## Proves automàtiques

```bash
npm test
```

Cobreixen: health check, protecció Back Office (401 sense credencials),
límit de 10 pax, bloqueig de duplicats per nom + dia, creació de Checkout,
confirmació de pagament, webhook i represa de pagament cancel·lat.

---

## Notes

- El paquet Tesseract.js (OCR) va inclòs a `public/vendor/` i funciona **offline**:
  cap dada surt del navegador del client.
- El Control Normatiu és una eina independent incrustada a l'app, amb el seu
  estat propi dins `data.json` (`controlNormatiu`).
- Les notificacions automàtiques per WhatsApp/email **no** estan incloses; requereixen
  escollir i configurar un proveïdor extern quan es vulguin activar.

### Abans d'obrir les reserves reals

- Completa el telèfon, el correu i el telèfon de grups des de **Configuració**.
- Revisa les reserves i els menús que ja hi ha carregats i elimina des del Back Office
  només les dades que siguin de prova.
- Configura Stripe en mode live i el webhook abans de cobrar fiances reals.
- Confirma que el servei de Render manté el pla Starter i el disc persistent d'1 GB.
- La versió actual no inclou avisos automàtics, control de capacitat total del
  restaurant ni plànol/assignació de taules.
