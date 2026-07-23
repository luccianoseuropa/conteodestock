/* ============================================================
   Conteo de Inventario - lógica principal
   Pantallas: login -> location -> count (stock) -> askWaste -> count (desperdicio) -> summary
   El Stock y el Desperdicio comparten el mismo listado de productos
   y terminan en UN SOLO Excel con dos pestañas: "Stock" y "Desperdicio".
   ============================================================ */

const STORAGE_KEY = 'inv_current_count';
const HISTORY_KEY = 'inv_history';
const SESSION_KEY = 'inv_logged_user';
const PREV_STOCK_KEY = 'inv_prev_stock'; // registro del último stock enviado, por sucursal + modo
const PRICE_OVERRIDES_KEY = 'inv_price_overrides'; // { [code]: { price1, price2 } } -- ediciones de precio hechas en este celular
const PRICE_HISTORY_KEY = 'inv_price_history';       // [{ code, name, oldPrice1, newPrice1, oldPrice2, newPrice2, user, at }]

let state = {
  screen: 'login',     // login | location | mode | changePassword | count | askWaste | summary
  currentUser: null,
  location: null,
  mode: null,           // 'semanal' | 'mensual' -- qué tipo de conteo se está haciendo
  stage: 'stock',       // 'stock' | 'desperdicio' -- qué se está contando ahora mismo
  startedAt: null,
  stockCounts: {},       // { code: qty }
  wasteCounts: {},        // { code: qty }
  wasteNotes: {},          // { code: 'motivo del desperdicio' }
  heladoDetails: { stock: {}, desperdicio: {} }, // { code: { vasquetas, manualKg } } -- solo para HELADO (KG)
  boxDetails: { stock: {}, desperdicio: {} },      // { code: { cajas, udXCaja, sueltas } } -- para el resto (menos ice pops)
  undoStack: [],            // [{ stage, code, prevValue }] -- para el botón Deshacer
  search: '',
  activeCategory: 'Todas',
  viewingHistoryId: null, // when set, summary shows a read-only past count
  priceSearch: '', // buscador de la pantalla de Precios (independiente del buscador de conteo)
};

const app = document.getElementById('app');

/* ---------------- Persistence ---------------- */

function saveCurrent() {
  if (!state.location) return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    location: state.location,
    mode: state.mode,
    stage: state.stage,
    startedAt: state.startedAt,
    stockCounts: state.stockCounts,
    wasteCounts: state.wasteCounts,
    wasteNotes: state.wasteNotes,
    heladoDetails: state.heladoDetails,
    boxDetails: state.boxDetails,
  }));
}

function loadCurrent() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (e) { return null; }
}

function clearCurrent() {
  localStorage.removeItem(STORAGE_KEY);
}

function loadHistory() {
  const raw = localStorage.getItem(HISTORY_KEY);
  if (!raw) return [];
  try { return JSON.parse(raw); } catch (e) { return []; }
}

function saveHistory(entry) {
  const hist = loadHistory();
  hist.unshift(entry);
  // Keep at most 30 finished counts locally
  localStorage.setItem(HISTORY_KEY, JSON.stringify(hist.slice(0, 30)));
}

function deleteHistoryEntry(index) {
  const hist = loadHistory();
  hist.splice(index, 1);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(hist));
}

/* --- Registro de stock previo ---
   Cada vez que se finaliza y se comparte un conteo (semanal o mensual),
   guardamos ese stock como "el último enviado" para esa sucursal + ese
   modo. La próxima vez que alguien arranca el mismo tipo de conteo en la
   misma sucursal, puede ver junto a cada producto cuánto había la vez
   anterior, a modo de referencia (no se usa para calcular nada, es solo
   informativo). */
function loadPrevStockAll() {
  const raw = localStorage.getItem(PREV_STOCK_KEY);
  if (!raw) return {};
  try { return JSON.parse(raw); } catch (e) { return {}; }
}

function getPrevStock(location, mode) {
  const all = loadPrevStockAll();
  return (all[location] && all[location][mode]) || null;
}

function savePrevStock(location, mode, stockCounts, savedAt, generatedBy) {
  if (!location || !mode) return;
  const all = loadPrevStockAll();
  if (!all[location]) all[location] = {};
  all[location][mode] = { stockCounts: stockCounts || {}, savedAt, generatedBy };
  localStorage.setItem(PREV_STOCK_KEY, JSON.stringify(all));
}

function findUser(username) {
  return USERS.find(u => u.username.toLowerCase() === String(username).toLowerCase());
}

function currentUserCanDelete() {
  const u = findUser(state.currentUser);
  return !!(u && u.canDelete);
}

function currentUserCanEditPrices() {
  const u = findUser(state.currentUser);
  return !!(u && u.canEditPrices);
}

/* --- Precios (Precio 1: Madrid/Málaga · Precio 2: BCN) ---
   Los precios "base" viven horneados en products.js (price1/price2 de cada
   producto), igual que pasa con USERS en config.js. Como la app no tiene
   servidor, cuando batodesrets edita un precio guardamos un "override" en
   el localStorage de ESE celular -- se usa al toque en ese dispositivo para
   valorizar conteos, pero para que TODOS los celulares vean el precio nuevo
   hay que descargar el products.js actualizado y subirlo a GitHub (como ya
   se hace con app.js/style.css). Cada cambio queda anotado en un historial,
   también guardado en este celular. */
function loadPriceOverrides() {
  const raw = localStorage.getItem(PRICE_OVERRIDES_KEY);
  if (!raw) return {};
  try { return JSON.parse(raw); } catch (e) { return {}; }
}

function savePriceOverrides(overrides) {
  localStorage.setItem(PRICE_OVERRIDES_KEY, JSON.stringify(overrides));
}

function getBaseProduct(code) {
  return PRODUCTS.find(p => String(p.code) === String(code));
}

function getEffectivePrice(code, field) {
  // field: 'price1' | 'price2'
  const overrides = loadPriceOverrides();
  const ov = overrides[code];
  if (ov && ov[field] !== undefined && ov[field] !== null && ov[field] !== '') return Number(ov[field]);
  const base = getBaseProduct(code);
  return base && base[field] !== null && base[field] !== undefined ? Number(base[field]) : null;
}

// Madrid y Málaga usan Precio 1; todas las sucursales de Barcelona (incluida
// la Fábrica BCN) usan Precio 2.
function priceFieldForLocation(location) {
  return /BCN/i.test(location || '') ? 'price2' : 'price1';
}

function priceLabelForLocation(location) {
  return priceFieldForLocation(location) === 'price2' ? 'Precio 2 (BCN)' : 'Precio 1 (Madrid / Málaga)';
}

function loadPriceHistory() {
  const raw = localStorage.getItem(PRICE_HISTORY_KEY);
  if (!raw) return [];
  try { return JSON.parse(raw); } catch (e) { return []; }
}

function addPriceHistoryEntries(entries) {
  if (!entries || !entries.length) return;
  const hist = loadPriceHistory();
  hist.unshift(...entries);
  // Guardamos hasta 2000 cambios en este celular para no crecer sin límite.
  localStorage.setItem(PRICE_HISTORY_KEY, JSON.stringify(hist.slice(0, 2000)));
}

function loadSession() {
  return localStorage.getItem(SESSION_KEY);
}

