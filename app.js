/* ============================================================
   Conteo de Inventario - lógica principal
   Pantallas: location -> type (Stock/Desperdicio) -> count -> summary
   ============================================================ */

const STORAGE_KEY = 'inv_current_count';
const HISTORY_KEY = 'inv_history';

let state = {
  screen: 'location',   // location | type | count | summary
  location: null,
  type: null,           // 'Stock' | 'Desperdicio'
  startedAt: null,
  counts: {},          // { code: qty }
  search: '',
  activeCategory: 'Todas',
  viewingHistoryId: null, // when set, summary shows a read-only past count
};

const app = document.getElementById('app');

/* ---------------- Persistence ---------------- */

function saveCurrent() {
  if (!state.location || !state.type) return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    location: state.location,
    type: state.type,
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
  if (state.screen === 'location') return renderLocation();
  if (state.screen === 'type') return renderType();
  if (state.screen === 'count') return renderCount();
  if (state.screen === 'summary') return renderSummary();
}

/* ---------------- Location picker (home) ---------------- */

function renderLocation() {
  const current = loadCurrent();
  const history = loadHistory();

  let resumeHtml = '';
  if (current && current.location && current.type) {
    const n = Object.values(current.counts || {}).filter(q => Number(q) > 0).length;
    resumeHtml = `
      <div class="resume-card" id="resumeCard">
        <div class="info">
          <b>${escapeHtml(current.location)} · ${escapeHtml(current.type)}</b>
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
              <b>${escapeHtml(h.location)} · ${escapeHtml(h.type || 'Stock')}</b>
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
      state.type = current.type;
      state.startedAt = current.startedAt;
      state.counts = current.counts || {};
      state.search = '';
      state.activeCategory = 'Todas';
      state.screen = 'count';
      render();
    };
  }

  document.querySelectorAll('[data-loc]').forEach(btn => {
    btn.onclick = () => {
      state.location = btn.getAttribute('data-loc');
      state.screen = 'type';
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
}

/* ---------------- Type picker (Stock / Desperdicio) ---------------- */

function renderType() {
  app.innerHTML = `
    <div class="topbar">
      <button class="icon-btn" id="backBtn">←</button>
      <h1>${escapeHtml(state.location)}</h1>
      <span style="width:32px"></span>
    </div>
    <div class="home">
      <div class="home-hero">
        <span class="emoji">🧾</span>
        <h2>¿Qué querés contar?</h2>
        <p>Usa el mismo listado de productos</p>
      </div>
      <button class="btn-primary" id="stockBtn">📦 Contar Stock</button>
      <button class="btn-secondary" id="wasteBtn">🗑️ Contar Desperdicio</button>
    </div>
  `;

  document.getElementById('backBtn').onclick = () => { state.screen = 'location'; render(); };

  const start = (type) => {
    state.type = type;
    state.startedAt = new Date().toISOString();
    state.counts = {};
    state.search = '';
    state.activeCategory = 'Todas';
    saveCurrent();
    state.screen = 'count';
    render();
  };

  document.getElementById('stockBtn').onclick = () => start('Stock');
  document.getElementById('wasteBtn').onclick = () => start('Desperdicio');
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

function buildProductListHtml(filtered) {
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
  return listHtml;
}

function renderCount() {
  const filtered = getFilteredProducts();
  const counted = countedItemsCount();
  const listHtml = buildProductListHtml(filtered);

  app.innerHTML = `
    <div class="topbar">
      <button class="icon-btn" id="backBtn">←</button>
      <div style="text-align:center;">
        <h1>${escapeHtml(state.location)}</h1>
        <div class="sub">${escapeHtml(state.type)} · guardado automático</div>
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

  document.getElementById('backBtn').onclick = () => { state.screen = 'location'; render(); };

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
  const data = isHistory
    ? state.viewingHistoryId
    : { location: state.location, type: state.type, counts: state.counts, finishedAt: new Date().toISOString() };

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
        <h2>${escapeHtml(data.location)} · ${escapeHtml(data.type || 'Stock')}</h2>
        <p>${fmtDate(data.finishedAt)}</p>
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
    if (isHistory) { state.viewingHistoryId = null; state.screen = 'location'; }
    else { state.screen = 'count'; }
    render();
  };

  const editBtn = document.getElementById('editBtn');
  if (editBtn) editBtn.onclick = () => { state.screen = 'count'; render(); };

  document.getElementById('shareBtn').onclick = () => shareCount(data, items, totalUnits, isHistory);
}

async function shareCount(data, items, totalUnits, isHistory) {
  const loc = sanitizeForFilename(data.location);
  const tipo = sanitizeForFilename(data.type || 'Stock');
  const dateStr = fmtDateShort(data.finishedAt);
  const filename = `${loc} - ${tipo} - ${dateStr}.xlsx`;

  // Columnas: Código, Producto, Categoría, Unidad de medida, Cantidad contada, Sucursal
  // (la fecha ya queda registrada en el nombre del archivo)
  const header = ['Código', 'Producto', 'Categoría', 'Unidad de medida', 'Cantidad contada', 'Sucursal'];
  const rows = items.map(p => [p.code, p.name, p.category, p.unit, Number(p.qty), data.location]);

  let shared = false;
  try {
    const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
    ws['!cols'] = [{ wch: 9 }, { wch: 34 }, { wch: 24 }, { wch: 14 }, { wch: 16 }, { wch: 16 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, tipo.slice(0, 28));
    const wbout = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const file = new File([blob], filename, { type: blob.type });

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({
        title: filename,
        text: `Conteo de ${tipo} - ${data.location}`,
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
    type: data.type,
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
