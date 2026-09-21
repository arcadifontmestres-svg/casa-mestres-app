# Gmail de Direcció

Direcció prem **Connectar Gmail**, autoritza Google i després prem **Enviar email** en una proposta validada. No hi ha camps de contrasenyes ni claus de correu. Cada connexió pertany a l’usuari de Direcció autenticat i al context d’empresa/centre; una proposta utilitza sempre el seu propi context. L’ERP actual autentica Direcció amb un únic ADMIN_USER; no s’utilitzen noms d’empleats ni perfils seleccionats al navegador com a identitat de seguretat.

## Activació única del servei

1. Al projecte de Google Cloud de l’organització, activa Gmail API i configura la pantalla de consentiment.
2. Crea un client OAuth **Aplicació web**. Afegeix exactament `https://DOMINI-ERP/api/gmail/callback` als URI de redirecció autoritzats.
3. Defineix GOOGLE_CLIENT_ID i GOOGLE_CLIENT_SECRET al servidor, i APP_BASE_URL amb l’origen HTTPS real. No comparteixis aquests secrets amb Direcció ni els guardis al repositori.
4. Mantén DATA_DIR al disc persistent de Render. El servidor genera gmail-token.key (32 bytes) i desa les connexions xifrades amb AES-256-GCM a gmail-connections.enc, amb permisos 0600. No formen part de data.json, les còpies exportades ni les respostes API. La còpia administrativa del disc ha de conservar tots dos fitxers junts, amb accés restringit.
5. Publica l’aplicació de consentiment de Google i completa la verificació que Google requereixi per gmail.send. En mode extern **Testing**, els refresh tokens amb permisos Gmail caduquen al cap de set dies: no serveix per a l’ús continu demanat. Google també pot revocar l’autorització; en aquest cas l’usuari reconnecta amb el mateix botó.
6. A l’ERP, selecciona l’empresa/centre, prem Connectar Gmail i autoritza el compte remitent. Comprova un enviament a un destinatari de prova amb una proposta validada i revisa l’historial abans d’utilitzar-lo amb clients.

Es demanen únicament openid, email i gmail.send. L’autorització inicial utilitza state d’un sol ús, cookie HttpOnly/SameSite i PKCE; la renovació es fa al servidor. El mòdul oauth.js existent és un proveïdor OAuth per a MCP/ChatGPT, no un client de Google: es conserva sense barrejar-ne els tokens. Es reutilitzen l’autenticació de Direcció i la cua d’escriptures de l’ERP.

En desplegar, s’elimina el fitxer antic commercial-email.json. Retira també les variables obsoletes RESEND_API_KEY, COMMERCIAL_EMAIL_PROVIDER, COMMERCIAL_FROM_EMAIL, COMMERCIAL_FROM_NAME, COMMERCIAL_REPLY_TO, GMAIL_SMTP_USER i GMAIL_APP_PASSWORD del servei: ja no es llegeixen. Revoca les credencials antigues al proveïdor si encara són actives.

Els errors de xarxa no es reintenten automàticament per evitar duplicats. Si Google ha acceptat un missatge però es perd la resposta, comprova Enviats abans de repetir-lo. L’historial registra el compte, el centre, l’usuari, el destinatari i l’identificador de Google. Una edició concurrent no queda sobreescrita en acabar un enviament.

Documentació oficial: https://developers.google.com/identity/protocols/oauth2/web-server i https://developers.google.com/identity/protocols/oauth2.
