# Conteo de Inventario — Lucciano's

App web (PWA) para contar stock (y desperdicio, si hubo) desde el celular, sucursal por sucursal.

## Qué incluye (archivos de esta actualización)

- `products.js` — se le agregaron los campos `price1` (Madrid/Málaga) y `price2` (BCN) a cada producto
- `config.js` — nuevo permiso `canEditPrices` (solo `batodesrets` por ahora)
- `app.js` — valorización automática del conteo (Excel + resumen en pantalla) + pantalla nueva de "Precios" con historial de cambios
- `README.md` — este archivo

*(el resto de los archivos — `index.html`, `manifest.json`, `service-worker.js`, `icons/`, `style.css` — no cambiaron en esta actualización)*

## Valorización automática del stock

Cada producto tiene dos precios de venta:

- **Precio 1** → se usa para conteos de **Madrid** y **Málaga**
- **Precio 2** → se usa para conteos de **cualquier sucursal de BCN** (BCN 1 - Space, BCN 2 - Moon, Fábrica BCN)

Al finalizar un conteo, la app detecta sola la sucursal y aplica el precio que corresponde. Esto se ve en dos lugares:

1. **En pantalla**, en el resumen final, una tarjeta muestra el "Valor total (Stock)" en €.
2. **En el Excel exportado**, la pestaña Stock (y Desperdicio, si hubo) tiene dos columnas nuevas — **Precio unitario (€)** y **Subtotal (€)** — y una fila **TOTAL** al final con el valor valorizado.

Si algún producto contado todavía no tiene precio cargado, no rompe nada: se deja en blanco, no suma al total, y aparece un aviso (⚠) tanto en pantalla como en el Excel para que se note.

## Pantalla de Precios (solo `batodesrets`)

Solo el usuario `batodesrets` ve un botón 💶 en la pantalla principal que abre una lista completa de productos con sus dos precios, editable ahí mismo (con buscador por nombre o código).

**Cómo funciona (importante, por ser una app sin servidor):**

- Al tocar **"Guardar cambios"**, los precios nuevos se guardan en el celular de `batodesrets` y ya valorizan los conteos hechos **desde ese mismo celular**.
- Para que el precio nuevo llegue a **todos los demás celulares** (los que usan `bautista`, `agostina`, etc.), hay que tocar **"Descargar products.js"** y subir ese archivo a GitHub, reemplazando el actual — exactamente el mismo mecanismo que ya se usa para `app.js`/`style.css` (`https://github.com/luccianoseuropa/conteodestock/upload/main`).
- Cada cambio de precio (quién, cuándo, producto, precio anterior y precio nuevo) queda anotado en un **historial**, accesible con el botón 🕘 arriba a la derecha de la pantalla de Precios. Desde ahí se puede descargar ese historial como Excel en cualquier momento, para no perderlo.

⚠️ Igual que con las contraseñas (ver más abajo), este historial y las ediciones en curso viven en el localStorage del celular de `batodesrets` — no están sincronizados en la nube. Conviene descargar el Excel del historial de tanto en tanto como respaldo.

### Sobre la carga inicial de precios

Los precios de esta actualización se cruzaron por **nombre de producto** contra la lista `listas_de_precios_terminados_-_MP_-_varios.xlsx`, porque los códigos de esa lista **no coinciden** con los códigos de `products.js` (son dos sistemas de codificación distintos). Se completaron automáticamente 212 de los 370 productos. Los que quedaron sin precio (`null`) son en su mayoría insumos internos que no se venden (uniformes, limpieza, moldes, materias primas) — pero también hay ~25 productos de venta real (helados, ice pops, pastelería, bebidas) cuyo nombre está escrito distinto entre las dos listas y no se pudo cruzar solo. Conviene que `batodesrets` revise esos desde la pantalla de Precios (van a aparecer con el cartelito rojo "Sin precio cargado") y los complete a mano.

## Usuarios cargados

| Usuario | Contraseña | Puede borrar conteos | Puede editar precios |
|---|---|---|---|
| `batodesrets` | `100393` | ✅ Sí | ✅ Sí |
| `bautista` | `100393` | ❌ No | ❌ No |
| `agostina` | `123456` | ❌ No | ❌ No |
| `manuel` | `123456` | ❌ No | ❌ No |
| `simon` | `123456` | ❌ No | ❌ No |
| `julian` | `123456` | ❌ No | ❌ No |

Para agregar, sacar o cambiar contraseñas/permisos más adelante: abrís `config.js` en GitHub, editás la lista `USERS` y hacés commit. Mismo recordatorio de siempre: esto es un control simple del lado del cliente (no hay servidor), no reemplaza una seguridad real.

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