function saveSession(username) {
  localStorage.setItem(SESSION_KEY, username);
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

/* --- Cambio de contraseña ---
   Los usuarios base viven en config.js (USERS), que es un archivo estático:
   la app no puede reescribirlo sola. Por eso, cuando alguien cambia su
   contraseña, guardamos un "override" en el localStorage de ESE celular.
   Esa nueva contraseña va a funcionar en ese celular/navegador. Si la
   persona usa otro dispositivo, ahí todavía va a pedir la contraseña
   original de config.js (a menos que la cambie ahí también). */
const PW_OVERRIDES_KEY = 'inv_pw_overrides';

function loadPasswordOverrides() {
  const raw = localStorage.getItem(PW_OVERRIDES_KEY);
  if (!raw) return {};
  try { return JSON.parse(raw); } catch (e) { return {}; }
}

function getEffectivePassword(username) {
  const overrides = loadPasswordOverrides();
  const key = username.toLowerCase();
  if (overrides[key]) return overrides[key];
  const u = findUser(username);
  return u ? u.password : null;
}

function setPasswordOverride(username, newPassword) {
  const overrides = loadPasswordOverrides();
  overrides[username.toLowerCase()] = newPassword;
  localStorage.setItem(PW_OVERRIDES_KEY, JSON.stringify(overrides));
}

/* ---------------- Íconos SVG inline ----------------
   Reemplazan los emojis usados como íconos funcionales (flechas, buscar,
   candado, tema, compartir, etc). Los emojis "decorativos" grandes de las
   pantallas de bienvenida (🍦🔒🗓️🗑️) se dejan igual, a propósito, para
   mantener un toque cálido/humano en esas pantallas. */
const ICONS = {
  chevronLeft: '<svg class="icon-svg" viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg>',
  chevronRight: '<svg class="icon-svg" viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"/></svg>',
  moon: '<svg class="icon-svg" viewBox="0 0 24 24"><path d="M21 12.8A9 9 0 1111.2 3 7 7 0 0021 12.8z"/></svg>',
  sun: '<svg class="icon-svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4.5"/><path d="M12 2v2.5M12 19.5V22M4.2 4.2l1.8 1.8M18 18l1.8 1.8M2 12h2.5M19.5 12H22M4.2 19.8L6 18M18 6l1.8-1.8"/></svg>',
  phone: '<svg class="icon-svg" viewBox="0 0 24 24"><rect x="7" y="2.5" width="10" height="19" rx="2"/><path d="M11 18.5h2"/></svg>',
  desktop: '<svg class="icon-svg" viewBox="0 0 24 24"><rect x="2.5" y="4" width="19" height="13" rx="1.5"/><path d="M8 21h8M12 17v4"/></svg>',
  key: '<svg class="icon-svg" viewBox="0 0 24 24"><circle cx="8" cy="9" r="4.5"/><path d="M11.3 12.2L21 21.9M17.3 17.9l2.6-2.6M14.6 15.2l2.1-2.1"/></svg>',
  logout: '<svg class="icon-svg" viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></svg>',
  search: '<svg class="icon-svg" viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M20 20l-4.6-4.6"/></svg>',
  undo: '<svg class="icon-svg" viewBox="0 0 24 24"><path d="M4 10h10a5 5 0 010 10H9"/><path d="M9 5L4 10l5 5"/></svg>',
  share: '<svg class="icon-svg" viewBox="0 0 24 24"><path d="M12 15V3"/><path d="M7 8l5-5 5 5"/><path d="M5 13v6a2 2 0 002 2h10a2 2 0 002-2v-6"/></svg>',
  checkCircle: '<svg class="icon-svg" viewBox="0 0 24 24" style="stroke-width:1.6;"><circle cx="12" cy="12" r="10"/><path d="M7.5 12.5l3 3 6-6.5"/></svg>',
  building: '<svg class="icon-svg" viewBox="0 0 24 24"><rect x="4" y="3" width="16" height="18" rx="1"/><path d="M9 8h1M14 8h1M9 12h1M14 12h1M9 16h1M14 16h1"/></svg>',
};

// Paleta cíclica para colorear categorías (barra izquierda de cada producto,
// punto del encabezado de categoría y barras del resumen final). Se asigna
// según la posición de la categoría en CATEGORIES, así el mismo nombre
// siempre tiene el mismo color en toda la app.
function categoryColor(category) {
  const idx = CATEGORIES.indexOf(category);
  const n = idx >= 0 ? idx : 0;
  return `var(--cat-${n % 10})`;
}

/* ---------------- Helpers ---------------- */

function fmtDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}

function fmtDateShort(iso) {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

function sanitizeForFilename(str) {
  return String(str).replace(/[\\/:*?"<>|]/g, '').trim();
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

// Devuelve el objeto de conteo activo según lo que se está contando ahora (stock o desperdicio)
function activeCounts() {
  return state.stage === 'desperdicio' ? state.wasteCounts : state.stockCounts;
}

// Devuelve el detalle de vasquetas/kg manual activo (solo se usa para HELADO (KG))
function activeHeladoDetails() {
  return state.heladoDetails[state.stage];
}

// Devuelve el detalle de cajas/ud por caja/sueltas activo (para todo lo que no sea helado ni ice pops)
function activeBoxDetails() {
  return state.boxDetails[state.stage];
}

const ICE_POP_CATEGORIES = ['ICE POPS CLASSIC', 'ICE POPS SIN BAÑO', 'ICE POPS BAÑADOS', 'ICE POPS LUXURY', 'ICE POP DUBAI'];

// Categorías habilitadas para el conteo SEMANAL: solo helado y ice pops.
// El conteo MENSUAL sigue habilitando el listado completo (todas las CATEGORIES).
const SEMANAL_CATEGORIES = ['HELADO (KG)', ...ICE_POP_CATEGORIES];

function isBoxCategory(category) {
  return category !== 'HELADO (KG)' && !ICE_POP_CATEGORIES.includes(category);
}

// Categorías visibles según el modo de conteo elegido (semanal/mensual).
function visibleCategories() {
  return state.mode === 'semanal' ? CATEGORIES.filter(c => SEMANAL_CATEGORIES.includes(c)) : CATEGORIES;
}

// Productos habilitados según el modo (para el total del badge, etc.)
function productsForMode() {
  return state.mode === 'semanal' ? PRODUCTS.filter(p => SEMANAL_CATEGORIES.includes(p.category)) : PRODUCTS;
}

function countedItemsCount() {
  return Object.values(activeCounts()).filter(q => Number(q) > 0).length;
}

function formatQty(n) {
  n = Number(n) || 0;
  // Muestra con coma decimal (estilo AR/ES). Los enteros se muestran sin decimales.
  return String(n).replace('.', ',');
}

function parseQtyInput(value) {
  if (value === null || value === undefined) return 0;
  const normalized = String(value).trim().replace(',', '.');
  const n = parseFloat(normalized);
  return isNaN(n) || n < 0 ? 0 : n;
}

function toast(msg) {
  let t = document.querySelector('.toast');
  if (!t) {
    t = document.createElement('div');
    t.className = 'toast';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 1800);
}

/* ---------------- Modo oscuro / claro ---------------- */
const THEME_KEY = 'inv_theme';

function getTheme() {
  return localStorage.getItem(THEME_KEY) || 'light';
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(THEME_KEY, theme);
}

function toggleTheme() {
  applyTheme(getTheme() === 'dark' ? 'light' : 'dark');
  render();
}

function themeToggleButtonHtml() {
  const isDark = getTheme() === 'dark';
  return `<button class="icon-btn" id="themeToggleBtn" title="Cambiar modo">${isDark ? ICONS.sun : ICONS.moon}</button>`;
}

/* ---------------- Vista celular / computadora ---------------- */
const VIEW_KEY = 'inv_view_mode';

function getViewMode() {
  return localStorage.getItem(VIEW_KEY) || 'mobile';
}

function applyViewMode(mode) {
  document.documentElement.setAttribute('data-view', mode);
  localStorage.setItem(VIEW_KEY, mode);
}

function toggleViewMode() {
  applyViewMode(getViewMode() === 'desktop' ? 'mobile' : 'desktop');
  render();
}

function viewToggleButtonHtml() {
  const isDesktop = getViewMode() === 'desktop';
  return `<button class="icon-btn" id="viewToggleBtn" title="Vista celular / computadora">${isDesktop ? ICONS.phone : ICONS.desktop}</button>`;
}

/* ---------------- Render router ---------------- */

function render() {
  if (state.screen === 'login') return renderLogin();
  if (state.screen === 'location') return renderLocation();
  if (state.screen === 'mode') return renderMode();
  if (state.screen === 'changePassword') return renderChangePassword();
  if (state.screen === 'count') return renderCount();
  if (state.screen === 'askWaste') return renderAskWaste();
  if (state.screen === 'summary') return renderSummary();
  if (state.screen === 'prices') return renderPrices();
  if (state.screen === 'priceHistory') return renderPriceHistory();
}

/* ---------------- Login screen ---------------- */

function renderLogin() {
  app.innerHTML = `
    <div class="topbar">
      <div>
        <h1>📋 Conteo de Inventario</h1>
        <div class="sub">Lucciano's</div>
      </div>
      ${themeToggleButtonHtml()}
      ${viewToggleButtonHtml()}
    </div>
    <div class="home">
      <div class="home-hero">
        <span class="emoji">🔒</span>
        <h2>Ingresá para continuar</h2>
        <p>Usá tu usuario y contraseña</p>
      </div>
      <div class="loc-list" style="padding:0;gap:12px;">
        <input type="text" id="loginUser" placeholder="Usuario" autocomplete="username"
          style="padding:14px;border-radius:12px;border:1.5px solid var(--line);font-size:15px;">
        <input type="password" id="loginPass" placeholder="Contraseña" autocomplete="current-password"
          style="padding:14px;border-radius:12px;border:1.5px solid var(--line);font-size:15px;">
      </div>
      <button class="btn-primary" id="loginBtn">Ingresar</button>
    </div>
  `;

  document.getElementById('themeToggleBtn').onclick = toggleTheme;
  document.getElementById('viewToggleBtn').onclick = toggleViewMode;

  const doLogin = () => {
    const user = document.getElementById('loginUser').value.trim();
    const pass = document.getElementById('loginPass').value;
    const found = findUser(user);
    const effectivePass = found ? getEffectivePassword(found.username) : null;
    if (!found || pass !== effectivePass) {
      toast('Usuario o contraseña incorrectos');
      return;
    }
    state.currentUser = found.username;
    saveSession(found.username);
    state.screen = 'location';
    render();
  };

  document.getElementById('loginBtn').onclick = doLogin;
  document.getElementById('loginPass').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doLogin();
  });
}

/* ---------------- Location picker (home) ---------------- */

function renderLocation() {
  const current = loadCurrent();
  const history = loadHistory();

  let resumeHtml = '';
  if (current && current.location) {
    const nStock = Object.values(current.stockCounts || {}).filter(q => Number(q) > 0).length;
    const nWaste = Object.values(current.wasteCounts || {}).filter(q => Number(q) > 0).length;
    const modeLabel = current.mode === 'semanal' ? 'Semanal' : 'Mensual';
    resumeHtml = `
      <div class="resume-card" id="resumeCard">
        <div class="info">
          <b>${escapeHtml(current.location)} · ${modeLabel}</b>
          <span>Conteo en curso · ${nStock} de stock${nWaste ? `, ${nWaste} de desperdicio` : ''}</span>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px;">
          <span class="go" style="display:flex;align-items:center;gap:4px;">Continuar ${ICONS.chevronRight}</span>
          <button id="discardCurrentBtn" style="font-size:11.5px;color:var(--danger);font-weight:700;">Descartar</button>
        </div>
      </div>`;
  }

  let historyHtml = '';
  if (history.length) {
    const canDelete = currentUserCanDelete();
    historyHtml = `
      <div class="section-label">Conteos finalizados</div>
      <div class="history-list">
        ${history.slice(0, 8).map((h, i) => `
          <div class="history-item">
            <div class="info">
              <b>${escapeHtml(h.location)}${h.mode ? ` · ${h.mode === 'semanal' ? 'Semanal' : 'Mensual'}` : ''}</b>
              <span>${fmtDate(h.finishedAt)} · ${h.itemCountStock} stock${h.itemCountWaste ? ` · ${h.itemCountWaste} desperdicio` : ''} · por ${escapeHtml(h.generatedBy || '—')}</span>
            </div>
            <div style="display:flex;gap:4px;">
              <button data-history-index="${i}">Ver</button>
              ${canDelete ? `<button data-delete-index="${i}" style="color:var(--danger);">Borrar</button>` : ''}
            </div>
          </div>
        `).join('')}
      </div>`;
  } else {
    historyHtml = `<div class="section-label">Conteos finalizados</div><div class="empty-hint">Todavía no hay conteos finalizados.</div>`;
  }

  app.innerHTML = `
    <div class="topbar topbar-home">
      <div>
        <h1>📋 Conteo de Inventario</h1>
      </div>
      ${currentUserCanEditPrices() ? `<button class="icon-btn" id="pricesBtn" title="Precios">💶</button>` : ''}
      <button class="icon-btn" id="changePwBtn" title="Cambiar contraseña">${ICONS.key}</button>
      ${themeToggleButtonHtml()}
      ${viewToggleButtonHtml()}
      <button class="icon-btn" id="logoutBtn" title="Cerrar sesión">${ICONS.logout}</button>
    </div>
    <div class="home">
      <div class="home-hero hero-noir">
        <div class="rule"></div>
        <h2>¿Listo para contar?</h2>
        <p>Elegí una sucursal para empezar</p>
      </div>
      ${resumeHtml}
      <div class="loc-list" style="padding:0;">
        ${LOCATIONS.map(loc => `
          <button class="loc-item ${loc.photo ? '' : 'no-photo'}" data-loc="${escapeHtml(loc.name)}">
            <div class="loc-bg" ${loc.photo ? `style="background-image:url('${escapeHtml(loc.photo)}')"` : ''}></div>
            ${!loc.photo ? `<div class="loc-building-icon">${ICONS.building}</div>` : ''}
            <div class="loc-overlay"></div>
            <div class="loc-content">
              <span class="loc-name">${escapeHtml(loc.name)}</span>
              <span class="arrow">${ICONS.chevronRight}</span>
            </div>
          </button>
        `).join('')}
      </div>
      ${historyHtml}
    </div>
  `;

  const resumeCard = document.getElementById('resumeCard');
  if (resumeCard) {
    resumeCard.onclick = () => {
      state.location = current.location;
      state.mode = current.mode || 'mensual'; // conteos guardados antes de esta versión no tenían modo
      state.stage = current.stage || 'stock';
      state.startedAt = current.startedAt;
      state.stockCounts = current.stockCounts || {};
      state.wasteCounts = current.wasteCounts || {};
      state.wasteNotes = current.wasteNotes || {};
      state.heladoDetails = current.heladoDetails || { stock: {}, desperdicio: {} };
      state.boxDetails = current.boxDetails || { stock: {}, desperdicio: {} };
      state.search = '';
      state.activeCategory = 'Todas';
      state.screen = 'count';
      render();
    };
  }

  const discardBtn = document.getElementById('discardCurrentBtn');
  if (discardBtn) {
    discardBtn.onclick = (e) => {
      e.stopPropagation();
      if (confirm('¿Descartar este conteo sin finalizar? Se va a borrar todo lo que se cargó.')) {
        clearCurrent();
        toast('Conteo descartado');
        render();
      }
    };
  }

  document.getElementById('changePwBtn').onclick = () => {
    state.screen = 'changePassword';
    render();
  };

  const pricesBtn = document.getElementById('pricesBtn');
  if (pricesBtn) {
    pricesBtn.onclick = () => {
      state.priceSearch = '';
      state.screen = 'prices';
      render();
    };
  }

  document.getElementById('themeToggleBtn').onclick = toggleTheme;
  document.getElementById('viewToggleBtn').onclick = toggleViewMode;

  document.getElementById('logoutBtn').onclick = () => {
    clearSession();
    state.currentUser = null;
    state.screen = 'login';
    render();
  };

  document.querySelectorAll('[data-loc]').forEach(btn => {
    btn.onclick = () => {
      state.location = btn.getAttribute('data-loc');
      state.screen = 'mode';
      render();
    };
  });

  document.querySelectorAll('[data-history-index]').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const idx = Number(btn.getAttribute('data-history-index'));
      const entry = history[idx];
      state.viewingHistoryId = entry;
      state.screen = 'summary';
      render();
    };
  });

  document.querySelectorAll('[data-delete-index]').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const idx = Number(btn.getAttribute('data-delete-index'));
      const entry = history[idx];
      if (confirm(`¿Borrar el conteo de ${entry.location}? Esta acción no se puede deshacer.`)) {
        deleteHistoryEntry(idx);
        toast('Conteo borrado');
        render();
      }
    };
  });
}

