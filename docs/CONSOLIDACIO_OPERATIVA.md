# GRUP TRÀFEC — CONSOLIDACIÓ OPERATIVA

Data d'inici d'aquest criteri: 2026-10-02

## Objectiu únic

No crear una altra aplicació. Consolidar l'aplicació existent, ordenar-la i deixar-la estable.

## Criteris fixos

- Una sola font de dades mestra.
- Direcció governa i configura.
- Els centres executen només les funcions autoritzades.
- La miniapp de centre no duplica base de dades ni lògica central.
- El codi d'empleat és global; la vinculació del dispositiu és independent del codi d'empleat.
- No es dona cap bloc per acabat fins que passi: **crear → guardar → recarregar → consultar → conservar**.
- Quan una peça funciona i passa la prova, es congela. No es redissenya sense una incidència concreta.

## Servei de dades autoritatiu

- Servei Render amb disc persistent: `casa-mestres-restaurant-app`.
- Branca de producció: `main`.
- El servei `grup-trafec-operatiu` és només un clon/prova i no s'ha d'utilitzar com a font mestra mentre no tingui persistència garantida.

## Ordre de tancament

### 1. Central / context / permisos
- [EN CURS] Identitat GRUP TRÀFEC a la central.
- [EN CURS] Direcció pot entrar a tots els mòduls sense rebotar a Inici.
- [PENDENT VALIDAR] Context `Grup Tràfec · SARRIERA1930` conserva dades després de recarregar.

### 2. RRHH
- [EN CURS] Empleats de Sarriera recuperats o reconstruïts des dels fitxatges existents.
- [PENDENT VALIDAR] Empleats.
- [PENDENT VALIDAR] Horaris.
- [PENDENT VALIDAR] Fitxatges.
- [PENDENT VALIDAR] Resum laboral / vacances / festius.

### 3. Miniapp Fitxatges
- [PENDENT] Empleat → activació temporal → dispositiu vinculat.
- [PENDENT] Entrada → pausa → tornar → sortida.
- [PENDENT] GPS i persistència.
- [PENDENT] Resum d'hores actualitzat amb els fitxatges.

### 4. Miniapp Centre
- [EN CURS] HTML/CSS de centre ja existent.
- [EN CURS] Sarriera vinculada al centre real de la base de dades, no a un ID antic fix.
- [PENDENT VALIDAR] Codi de vinculació → token de dispositiu.
- [PENDENT VALIDAR] Agenda centre.
- [PENDENT VALIDAR] Reserves.
- [PENDENT VALIDAR] Operativa autoritzada.
- [PENDENT VALIDAR] Crear/guardar/recarregar des del dispositiu.

### 5. Cuina / Magatzem / APPCC
- [PENDENT VALIDAR] Productes.
- [PENDENT VALIDAR] Bases.
- [PENDENT VALIDAR] Plats / escandalls.
- [PENDENT VALIDAR] Inventari / previsió / compra.
- [PENDENT VALIDAR] APPCC / recepció / traçabilitat.

### 6. Comercial / Reserves / Ocupació
- [PENDENT VALIDAR] CRM.
- [PENDENT VALIDAR] Comercial i grups.
- [PENDENT VALIDAR] Reserves i ocupació com a única font.

## Regla de continuïtat

Cada sessió ha de començar llegint aquest fitxer i continuar pel primer bloc no tancat. No s'ha de tornar a definir l'arquitectura ni obrir un projecte paral·lel.
