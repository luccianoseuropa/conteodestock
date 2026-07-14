# Conteo de Inventario — Lucciano's

App web (PWA) para contar stock o desperdicio desde el celular, sucursal por sucursal.

## Qué incluye (archivos de esta actualización)

- `index.html` — pantalla principal (título/nombre "Stock")
- `app.js` — lógica de la app (login, sesión, conteo, borrado con permisos, exportar a Excel)
- `config.js` — sucursales **+ usuarios habilitados** (nuevo)
- `manifest.json` — nombre de la app ahora es **"Stock"**
- `icons/` — ícono en negro con "Lucciano's" en blanco *(placeholder, ver nota abajo)*

*(`style.css`, `products.js` y `service-worker.js` no cambiaron — no hace falta volver a subirlos)*

## Novedades de esta versión

### 1. Borrar conteos — solo vos
En "Conteos finalizados" ahora hay un botón **Borrar** al lado de "Ver", pero solo lo ve el usuario con permiso (`claudios`). El resto del personal solo puede ver, no borrar. Pide confirmación antes de borrar.

### 2. Login con usuario y contraseña
Al abrir la app por primera vez, pide usuario y contraseña. Una vez que entrás, se guarda la sesión en el celular (no te la vuelve a pedir la próxima vez) hasta que toques el botón de cerrar sesión (⎋, arriba a la derecha).

**Usuarios configurados ahora mismo** (en `config.js`):
| Usuario | Contraseña | Puede borrar |
|---|---|---|
| `claudios` | `CAMBIAR-ESTA-CLAVE` | ✅ Sí |
| `staff` | `lucciano2026` | ❌ No |

**⚠️ Importante sobre seguridad:** esta app vive en GitHub Pages, un hosting de archivos estáticos, sin servidor propio. Este login es un control simple para que el personal no borre cosas por error o gente sin usuario no entre a la app — **no es seguridad real**. Cualquiera que sepa inspeccionar el código fuente de la página puede leer las contraseñas en `config.js`. Si más adelante necesitás protección de verdad (por ejemplo, si vas a manejar datos más sensibles o querés evitar que alguien motivado entre igual), lo correcto sería un backend con autenticación de verdad — avisame si querés que lo charlemos.

**Cambiá la contraseña de `claudios`** en `config.js` antes de subir esto (ahora mismo dice `CAMBIAR-ESTA-CLAVE` a propósito, para que la reemplaces vos).

### 3. Ícono e identidad
- Ícono ahora con el **logo real de Lucciano's** que nos pasaste, centrado sobre fondo negro redondeado.
- Nombre de la app al instalarla en el celular: **"Stock"**.

## Cómo subir esto a GitHub

Solo reemplazá estos 5 archivos/carpeta (mismo nombre, GitHub te va a avisar que ya existen):

1. `https://github.com/luccianoseuropa/conteodestock/upload/main`
2. Arrastrá: `index.html`, `app.js`, `config.js`, `manifest.json`, carpeta `icons`
3. Confirmá el reemplazo → Commit changes.

## Cómo se usa (flujo actual)

1. Abrís la app → **login** (usuario y contraseña).
2. Elegís **sucursal**.
3. Elegís **Contar Stock** o **Contar Desperdicio**.
4. Contás productos (buscador, categorías, `−`/`+`, coma decimal).
5. **Finalizar conteo** → **Compartir** → se genera el Excel (`Sucursal - Stock/Desperdicio - Fecha.xlsx`).
6. Desde la pantalla de inicio, en "Conteos finalizados", `claudios` puede borrar cualquier conteo; el resto del personal solo puede verlos.



