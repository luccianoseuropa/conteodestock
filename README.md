# Conteo de Inventario — Lucciano's

App web (PWA) para contar inventario o desperdicio desde el celular, sucursal por sucursal.

## Qué incluye

- `index.html` — pantalla principal (incluye la librería SheetJS para generar el Excel)
- `style.css` — estilos (acento en negro)
- `app.js` — lógica de la app (pantallas, conteo, guardado, exportar a Excel)
- `products.js` — listado de **371 productos** con código, categoría y unidad de medida *(sin cambios en esta versión)*
- `config.js` — sucursales: BCN 1 - Space, BCN 2 - Moon, Madrid, Roma *(sin cambios en esta versión)*
- `manifest.json` + `service-worker.js` — instalación y funcionamiento offline
- `icons/` — ícono de la app (ahora en negro)

## Novedades de esta versión

1. **Categorías con scroll automático**: al elegir una categoría en la barra de arriba, la barra se desliza sola para que sigas viendo las opciones siguientes.
2. **La página ya no salta al principio** al elegir una categoría — se actualiza solo la lista de productos.
3. **Excel sin columna de fecha**: la fecha ya queda en el nombre del archivo, no hace falta repetirla en una columna.
4. **Nuevo flujo de uso**:
   - Al abrir la app, lo primero que aparece es elegir **sucursal**.
   - Después elegís **Contar Stock** o **Contar Desperdicio** (mismo listado de productos para ambos).
   - El archivo exportado se llama: `Sucursal - Stock o Desperdicio - Fecha.xlsx` (ej: `BCN 1 - Space - Stock - 14-07-2026.xlsx`).
5. **Color**: se cambió el rosa por negro en toda la app (barra superior, botones, ícono).

## Cómo subirlo a GitHub

Como ya tenés el repo `conteodestock` creado, solo hace falta **reemplazar** estos archivos (mismo nombre que ya subiste):

1. Entrá a: `https://github.com/luccianoseuropa/conteodestock/upload/main`
2. Arrastrá los archivos que te paso ahora: `index.html`, `style.css`, `app.js`, `manifest.json` y la carpeta `icons` (con los 2 íconos).
3. GitHub va a avisarte que esos archivos ya existen y los vas a **reemplazar** — confirmá.
4. Commit changes.

No hace falta volver a subir `products.js` ni `config.js` porque no cambiaron en esta actualización.

Unos minutos después de subir, el link `https://luccianoseuropa.github.io/conteodestock/` ya va a mostrar la versión nueva (puede tardar un poco por el caché del service worker — si no se ve actualizado, cerrá la app del todo y volvé a abrirla, o hacé "Actualizar" en el navegador).

## Cómo se usa (flujo actual)

1. Abrís la app → elegís **sucursal**.
2. Elegís **Contar Stock** o **Contar Desperdicio**.
3. Buscás por nombre/código o filtrás por categoría.
4. Contás con `−` `+`, o tipeás la cantidad (acepta coma decimal, ej: `2,5`).
5. Se guarda solo en el celular a medida que contás.
6. **Finalizar conteo** → **Compartir** → se genera el Excel (`Sucursal - Stock/Desperdicio - Fecha.xlsx`) y se abre el menú del celular para enviarlo.


