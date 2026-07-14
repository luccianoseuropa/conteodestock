/* ============================================================
   Conteo de Inventario - lógica principal
   Pantallas: home -> location -> count -> summary
   ============================================================ */

const STORAGE_KEY = 'inv_current_count';
const HISTORY_KEY = 'inv_history';

let state = {
  screen: 'home',      // home | location | count | summary
  location: null,
  startedAt: null,
  counts: {},          // { code: qty }
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
    startedAt: state.startedAt,
    counts: state.counts,
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

/* ---------------- Helpers ---------------- */

function fmtDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function countedItemsCount() {
  return Object.values(state.counts).filter(q => Number(q) > 0).length;
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

/* ---------------- Render router ---------------- */

function render() {
  if (state.screen === 'home') return renderHome();
  if (state.screen === 'location') return renderLocation();
  if (state.screen === 'count') return renderCount();
  if (state.screen === 'summary') return renderSummary();
}

/* ---------------- Home screen ---------------- */

function renderHome() {
  const current = loadCurrent();
  const history = loadHistory();

  let resumeHtml = '';
  if (current && Object.keys(current.counts || {}).length >= 0 && current.location) {
    const n = Object.values(current.counts).filter(q => Number(q) > 0).length;
    resumeHtml = `
      <div class="resume-card" id="resumeCard">
        <div class="info">
          <b>${escapeHtml(current.location)}</b>
          <span>Conteo en curso · ${n} producto${n === 1 ? '' : 's'} contados</span>
        </div>
        <span class="go">Continuar →</span>
      </div>`;
  }

  let historyHtml = '';
  if (history.length) {
    historyHtml = `
      <div class="section-label">Conteos finalizados</div>
      <div class="history-list">
        ${history.slice(0, 8).map((h, i) => `
          <div class="history-item">
            <div class="info">
              <b>${escapeHtml(h.location)}</b>
              <span>${fmtDate(h.finishedAt)} · ${h.itemCount} productos</span>
            </div>
            <button data-history-index="${i}">Ver</button>
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
        <div class="sub">Lucciano's</div>
      </div>
    </div>
    <div class="home">
      <div class="home-hero">
        <span class="emoji">🍦</span>
        <h2>¿Listo para contar?</h2>
        <p>Elegí una sucursal y arrancá el conteo</p>
      </div>
      ${resumeHtml}
      <button class="btn-primary" id="newCountBtn">+ Nuevo conteo</button>
      ${historyHtml}
    </div>
  `;

  document.getElementById('newCountBtn').onclick = () => {
    state.screen = 'location';
    render();
  };

  const resumeCard = document.getElementById('resumeCard');
  if (resumeCard) {
    resumeCard.onclick = () => {
      state.location = current.location;
      state.startedAt = current.startedAt;
      state.counts = current.counts || {};
      state.screen = 'count';
      render();
    };
  }

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
}

/* ---------------- Location picker ---------------- */

function renderLocation() {
  app.innerHTML = `
    <div class="topbar">
      <button class="icon-btn" id="backBtn">←</button>
      <h1>Elegí la sucursal</h1>
      <span style="width:32px"></span>
    </div>
    <div class="loc-list" style="margin-top:20px;">
      ${LOCATIONS.map(loc => `
        <button class="loc-item" data-loc="${escapeHtml(loc)}">
          ${escapeHtml(loc)} <span class="arrow">→</span>
        </button>
      `).join('')}
    </div>
  `;
  document.getElementById('backBtn').onclick = () => { state.screen = 'home'; render(); };
  document.querySelectorAll('[data-loc]').forEach(btn => {
    btn.onclick = () => {
      state.location = btn.getAttribute('data-loc');
      state.startedAt = new Date().toISOString();
      state.counts = {};
      state.search = '';
      state.activeCategory = 'Todas';
      saveCurrent();
      state.screen = 'count';
      render();
    };
  });
}

/* ---------------- Count screen ---------------- */

function getFilteredProducts() {
  const term = state.search.trim().toLowerCase();
  return PRODUCTS.filter(p => {
    if (state.activeCategory !== 'Todas' && p.category !== state.activeCategory) return false;
    if (!term) return true;
    return p.name.toLowerCase().includes(term) || String(p.code).includes(term);
  });
}

function renderCount() {
  const filtered = getFilteredProducts();
  const counted = countedItemsCount();

  // group by category in the order they appear in CATEGORIES
  const grouped = {};
  filtered.forEach(p => {
    if (!grouped[p.category]) grouped[p.category] = [];
    grouped[p.category].push(p);
  });

  let listHtml = '';
  if (filtered.length === 0) {
    listHtml = `<div class="no-results">No se encontraron productos.</div>`;
  } else {
    CATEGORIES.forEach(cat => {
      if (!grouped[cat]) return;
      listHtml += `<div class="cat-heading">${escapeHtml(cat)}</div>`;
      grouped[cat].forEach(p => {
        const qty = state.counts[p.code] || 0;
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
          </div>`;
      });
    });
  }

  app.innerHTML = `
    <div class="topbar">
      <button class="icon-btn" id="backBtn">←</button>
      <div style="text-align:center;">
        <h1>${escapeHtml(state.location)}</h1>
        <div class="sub">Guardado automático activado</div>
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
      <span class="count-pill">${counted} contados</span>
      <button class="btn-primary" id="finishBtn">Finalizar conteo</button>
    </div>
  `;

  document.getElementById('backBtn').onclick = () => { state.screen = 'home'; render(); };

  const searchInput = document.getElementById('searchInput');
  searchInput.oninput = (e) => {
    state.search = e.target.value;
    renderCountListOnly();
  };

  document.getElementById('chips').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-cat]');
    if (!btn) return;
    state.activeCategory = btn.getAttribute('data-cat');
    render();
    document.getElementById('searchInput').focus();
  });

  attachCountRowHandlers();

  document.getElementById('finishBtn').onclick = () => {
    if (countedItemsCount() === 0) {
      toast('Contá al menos un producto antes de finalizar');
      return;
    }
    state.screen = 'summary';
    state.viewingHistoryId = null;
    render();
  };
}

