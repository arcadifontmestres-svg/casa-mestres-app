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

El codi JavaScript és compartit i únic. No es creen còpies de l'aplicació per centre.

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
6. Verificar aïllament, permisos, còpies i restauració.
7. Integrar a main i desplegar una única versió Render.