/* ---------------- Elegir tipo de conteo: semanal o mensual ---------------- */

function renderMode() {
  const prevSemanal = getPrevStock(state.location, 'semanal');
  const prevMensual = getPrevStock(state.location, 'mensual');

  const prevLineHtml = (prev, label) => prev
    ? `<p class="empty-hint" style="text-align:left;">📋 Último conteo ${label.toLowerCase()} de esta sucursal: ${fmtDate(prev.savedAt)}${prev.generatedBy ? ` (por ${escapeHtml(prev.generatedBy)})` : ''}. Vas a poder verlo de referencia mientras contás.</p>`
    : `<p class="empty-hint" style="text-align:left;">Todavía no hay un conteo ${label.toLowerCase()} registrado para esta sucursal.</p>`;

  app.innerHTML = `
    <div class="topbar">
      <button class="icon-btn" id="backBtn">${ICONS.chevronLeft}</button>
      <h1>${escapeHtml(state.location)}</h1>
      <span style="width:32px"></span>
    </div>
    <div class="home">
      <div class="home-hero">
        <span class="emoji">🗓️</span>
        <h2>¿Qué conteo vas a hacer?</h2>
        <p>Elegí semanal o mensual</p>
      </div>
      <button class="btn-primary" id="modeSemanalBtn">📆 Semanal — Helado + Ice Pops</button>
      ${prevLineHtml(prevSemanal, 'Semanal')}
      <button class="btn-secondary" id="modeMensualBtn" style="margin-top:6px;">🗂️ Mensual — Todo el listado</button>
      ${prevLineHtml(prevMensual, 'Mensual')}
    </div>
  `;

  document.getElementById('backBtn').onclick = () => { state.screen = 'location'; render(); };

  const startMode = (mode) => {
    state.mode = mode;
    state.stage = 'stock';
    state.startedAt = new Date().toISOString();
    state.stockCounts = {};
    state.wasteCounts = {};
    state.wasteNotes = {};
    state.heladoDetails = { stock: {}, desperdicio: {} };
    state.boxDetails = { stock: {}, desperdicio: {} };
    state.undoStack = [];
    state.search = '';
    state.activeCategory = 'Todas';
    saveCurrent();
    state.screen = 'count';
    render();
  };

  document.getElementById('modeSemanalBtn').onclick = () => startMode('semanal');
  document.getElementById('modeMensualBtn').onclick = () => startMode('mensual');
}

/* ---------------- Cambiar contraseña ---------------- */

