# Arquitectura multirestaurant unificada

## Objectiu

Convertir l'aplicació Render actual en l'única versió operativa d'ARCADI GESTIÓ. El repositori i el codi d'interfície/servidor són únics. L'EXE queda com a còpia històrica i no es desenvolupa en paral·lel.

## Jerarquia

- Plataforma: ARCADI GESTIÓ
- Empresa: Casa Mestres
  - Centre: Casa Mestres
- Empresa: Grup Tràfec
  - Sarriera 1930
  - Tràfec La Granada
  - Tràfec l'Arboç
  - Tràfec Mar / Sitges
  - Tràfec Hospitalet
  - Tràfec Piscina La Granada
  - Can Cartró

## Separació de dades

Cada centre disposa d'un espai de dades operatives independent. No es barregen:

- productes, inventari i moviments;
- plats, receptes, escandalls, cartes, vins, menús i serveis;
- proveïdors, compres, recepcions i traçabilitat;
- APPCC, producció, manteniment i incidències;
- reserves, clients operatius i configuració del local;
- quadrants, fitxatges i geolocalització.

En desplegament, les col·leccions locals es desen a `DATA_DIR/centres/<centreId>.json`.
`data.json` conserva l'índex corporatiu i les dades compartides; el codi de servidor i
els mòduls JavaScript són únics i reutilitzats per tots els centres.

El codi JavaScript és compartit i únic. No es creen còpies de l'aplicació per centre.

## Biblioteca corporativa i operativa local

Direcció pot crear productes homologats, bases, receptes, proveïdors i plantilles APPCC corporatives. Cada centre activa els elements que utilitza i manté de manera independent preus, existències, produccions, costos, cartes i registres.

Les variants locals no modifiquen la fitxa corporativa. Una diferència de gramatura, composició, rendiment o procés ha de quedar identificada i, quan correspongui, aprovada per Direcció.

## Criteris pendents i governança

L'arquitectura de l'aplicació no pressuposa que tots els criteris corporatius ja estiguin definits. Ha de permetre registrar una necessitat de criteri com una tasca pendent i gestionar-ne el procés fins a l'aprovació.

Cada proposta de criteri ha de poder conservar:

- empresa, àrea i centres afectats;
- títol i problema detectat;
- dades o exemples dels centres;
- proposta tècnica;
- responsable de preparar-la;
- persones que l'han de revisar;
- prioritat, termini i pròxim pas;
- estat: detectada, en estudi, en prova, pendent d'aprovació, aprovada, rebutjada o substituïda;
- versió, data d'entrada en vigor i historial de decisions;
- documents, proves i observacions;
- centres obligats, centres opcionals i excepcions autoritzades.

Quan el criteri s'aprova, es converteix en una fitxa, plantilla, protocol o configuració corporativa publicable. Els centres afectats reben una notificació i Direcció pot comprovar-ne l'adopció.

Exemples de criteris gestionables:

- composició i rendiment estàndard d'un fons o fumet;
- gramatura autoritzada d'un plat per centre;
- productes bàsics homologats;
- controls APPCC comuns i controls específics;
- toleràncies de producció, minves i costos;
- criteris de torns, tasques i responsabilitats.

## Producció i valoració d'existències

Cada producció registra la fitxa i versió utilitzades, ingredients reals, lots, quantitat obtinguda, minva, cost real, responsable, lot de producció, caducitat i stock resultant.

La direcció pot consultar per centre, selecció de centres o total d'empresa:

- compres;
- existències de matèries primeres;
- existències processades;
- cost teòric i real;
- rendiments i desviacions;
- minves i diferències entre centres.

## Dades corporatives

El registre d'empleats és corporatiu per empresa. Cada empleat té:

- centre principal;
- zero o més centres addicionals autoritzats;
- estat, posició i funció per centre;
- hores contractades;
- accés a miniapp i dispositiu vinculat.

Els quadrants i fitxatges pertanyen sempre a un centre. La direcció pot totalitzar hores per empleat, centre i empresa.

## Geolocalització

Cada centre defineix coordenades, radi i tolerància GPS propis. Cada fitxatge desa empleat, centre, coordenades, precisió, distància, tipus i resultat. El servidor comprova que l'empleat està assignat al centre.

## CRM i direcció central

La vista Grup Tràfec consolida dades autoritzades sense barrejar-ne l'origen. Permet filtrar per un centre, diversos centres o tot el grup. Cada registre conserva empresaId i centreId.

## Comunicacions i tasques

Les comunicacions poden dirigir-se a:

- tota l'empresa;
- un o diversos centres;
- equips o posicions;
- empleats concrets.

Admeten prioritat, vigència, adjunts i confirmació de lectura. Una comunicació pot generar tasques individuals amb responsable, termini i estat.

La miniapp permet consultar, sense haver fitxat:

- horaris;
- tasques;
- comunicacions;
- documents autoritzats.

No exposa CRM, dades econòmiques, dades d'altres empleats ni informació de centres no autoritzats.

## Seguretat

La separació s'aplica al servidor, no només a la interfície. Cap usuari pot obtenir dades d'una empresa o centre no autoritzat canviant paràmetres de la petició.

Rols inicials:

- administrador de plataforma;
- direcció d'empresa;
- responsable de centre;
- responsable d'àrea;
- empleat miniapp.

## Migració

1. Crear empreses, centres, usuaris, rols i assignacions.
2. Assignar les dades existents a Casa Mestres sense alterar-ne els identificadors.
3. Traslladar o crear dades de Grup Tràfec només amb confirmació del centre d'origen.
4. Afegir selector d'empresa i centre.
5. Adaptar API, MCP, Back Office i miniapp.
6. Implementar la gestió de criteris pendents, aprovacions i publicació corporativa.
7. Verificar aïllament, permisos, còpies i restauració.
8. Integrar a main i desplegar una única versió Render.
