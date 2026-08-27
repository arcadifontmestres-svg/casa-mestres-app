# Regla del projecte únic

Aquest repositori és **ARCADI GESTIO RESTAURANT**. És l’única font del programa.

## Què no s’ha de tornar a fer

- No crear carpetes `FINAL`, `FINAL_v2`, `MASTER`, `NETA` o semblants.
- No copiar tot el projecte per modificar una pantalla.
- No mantenir un codi diferent per a Render i Windows.
- No crear catàlegs duplicats de productes, plats, reserves o proveïdors.
- No pujar manualment un ZIP diferent del contingut del repositori.

## Com es fa una modificació

1. Es modifica el fitxer corresponent dins aquest projecte.
2. S’executen `npm run check` i `npm test`.
3. Es revisen només els fitxers que han canviat.
4. Es fa un commit amb una descripció clara.
5. Render desplega el mateix commit.
6. El workflow de Windows crea l’EXE del mateix commit.

Una modificació és un canvi del projecte, **no una nova versió completa descarregada en una altra carpeta**.

## Dades

- `data.json` és la seed i la còpia de referència.
- `seed/catalog.json` completa una instal·lació nova sense tocar instal·lacions existents.
- A Render, les dades vives són al disc persistent configurat amb `DATA_DIR`.
- A Windows, les dades vives són a la carpeta d’usuari del programa.
- L’EXE no conté l’única còpia de les dades: es pot actualitzar sense perdre-les.

## IA

La IA és una integració opcional. No pot ser necessària per arrencar, guardar, imprimir ni consultar cap mòdul.