function renderChangePassword() {
  app.innerHTML = `
    <div class="topbar">
      <button class="icon-btn" id="backBtn">${ICONS.chevronLeft}</button>
      <h1>Cambiar contraseña</h1>
      <span style="width:32px"></span>
    </div>
    <div class="home">
      <div class="home-hero">
        <span class="emoji">🔑</span>
        <h2>${escapeHtml(state.currentUser)}</h2>
        <p>Esto solo cambia tu clave en este celular</p>
      </div>
      <div class="loc-list" style="padding:0;gap:12px;">
        <input type="password" id="pwCurrent" placeholder="Contraseña actual" autocomplete="current-password"
          style="padding:14px;border-radius:12px;border:1.5px solid var(--line);font-size:15px;">
        <input type="password" id="pwNew" placeholder="Contraseña nueva" autocomplete="new-password"
          style="padding:14px;border-radius:12px;border:1.5px solid var(--line);font-size:15px;">
        <input type="password" id="pwConfirm" placeholder="Repetir contraseña nueva" autocomplete="new-password"
          style="padding:14px;border-radius:12px;border:1.5px solid var(--line);font-size:15px;">
      </div>
      <button class="btn-primary" id="pwSaveBtn">Guardar nueva contraseña</button>
      <p class="empty-hint" style="text-align:left;">
        ⚠️ Como la app no tiene servidor propio, este cambio queda guardado
        solo en este celular. Si entrás desde otro dispositivo vas a necesitar
        la contraseña original hasta que la cambies ahí también.
      </p>
    </div>
  `;

  document.getElementById('backBtn').onclick = () => { state.screen = 'location'; render(); };

  document.getElementById('pwSaveBtn').onclick = () => {
    const current = document.getElementById('pwCurrent').value;
    const next = document.getElementById('pwNew').value;
    const confirmPw = document.getElementById('pwConfirm').value;

    const effective = getEffectivePassword(state.currentUser);
    if (current !== effective) {
      toast('La contraseña actual no es correcta');
      return;
    }
    if (!next || next.length < 4) {
      toast('La contraseña nueva debe tener al menos 4 caracteres');
      return;
    }
    if (next !== confirmPw) {
      toast('Las contraseñas nuevas no coinciden');
      return;
    }
    setPasswordOverride(state.currentUser, next);
    toast('Contraseña actualizada en este celular');
    state.screen = 'location';
    render();
  };
}

/* ---------------- Count screen (usado para stock y para desperdicio) ---------------- */

function getFilteredProducts() {
  const term = state.search.trim().toLowerCase();
  return productsForMode().filter(p => {
    if (state.activeCategory !== 'Todas' && p.category !== state.activeCategory) return false;
    if (!term) return true;
    return p.name.toLowerCase().includes(term) || String(p.code).includes(term);
  });
}

function buildProductListHtml(filtered) {
  const counts = activeCounts();
  const isWaste = state.stage === 'desperdicio';
  // Solo mostramos referencia de stock previo durante el conteo de Stock
  // (no tiene sentido para Desperdicio), comparando sucursal + modo actual.
  const prevStock = (!isWaste && getPrevStock(state.location, state.mode)) || null;
  const prevQty = (code) => {
    if (!prevStock) return null;
    const v = Number(prevStock.stockCounts[code] || 0);
    return v > 0 ? v : null;
  };
  const prevHintHtml = (code, unit) => {
    const v = prevQty(code);
    return v !== null ? `<span class="prev-hint">Antes: ${formatQty(v)}${unit ? ' ' + escapeHtml(unit) : ''}</span>` : '';
  };
  const grouped = {};
  filtered.forEach(p => {
    if (!grouped[p.category]) grouped[p.category] = [];
    grouped[p.category].push(p);
  });
  if (grouped['HELADO (KG)']) {
    grouped['HELADO (KG)'].sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }

  if (filtered.length === 0) {
    return `<div class="no-results">No se encontraron productos.</div>`;
  }
  let listHtml = '';
  CATEGORIES.forEach(cat => {
    if (!grouped[cat]) return;
    const catColor = categoryColor(cat);
    listHtml += `<div class="cat-heading"><span class="cat-dot" style="--cat-color:${catColor}"></span>${escapeHtml(cat)}</div>`;
    grouped[cat].forEach(p => {
      const qty = counts[p.code] || 0;
      const isHelado = p.category === 'HELADO (KG)';
      const rowStyle = `style="--cat-color:${categoryColor(p.category)}"`;

      if (isHelado) {
        const detail = activeHeladoDetails()[p.code] || { vasquetas: 0, pesoProm: 0, manualKg: 0 };
        const subtotal = (detail.vasquetas || 0) * (detail.pesoProm || 0);
        listHtml += `
          <div class="product-row ${qty > 0 ? 'counted' : ''}" data-row="${p.code}" ${rowStyle}>
            <div class="product-info">
              <div class="code">#${p.code} · Kg</div>
              <div class="name">${escapeHtml(p.name)}</div>
              ${prevHintHtml(p.code, 'kg')}
            </div>
          </div>
          <div class="helado-controls" data-helado-wrap="${p.code}">
            <div class="helado-field">
              <span class="helado-label">Cant. vasquetas</span>
              <input type="text" inputmode="numeric" class="helado-input" data-vasq="${p.code}" value="${detail.vasquetas || ''}" placeholder="0">
            </div>
            <div class="helado-field">
              <span class="helado-label">Peso prom. (kg)</span>
              <input type="text" inputmode="decimal" class="helado-input" data-pesoprom="${p.code}" value="${detail.pesoProm ? formatQty(detail.pesoProm) : ''}" placeholder="0">
            </div>
            <div class="helado-eq">= ${formatQty(subtotal)} kg</div>
            <div class="helado-field">
              <span class="helado-label">Kg manual</span>
              <input type="text" inputmode="decimal" class="helado-input" data-manualkg="${p.code}" value="${detail.manualKg ? formatQty(detail.manualKg) : ''}" placeholder="0">
            </div>
            <div class="helado-total">Total: <b data-total-label="${p.code}">${formatQty(qty)} kg</b></div>
          </div>`;
        return;
      }

      const isBox = isBoxCategory(p.category);
      if (isBox) {
        const detail = activeBoxDetails()[p.code] || { cajas: 0, udXCaja: 0, sueltas: 0 };
        const subtotal = (detail.cajas || 0) * (detail.udXCaja || 0);
        listHtml += `
          <div class="product-row ${qty > 0 ? 'counted' : ''}" data-row="${p.code}" ${rowStyle}>
            <div class="product-info">
              <div class="code">#${p.code} · ${escapeHtml(p.unit)}</div>
              <div class="name">${escapeHtml(p.name)}</div>
              ${prevHintHtml(p.code, p.unit)}
            </div>
          </div>
          <div class="helado-controls" data-box-wrap="${p.code}">
            <div class="helado-field">
              <span class="helado-label">Cant. cajas</span>
              <input type="text" inputmode="numeric" class="helado-input" data-cajas="${p.code}" value="${detail.cajas || ''}" placeholder="0">
            </div>
            <div class="helado-field">
              <span class="helado-label">Ud x caja</span>
              <input type="text" inputmode="numeric" class="helado-input" data-udxcaja="${p.code}" value="${detail.udXCaja || ''}" placeholder="0">
            </div>
            <div class="helado-eq">= ${formatQty(subtotal)} ud</div>
            <div class="helado-field">
              <span class="helado-label">Ud sueltas</span>
              <input type="text" inputmode="decimal" class="helado-input" data-sueltas="${p.code}" value="${detail.sueltas ? formatQty(detail.sueltas) : ''}" placeholder="0">
            </div>
            <div class="helado-total">Total: <b data-total-label="${p.code}">${formatQty(qty)} ${escapeHtml(p.unit)}</b></div>
          </div>`;
        return;
      }

      const noteHtml = isWaste ? `
        <div class="waste-note-wrap" data-note-wrap="${p.code}">
          <input type="text" class="waste-note-input" placeholder="Motivo del desperdicio (opcional)"
            value="${escapeHtml(state.wasteNotes[p.code] || '')}" data-note="${p.code}">
        </div>` : '';
      listHtml += `
        <div class="product-row ${qty > 0 ? 'counted' : ''}" data-row="${p.code}" ${rowStyle}>
          <div class="product-info">
            <div class="code">#${p.code} · ${escapeHtml(p.unit)}</div>
            <div class="name">${escapeHtml(p.name)}</div>
            ${prevHintHtml(p.code, p.unit)}
          </div>
          <div class="qty-controls">
            <button class="qty-btn minus" data-minus="${p.code}">−</button>
            <input class="qty-input" type="text" inputmode="decimal" value="${formatQty(qty)}" data-qty="${p.code}">
            <button class="qty-btn plus" data-plus="${p.code}">+</button>
          </div>
        </div>
        ${noteHtml}`;
    });
  });
  return listHtml;
}

