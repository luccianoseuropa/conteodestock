# Conteo de Inventario — Lucciano's

App web (PWA) para contar inventario desde el celular, sucursal por sucursal.

## Qué incluye

- `index.html` — pantalla principal (incluye la librería SheetJS para generar el Excel)
- `style.css` — estilos
- `app.js` — lógica de la app (pantallas, conteo, guardado, exportar a Excel)
- `products.js` — listado de **371 productos** con código, categoría y **unidad de medida** (generado desde `Listado_productos_Stock.xlsx`, pestañas *Productos terminados*, *Pasteleria* y *VARIOS*)
- `config.js` — lista de sucursales: **BCN 1 - Space, BCN 2 - Moon, Madrid, Roma** (editable)
- `manifest.json` + `service-worker.js` — hacen que la app se pueda instalar y funcione offline
- `icons/` — ícono de la app

## Novedades de esta versión

1. **Sucursales actualizadas**: BCN 1 - Space, BCN 2 - Moon, Madrid, Roma.
2. **Cantidades con coma decimal**: ahora podés tipear `1,5` en vez de `1.5`. Además, cada producto muestra su **unidad de medida** (Kg, Litro, Unidad, Caja o Cápsula) al lado del código.
   - Unidades ya definidas: HELADO (KG) → Kg. Ice Pops (todas las variantes), Cannolis, Pastelería y Frascos DDL → Unidad. El resto de categorías (salsas, lácteos, limpieza, uniformes, etc.) ya traían su unidad correcta desde el Excel original.
3. **Exportación a Excel real** (no texto): al tocar "Compartir" se genera un archivo `.xlsx` con las columnas **Código, Producto, Categoría, Unidad de medida, Cantidad contada, Sucursal, Fecha del conteo**, y se abre el menú nativo para compartirlo (WhatsApp, mail, Drive, etc). Si el navegador no permite compartir archivos directo, lo descarga y avisa para compartirlo manualmente desde Descargas.

## Sobre el listado de productos

- Se usaron las **3 pestañas** indicadas (no se usó "DESPERDICIO", que es un registro de mermas, no un catálogo de productos).
- Se tomó **solo código y nombre** — no se copiaron importes ni cantidades del archivo original.
- **127 productos** no tenían código en el Excel (mayormente uniformes, limpieza y algunos insumos). Se les asignó un código correlativo nuevo a partir del **90001**. Podés reconocerlos porque son los únicos con código ≥ 90000.
- Categorías tal como estaban en el Excel (39 en total).

## Cómo subirlo a GitHub

1. Entrá a tu repositorio en GitHub.
2. Click en **Add file → Upload files**.
3. Arrastrá los 8 archivos y la carpeta `icons` (con los 2 íconos adentro) — todo debe quedar en la **raíz** del repo, salvo `icons/`, que va como carpeta.
4. Escribí un mensaje de commit y click en **Commit changes**.

Si ya tenías el repo subido antes, este upload va a **sobrescribir** los archivos existentes con la versión nueva (mismos nombres de archivo).

## Cómo activar el link público (GitHub Pages)

1. En el repo, click en **Settings**.
2. Menú izquierdo → **Pages**.
3. Branch `main`, carpeta `/ (root)`. **Save**.
4. Esperá 1-2 minutos y abrí el link `https://tu-usuario.github.io/nombre-del-repo/` desde el celular.

## Cómo instalarla en el celular

**Android (Chrome):** abrí el link → menú (⋮) → **"Instalar app"**.
**iPhone (Safari):** abrí el link en Safari → botón **Compartir** → **"Agregar a pantalla de inicio"**.

## Cómo editar sucursales, productos o unidades más adelante

- **Sucursales**: `config.js` → lista `LOCATIONS`.
- **Productos y unidades**: `products.js`, cada línea es `{ code: ..., name: '...', category: '...', unit: '...' }`.

## Cómo se usa

1. **Nuevo conteo** → elegís sucursal.
2. Buscás por nombre/código o filtrás por categoría.
3. Contás con `−` `+`, o tipeás la cantidad (acepta coma decimal, ej: `2,5`).
4. Se guarda solo en el celular a medida que contás.
5. **Finalizar conteo** → **Compartir** → se genera el Excel y se abre el menú del celular para enviarlo.

