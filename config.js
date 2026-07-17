// Ubicaciones disponibles para el conteo.
// Cada una puede tener una foto (archivo de imagen subido junto a la app,
// en la raíz del repo) para identificarla más fácil al elegir sucursal.
// Si "photo" es null, se muestra un ícono genérico en su lugar.
const LOCATIONS = [
  { name: 'BCN 1 - Space', photo: 'loc-bcn1.jpg' },
  { name: 'BCN 2 - Moon', photo: 'loc-bcn2.jpg' },
  { name: 'Madrid', photo: 'loc-madrid.jpg' },
  { name: 'Málaga 1', photo: 'loc-malaga1.jpg' },
  { name: 'Fabrica BCN', photo: null },
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
  { username: 'batodesrets', password: '100393', canDelete: true },
  { username: 'bautista', password: '100393', canDelete: false },
  { username: 'agostina', password: '123456', canDelete: false },
  { username: 'manuel', password: '123456', canDelete: false },
  { username: 'simon', password: '123456', canDelete: false },
  { username: 'julian', password: '123456', canDelete: false },
];

if (typeof module !== 'undefined') { module.exports = { LOCATIONS, USERS }; }