function renderCount() {
  const filtered = getFilteredProducts();
  const counted = countedItemsCount();
  const listHtml = buildProductListHtml(filtered);
  const isWaste = state.stage === 'desperdicio';

  app.innerHTML = `
    <div class="topbar">
      <button class="icon-btn" id="backBtn">${ICONS.chevronLeft}</button>
      <div style="text-align:center;">
        <h1>${escapeHtml(state.location)}</h1>
        <div class="sub">${state.mode === 'semanal' ? 'Semanal' : 'Mensual'} · ${isWaste ? 'Contando Desperdicio' : 'Contando Stock'} · guardado automático</div>
      </div>
      <span class="badge">${counted}/${productsForMode().length}</span>
    </div>
    <div class="count-controls">
      <div class="progress-track"><div class="progress-fill" style="width:${productsForMode().length ? Math.round(counted / productsForMode().length * 100) : 0}%"></div></div>
      <div class="search-wrap">
        <span class="icon">${ICONS.search}</span>
        <input type="text" id="searchInput" placeholder="Buscar producto o código..." value="${escapeHtml(state.search)}">
      </div>
      <div class="chips" id="chips">
        <button class="chip ${state.activeCategory === 'Todas' ? 'active' : ''}" data-cat="Todas">Todas</button>
        ${visibleCategories().map(c => `<button class="chip ${state.activeCategory === c ? 'active' : ''}" data-cat="${escapeHtml(c)}">${escapeHtml(c)}</button>`).join('')}
      </div>
    </div>
    <div class="product-list">${listHtml}</div>
    <div class="footer-bar">
      <button class="qty-btn" id="undoBtn" title="Deshacer último cambio" style="width:44px;height:44px;flex:none;">${ICONS.undo}</button>
      <span class="count-pill">${counted} contados</span>
      <button class="btn-primary" id="finishBtn">${isWaste ? 'Finalizar desperdicio' : 'Finalizar conteo'}</button>
    </div>
  `;

  document.getElementById('backBtn').onclick = () => {
    if (isWaste) { state.screen = 'askWaste'; }
    else { state.screen = 'location'; }
    render();
  };

  const searchInput = document.getElementById('searchInput');
  searchInput.oninput = (e) => {
    state.search = e.target.value;
    renderCountListOnly();
  };

  document.getElementById('chips').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-cat]');
    if (!btn) return;
    state.activeCategory = btn.getAttribute('data-cat');
    // Solo actualizamos las clases activas y la lista de productos:
    // NO llamamos a render() completo para no perder el scroll de la página.
    document.querySelectorAll('#chips .chip').forEach(c => c.classList.toggle('active', c === btn));
    // Acompañamos el scroll horizontal de los chips hacia el elegido.
    btn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    renderCountListOnly();
  });

  attachCountRowHandlers();

  document.getElementById('undoBtn').onclick = () => undoLastChange();

  document.getElementById('finishBtn').onclick = () => {
    if (countedItemsCount() === 0) {
      toast('Contá al menos un producto antes de finalizar');
      return;
    }
    if (isWaste) {
      state.screen = 'summary';
      state.viewingHistoryId = null;
      render();
    } else {
      state.screen = 'askWaste';
      render();
    }
  };
}

// Actualiza el badge del header, la pastilla del footer y la barra de
// progreso, sin volver a dibujar toda la pantalla.
function updateProgressUI() {
  const counted = countedItemsCount();
  const total = productsForMode().length;
  const badge = document.querySelector('.badge');
  if (badge) badge.textContent = `${counted}/${total}`;
  const pill = document.querySelector('.count-pill');
  if (pill) pill.textContent = `${counted} contados`;
  const fill = document.querySelector('.progress-fill');
  if (fill) fill.style.width = `${total ? Math.round(counted / total * 100) : 0}%`;
}

// Re-render only the product list + badge/footer, without touching the
// search input, the chips bar or the page scroll position.
function renderCountListOnly() {
  const filtered = getFilteredProducts();
  document.querySelector('.product-list').innerHTML = buildProductListHtml(filtered);
  updateProgressUI();
  attachCountRowHandlers();
}

function attachCountRowHandlers() {
  document.querySelectorAll('[data-minus]').forEach(btn => {
    btn.onclick = () => changeQty(btn.getAttribute('data-minus'), -1);
  });
  document.querySelectorAll('[data-plus]').forEach(btn => {
    btn.onclick = () => changeQty(btn.getAttribute('data-plus'), 1);
  });
  document.querySelectorAll('[data-qty]').forEach(input => {
    input.onchange = (e) => setQty(input.getAttribute('data-qty'), e.target.value);
    input.onfocus = (e) => e.target.select();
  });
  document.querySelectorAll('[data-note]').forEach(input => {
    input.onchange = (e) => {
      const code = input.getAttribute('data-note');
      state.wasteNotes[code] = e.target.value;
      saveCurrent();
    };
  });
  document.querySelectorAll('[data-vasq]').forEach(input => {
    input.onchange = (e) => updateHeladoRow(input.getAttribute('data-vasq'), 'vasquetas', e.target.value);
    input.onfocus = (e) => e.target.select();
  });
  document.querySelectorAll('[data-pesoprom]').forEach(input => {
    input.onchange = (e) => updateHeladoRow(input.getAttribute('data-pesoprom'), 'pesoProm', e.target.value);
    input.onfocus = (e) => e.target.select();
  });
  document.querySelectorAll('[data-manualkg]').forEach(input => {
    input.onchange = (e) => updateHeladoRow(input.getAttribute('data-manualkg'), 'manualKg', e.target.value);
    input.onfocus = (e) => e.target.select();
  });
  document.querySelectorAll('[data-cajas]').forEach(input => {
    input.onchange = (e) => updateBoxRow(input.getAttribute('data-cajas'), 'cajas', e.target.value);
    input.onfocus = (e) => e.target.select();
  });
  document.querySelectorAll('[data-udxcaja]').forEach(input => {
    input.onchange = (e) => updateBoxRow(input.getAttribute('data-udxcaja'), 'udXCaja', e.target.value);
    input.onfocus = (e) => e.target.select();
  });
  document.querySelectorAll('[data-sueltas]').forEach(input => {
    input.onchange = (e) => updateBoxRow(input.getAttribute('data-sueltas'), 'sueltas', e.target.value);
    input.onfocus = (e) => e.target.select();
  });
}

function updateHeladoRow(code, field, rawValue) {
  const details = activeHeladoDetails();
  const current = details[code] || { vasquetas: 0, pesoProm: 0, manualKg: 0 };
  const value = field === 'vasquetas'
    ? Math.max(0, Math.round(parseQtyInput(rawValue)))
    : Math.max(0, parseQtyInput(rawValue));
  current[field] = value;
  details[code] = current;

  const total = (current.vasquetas || 0) * (current.pesoProm || 0) + (current.manualKg || 0);
  activeCounts()[code] = total;
  saveCurrent();

  const row = document.querySelector(`[data-row="${code}"]`);
  if (row) row.classList.toggle('counted', total > 0);
  const wrap = document.querySelector(`[data-helado-wrap="${code}"]`);
  if (wrap) {
    const eq = wrap.querySelector('.helado-eq');
    if (eq) eq.textContent = `= ${formatQty((current.vasquetas || 0) * (current.pesoProm || 0))} kg`;
    const totalLabel = wrap.querySelector(`[data-total-label="${code}"]`);
    if (totalLabel) totalLabel.textContent = `${formatQty(total)} kg`;
  }
  updateProgressUI();
}

function updateBoxRow(code, field, rawValue) {
  const details = activeBoxDetails();
  const current = details[code] || { cajas: 0, udXCaja: 0, sueltas: 0 };
  const value = field === 'sueltas'
    ? Math.max(0, parseQtyInput(rawValue))
    : Math.max(0, Math.round(parseQtyInput(rawValue)));
  current[field] = value;
  details[code] = current;

  const total = (current.cajas || 0) * (current.udXCaja || 0) + (current.sueltas || 0);
  activeCounts()[code] = total;
  saveCurrent();

  const product = PRODUCTS.find(p => String(p.code) === String(code));
  const unit = (product && product.unit) || 'ud';
  const row = document.querySelector(`[data-row="${code}"]`);
  if (row) row.classList.toggle('counted', total > 0);
  const wrap = document.querySelector(`[data-box-wrap="${code}"]`);
  if (wrap) {
    const eq = wrap.querySelector('.helado-eq');
    if (eq) eq.textContent = `= ${formatQty((current.cajas || 0) * (current.udXCaja || 0))} ud`;
    const totalLabel = wrap.querySelector(`[data-total-label="${code}"]`);
    if (totalLabel) totalLabel.textContent = `${formatQty(total)} ${unit}`;
  }
  updateProgressUI();
}

function pushUndo(code, prevValue) {
  state.undoStack.push({ stage: state.stage, code, prevValue });
  if (state.undoStack.length > 20) state.undoStack.shift();
}

function undoLastChange() {
  const last = state.undoStack.pop();
  if (!last || last.stage !== state.stage) {
    toast('No hay nada para deshacer');
    return;
  }
  activeCounts()[last.code] = last.prevValue;
  saveCurrent();
  updateRowUI(last.code, last.prevValue);
  toast('Cambio deshecho');
}

function changeQty(code, delta) {
  const counts = activeCounts();
  const current = Number(counts[code] || 0);
  let next = current + delta;
  if (next < 0) next = 0;
  pushUndo(code, current);
  counts[code] = next;
  saveCurrent();
  updateRowUI(code, next);
}

function setQty(code, value) {
  const counts = activeCounts();
  const prev = Number(counts[code] || 0);
  const n = parseQtyInput(value);
  pushUndo(code, prev);
  counts[code] = n;
  saveCurrent();
  updateRowUI(code, n);
}

function updateRowUI(code, qty) {
  const row = document.querySelector(`[data-row="${code}"]`);
  if (!row) return;
  row.classList.toggle('counted', qty > 0);
  const input = row.querySelector('[data-qty]');
  if (input && document.activeElement !== input) input.value = formatQty(qty);
  updateProgressUI();
}

/* ---------------- ¿Tuviste desperdicios? ---------------- */