// Re-render only the product list + badge/footer without losing search focus
function renderCountListOnly() {
  const filtered = getFilteredProducts();
  const counted = countedItemsCount();
  const grouped = {};
  filtered.forEach(p => {
    if (!grouped[p.category]) grouped[p.category] = [];
    grouped[p.category].push(p);
  });

  let listHtml = '';
  if (filtered.length === 0) {
    listHtml = `<div class="no-results">No se encontraron productos.</div>`;
  } else {
    CATEGORIES.forEach(cat => {
      if (!grouped[cat]) return;
      listHtml += `<div class="cat-heading">${escapeHtml(cat)}</div>`;
      grouped[cat].forEach(p => {
        const qty = state.counts[p.code] || 0;
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
          </div>`;
      });
    });
  }
  document.querySelector('.product-list').innerHTML = listHtml;
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
}

function changeQty(code, delta) {
  const current = Number(state.counts[code] || 0);
  let next = current + delta;
  if (next < 0) next = 0;
  state.counts[code] = next;
  saveCurrent();
  updateRowUI(code, next);
}

function setQty(code, value) {
  const n = parseQtyInput(value);
  state.counts[code] = n;
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

/* ---------------- Summary screen ---------------- */

function renderSummary() {
  const isHistory = !!state.viewingHistoryId;
  const data = isHistory ? state.viewingHistoryId : { location: state.location, counts: state.counts, finishedAt: new Date().toISOString() };

  const items = PRODUCTS
    .filter(p => Number(data.counts[p.code] || 0) > 0)
    .map(p => ({ ...p, qty: data.counts[p.code] }));

  const totalUnits = items.reduce((sum, p) => sum + Number(p.qty), 0);

  const rowsHtml = items.map(p => `
    <div class="summary-row">
      <div class="name">${escapeHtml(p.name)}<span class="cat">#${p.code} · ${escapeHtml(p.category)} · ${escapeHtml(p.unit)}</span></div>
      <div class="qty">${formatQty(p.qty)}</div>
    </div>
  `).join('');

  app.innerHTML = `
    <div class="topbar">
      <button class="icon-btn" id="backBtn">←</button>
      <h1>Resumen</h1>
      <span style="width:32px"></span>
    </div>
    <div class="summary">
      <div class="summary-hero">
        <span class="check">✅</span>
        <h2>${isHistory ? escapeHtml(data.location) : 'Conteo finalizado'}</h2>
        <p>${escapeHtml(data.location)} · ${fmtDate(data.finishedAt)}</p>
      </div>
      <div class="summary-stats">
        <div class="stat-card"><div class="num">${items.length}</div><div class="lbl">Productos</div></div>
        <div class="stat-card"><div class="num">${totalUnits}</div><div class="lbl">Unidades totales</div></div>
      </div>
      <div class="summary-table">${rowsHtml || '<div class="empty-hint">No hay productos contados.</div>'}</div>
    </div>
    <div class="footer-bar">
      ${isHistory ? '' : '<button class="btn-secondary" id="editBtn" style="flex:1;">Seguir contando</button>'}
      <button class="btn-primary" id="shareBtn" style="flex:1;">📤 Compartir</button>
    </div>
  `;

  document.getElementById('backBtn').onclick = () => {
    if (isHistory) { state.viewingHistoryId = null; state.screen = 'home'; }
    else { state.screen = 'count'; }
    render();
  };

  const editBtn = document.getElementById('editBtn');
  if (editBtn) editBtn.onclick = () => { state.screen = 'count'; render(); };

  document.getElementById('shareBtn').onclick = () => shareCount(data, items, totalUnits, isHistory);
}

async function shareCount(data, items, totalUnits, isHistory) {
  const filenameSafeLoc = data.location.replace(/[^\w\-]+/g, '_');
  const dateStr = new Date(data.finishedAt).toISOString().slice(0, 10);
  const filename = `Inventario_${filenameSafeLoc}_${dateStr}.xlsx`;

  // Columnas elegidas: Código, Producto, Categoría, Unidad de medida, Cantidad contada, Sucursal, Fecha del conteo
  const header = ['Código', 'Producto', 'Categoría', 'Unidad de medida', 'Cantidad contada', 'Sucursal', 'Fecha del conteo'];
  const fechaFmt = fmtDate(data.finishedAt);
  const rows = items.map(p => [p.code, p.name, p.category, p.unit, Number(p.qty), data.location, fechaFmt]);

  let shared = false;
  try {
    const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
    ws['!cols'] = [{ wch: 9 }, { wch: 34 }, { wch: 24 }, { wch: 14 }, { wch: 16 }, { wch: 16 }, { wch: 18 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Conteo');
    const wbout = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const file = new File([blob], filename, { type: blob.type });

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({
        title: `Inventario ${data.location}`,
        text: `Conteo de ${data.location} - ${fechaFmt}`,
        files: [file],
      });
      shared = true;
    } else {
      // Descarga directa del Excel como respaldo
      XLSX.writeFile(wb, filename);
      toast('Tu navegador no permite compartir el archivo directo: se descargó el Excel.');
      shared = true;
    }
  } catch (err) {
    if (err && err.name === 'AbortError') { return; } // el usuario cerró el menú de compartir
    toast('No se pudo generar el Excel. Probá de nuevo.');
    return;
  }

  if (shared && !isHistory) finalizeIfNeeded(data);
}

function finalizeIfNeeded(data) {
  // Save to history and clear the in-progress count, only once.
  if (state._finalized) return;
  state._finalized = true;
  saveHistory({
    location: data.location,
    finishedAt: data.finishedAt,
    counts: data.counts,
    itemCount: Object.values(data.counts).filter(q => Number(q) > 0).length,
  });
  clearCurrent();
}

/* ---------------- Init ---------------- */

render();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js').catch(() => {});
  });
}
