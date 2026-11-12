# TPV: configuració de botons i presentació del servei

## Abast
Repositori `arcadifontmestres-svg/casa-mestres-app`, branca `grup-trafec-operatiu`.
Base inspeccionada: `760e9c5a08eb33fe2387be75728c309008771fa1`.

Canvi limitat al Front Office / TPV: editor HTML/CSS/JS, presentació tàctil i enllaç des del TPV BACK existent. No es modifica `server.js`, `tpv-layout-store.js`, `public/app.js`, el catàleg, les receptes, els permisos, la caixa ni els fitxatges. No s'importen JSON antics, no s'inicialitzen registres reals i no es canvia la configuració de Render.

## Ús
A Sala / TPV, seleccionar el centre i obrir «TPV BACK · Configurar botons». També es pot obrir `/tpv-botons.html` des del mateix origen; reutilitza l'empresa/centre actius. Amb visió global, demana quin TPV de centre s'ha de configurar, sense crear cap centre nou.

1. Crear grups de pantalla independents de les famílies de Magatzem.
2. Crear un botó i vincular-lo, o seleccionar diversos articles existents amb caselles per generar els botons.
3. Referències estables: tipus + identificador existent + codi. Els registres sense codi queden visibles però no seleccionables; no es modifica la codificació de Cuina.
4. Editar nom visible, color, amplada normal/doble, grup i PVP opcional. El cost de compra mai es tracta com a PVP.
5. Ordenar amb el ratolí o amb tacte des de la nansa; alternativa amb botons de moure i Alt+fletxes.
6. Desar esborrany sense alterar el FRONT; publicar explícitament quan estigui preparat.
7. Vista prèvia amb tiquet simulat: no crea vendes, comandes, cobraments ni moviments reals.

La vista FRONT publicada la continua llegint el motor TPV existent. La nova fulla d'estils modifica només la pantalla de configuració i `.modal.posModal`, no la resta del Back Office. L'entrada `miniapp=1` no mostra el botó de configuració; això és comportament de pantalla, no substitueix l'autorització del servidor.

## Persistència i proteccions
Es reutilitza exclusivament `/api/tpv-layout`: lectura i escriptura del JSON separat per empresa/centre existent. El catàleg es consulta amb `GET /api/state`; l'editor no hi escriu.

La revisió del servidor evita sobreescriure des d'un terminal desactualitzat (409). Després de desar, es fa una lectura de comprovació. Errors de servidor conserven l'esborrany local. Canviar el context de treball en una altra finestra bloqueja el desat fins a reobrir el centre correcte. Avís en sortir amb canvis pendents.

Un botó sense vinculació es pot preparar en pantalla, però cal completar-ne el codi abans de desar: és el contracte actual del servidor. El mateix article d'origen no es publica amb PVP diferents en dos botons, perquè el motor de comandes existent agrupa per article.

## Validació executada
- 18 proves Node: model, vinculació, PVP, ordre, entrada al BACK i persistència real en fitxers temporals a través de la implementació existent de `tpv-layout-store.js`.
- 19 comprovacions de navegador Chromium: selecció, edició, ratolí, tacte amb esdeveniments CDP, teclat, esborrany/publicació/relectura, errors 503/409, context de centre i amplada mòbil de 390 px.
- Inspecció visual a 1536, 768 i 390 px.

Les comprovacions de navegador s'han executat amb DOM real i API simulada, sense navegar a producció. Les proves de fitxer utilitzen carpetes temporals; no dades del restaurant. No són una validació de cobraments, impressores o del servei real a Render. Els exemples de les proves no s'incorporen al catàleg.

## Reversió
Revertir aquest canvi de codi torna a l'editor anterior. La distribució continua compatible amb l'esquema existent. No s'han de suprimir els fitxers de dades per revertir la interfície.
