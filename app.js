/* ============================================================
   Conteo de Inventario - lógica principal
   Pantallas: login -> location -> count (stock) -> askWaste -> count (desperdicio) -> summary
   El Stock y el Desperdicio comparten el mismo listado de productos
   y terminan en UN SOLO Excel con dos pestañas: "Stock" y "Desperdicio".
   ============================================================ */

const STORAGE_KEY = 'inv_current_count';
const HISTORY_KEY = 'inv_history';
const SESSION_KEY = 'inv_logged_user';

let state = {
  screen: 'login',     // login | location | changePassword | count | askWaste | summary
  currentUser: null,
  location: null,
  stage: 'stock',       // 'stock' | 'desperdicio' -- qué se está contando ahora mismo
  startedAt: null,
  stockCounts: {},       // { code: qty }
  wasteCounts: {},        // { code: qty }
  wasteNotes: {},          // { code: 'motivo del desperdicio' }
  heladoDetails: { stock: {}, desperdicio: {} }, // { code: { vasquetas, manualKg } } -- solo para HELADO (KG)
  undoStack: [],            // [{ stage, code, prevValue }] -- para el botón Deshacer
  search: '',
  activeCategory: 'Todas',
  viewingHistoryId: null, // when set, summary shows a read-only past count
};

const app = document.getElementById('app');

/* ---------------- Persistence ---------------- */