function renderAskWaste() {
  const nStock = countedItemsCount(); // en este punto state.stage sigue en 'stock'
  app.innerHTML = `
    <div class="topbar">
      <button class="icon-btn" id="backBtn">${ICONS.chevronLeft}</button>
      <h1>${escapeHtml(state.location)}</h1>
      <span style="width:32px"></span>
    </div>
    <div class="home">
      <div class="home-hero">
        <span class="emoji">🗑️</span>
        <h2>¿Tuviste desperdicios?</h2>
        <p>Ya contaste ${nStock} producto${nStock === 1 ? '' : 's'} de stock</p>
      </div>
      <button class="btn-primary" id="wasteYes">Sí, contar desperdicio</button>
      <button class="btn-secondary" id="wasteNo">No, generar Excel</button>
    </div>
  `;

  document.getElementById('backBtn').onclick = () => { state.screen = 'count'; state.stage = 'stock'; render(); };

  document.getElementById('wasteYes').onclick = () => {
    state.stage = 'desperdicio';
    state.undoStack = [];
    state.search = '';
    state.activeCategory = 'Todas';
    saveCurrent();
    state.screen = 'count';
    render();
  };

  document.getElementById('wasteNo').onclick = () => {
    state.screen = 'summary';
    state.viewingHistoryId = null;
    render();
  };
}

/* ---------------- Summary screen ---------------- */

