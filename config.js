// Ubicaciones disponibles para el conteo.
// Para agregar, quitar o renombrar una sucursal, editá esta lista.
const LOCATIONS = [
  'BCN 1 - Space',
  'BCN 2 - Moon',
  'Madrid',
  'Roma',
];

// Usuarios habilitados para entrar a la app.
// canDelete: true = puede borrar conteos/desperdicios ya finalizados del historial.
// Por ahora solo "claudios" tiene ese permiso, tal como pediste.
//
// ⚠️ IMPORTANTE: esta app es un sitio estático (sin servidor), así que este
// login es un control simple para que el personal no borre conteos por
// error o entre gente no autorizada — NO es seguridad real. Cualquiera que
// sepa mirar el código fuente de la página puede ver estas contraseñas.
// Si en algún momento necesitás protección de verdad (por ejemplo, más
// sucursales, más gente, datos sensibles), lo ideal sería sumar un backend
// con autenticación real.
//
// Cambiá estas contraseñas antes de subir la app a producción.
const USERS = [
  { username: 'claudios', password: 'CAMBIAR-ESTA-CLAVE', canDelete: true },
  { username: 'staff', password: 'lucciano2026', canDelete: false },
];

if (typeof module !== 'undefined') { module.exports = { LOCATIONS, USERS }; }
