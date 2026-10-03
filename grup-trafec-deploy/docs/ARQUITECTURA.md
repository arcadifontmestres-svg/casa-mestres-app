# Arquitectura mare — GRUP TRÀFEC

## 1. Ecosistema de miniapps

GRUP TRÀFEC no és una única aplicació gegant ni una còpia diferent per cada centre.

El sistema es construeix com un conjunt de **miniapps i eines funcionals autònomes**. Cada miniapp conserva la seva lògica i les seves dades, i pot ser utilitzada per un o més centres segons la configuració.

Exemples de miniapps o eines del catàleg:
- Reserves / Ocupació
- Fitxatges
- Gestió cuina
- Gestió magatzem
- Control normatiu / APPCC
- Gestió general
- Front Office / TPV
- CRM
- Comercial / Grups

No es crea una còpia nova de cada miniapp per centre.

## 2. App Gestió Grup Tràfec

**Gestió Grup Tràfec** és una app pròpia de govern. Té la porta oberta al conjunt del sistema i serveix per decidir com s'utilitzen les eines.

El seu menú principal és:
- Front Office
- Back Office
- RRHH
- Configuració

Dins d'aquests apartats es connecten les eines o miniapps reals.

## 3. Configuració

Configuració és l'origen de les dades de govern.

Ha de permetre:
- crear un centre nou;
- editar un centre;
- crear un empleat nou;
- editar un empleat;
- assignar centres a empleats;
- activar o desactivar eines / miniapps per centre.

Un centre nou **no rep funcions automàticament**. Neix buit i l'usuari decideix què hi posa.

## 4. Regla de dades

No hi ha centres, empleats, clients ni altres registres ficticis creats per defecte.

Les dades només existeixen quan:
1. l'usuari les crea expressament;
2. una miniapp real les genera com a part de la seva funció.

Exemple: a Reserves, una persona que reserva és un client de l'eina de reserves. No es converteix automàticament en empleat ni obliga a inventar cap altra dada de govern.

## 5. Centres

Els centres són entitats creades des de Configuració. Cada centre pot tenir un conjunt diferent d'eines o miniapps habilitades.

La mateixa miniapp pot treballar amb diferents centres sense duplicar el codi.

## 6. Estat d'una eina

El catàleg pot contenir:
- eines ja connectades i operatives;
- eines definides però encara pendents de connectar.

La interfície ha de distingir clarament aquests dos estats i no presentar una funció pendent com si ja funcionés.

## 7. Criteri funcional

Una funció es considera acabada quan compleix:

`crear → guardar → recarregar → consultar → conservar resultat`

La configuració i les dades de govern segueixen el mateix criteri.
