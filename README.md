# Conteo de Inventario — Lucciano's

App web (PWA) para contar stock (y desperdicio, si hubo) desde el celular, sucursal por sucursal.

## Qué incluye (archivos de esta actualización)

- `app.js` — lógica de la app (login, flujo Stock → ¿Desperdicio? → Excel combinado, ahora con Semanal/Mensual y registro de stock previo)
- `style.css` — agrega el estilo del cartelito "Antes: X" (stock previo)

*(el resto de los archivos — `index.html`, `products.js`, `manifest.json`, `service-worker.js`, `icons/`, `config.js` — no cambiaron en esta actualización, no hace falta volver a subirlos)*

## Usuarios cargados

| Usuario | Contraseña | Puede borrar conteos |
|---|---|---|
| `batodesrets` | `100393` | ✅ Sí |
| `bautista` | `100393` | ❌ No |
| `agostina` | `123456` | ❌ No |
| `manuel` | `123456` | ❌ No |
| `simon` | `123456` | ❌ No |
| `julian` | `123456` | ❌ No |

Para agregar, sacar o cambiar contraseñas más adelante: abrís `config.js` en GitHub, editás la lista `USERS` y hacés commit. Mismo recordatorio de siempre: esto es un control simple del lado del cliente (no hay servidor), no reemplaza una seguridad real.

## Nuevo flujo de conteo

1. **Login** → usuario y contraseña.
2. **Elegís la sucursal**.
3. **Elegís el tipo de conteo**: **Semanal** o **Mensual**.
   - **Semanal** → solo se puede cargar Stock y Desperdicio de **HELADO (KG)** e **ICE POPS** (todas sus variantes: Classic, Sin Baño, Bañados, Luxury, Dubai). El resto de las categorías no aparece.
   - **Mensual** → se habilita el listado completo, como antes.
   - En esta pantalla también se muestra cuándo fue el último conteo de ese mismo tipo en esa sucursal (si hubo alguno).
4. **Contás el Stock** (del listado que corresponda según el modo elegido). Mientras contás, si hubo un conteo anterior del mismo tipo (semanal con semanal, mensual con mensual) en esa sucursal, cada producto muestra un cartelito **"Antes: X"** con la cantidad de la vez pasada, a modo de referencia.
5. Al tocar **Finalizar conteo**, te pregunta: **"¿Tuviste desperdicios?"**
   - **No** → se genera directo el Excel, listo para compartir.
   - **Sí** → pasás a contar el desperdicio (mismo listado según el modo) y al finalizar se genera el Excel.
6. El Excel exportado es **un solo archivo** (`Stock Semanal - Sucursal - Fecha.xlsx` o `Stock Mensual - Sucursal - Fecha.xlsx`) con:
   - Pestaña **"Stock"** (siempre)
   - Pestaña **"Desperdicio"** (solo si contaste desperdicio)

## Registro de stock previo

Cada vez que se finaliza y comparte un conteo (semanal o mensual), la app guarda ese stock en el celular como "el último enviado" para esa combinación de **sucursal + tipo de conteo**. Eso permite:

- Ver en la pantalla de "¿Qué conteo vas a hacer?" la fecha del último conteo semanal y del último mensual de esa sucursal.
- Ver, mientras se está cargando el stock nuevo, cuánto había la vez anterior al lado de cada producto (cartelito verde "Antes: X").

Este registro es **solo informativo/de referencia** — no resta ni compara automáticamente, es para que quien cuenta tenga a mano el dato de la vez pasada. Se guarda en el localStorage del celular (igual que el resto de la info de la app), separado por sucursal y por tipo de conteo.

## Cómo subir esto a GitHub

Solo hace falta reemplazar 2 archivos:

1. `https://github.com/luccianoseuropa/conteodestock/upload/main`
2. Arrastrá `app.js` y `style.css`
3. Confirmá el reemplazo → Commit changes.

## Cómo se usa (flujo actual)

1. Abrís la app → login.
2. Elegís sucursal.
3. Elegís Semanal o Mensual.
4. Contás stock (buscador, categorías, `−`/`+`, coma decimal) — con referencia del conteo anterior si existe.
5. **Finalizar conteo** → "¿Tuviste desperdicios?" → Sí/No.
6. Si contaste desperdicio, lo contás igual que el stock y finalizás.
7. **Compartir** → se genera el Excel con las pestañas correspondientes y se abre el menú del celular para enviarlo.
8. En "Conteos finalizados", `batodesrets` puede borrar cualquier conteo; el resto solo puede verlos.

