# Conteo de Inventario — Lucciano's

App web (PWA) para contar stock (y desperdicio, si hubo) desde el celular, sucursal por sucursal.

## Qué incluye (archivos de esta actualización)

- `app.js` — lógica de la app (login, flujo Stock → ¿Desperdicio? → Excel combinado)
- `config.js` — usuarios reales cargados (nuevo)

*(el resto de los archivos — `index.html`, `style.css`, `products.js`, `manifest.json`, `service-worker.js`, `icons/` — no cambiaron en esta actualización, no hace falta volver a subirlos)*

## Usuarios cargados

| Usuario | Contraseña | Puede borrar conteos |
|---|---|---|
| `batodesrets` | `100393` | ✅ Sí |
| `bautista` | `100393` | ❌ No |
| `agostina` | `123456` | ❌ No |
| `manuel` | `123456` | ❌ No |
| `simon` | `123456` | ❌ No |

Para agregar, sacar o cambiar contraseñas más adelante: abrís `config.js` en GitHub, editás la lista `USERS` y hacés commit. Mismo recordatorio de siempre: esto es un control simple del lado del cliente (no hay servidor), no reemplaza una seguridad real.

## Nuevo flujo de conteo

Ya no se elige "Stock" o "Desperdicio" al principio. Ahora es todo un solo recorrido:

1. **Login** → usuario y contraseña.
2. **Elegís la sucursal**.
3. **Contás el Stock** (todo el listado de productos).
4. Al tocar **Finalizar conteo**, te pregunta: **"¿Tuviste desperdicios?"**
   - **No** → se genera directo el Excel, listo para compartir.
   - **Sí** → pasás a contar el desperdicio (mismo listado de productos) y al finalizar se genera el Excel.
5. El Excel exportado es **un solo archivo** (`Sucursal - Fecha.xlsx`) con:
   - Pestaña **"Stock"** (siempre)
   - Pestaña **"Desperdicio"** (solo si contaste desperdicio)

## Cómo subir esto a GitHub

Solo hace falta reemplazar 2 archivos:

1. `https://github.com/luccianoseuropa/conteodestock/upload/main`
2. Arrastrá `app.js` y `config.js`
3. Confirmá el reemplazo → Commit changes.

## Cómo se usa (flujo actual)

1. Abrís la app → login.
2. Elegís sucursal.
3. Contás stock (buscador, categorías, `−`/`+`, coma decimal).
4. **Finalizar conteo** → "¿Tuviste desperdicios?" → Sí/No.
5. Si contaste desperdicio, lo contás igual que el stock y finalizás.
6. **Compartir** → se genera el Excel con las pestañas correspondientes y se abre el menú del celular para enviarlo.
7. En "Conteos finalizados", `batodesrets` puede borrar cualquier conteo; el resto solo puede verlos.