function saveCurrent() {
  if (!state.location) return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    location: state.location,
    stage: state.stage,
    startedAt: state.startedAt,
    stockCounts: state.stockCounts,
    wasteCounts: state.wasteCounts,
    wasteNotes: state.wasteNotes,
    heladoDetails: state.heladoDetails,
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

function findUser(username) {
  return USERS.find(u => u.username.toLowerCase() === String(username).toLowerCase());
}

function currentUserCanDelete() {
  const u = findUser(state.currentUser);
  return !!(u && u.canDelete);
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
  return `<button class="icon-btn" id="themeToggleBtn" title="Cambiar modo">${isDark ? '☀️' : '🌙'}</button>`;
}

/* ---------------- Render router ---------------- */

function render() {
  if (state.screen === 'login') return renderLogin();
  if (state.screen === 'location') return renderLocation();
  if (state.screen === 'changePassword') return renderChangePassword();
  if (state.screen === 'count') return renderCount();
  if (state.screen === 'askWaste') return renderAskWaste();
  if (state.screen === 'summary') return renderSummary();
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
    resumeHtml = `
      <div class="resume-card" id="resumeCard">
        <div class="info">
          <b>${escapeHtml(current.location)}</b>
          <span>Conteo en curso · ${nStock} de stock${nWaste ? `, ${nWaste} de desperdicio` : ''}</span>
        </div>
        <span class="go">Continuar →</span>
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
              <b>${escapeHtml(h.location)}</b>
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
    <div class="topbar">
      <div>
        <h1>📋 Conteo de Inventario</h1>
        <div class="sub">Lucciano's · ${escapeHtml(state.currentUser || '')}</div>
      </div>
      <button class="icon-btn" id="changePwBtn" title="Cambiar contraseña">🔑</button>
      ${themeToggleButtonHtml()}
      <button class="icon-btn" id="logoutBtn" title="Cerrar sesión">⎋</button>
    </div>
    <div class="home">
      <div class="home-hero">
        <span class="emoji">🍦</span>
        <h2>¿Listo para contar?</h2>
        <p>Elegí una sucursal para empezar</p>
      </div>
      ${resumeHtml}
      <div class="loc-list" style="padding:0;">
        ${LOCATIONS.map(loc => `
          <button class="loc-item" data-loc="${escapeHtml(loc)}">
            ${escapeHtml(loc)} <span class="arrow">→</span>
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
      state.stage = current.stage || 'stock';
      state.startedAt = current.startedAt;
      state.stockCounts = current.stockCounts || {};
      state.wasteCounts = current.wasteCounts || {};
      state.wasteNotes = current.wasteNotes || {};
      state.heladoDetails = current.heladoDetails || { stock: {}, desperdicio: {} };
      state.search = '';
      state.activeCategory = 'Todas';
      state.screen = 'count';
      render();
    };
  }

  document.getElementById('changePwBtn').onclick = () => {
    state.screen = 'changePassword';
    render();
  };

  document.getElementById('themeToggleBtn').onclick = toggleTheme;

  document.getElementById('logoutBtn').onclick = () => {
    clearSession();
    state.currentUser = null;
    state.screen = 'login';
    render();
  };

  document.querySelectorAll('[data-loc]').forEach(btn => {
    btn.onclick = () => {
      state.location = btn.getAttribute('data-loc');
      state.stage = 'stock';
      state.startedAt = new Date().toISOString();
      state.stockCounts = {};
      state.wasteCounts = {};
      state.wasteNotes = {};
      state.heladoDetails = { stock: {}, desperdicio: {} };
      state.undoStack = [];
      state.search = '';
      state.activeCategory = 'Todas';
      saveCurrent();
      state.screen = 'count';
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

/* ---------------- Cambiar contraseña ---------------- */

function renderChangePassword() {
  app.innerHTML = `
    <div class="topbar">
      <button class="icon-btn" id="backBtn">←</button>
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
  return PRODUCTS.filter(p => {
    if (state.activeCategory !== 'Todas' && p.category !== state.activeCategory) return false;
    if (!term) return true;
    return p.name.toLowerCase().includes(term) || String(p.code).includes(term);
  });
}

function buildProductListHtml(filtered) {
  const counts = activeCounts();
  const isWaste = state.stage === 'desperdicio';
  const grouped = {};
  filtered.forEach(p => {
    if (!grouped[p.category]) grouped[p.category] = [];
    grouped[p.category].push(p);
  });

  if (filtered.length === 0) {
    return `<div class="no-results">No se encontraron productos.</div>`;
  }
  let listHtml = '';
  CATEGORIES.forEach(cat => {
    if (!grouped[cat]) return;
    listHtml += `<div class="cat-heading">${escapeHtml(cat)}</div>`;
    grouped[cat].forEach(p => {
      const qty = counts[p.code] || 0;
      const isHelado = p.category === 'HELADO (KG)';

      if (isHelado) {
        const detail = activeHeladoDetails()[p.code] || { vasquetas: 0, manualKg: 0 };
        const avgW = p.avgWeight || 0;
        const subtotal = detail.vasquetas * avgW;
        listHtml += `
          <div class="product-row ${qty > 0 ? 'counted' : ''}" data-row="${p.code}">
            <div class="product-info">
              <div class="code">#${p.code} · Kg${avgW ? ` · vasqueta ≈ ${formatQty(avgW)} kg` : ' · peso pendiente'}</div>
              <div class="name">${escapeHtml(p.name)}</div>
            </div>
          </div>
          <div class="helado-controls" data-helado-wrap="${p.code}">
            <div class="helado-field">
              <span class="helado-label">Cant. vasquetas</span>
              <input type="text" inputmode="numeric" class="helado-input" data-vasq="${p.code}" value="${detail.vasquetas || ''}" placeholder="0">
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

      const noteHtml = isWaste ? `
        <div class="waste-note-wrap" data-note-wrap="${p.code}">
          <input type="text" class="waste-note-input" placeholder="Motivo del desperdicio (opcional)"
            value="${escapeHtml(state.wasteNotes[p.code] || '')}" data-note="${p.code}">
        </div>` : '';
      listHtml += `
        <div class="product-row ${qty > 0 ? 'counted' : ''}" data-row="${p.code}">
          <div class="product-info">
            <div class="code">#${p.code} · ${escapeHtml(p.unit)}</div>
            <div class="name">${escapeHtml(p.name)}</div>
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
      <button class="icon-btn" id="backBtn">←</button>
      <div style="text-align:center;">
        <h1>${escapeHtml(state.location)}</h1>
        <div class="sub">${isWaste ? 'Contando Desperdicio' : 'Contando Stock'} · guardado automático</div>
      </div>
      <span class="badge">${counted}/${PRODUCTS.length}</span>
    </div>
    <div class="count-controls">
      <div class="search-wrap">
        <span class="icon">🔎</span>
        <input type="text" id="searchInput" placeholder="Buscar producto o código..." value="${escapeHtml(state.search)}">
      </div>
      <div class="chips" id="chips">
        <button class="chip ${state.activeCategory === 'Todas' ? 'active' : ''}" data-cat="Todas">Todas</button>
        ${CATEGORIES.map(c => `<button class="chip ${state.activeCategory === c ? 'active' : ''}" data-cat="${escapeHtml(c)}">${escapeHtml(c)}</button>`).join('')}
      </div>
    </div>
    <div class="product-list">${listHtml}</div>
    <div class="footer-bar">
      <button class="qty-btn" id="undoBtn" title="Deshacer último cambio" style="width:44px;height:44px;flex:none;">↩️</button>
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

// Re-render only the product list + badge/footer, without touching the
// search input, the chips bar or the page scroll position.
function renderCountListOnly() {
  const filtered = getFilteredProducts();
  const counted = countedItemsCount();
  document.querySelector('.product-list').innerHTML = buildProductListHtml(filtered);
  document.querySelector('.badge').textContent = `${counted}/${PRODUCTS.length}`;
  document.querySelector('.count-pill').textContent = `${counted} contados`;
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
  document.querySelectorAll('[data-manualkg]').forEach(input => {
    input.onchange = (e) => updateHeladoRow(input.getAttribute('data-manualkg'), 'manualKg', e.target.value);
    input.onfocus = (e) => e.target.select();
  });
}

function updateHeladoRow(code, field, rawValue) {
  const details = activeHeladoDetails();
  const current = details[code] || { vasquetas: 0, manualKg: 0 };
  const value = field === 'vasquetas'
    ? Math.max(0, Math.round(parseQtyInput(rawValue)))
    : Math.max(0, parseQtyInput(rawValue));
  current[field] = value;
  details[code] = current;

  const product = PRODUCTS.find(p => String(p.code) === String(code));
  const avgW = (product && product.avgWeight) || 0;
  const total = (current.vasquetas || 0) * avgW + (current.manualKg || 0);
  activeCounts()[code] = total;
  saveCurrent();

  const row = document.querySelector(`[data-row="${code}"]`);
  if (row) row.classList.toggle('counted', total > 0);
  const wrap = document.querySelector(`[data-helado-wrap="${code}"]`);
  if (wrap) {
    const eq = wrap.querySelector('.helado-eq');
    if (eq) eq.textContent = `= ${formatQty((current.vasquetas || 0) * avgW)} kg`;
    const totalLabel = wrap.querySelector(`[data-total-label="${code}"]`);
    if (totalLabel) totalLabel.textContent = `${formatQty(total)} kg`;
  }
  const counted = countedItemsCount();
  document.querySelector('.badge').textContent = `${counted}/${PRODUCTS.length}`;
  document.querySelector('.count-pill').textContent = `${counted} contados`;
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
  const counted = countedItemsCount();
  document.querySelector('.badge').textContent = `${counted}/${PRODUCTS.length}`;
  document.querySelector('.count-pill').textContent = `${counted} contados`;
}

/* ---------------- ¿Tuviste desperdicios? ---------------- */

function renderAskWaste() {
  const nStock = countedItemsCount(); // en este punto state.stage sigue en 'stock'
  app.innerHTML = `
    <div class="topbar">
      <button class="icon-btn" id="backBtn">←</button>
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
    return `<div class="summary-table" style="margin-bottom:10px;">${cats.map(c => `
      <div class="summary-row">
        <div class="name">${escapeHtml(c.category)}</div>
        <div class="qty">${formatQty(c.total)} ${escapeHtml(c.unit)}</div>
      </div>
    `).join('')}</div>`;
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
      <button class="icon-btn" id="backBtn">←</button>
      <h1>Resumen</h1>
      <span style="width:32px"></span>
    </div>
    <div class="summary">
      <div class="summary-hero">
        <span class="check">✅</span>
        <h2>${escapeHtml(data.location)}</h2>
        <p>${fmtDate(data.finishedAt)} · Generado por ${escapeHtml(data.generatedBy || '—')}</p>
      </div>
      <div class="summary-stats">
        <div class="stat-card"><div class="num">${stockItems.length}</div><div class="lbl">Productos (Stock)</div></div>
        <div class="stat-card"><div class="num">${totalStockUnits}</div><div class="lbl">Unidades (Stock)</div></div>
      </div>
      <div class="section-label">Stock — resumen por categoría</div>
      ${buildCategorySummaryHtml(stockItems)}
      <div class="section-label">Stock — detalle</div>
      <div class="summary-table">${buildRows(stockItems, false) || '<div class="empty-hint">No hay productos contados.</div>'}</div>
      ${wasteBlockHtml}
    </div>
    <div class="footer-bar">
      ${isHistory ? '' : '<button class="btn-secondary" id="editBtn" style="flex:1;">Seguir contando</button>'}
      <button class="btn-primary" id="shareBtn" style="flex:1;">📤 Compartir</button>
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
  const filename = `Stock - ${loc} - ${dateStr}.xlsx`;

  const header = ['Código', 'Producto', 'Categoría', 'Unidad de medida', 'Cantidad contada', 'Sucursal'];
  const wasteHeader = [...header, 'Motivo'];
  const toRows = (items) => items.map(p => [p.code, p.name, p.category, p.unit, Number(p.qty), data.location]);
  const toWasteRows = (items) => items.map(p => [p.code, p.name, p.category, p.unit, Number(p.qty), data.location, p.note || '']);
  const infoRows = (sheetLabel) => [
    [`Generado por: ${data.generatedBy || '—'}`],
    [`Sucursal: ${data.location}    Fecha: ${fmtDate(data.finishedAt)}    Pestaña: ${sheetLabel}`],
    [],
  ];

  let shared = false;
  try {
    const wb = XLSX.utils.book_new();

    const wsStock = XLSX.utils.aoa_to_sheet([...infoRows('Stock'), header, ...toRows(stockItems)]);
    wsStock['!cols'] = [{ wch: 9 }, { wch: 34 }, { wch: 24 }, { wch: 14 }, { wch: 16 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(wb, wsStock, 'Stock');

    if (wasteItems.length > 0) {
      const wsWaste = XLSX.utils.aoa_to_sheet([...infoRows('Desperdicio'), wasteHeader, ...toWasteRows(wasteItems)]);
      wsWaste['!cols'] = [{ wch: 9 }, { wch: 34 }, { wch: 24 }, { wch: 14 }, { wch: 16 }, { wch: 16 }, { wch: 28 }];
      XLSX.utils.book_append_sheet(wb, wsWaste, 'Desperdicio');
    }

    const wbout = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const file = new File([blob], filename, { type: blob.type });

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({
        title: filename,
        text: `Conteo de ${data.location}${wasteItems.length ? ' (Stock + Desperdicio)' : ' (Stock)'} · Generado por ${data.generatedBy || '—'}`,
        files: [file],
      });
      shared = true;
    } else {
      XLSX.writeFile(wb, filename);
      toast('Tu navegador no permite compartir el archivo directo: se descargó el Excel.');
      shared = true;
    }
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
    finishedAt: data.finishedAt,
    generatedBy: data.generatedBy,
    wasteNotes: state.wasteNotes,
    heladoDetails: state.heladoDetails,
    stockCounts: data.stockCounts,
    wasteCounts: data.wasteCounts,
    itemCountStock: Object.values(data.stockCounts || {}).filter(q => Number(q) > 0).length,
    itemCountWaste: Object.values(data.wasteCounts || {}).filter(q => Number(q) > 0).length,
  });
  clearCurrent();
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