function renderSummary() {
  const isHistory = !!state.viewingHistoryId;
  const data = isHistory
    ? state.viewingHistoryId
    : {
        location: state.location,
        mode: state.mode,
        stockCounts: state.stockCounts,
        wasteCounts: state.wasteCounts,
        finishedAt: new Date().toISOString(),
        generatedBy: state.currentUser,
      };

  const stockItems = PRODUCTS
    .filter(p => Number((data.stockCounts || {})[p.code] || 0) > 0)
    .map(p => ({ ...p, qty: data.stockCounts[p.code] }));
  const wasteItems = PRODUCTS
    .filter(p => Number((data.wasteCounts || {})[p.code] || 0) > 0)
    .map(p => ({ ...p, qty: data.wasteCounts[p.code], note: (data.wasteNotes || {})[p.code] || '' }));

  const totalStockUnits = stockItems.reduce((sum, p) => sum + Number(p.qty), 0);
  const hasWaste = wasteItems.length > 0;

  const priceField = priceFieldForLocation(data.location);
  const valorize = (items) => items.reduce((sum, p) => {
    const price = getEffectivePrice(p.code, priceField);
    return price === null ? sum : sum + Number(p.qty) * price;
  }, 0);
  const fmtMoney = (n) => `${n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
  const totalStockValue = valorize(stockItems);
  const missingStockPrices = stockItems.filter(p => getEffectivePrice(p.code, priceField) === null).length;

  function buildCategorySummary(items) {
    const totals = {}; // key: "categoria||unidad" -> total
    items.forEach(p => {
      const key = p.category + '||' + p.unit;
      totals[key] = (totals[key] || 0) + Number(p.qty);
    });
    return Object.keys(totals).map(key => {
      const [category, unit] = key.split('||');
      return { category, unit, total: totals[key] };
    }).sort((a, b) => CATEGORIES.indexOf(a.category) - CATEGORIES.indexOf(b.category));
  }

  const buildCategorySummaryHtml = (items) => {
    const cats = buildCategorySummary(items);
    if (!cats.length) return '';
    const maxTotal = Math.max(...cats.map(c => c.total), 1);
    return `<div class="cat-chart">${cats.map(c => {
      const color = categoryColor(c.category);
      const pct = Math.max(4, Math.round(c.total / maxTotal * 100));
      return `
      <div class="cat-bar-row">
        <div class="cat-bar-top">
          <span class="cat-name"><span class="cat-dot" style="--cat-color:${color}"></span>${escapeHtml(c.category)}</span>
          <span class="cat-total">${formatQty(c.total)} ${escapeHtml(c.unit)}</span>
        </div>
        <div class="cat-bar-track"><div class="cat-bar-fill" style="width:${pct}%;--cat-color:${color}"></div></div>
      </div>`;
    }).join('')}</div>`;
  };

  const buildRows = (items, withNotes) => items.map(p => `
    <div class="summary-row">
      <div class="name">${escapeHtml(p.name)}<span class="cat">#${p.code} · ${escapeHtml(p.category)} · ${escapeHtml(p.unit)}${withNotes && p.note ? ` · Motivo: ${escapeHtml(p.note)}` : ''}</span></div>
      <div class="qty">${formatQty(p.qty)}</div>
    </div>
  `).join('');

  const wasteBlockHtml = hasWaste ? `
    <div class="section-label" style="margin-top:18px;">Desperdicio — resumen por categoría</div>
    ${buildCategorySummaryHtml(wasteItems)}
    <div class="section-label">Desperdicio — detalle</div>
    <div class="summary-table">${buildRows(wasteItems, true)}</div>
  ` : '';

  app.innerHTML = `
    <div class="topbar">
      <button class="icon-btn" id="backBtn">${ICONS.chevronLeft}</button>
      <h1>Resumen</h1>
      <span style="width:32px"></span>
    </div>
    <div class="summary">
      <div class="summary-hero">
        <span class="check-icon">${ICONS.checkCircle}</span>
        <h2>${escapeHtml(data.location)}</h2>
        <p>${data.mode === 'semanal' ? 'Conteo Semanal' : 'Conteo Mensual'} · ${fmtDate(data.finishedAt)} · Generado por ${escapeHtml(data.generatedBy || '—')}</p>
      </div>
      <div class="summary-stats">
        <div class="stat-card"><div class="num">${stockItems.length}</div><div class="lbl">Productos (Stock)</div></div>
        <div class="stat-card"><div class="num">${totalStockUnits}</div><div class="lbl">Unidades (Stock)</div></div>
      </div>
      <div class="stat-card" style="margin-bottom:10px;">
        <div class="num">${fmtMoney(totalStockValue)}</div>
        <div class="lbl">Valor total (Stock) · ${priceLabelForLocation(data.location)}</div>
      </div>
      ${missingStockPrices > 0 ? `<div class="empty-hint" style="color:var(--danger);">⚠ ${missingStockPrices} producto(s) contado(s) todavía no tienen precio cargado, no se incluyen en el valor total.</div>` : ''}
      <div class="section-label">Stock — resumen por categoría</div>
      ${buildCategorySummaryHtml(stockItems)}
      <div class="section-label">Stock — detalle</div>
      <div class="summary-table">${buildRows(stockItems, false) || '<div class="empty-hint">No hay productos contados.</div>'}</div>
      ${wasteBlockHtml}
    </div>
    <div class="footer-bar">
      ${isHistory ? '' : '<button class="btn-secondary" id="editBtn" style="flex:1;">Seguir contando</button>'}
      <button class="btn-primary" id="shareBtn" style="flex:1;display:flex;align-items:center;justify-content:center;gap:8px;">${ICONS.share} Compartir</button>
    </div>
  `;

  document.getElementById('backBtn').onclick = () => {
    if (isHistory) { state.viewingHistoryId = null; state.screen = 'location'; }
    else { state.screen = hasWaste ? 'count' : 'askWaste'; if (hasWaste) state.stage = 'desperdicio'; }
    render();
  };

  const editBtn = document.getElementById('editBtn');
  if (editBtn) editBtn.onclick = () => {
    state.screen = 'count';
    state.stage = hasWaste ? 'desperdicio' : 'stock';
    render();
  };

  document.getElementById('shareBtn').onclick = () => shareCount(data, stockItems, wasteItems, isHistory);
}

async function shareCount(data, stockItems, wasteItems, isHistory) {
  const loc = sanitizeForFilename(data.location);
  const dateStr = fmtDateShort(data.finishedAt);
  const modeLabel = data.mode === 'semanal' ? 'Semanal' : 'Mensual';
  const filename = `Stock ${modeLabel} - ${loc} - ${dateStr}.xlsx`;

  // Valorización: Madrid/Málaga usan Precio 1, las sucursales de BCN (incluida
  // la Fábrica BCN) usan Precio 2. Si a algún producto todavía no se le cargó
  // precio, se deja en blanco y no suma al total (en vez de inventar un 0).
  const priceField = priceFieldForLocation(data.location);
  const priceLabel = priceLabelForLocation(data.location);
  const unitPriceOf = (p) => getEffectivePrice(p.code, priceField);

  const header = ['Código', 'Producto', 'Categoría', 'Unidad de medida', 'Cantidad contada', 'Precio unitario (€)', 'Subtotal (€)', 'Sucursal'];
  const wasteHeader = [...header, 'Motivo'];
  const toRows = (items) => items.map(p => {
    const price = unitPriceOf(p);
    const qty = Number(p.qty);
    return [p.code, p.name, p.category, p.unit, qty, price === null ? '' : price, price === null ? '' : Math.round(qty * price * 100) / 100, data.location];
  });
  const toWasteRows = (items) => items.map(p => {
    const price = unitPriceOf(p);
    const qty = Number(p.qty);
    return [p.code, p.name, p.category, p.unit, qty, price === null ? '' : price, price === null ? '' : Math.round(qty * price * 100) / 100, data.location, p.note || ''];
  });
  const totalValorizado = (items) => items.reduce((sum, p) => {
    const price = unitPriceOf(p);
    return price === null ? sum : sum + Number(p.qty) * price;
  }, 0);
  const totalRow = (items, ncols) => {
    const row = new Array(ncols).fill('');
    row[4] = 'TOTAL';
    row[6] = Math.round(totalValorizado(items) * 100) / 100;
    return row;
  };
  const missingPriceCount = (items) => items.filter(p => unitPriceOf(p) === null).length;
  const infoRows = (sheetLabel, items) => {
    const rows = [
      [`Generado por: ${data.generatedBy || '—'}`],
      [`Sucursal: ${data.location}    Conteo: ${modeLabel}    Fecha: ${fmtDate(data.finishedAt)}    Pestaña: ${sheetLabel}`],
      [`Valorizado con: ${priceLabel}`],
    ];
    const missing = missingPriceCount(items);
    if (missing > 0) rows.push([`⚠ ${missing} producto(s) sin precio cargado (no se incluyen en el total)`]);
    rows.push([]);
    return rows;
  };

  let shared = false;

  if (typeof XLSX === 'undefined') {
    toast('La app todavía está terminando de cargar. Esperá unos segundos y probá de nuevo.');
    return;
  }

  try {
    const wb = XLSX.utils.book_new();

    const wsStock = XLSX.utils.aoa_to_sheet([...infoRows('Stock', stockItems), header, ...toRows(stockItems), totalRow(stockItems, header.length)]);
    wsStock['!cols'] = [{ wch: 9 }, { wch: 34 }, { wch: 24 }, { wch: 14 }, { wch: 16 }, { wch: 18 }, { wch: 14 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(wb, wsStock, 'Stock');

    if (wasteItems.length > 0) {
      const wsWaste = XLSX.utils.aoa_to_sheet([...infoRows('Desperdicio', wasteItems), wasteHeader, ...toWasteRows(wasteItems), totalRow(wasteItems, wasteHeader.length)]);
      wsWaste['!cols'] = [{ wch: 9 }, { wch: 34 }, { wch: 24 }, { wch: 14 }, { wch: 16 }, { wch: 18 }, { wch: 14 }, { wch: 16 }, { wch: 28 }];
      XLSX.utils.book_append_sheet(wb, wsWaste, 'Desperdicio');
    }

    const wbout = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const file = new File([blob], filename, { type: blob.type });

    let usedShare = false;
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          title: filename,
          text: `Conteo ${modeLabel} de ${data.location}${wasteItems.length ? ' (Stock + Desperdicio)' : ' (Stock)'} · Generado por ${data.generatedBy || '—'}`,
          files: [file],
        });
        usedShare = true;
      } catch (shareErr) {
        // Si la persona cancela el menú de compartir, no insistimos con la descarga.
        if (shareErr && shareErr.name === 'AbortError') { return; }
        // Cualquier otro error del share (falla del sistema, sin apps compatibles,
        // navegador de escritorio que dice que sí pero no puede, etc.) -> descargamos directo.
      }
    }
    if (!usedShare) {
      XLSX.writeFile(wb, filename);
      toast('Se descargó el Excel a tu dispositivo (no se pudo compartir directo).');
    }
    shared = true;
  } catch (err) {
    if (err && err.name === 'AbortError') { return; }
    toast('No se pudo generar el Excel. Probá de nuevo.');
    return;
  }

  if (shared && !isHistory) {
    finalizeIfNeeded(data);
    toast('Conteo finalizado');
    state.screen = 'location';
    render();
  }
}

function finalizeIfNeeded(data) {
  if (state._finalized) return;
  state._finalized = true;
  saveHistory({
    location: data.location,
    mode: state.mode,
    finishedAt: data.finishedAt,
    generatedBy: data.generatedBy,
    wasteNotes: state.wasteNotes,
    heladoDetails: state.heladoDetails,
    boxDetails: state.boxDetails,
    stockCounts: data.stockCounts,
    wasteCounts: data.wasteCounts,
    itemCountStock: Object.values(data.stockCounts || {}).filter(q => Number(q) > 0).length,
    itemCountWaste: Object.values(data.wasteCounts || {}).filter(q => Number(q) > 0).length,
  });
  // Guardamos este stock como referencia ("registro de stock previo") para
  // la próxima vez que se haga un conteo del mismo tipo en esta sucursal.
  savePrevStock(data.location, state.mode, data.stockCounts, data.finishedAt, data.generatedBy);
  clearCurrent();
}

/* ---------------- Precios (solo batodesrets) ----------------
   Pantalla para ver y editar Precio 1 (Madrid/Málaga) y Precio 2 (BCN) de
   cada producto. Los cambios se guardan como "override" en este celular y
   quedan anotados en un historial (también local). Para que el precio
   nuevo llegue a TODOS los celulares hay que descargar el products.js
   actualizado desde acá y subirlo a GitHub. */

// Buffer en memoria con lo que se va tipeando en los inputs de precio,
// independiente del filtro de búsqueda (así no se pierde nada al filtrar).
let priceEditsBuffer = {};

function parsePriceInput(value) {
  if (value === null || value === undefined) return undefined; // sin cambios
  const trimmed = String(value).trim();
  if (trimmed === '') return undefined; // vacío = no tocar ese precio
  const n = parseFloat(trimmed.replace(',', '.'));
  if (isNaN(n) || n < 0) return undefined;
  return Math.round(n * 1000) / 1000;
}

function getPricesFilteredProducts() {
  const term = state.priceSearch.trim().toLowerCase();
  if (!term) return PRODUCTS;
  return PRODUCTS.filter(p => p.name.toLowerCase().includes(term) || String(p.code).includes(term));
}

function buildPriceListHtml(filtered) {
  if (filtered.length === 0) return `<div class="no-results">No se encontraron productos.</div>`;
  const grouped = {};
  filtered.forEach(p => { (grouped[p.category] = grouped[p.category] || []).push(p); });
  let html = '';
  CATEGORIES.forEach(cat => {
    if (!grouped[cat]) return;
    html += `<div class="cat-heading"><span class="cat-dot" style="--cat-color:${categoryColor(cat)}"></span>${escapeHtml(cat)}</div>`;
    grouped[cat].forEach(p => {
      const buffered = priceEditsBuffer[p.code] || {};
      const eff1 = getEffectivePrice(p.code, 'price1');
      const eff2 = getEffectivePrice(p.code, 'price2');
      const val1 = buffered.price1 !== undefined ? buffered.price1 : (eff1 !== null ? formatQty(eff1) : '');
      const val2 = buffered.price2 !== undefined ? buffered.price2 : (eff2 !== null ? formatQty(eff2) : '');
      const missingBoth = eff1 === null && eff2 === null;
      html += `
        <div class="product-row" style="--cat-color:${categoryColor(p.category)}">
          <div class="product-info">
            <div class="code">#${p.code} · ${escapeHtml(p.unit)}</div>
            <div class="name">${escapeHtml(p.name)}</div>
            ${missingBoth ? `<span class="prev-hint" style="color:var(--danger);">Sin precio cargado</span>` : ''}
          </div>
        </div>
        <div class="helado-controls">
          <div class="helado-field">
            <span class="helado-label">Precio 1 (Madrid/Málaga)</span>
            <input type="text" inputmode="decimal" class="helado-input" data-price1="${p.code}" value="${escapeHtml(String(val1))}" placeholder="0,00">
          </div>
          <div class="helado-field">
            <span class="helado-label">Precio 2 (BCN)</span>
            <input type="text" inputmode="decimal" class="helado-input" data-price2="${p.code}" value="${escapeHtml(String(val2))}" placeholder="0,00">
          </div>
        </div>`;
    });
  });
  return html;
}

function attachPriceRowHandlers() {
  document.querySelectorAll('[data-price1]').forEach(inp => {
    inp.oninput = (e) => {
      const code = inp.getAttribute('data-price1');
      priceEditsBuffer[code] = priceEditsBuffer[code] || {};
      priceEditsBuffer[code].price1 = e.target.value;
    };
  });
  document.querySelectorAll('[data-price2]').forEach(inp => {
    inp.oninput = (e) => {
      const code = inp.getAttribute('data-price2');
      priceEditsBuffer[code] = priceEditsBuffer[code] || {};
      priceEditsBuffer[code].price2 = e.target.value;
    };
  });
}

function renderPricesListOnly() {
  const listEl = document.querySelector('.product-list');
  if (!listEl) return;
  listEl.innerHTML = buildPriceListHtml(getPricesFilteredProducts());
  attachPriceRowHandlers();
}

function renderPrices() {
  if (!currentUserCanEditPrices()) { state.screen = 'location'; render(); return; }
  priceEditsBuffer = {};
  const missing = PRODUCTS.filter(p => getEffectivePrice(p.code, 'price1') === null && getEffectivePrice(p.code, 'price2') === null).length;

  app.innerHTML = `
    <div class="topbar">
      <button class="icon-btn" id="backBtn">${ICONS.chevronLeft}</button>
      <div style="text-align:center;">
        <h1>Precios</h1>
        <div class="sub">Precio 1 = Madrid/Málaga · Precio 2 = BCN</div>
      </div>
      <button class="icon-btn" id="priceHistoryBtn" title="Historial de cambios">🕘</button>
    </div>
    <div class="count-controls">
      <div class="search-wrap">
        <span class="icon">${ICONS.search}</span>
        <input type="text" id="priceSearchInput" placeholder="Buscar producto o código..." value="${escapeHtml(state.priceSearch)}">
      </div>
      ${missing > 0 ? `<div class="empty-hint" style="color:var(--danger);">⚠ ${missing} producto(s) sin ningún precio cargado todavía.</div>` : ''}
    </div>
    <div class="product-list">${buildPriceListHtml(getPricesFilteredProducts())}</div>
    <div class="footer-bar">
      <button class="btn-secondary" id="downloadProductsBtn" style="flex:1;">Descargar products.js</button>
      <button class="btn-primary" id="saveAllPricesBtn" style="flex:1;">Guardar cambios</button>
    </div>
  `;

  document.getElementById('backBtn').onclick = () => { state.screen = 'location'; render(); };
  document.getElementById('priceHistoryBtn').onclick = () => { state.screen = 'priceHistory'; render(); };

  const searchInput = document.getElementById('priceSearchInput');
  searchInput.oninput = (e) => {
    state.priceSearch = e.target.value;
    renderPricesListOnly();
  };

  attachPriceRowHandlers();

  document.getElementById('downloadProductsBtn').onclick = () => downloadUpdatedProductsJs();
  document.getElementById('saveAllPricesBtn').onclick = () => saveAllPriceEdits();
}

function saveAllPriceEdits() {
  const overrides = loadPriceOverrides();
  const historyEntries = [];
  let changedCount = 0;

  Object.keys(priceEditsBuffer).forEach(codeStr => {
    const code = Number(codeStr);
    const edit = priceEditsBuffer[codeStr];
    const base = getBaseProduct(code);
    if (!base) return;
    ['price1', 'price2'].forEach(field => {
      if (!(field in edit)) return;
      const parsed = parsePriceInput(edit[field]);
      if (parsed === undefined) return;
      const oldVal = getEffectivePrice(code, field);
      if (oldVal !== null && Math.abs(oldVal - parsed) < 0.0005) return; // no cambió en los hechos
      if (!overrides[code]) overrides[code] = {};
      overrides[code][field] = parsed;
      changedCount++;
      historyEntries.push({
        code,
        name: base.name,
        field,
        oldValue: oldVal,
        newValue: parsed,
        user: state.currentUser,
        at: new Date().toISOString(),
      });
    });
  });

  if (changedCount === 0) {
    toast('No hay cambios de precio para guardar.');
    return;
  }

  savePriceOverrides(overrides);
  addPriceHistoryEntries(historyEntries);
  priceEditsBuffer = {};
  toast(`Se guardaron ${changedCount} cambio(s) en este celular. No te olvides de descargar products.js y subirlo a GitHub para que lleguen a todos.`);
  renderPrices();
}

// Reconstruye products.js completo (mismo formato que el original) con los
// precios efectivos actuales (base + overrides de este celular), listo para
// subir a GitHub y que el precio nuevo llegue a todos los celulares.
function buildProductsJsFileText() {
  const overrides = loadPriceOverrides();
  const autogenCount = PRODUCTS.filter(p => p.code >= 90001).length;
  const lines = [];
  lines.push('// Listado de productos - generado desde Listado_productos_Stock.xlsx');
  lines.push('// Pestañas usadas: Productos terminados, Pasteleria, VARIOS');
  lines.push(`// Total productos: ${PRODUCTS.length}  |  Códigos autogenerados (90001+): ${autogenCount}`);
  lines.push('//');
  lines.push('// price1 = precio de venta en Madrid y Málaga · price2 = precio de venta en BCN');
  lines.push(`// products.js actualizado desde la pantalla de Precios por ${state.currentUser || '—'} · ${fmtDate(new Date().toISOString())}`);
  lines.push('const PRODUCTS = [');
  PRODUCTS.forEach(p => {
    const ov = overrides[p.code] || {};
    const price1 = ov.price1 !== undefined ? ov.price1 : p.price1;
    const price2 = ov.price2 !== undefined ? ov.price2 : p.price2;
    const nameEsc = String(p.name).replace(/'/g, "\\'");
    const avgW = (p.avgWeight === null || p.avgWeight === undefined) ? 'null' : p.avgWeight;
    const p1s = (price1 === null || price1 === undefined) ? 'null' : price1;
    const p2s = (price2 === null || price2 === undefined) ? 'null' : price2;
    lines.push(`  { code: ${p.code}, name: '${nameEsc}', category: '${p.category}', unit: '${p.unit}', avgWeight: ${avgW}, price1: ${p1s}, price2: ${p2s} },`);
  });
  lines.push('];');
  lines.push('');
  lines.push('const CATEGORIES = [');
  CATEGORIES.forEach(c => lines.push(`  '${String(c).replace(/'/g, "\\'")}',`));
  lines.push('];');
  lines.push('');
  lines.push("if (typeof module !== 'undefined') { module.exports = { PRODUCTS, CATEGORIES }; }");
  return lines.join('\n');
}

function downloadUpdatedProductsJs() {
  const text = buildProductsJsFileText();
  const blob = new Blob([text], { type: 'text/javascript' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'products.js';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  toast('Se descargó products.js. Subilo a GitHub (upload/main) para que el precio nuevo llegue a todos los celulares.');
}

function renderPriceHistory() {
  if (!currentUserCanEditPrices()) { state.screen = 'location'; render(); return; }
  const hist = loadPriceHistory();
  const rows = hist.map(h => `
    <div class="history-item">
      <div class="info">
        <b>${escapeHtml(h.name)} <span style="color:var(--ink-soft);font-weight:400;">#${h.code}</span></b>
        <span>${h.field === 'price1' ? 'Precio 1 (Madrid/Málaga)' : 'Precio 2 (BCN)'} · ${h.oldValue === null || h.oldValue === undefined ? 'sin precio' : formatQty(h.oldValue)} → <b>${formatQty(h.newValue)}</b> · ${escapeHtml(h.user || '—')} · ${fmtDate(h.at)}</span>
      </div>
    </div>
  `).join('');

  app.innerHTML = `
    <div class="topbar">
      <button class="icon-btn" id="backBtn">${ICONS.chevronLeft}</button>
      <h1>Historial de precios</h1>
      <span style="width:32px"></span>
    </div>
    <div class="home">
      ${hist.length ? `<div class="history-list">${rows}</div>` : `<div class="empty-hint">Todavía no se registraron cambios de precio en este celular.</div>`}
    </div>
    <div class="footer-bar">
      <button class="btn-primary" id="downloadHistoryBtn" style="flex:1;" ${hist.length ? '' : 'disabled'}>Descargar historial (Excel)</button>
    </div>
  `;

  document.getElementById('backBtn').onclick = () => { state.screen = 'prices'; render(); };
  const dlBtn = document.getElementById('downloadHistoryBtn');
  if (hist.length) dlBtn.onclick = () => downloadPriceHistoryExcel(hist);
}

function downloadPriceHistoryExcel(hist) {
  if (typeof XLSX === 'undefined') {
    toast('La app todavía está terminando de cargar. Esperá unos segundos y probá de nuevo.');
    return;
  }
  const header = ['Fecha', 'Usuario', 'Código', 'Producto', 'Lista de precio', 'Valor anterior', 'Valor nuevo'];
  const rows = hist.map(h => [
    fmtDate(h.at), h.user || '—', h.code, h.name,
    h.field === 'price1' ? 'Precio 1 (Madrid/Málaga)' : 'Precio 2 (BCN)',
    (h.oldValue === null || h.oldValue === undefined) ? '' : h.oldValue,
    h.newValue,
  ]);
  const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
  ws['!cols'] = [{ wch: 18 }, { wch: 14 }, { wch: 9 }, { wch: 34 }, { wch: 24 }, { wch: 14 }, { wch: 14 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Historial de precios');
  XLSX.writeFile(wb, `Historial de precios - ${fmtDateShort(new Date().toISOString())}.xlsx`);
}

/* ---------------- Init ---------------- */

(function initSession() {
  const savedUser = loadSession();
  if (savedUser && findUser(savedUser)) {
    state.currentUser = savedUser;
    state.screen = 'location';
  }
})();

applyTheme(getTheme());
applyViewMode(getViewMode());

render();

/* ---------------- Actualizaciones automáticas ----------------
   Cuando subís cambios nuevos a GitHub, el celular de cada persona
   descarga el archivo en segundo plano y le muestra un banner con
   un botón "Actualizar". Al tocarlo, se activa la versión nueva y
   se recarga la página sola. */

function showUpdateBanner(waitingWorker) {
  if (document.getElementById('updateBanner')) return;
  const banner = document.createElement('div');
  banner.id = 'updateBanner';
  banner.className = 'update-banner';
  banner.innerHTML = `
    <span>Hay una actualización disponible</span>
    <button id="updateBannerBtn">Actualizar</button>
  `;
  document.body.appendChild(banner);
  document.getElementById('updateBannerBtn').onclick = () => {
    banner.querySelector('button').textContent = 'Actualizando…';
    waitingWorker.postMessage('SKIP_WAITING');
  };
}

if ('serviceWorker' in navigator) {
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js').then((reg) => {
      // Si ya hay una versión nueva esperando (por ejemplo, se descargó
      // mientras la app estaba cerrada), avisamos apenas se abre.
      if (reg.waiting) showUpdateBanner(reg.waiting);

      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        if (!newWorker) return;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            showUpdateBanner(newWorker);
          }
        });
      });

      // Revisa si hay una versión nueva cada vez que la app vuelve a
      // primer plano, y cada 5 minutos si se la deja abierta.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reg.update().catch(() => {});
      });
      setInterval(() => reg.update().catch(() => {}), 5 * 60 * 1000);
    }).catch(() => {});
  });
}
