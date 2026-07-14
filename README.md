# Conteo de Inventario — Lucciano's

App web (PWA) para contar inventario desde el celular, sucursal por sucursal.

## Qué incluye

- `index.html` — pantalla principal
- `style.css` — estilos
- `app.js` — lógica de la app (pantallas, conteo, guardado, compartir)
- `products.js` — listado de **371 productos** con código y categoría (generado desde `Listado_productos_Stock.xlsx`, pestañas *Productos terminados*, *Pasteleria* y *VARIOS*)
- `config.js` — lista de sucursales (editable)
- `manifest.json` + `service-worker.js` — hacen que la app se pueda instalar y funcione offline
- `icons/` — ícono de la app

## Sobre el listado de productos

- Se usaron las **3 pestañas** indicadas (no se usó "DESPERDICIO", que es un registro de mermas, no un catálogo de productos).
- Se tomó **solo código y nombre** — no se copiaron importes ni cantidades del archivo original.
- **127 productos no tenían código** en el Excel (mayormente uniformes, limpieza y algunos insumos). Se les asignó un código correlativo nuevo a partir del **90001** para que ninguno quede sin identificar. Podés reconocerlos porque son los únicos con código ≥ 90000 — si preferís asignarles otro código más adelante, se cambia directo en `products.js`.
- Categorías tal como estaban en el Excel (39 en total: HELADO (KG), ICE POPS CLASSIC/SIN BAÑO/BAÑADOS/LUXURY, PASTELERIA, TERMICOS, POLIPAPEL, salsas, uniformes, limpieza, etc.)

## Cómo subirlo a GitHub

1. Entrá a tu repositorio en GitHub (o creá uno nuevo: botón **New** en github.com).
2. Click en **Add file → Upload files**.
3. Arrastrá los 8 archivos y la carpeta `icons` (con los 2 íconos adentro) — todo debe quedar en la **raíz** del repo (no dentro de una subcarpeta), salvo `icons/`, que sí va como carpeta.
4. Escribí un mensaje de commit (ej: "App de inventario") y click en **Commit changes**.

## Cómo activar el link público (GitHub Pages)

1. En el repo, click en **Settings** (arriba a la derecha).
2. En el menú izquierdo, click en **Pages**.
3. En "Branch", elegí `main` y la carpeta `/ (root)`. Click en **Save**.
4. Esperá 1-2 minutos. GitHub te va a mostrar un link tipo:
   `https://tu-usuario.github.io/nombre-del-repo/`
5. Ese es el link que vas a abrir desde el celular.

## Cómo instalarla en el celular

**Android (Chrome):**
1. Abrí el link de GitHub Pages en Chrome.
2. Tocá el menú (⋮) arriba a la derecha.
3. Elegí **"Instalar app"** o **"Agregar a pantalla de inicio"**.

**iPhone (Safari):**
1. Abrí el link en Safari (tiene que ser Safari, no Chrome).
2. Tocá el botón de **Compartir** (el cuadrado con la flecha hacia arriba).
3. Elegí **"Agregar a pantalla de inicio"**.

Después de instalarla, el ícono va a aparecer como una app normal y funciona sin conexión.

## Cómo editar sucursales o productos más adelante

- **Sucursales**: abrí `config.js`, editá la lista `LOCATIONS`.
- **Productos**: abrí `products.js`, cada producto es una línea `{ code: ..., name: '...', category: '...' }`. Podés agregar, borrar o corregir directamente ahí.
- Después de editar en GitHub, los cambios se ven en la app la próxima vez que la abrís con internet (el service worker actualiza el caché solo).

## Cómo se usa

1. Abrís la app → **Nuevo conteo** → elegís sucursal.
2. Buscás productos por nombre o código, o filtrás por categoría (los chips de arriba).
3. Contás con los botones `−` `+`, o tipeás la cantidad directo.
4. Se guarda solo en el celular a medida que contás (si cerrás la app, seguís donde quedaste).
5. Al terminar, **Finalizar conteo** → **Compartir** → elegís WhatsApp, mail, o lo que quieras desde el menú del celular.
