const LS_KEY      = 'mineto_session';
const LS_PERFILES = 'mineto_perfiles';

let perfil = {
  nombre: '', sueldo: 0, af: 0,
  seguro: 'AFP', afpNombre: 'Integra',
  epsMode: false, epsMonto: 0,
  jornada: 'FORANEO',
  semana:  'L-S',
  movilidadMes: 0,
};

function mostrarOnboarding() {
  document.getElementById('screen-perfiles').style.display   = 'none';
  document.getElementById('screen-onboarding').style.display = '';
}

// ── PERFIL / HISTORIAL ───────────────────────────────────────────────────────

function loadPerfiles() {
  try { return JSON.parse(localStorage.getItem(LS_PERFILES) || '[]'); }
  catch(e) { return []; }
}

function saveProfile(nombre, anio) {
  const perfiles = loadPerfiles();
  const key      = nombre + '|' + anio;
  const idx      = perfiles.findIndex(p => p.key === key);
  const entry    = {
    key, nombre, anio,
    perfil:       { ...perfil },
    transacciones: JSON.parse(JSON.stringify(transacciones)),
    categorias:    JSON.parse(JSON.stringify(categorias)),
    planillaData:  JSON.parse(JSON.stringify(planillaData)),
    ts:            Date.now(),
  };
  if (idx >= 0) perfiles[idx] = entry;
  else          perfiles.unshift(entry);
  try { localStorage.setItem(LS_PERFILES, JSON.stringify(perfiles.slice(0, 20))); } catch(e) {}
}

function showPerfilSelector() {
  const perfiles = loadPerfiles();
  const lista    = document.getElementById('perfiles-lista');
  lista.innerHTML = '';
  perfiles.forEach(p => {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:6px;align-items:stretch';

    const btn = document.createElement('button');
    btn.className = 'perfil-item';
    btn.style.flex = '1';
    btn.innerHTML = `
      <div class="pi-name">${p.nombre}</div>
      <div class="pi-meta">Año ${p.anio} · ${new Date(p.ts).toLocaleDateString('es-PE')}</div>
    `;
    btn.onclick = () => cargarPerfil(p);

    const exp = document.createElement('button');
    exp.className = 'btn btn-ghost btn-sm';
    exp.title     = 'Exportar este perfil';
    exp.textContent = '⬇';
    exp.style.cssText = 'padding:0 10px;flex-shrink:0;font-size:13px';
    exp.onclick = (e) => {
      e.stopPropagation();
      exportarPerfil(p);
    };

    const del = document.createElement('button');
    del.className = 'btn btn-danger btn-sm';
    del.title     = 'Eliminar perfil';
    del.textContent = '✕';
    del.style.cssText = 'padding:0 10px;flex-shrink:0;font-size:12px';
    del.onclick = (e) => {
      e.stopPropagation();
      eliminarPerfil(p.nombre, p.anio);
    };

    row.appendChild(btn);
    row.appendChild(exp);
    row.appendChild(del);
    lista.appendChild(row);
  });
  document.getElementById('screen-perfiles').style.display = 'flex';
  updateTopNav('perfiles');
}

function eliminarPerfil(nombre, anio) {
  if (!confirm('¿Eliminar el perfil "' + nombre + ' · ' + anio + '"?')) return;
  const perfiles = loadPerfiles().filter(p => !(p.nombre === nombre && p.anio === anio));
  try { localStorage.setItem(LS_PERFILES, JSON.stringify(perfiles)); } catch(e) {}
  showToast('Perfil eliminado ✓');
  showPerfilSelector();
}

/** Vuelve a la pantalla principal de perfiles desde cualquier pantalla */
function irInicio() {
  saveAll();
  ['screen-app', 'screen-onboarding'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  showPerfilSelector();
}

function cargarPerfil(p) {
  perfil        = Object.assign({ movilidadMes: 0 }, perfil, p.perfil);
  if (p.transacciones) transacciones = p.transacciones;
  if (p.categorias)    categorias    = p.categorias;
  if (p.planillaData)  planillaData  = p.planillaData;
  document.getElementById('screen-perfiles').style.display = 'none';
  arrancaApp();
}

// ── ESTADO GLOBAL ────────────────────────────────────────────────────────────
let calState = {
  anio:       new Date().getFullYear(),
  mes:        new Date().getMonth(),
  marcas:     {},
  markActivo: 'W',
  painting:   false,
};

let transacciones = [];           // [{id, tipo:'gasto'|'ingreso', catId, monto, desc, fecha, autoId?}]
let categorias    = { gastos: [], ingresos: [] };
let planillaData  = {};           // {YYYY-M: {sueldo,af,alimentacion}} para computeIngAnt
let feState = {
  tipo:        'gastos',
  periodo:     'dia',
  offset:      0,
  view:        'categorias',
  grafico:     'general',
  section:     'inicio',
  sbCatTipo:   'gasto',
  sbGrafico:   'general',
  sbGrafPer:   'mes',
  catFilter:   null,        // filtro por catId en vista transacciones
  customFrom:  null,
  customTo:    null,
  txAccordion: null,        // catId con detalle abierto (acordeón)
};

// ── PARÁMETROS DEL SISTEMA ────────────────────────────────────────────────────
const DEFAULT_GEMINI_KEY = 'AIzaSyDKxchGCXz_TGAUqMYY3F_YayBGoAj5lA8';

let params = {
  empresa:   { nombre: 'Consorcio Rovella-INMAC', ruc: '', direccion: '', logo: '', anio: 2026 },
  planilla:  { af: 102.50, movilidadMensual: 679.00, viaticosAlim: 39.00, viaticosAloj: 65.00 },
  apariencia:{ redondeo: false, moneda: 'PEN', tipoCambio: 3.85, primerDia: 1, sepDecimal: '.', idioma: 'es' },
  ia:        { geminiKey: DEFAULT_GEMINI_KEY, vozActiva: false },
};
let feModalTx  = { open: false, editId: null, tipo: 'gasto', fecha: 'hoy', customFecha: null, catId: null };
let feCatModal = { open: false, tipo: 'gasto' };
let feEditCat  = { open: false, id: null, tipo: 'gasto', emoji: '📦', color: '#90a4ae' };

function loadLS() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch(e) { return null; }
}
function saveLS(data) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(data)); } catch(e) {}
}
function loadAll() {
  const d = loadLS();
  if (!d) return;
  if (d.perfil)        perfil        = Object.assign({ movilidadMes: 0 }, perfil, d.perfil);
  if (d.calState)      calState      = Object.assign({}, calState, d.calState);
  if (d.transacciones) transacciones = d.transacciones;
  if (d.categorias)    categorias    = d.categorias;
  if (d.planillaData)  planillaData  = d.planillaData;
  if (d.params) {
    params = Object.assign({}, params, d.params);
    // Deep-merge sección ia para preservar key por defecto si no hay una guardada
    params.ia = Object.assign(
      { geminiKey: DEFAULT_GEMINI_KEY, vozActiva: false },
      d.params.ia || {}
    );
    if (!params.ia.geminiKey) params.ia.geminiKey = DEFAULT_GEMINI_KEY;
  }
}
function saveAll() {
  saveLS({ perfil, calState, transacciones, categorias, planillaData, params });
}

// ── INICIAR APP ──────────────────────────────────────────────────────────────

function iniciarApp() {
  const nombre = document.getElementById('ob-nombre').value.trim();
  if (!nombre) { alert('Ingresa tu nombre'); return; }

  perfil.nombre      = nombre;
  perfil.jornada     = document.querySelector('.jornada-opt.selected')?.dataset.j  || 'FORANEO';
  perfil.semana      = leerDiasPicker() || 'L,M,X,J,V,S';
  perfil.seguro      = document.querySelector('.seg-opt.selected[data-seg]')?.dataset.seg || 'AFP';
  perfil.afpNombre   = document.querySelector('.seg-opt.selected[data-afp]')?.dataset.afp || 'Integra';
  perfil.epsMode     = false;
  perfil.epsMonto    = 0;
  perfil.sueldo      = 0;
  perfil.af          = 0;
  perfil.movilidadMes = 0;

  arrancaApp();
}

function arrancaApp() {
  document.getElementById('screen-onboarding').style.display = 'none';
  document.getElementById('screen-perfiles').style.display   = 'none';
  document.getElementById('screen-app').style.display        = 'flex';

  // ── Advertencia file:// — Chrome nunca guarda permisos de micrófono en file:// ──
  if (location.protocol === 'file:') {
    const KEY = 'mineto_localhost_banner';
    if (!localStorage.getItem(KEY)) {
      const bar = document.createElement('div');
      bar.id = 'localhost-banner';
      bar.style.cssText = [
        'position:fixed','top:0','left:0','right:0','z-index:99999',
        'background:#c0392b','color:#fff','padding:10px 16px',
        'font-size:12px','font-family:monospace',
        'display:flex','align-items:center','justify-content:space-between','gap:12px',
        'box-shadow:0 2px 12px rgba(0,0,0,.4)'
      ].join(';');
      bar.innerHTML =
        '<span>🎤 <b>Para el micrófono sin diálogos</b>, abre la app desde ' +
        '<code style="background:rgba(255,255,255,.2);padding:1px 6px;border-radius:3px">http://localhost:7890</code> — ' +
        'ejecuta en la carpeta del proyecto: ' +
        '<code style="background:rgba(255,255,255,.2);padding:1px 6px;border-radius:3px">python -m http.server 7890</code></span>' +
        '<button onclick="localStorage.setItem(\'mineto_localhost_banner\',\'1\');this.closest(\'#localhost-banner\').remove()" ' +
        'style="background:rgba(255,255,255,.15);border:1px solid rgba(255,255,255,.4);color:#fff;padding:5px 14px;border-radius:5px;cursor:pointer;white-space:nowrap;font-size:11px">OK, no mostrar más</button>';
      document.body.prepend(bar);
    }
  }

  // Aplicar estado del micrófono (activa/desactiva según params.ia.vozActiva)
  _applyVozState();

  // Update global sidebar profile name
  const pnameEl = document.getElementById('app-sb-pname');
  if (pnameEl) pnameEl.textContent = perfil.nombre || '—';

  // Update mobile topbar profile name
  const mtpProfile = document.getElementById('mtp-profile');
  if (mtpProfile) mtpProfile.textContent = perfil.nombre || '—';

  // hdr-nombre may no longer exist but keep for safety
  const hdrNombre = document.getElementById('hdr-nombre');
  if (hdrNombre) hdrNombre.textContent = perfil.nombre;

  // Inicializar categorías si es primera vez
  if (!categorias.gastos || categorias.gastos.length === 0 ||
      !categorias.ingresos || categorias.ingresos.length === 0) {
    categorias = getCatsDefault();
  }
  // Migrar: añadir i-movil si falta
  if (!categorias.ingresos.find(c => c.id === 'i-movil')) {
    const idx = categorias.ingresos.findIndex(c => c.id === 'i-cts');
    const movCat = { id:'i-movil', emoji:'🚗', nombre:'Movilidad', color:'#1abc9c', budget:0 };
    if (idx >= 0) categorias.ingresos.splice(idx, 0, movCat);
    else categorias.ingresos.push(movCat);
  }

  // Auto-carga de datos de muestra en el primer lanzamiento
  const _DEMO_KEY = 'mineto_demo_auto';
  if (!transacciones.length && !localStorage.getItem(_DEMO_KEY)) {
    localStorage.setItem(_DEMO_KEY, '1');
    _autoLoadDemoSilent();
  }

  sincronizarUI();
  buildCal();
  recalcular();
  showModule('individual');
}

function editarPerfil() {
  document.getElementById('screen-app').style.display        = 'none';
  document.getElementById('screen-onboarding').style.display = '';

  document.getElementById('ob-nombre').value = perfil.nombre;

  document.querySelectorAll('.seg-opt[data-seg]').forEach(el => {
    el.classList.toggle('selected', el.dataset.seg === perfil.seguro);
  });
  document.querySelectorAll('.seg-opt[data-afp]').forEach(el => {
    el.classList.toggle('selected', el.dataset.afp === perfil.afpNombre);
  });
  document.getElementById('ob-afp-wrap').style.display = perfil.seguro === 'ONP' ? 'none' : '';

  document.querySelectorAll('.jornada-opt').forEach(el => {
    el.classList.toggle('selected', el.dataset.j === perfil.jornada);
  });
  restaurarDiasPicker(perfil.semana);
  const semWrap = document.getElementById('ob-semana-wrap');
  if (semWrap) semWrap.style.display = perfil.jornada === 'LOCAL' ? '' : 'none';
}

function sincronizarUI() {
  document.getElementById('ind-sueldo').value     = perfil.sueldo      || '';
  document.getElementById('ind-af').value         = perfil.af          || '';
  document.getElementById('ind-movil').value      = perfil.movilidadMes || '';
  document.getElementById('chk-hijos').checked    = perfil.af === 113;
  document.getElementById('chk-eps').checked      = perfil.epsMode;
  const epsD = document.getElementById('ind-eps-detail');
  if (perfil.epsMode) {
    epsD.classList.add('open');
    document.getElementById('ind-eps-monto').value = perfil.epsMonto || '';
  } else {
    epsD.classList.remove('open');
  }
  const now = new Date();
  document.getElementById('ind-anio').value = now.getFullYear();
  document.getElementById('ind-mes').value  = now.getMonth();
  calState.anio = now.getFullYear();
  calState.mes  = now.getMonth();
}

// ── UI HELPERS ───────────────────────────────────────────────────────────────

function switchTab(btn) {
  // Legacy: redirect to showModule
  showModule(btn.dataset.tab || 'individual');
}

function toggleTheme() {
  const html   = document.documentElement;
  const isDark = html.getAttribute('data-theme') === 'dark';
  html.setAttribute('data-theme', isDark ? 'light' : 'dark');
  const label  = isDark ? '☾ Dark' : '☀ Light';
  const t1 = document.getElementById('btn-theme');
  const t2 = document.getElementById('btn-theme-nav');
  if (t1) t1.textContent = label;
  if (t2) t2.textContent = label;
}

// ── VOZ TOGGLE ────────────────────────────────────────────────────────────────

function toggleVoz() {
  if (!params.ia) params.ia = { geminiKey: DEFAULT_GEMINI_KEY, vozActiva: false };
  params.ia.vozActiva = !params.ia.vozActiva;
  saveAll();
  _applyVozState();
}

function _applyVozState() {
  const on   = params.ia && params.ia.vozActiva;
  const btn  = document.getElementById('btn-voz-toggle');
  const wrap = document.getElementById('voz-fab-wrap');
  const mtpBtn = document.getElementById('mtp-voz-btn');
  if (btn)    { btn.textContent = on ? '🎤 Voz ON' : '🎤 Voz OFF';
                btn.classList.toggle('app-sb-voz-active', on); }
  if (mtpBtn) { mtpBtn.textContent = on ? '🎙️' : '🎤';
                mtpBtn.classList.toggle('mtp-voz-active', on);
                mtpBtn.title = on ? 'Voz ON — toca para desactivar' : 'Activar voz'; }
  if (wrap)   wrap.style.display = on ? '' : 'none';
  if (on) {
    if (typeof VozControl !== 'undefined' && VozControl.preinit) VozControl.preinit();
  } else {
    if (typeof VozControl !== 'undefined' && VozControl.stop) VozControl.stop();
  }
}

// ── MODULE SWITCHER ───────────────────────────────────────────────────────────

function showModule(mod) {
  // Update module panels
  ['individual', 'flujo', 'params'].forEach(m => {
    const el = document.getElementById('module-' + m);
    if (el) { el.style.display = m === mod ? '' : 'none'; el.classList.toggle('active-module', m === mod); }
  });

  // Update sidebar active state
  ['individual', 'flujo', 'params'].forEach(m => {
    const btn = document.getElementById('sb-btn-' + m);
    if (btn) btn.classList.toggle('app-sb-active', m === mod);
  });

  // Sync bottom-nav (mobile)
  ['individual', 'flujo', 'params'].forEach(m => {
    const bn = document.getElementById('bn-' + m);
    if (bn) bn.classList.toggle('bn-active', m === mod);
  });

  // Show/hide sub-navs
  const flujoNav = document.getElementById('app-sb-flujo-nav');
  const indNav   = document.getElementById('app-sb-ind-nav');
  if (flujoNav) flujoNav.style.display = mod === 'flujo' ? '' : 'none';
  if (indNav)   indNav.style.display   = mod === 'individual' ? '' : 'none';

  // Render content when switching
  if (mod === 'flujo') {
    feState.section = feState.section || 'inicio';
    setFeSection(feState.section);
    renderFlujoTab();
  }
  if (mod === 'params') renderParams();
}

function selSeg(el) {
  document.querySelectorAll('.seg-opt[data-seg]').forEach(e => e.classList.remove('selected'));
  el.classList.add('selected');
  document.getElementById('ob-afp-wrap').style.display = el.dataset.seg === 'AFP' ? '' : 'none';
}

function selAFP(el) {
  document.querySelectorAll('.seg-opt[data-afp]').forEach(e => e.classList.remove('selected'));
  el.classList.add('selected');
}

function selJornada(el) {
  document.querySelectorAll('.jornada-opt').forEach(e => e.classList.remove('selected'));
  el.classList.add('selected');
  const isLocal = el.dataset.j === 'LOCAL';
  const semWrap = document.getElementById('ob-semana-wrap');
  if (semWrap) semWrap.style.display = isLocal ? '' : 'none';
}

// ── SELECTOR DE DÍAS SUELTOS ──────────────────────────────────────────────────
/** Mapa de código día → número JS (getDay()) */
const DIA_MAP = { L:1, M:2, X:3, J:4, V:5, S:6, D:0 };
const DIA_ORDER = ['L','M','X','J','V','S','D'];

/**
 * Devuelve un Set con los números JS (0=Dom…6=Sáb) de días hábiles según perfil.semana.
 * Compatible con formato antiguo ('L-S','L-V') y nuevo ('L,M,X,J,V').
 */
function getDiasHab(semana) {
  const s = semana || perfil.semana || 'L-S';
  if (s === 'L-S') return new Set([1,2,3,4,5,6]);
  if (s === 'L-V') return new Set([1,2,3,4,5]);
  // Formato nuevo: "L,M,X,J,V,S"
  return new Set(s.split(',').map(c => DIA_MAP[c]).filter(v => v !== undefined));
}

/** Lee los días seleccionados del picker y devuelve el string "L,M,X,J,V" */
function leerDiasPicker() {
  const activos = [];
  document.querySelectorAll('#ob-dias-picker .dsp-cell.selected').forEach(c => {
    activos.push(c.dataset.dia);
  });
  // Mantener el orden canónico L M X J V S D
  return DIA_ORDER.filter(d => activos.includes(d)).join(',');
}

/** Toggle individual de celda día */
function toggleDia(el) {
  el.classList.toggle('selected');
}

/** Restaura el picker con los días de perfil.semana */
function restaurarDiasPicker(semana) {
  const hab = getDiasHab(semana);
  document.querySelectorAll('#ob-dias-picker .dsp-cell').forEach(c => {
    c.classList.toggle('selected', hab.has(DIA_MAP[c.dataset.dia]));
  });
}

function selPeriodo(el) {
  document.querySelectorAll('.seg-opt[data-p]').forEach(e => e.classList.remove('selected'));
  el.classList.add('selected');
  recalcular();
}

function toggleHijosApp() {
  const checked = document.getElementById('chk-hijos').checked;
  if (checked) document.getElementById('ind-af').value = '113';
  else if (document.getElementById('ind-af').value === '113') document.getElementById('ind-af').value = '';
  recalcular();
}

function toggleEpsApp() {
  const checked = document.getElementById('chk-eps').checked;
  const det     = document.getElementById('ind-eps-detail');
  if (checked) det.classList.add('open');
  else         det.classList.remove('open');
  recalcular();
}

// ── CALENDARIO ───────────────────────────────────────────────────────────────
// AbortController para gestionar listeners del calendario sin acumulación
let _calAbortCtrl = null;

function buildCal() {
  const { anio, mes } = calState;
  const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  document.getElementById('cal-label').textContent = meses[mes] + ' ' + anio;

  const isLocal  = perfil.jornada === 'LOCAL';
  const diasHab  = getDiasHab(perfil.semana);

  // LOCAL: si no hay marcas en el mes, pre-rellenar días hábiles como W
  if (isLocal) {
    const totalD    = new Date(anio, mes + 1, 0).getDate();
    const hayMarcas = Object.keys(calState.marcas).some(k => k.startsWith(anio + '-' + mes + '-'));
    if (!hayMarcas) {
      for (let d = 1; d <= totalD; d++) {
        const dow = new Date(anio, mes, d).getDay();
        if (diasHab.has(dow)) {
          calState.marcas[anio + '-' + mes + '-' + d] = 'W';
        }
      }
    }
  }

  const grid = document.getElementById('cal-grid');
  grid.innerHTML = '';

  // Cabeceras
  for (const d of ['L','M','X','J','V','S','D']) {
    const hdr = document.createElement('div');
    hdr.className   = 'day-hdr';
    hdr.textContent = d;
    grid.appendChild(hdr);
  }

  const firstDow  = new Date(anio, mes, 1).getDay();
  const offset    = firstDow === 0 ? 6 : firstDow - 1;
  const totalDias = new Date(anio, mes + 1, 0).getDate();
  // Feriados del mes para mostrar estrella
  const feriadosDia = (typeof getFeriadosMes === 'function') ? getFeriadosMes(anio, mes) : [];

  for (let i = 0; i < offset; i++) {
    const e = document.createElement('div');
    e.className = 'day empty';
    grid.appendChild(e);
  }

  for (let d = 1; d <= totalDias; d++) {
    const dow       = new Date(anio, mes, d).getDay();
    const key       = anio + '-' + mes + '-' + d;
    const mark      = calState.marcas[key] || '';
    const esFeriado = feriadosDia.includes(d);
    const isDOM     = dow === 0;
    const blocked   = isLocal && !diasHab.has(dow);

    const el = document.createElement('div');
    el.dataset.day  = String(d); // ← clave para event delegation

    // Número del día como texto base
    el.textContent = d;

    let cls = 'day';
    if (mark)              cls += ' ' + mark;
    if (isDOM && isLocal)  cls += ' dom';   // solo LOCAL: domingo apagado si no labora
    if (blocked)           cls += ' blocked';
    if (esFeriado) cls += ' feriado';
    el.className = cls;

    // Etiqueta de marca
    if (mark) {
      const lbl = document.createElement('div');
      lbl.className   = 'day-mark';
      lbl.textContent = mark;
      el.appendChild(lbl);
    }

    // Estrella de feriado (esquina superior derecha)
    if (esFeriado) {
      const star = document.createElement('div');
      star.className   = 'day-star';
      star.textContent = '★';
      el.appendChild(star);
    }

    grid.appendChild(el);
  }

  // Configurar event delegation (un solo juego de listeners por buildCal)
  _setupCalListeners(grid, anio, mes);
  updateCounters();
}

/** Configura listeners de pintado con AbortController (evita acumulación). */
function _setupCalListeners(grid, anio, mes) {
  if (_calAbortCtrl) _calAbortCtrl.abort();
  _calAbortCtrl = new AbortController();
  const sig = _calAbortCtrl.signal;

  function getCell(e) {
    return e.target.closest('[data-day]');
  }

  grid.addEventListener('mousedown', (e) => {
    const cell = getCell(e);
    if (!cell || cell.classList.contains('empty') || cell.classList.contains('blocked')) return;
    calState.painting = true;
    paintDay(parseInt(cell.dataset.day));
  }, { signal: sig });

  // mouseover (no mouseenter) para capturar el arrastre sobre celdas hijas
  grid.addEventListener('mouseover', (e) => {
    if (!calState.painting) return;
    const cell = getCell(e);
    if (!cell || cell.classList.contains('empty') || cell.classList.contains('blocked')) return;
    paintDay(parseInt(cell.dataset.day));
  }, { signal: sig });

  grid.addEventListener('touchstart', (e) => {
    const cell = e.target.closest('[data-day]');
    if (!cell || cell.classList.contains('blocked')) return;
    e.preventDefault();
    calState.painting = true;
    paintDay(parseInt(cell.dataset.day));
  }, { signal: sig, passive: false });

  grid.addEventListener('touchmove', (e) => {
    if (!calState.painting) return;
    e.preventDefault();
    const touch = e.touches[0];
    const el = document.elementFromPoint(touch.clientX, touch.clientY);
    if (!el) return;
    const cell = el.closest('[data-day]');
    if (!cell || cell.classList.contains('blocked')) return;
    paintDay(parseInt(cell.dataset.day));
  }, { signal: sig, passive: false });

  const stopPainting = () => { calState.painting = false; };
  document.addEventListener('mouseup',    stopPainting, { signal: sig });
  document.addEventListener('touchend',   stopPainting, { signal: sig });
  document.addEventListener('touchcancel', stopPainting, { signal: sig }); // evita estado 'painting' atascado
}

/**
 * Pinta/despinta un día sin reconstruir el calendario completo.
 * Actualiza sólo la celda afectada, los contadores y el resultado.
 */
function paintDay(d) {
  const { anio, mes } = calState;
  const key  = anio + '-' + mes + '-' + d;
  const mark = calState.markActivo;
  const cur  = calState.marcas[key];

  // Toggle: si ya tiene la misma marca, se borra
  if (cur === mark) delete calState.marcas[key];
  else              calState.marcas[key] = mark;

  // ── Actualizar sólo esta celda (no rebuildar todo el calendario) ──
  const el = document.querySelector(`#cal-grid [data-day="${d}"]`);
  if (el) {
    const dow       = new Date(anio, mes, d).getDay();
    const isDOM     = dow === 0;
    const isLocal   = perfil.jornada === 'LOCAL';
    const blocked   = isLocal && !getDiasHab(perfil.semana).has(dow);
    const esFeriado = (typeof getFeriadosMes === 'function') && getFeriadosMes(anio, mes).includes(d);
    const newMark   = calState.marcas[key] || '';

    let cls = 'day';
    if (newMark)            cls += ' ' + newMark;
    if (isDOM && isLocal)   cls += ' dom';
    if (blocked)            cls += ' blocked';
    if (esFeriado)          cls += ' feriado';
    el.className  = cls;
    el.dataset.day = String(d);

    // Reconstruir contenido de la celda (número + mark + star)
    el.textContent = d; // limpia todo y pone el número
    if (newMark) {
      const lbl = document.createElement('div');
      lbl.className   = 'day-mark';
      lbl.textContent = newMark;
      el.appendChild(lbl);
    }
    if (esFeriado) {
      const star = document.createElement('div');
      star.className   = 'day-star';
      star.textContent = '★';
      el.appendChild(star);
    }
  }

  updateCounters();
  recalcular();
  saveAll();
}

function calPrev() {
  if (calState.mes === 0) { calState.mes = 11; calState.anio--; }
  else calState.mes--;
  syncCalMes();
}
function calNext() {
  if (calState.mes === 11) { calState.mes = 0; calState.anio++; }
  else calState.mes++;
  syncCalMes();
}
function syncCalMes() {
  document.getElementById('ind-anio').value = calState.anio;
  document.getElementById('ind-mes').value  = calState.mes;
  buildCal();
  recalcular();
}
function calClear() {
  const { anio, mes } = calState;
  for (const key of Object.keys(calState.marcas)) {
    if (key.startsWith(anio + '-' + mes + '-')) delete calState.marcas[key];
  }
  buildCal();
  recalcular();
  saveAll();
}

function selMark(btn) {
  document.querySelectorAll('.paint-btn').forEach(b =>
    b.classList.remove('sel-W','sel-R','sel-V','sel-F','sel-SU','sel-MED','sel-TL')
  );
  btn.classList.add('sel-' + btn.dataset.mark);
  calState.markActivo = btn.dataset.mark;
}

function updateCounters() {
  const { anio, mes } = calState;
  const counts = { W:0, R:0, V:0, F:0, SU:0, MED:0, TL:0 };
  for (const [key, val] of Object.entries(calState.marcas)) {
    if (key.startsWith(anio + '-' + mes + '-')) counts[val] = (counts[val]||0) + 1;
  }
  document.getElementById('cnt-W').textContent = counts.W;
  document.getElementById('cnt-R').textContent = counts.R;
  document.getElementById('cnt-V').textContent = counts.V;
  document.getElementById('cnt-F').textContent = counts.F + counts.SU;
}

function getMarcasDelMes() {
  const { anio, mes } = calState;
  const totalDias = new Date(anio, mes + 1, 0).getDate();
  const arr = [];
  for (let d = 1; d <= totalDias; d++) {
    const key = anio + '-' + mes + '-' + d;
    arr.push(calState.marcas[key] || '');
  }
  return arr;
}

// ── CÁLCULO ──────────────────────────────────────────────────────────────────

/**
 * Suma ingresos afectos de meses anteriores guardados en flujoData.
 * Necesario para la fórmula progresiva de Renta 5ta (ingAnt en calcR5Full).
 * Sólo toma meses del mismo año con datos grabados (sueldo+af+alimGravable).
 */
function computeIngAnt(anio, mes) {
  let total = 0;
  for (let p = 0; p < mes; p++) {
    const dp = planillaData[anio + '-' + p];
    if (!dp) continue;
    const sp  = dp.sueldo  || 0;
    const ap  = dp.af      || 0;
    const alp = dp.alimentacion || 0;
    total += sp + ap + Math.min(alp, sp * 0.20);
  }
  return total;
}

function recalcular() {
  const anio        = parseInt(document.getElementById('ind-anio').value) || new Date().getFullYear();
  const mes         = parseInt(document.getElementById('ind-mes').value);
  const sueldo      = parseFloat(document.getElementById('ind-sueldo').value)    || 0;
  const af          = parseFloat(document.getElementById('ind-af').value)         || 0;
  const epsMode     = document.getElementById('chk-eps').checked;
  const epsMonto    = parseFloat(document.getElementById('ind-eps-monto').value)  || 0;
  const movilidadMes = parseFloat(document.getElementById('ind-movil')?.value)    || 0;
  const { periodo: periodoProvis, mesEnPeriodo } = getPeriodoProvis(mes);

  // Mantener perfil sincronizado con la pantalla
  perfil.sueldo      = sueldo;
  perfil.af          = af;
  perfil.epsMode     = epsMode;
  perfil.epsMonto    = epsMonto;
  perfil.movilidadMes = movilidadMes;

  calState.anio = anio;
  calState.mes  = mes;

  const marcas = getMarcasDelMes();
  const calcParams = {
    sueldo, af, afpNombre: perfil.afpNombre,
    epsMode, epsMonto, seguro: perfil.seguro,
    marcas, anio, mes,
    jornada: perfil.jornada,
    periodoProvis,
    movilidadMes,
    ingAnt: computeIngAnt(anio, mes),
    viaticosAlim: params.planilla.viaticosAlim,
    viaticosAloj: params.planilla.viaticosAloj,
  };

  const r = calcularPlanilla(calcParams);
  window._lastResult = r;
  window._lastParams = calcParams;

  const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  document.getElementById('res-neto').textContent    = fmtS(r.neto);
  document.getElementById('res-periodo').textContent = meses[mes] + ' ' + anio + ' · ' + perfil.jornada;
  document.getElementById('res-dias-s').textContent  = fmt(r.diasSueldo);
  document.getElementById('res-dias-v').textContent  = r.diasViat;
  document.getElementById('res-vdia').textContent    = fmtS(r.valorDia);

  document.getElementById('r-sueldo-prop').textContent = fmt(r.sueldoProp);
  document.getElementById('r-af-prop').textContent     = fmt(r.afProp);
  document.getElementById('r-alim').textContent        = fmt(r.alimentacion);
  document.getElementById('r-aloj').textContent        = fmt(r.alojamiento);
  document.getElementById('r-movil').textContent       = fmt(r.movilidad);
  document.getElementById('r-tot-ing').textContent     = fmt(r.totalIngresos);

  // Feriados: mostrar línea si hay alguno
  const feriadoEl = document.getElementById('r-feriado');
  if (feriadoEl) feriadoEl.textContent = fmt(r.feriadoProp || 0);

  document.getElementById('r-afp-fondo').textContent   = fmt(r.afpFondo);
  document.getElementById('r-afp-seguro').textContent  = fmt(r.afpSeguro);
  document.getElementById('r-onp').textContent         = fmt(r.onp);
  document.getElementById('r-r5').textContent          = fmt(r.r5Prop);
  document.getElementById('r-eps').textContent         = fmt(r.epsDesc);
  document.getElementById('r-tot-desc').textContent    = fmt(r.totalDesc);

  document.getElementById('r-essalud').textContent     = fmt(r.essalud);
  document.getElementById('r-vidaley').textContent     = fmt(r.vidaLey);
  document.getElementById('r-tot-emp').textContent     = fmt(r.essalud + r.vidaLey);

  document.getElementById('r-cts').textContent         = fmt(r.ctsMens);
  document.getElementById('r-grati').textContent       = fmt(r.gratiMes);
  document.getElementById('r-tot-prov').textContent    = fmt(r.ctsMens + r.gratiMes);

  updateRentaSteps(sueldo, af, epsMode, anio, r.diasSueldo, mes, r.alimentacion, params.ingAnt);

  // ── Guardar datos de planilla (Renta 5ta + CTS/Grati acumulables) ────────────
  planillaData[anio + '-' + mes] = {
    sueldo, af,
    alimentacion: r.alimentacion,
    ctsMens:  r.ctsMens  || 0,
    gratiMes: r.gratiMes || 0,
  };

  saveAll();
  saveProfile(perfil.nombre, anio);
}

function updateRentaSteps(sueldo, af, epsMode, anio, diasSueldo, mes, alimMes, ingAnt) {
  const steps     = buildRentaSteps(sueldo, af, epsMode, anio, diasSueldo, mes, alimMes, ingAnt);
  const mesNombre = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'][steps.mes] || '';
  const bonifLbl  = epsMode ? '6.75% EPS' : '9% EsSalud';
  const cont      = document.getElementById('renta-steps');
  const ingAntRow = steps.ingAntAdj > 0
    ? `<div class="rs"><span class="rl">+ Ingresos anteriores (Ene–${mesNombre} acum.)</span><span class="rv">${fmtS(steps.ingAntAdj)}</span></div>`
    : '';
  const alimRow = steps.alimGrav > 0
    ? `<div class="rs"><span class="rl">+ Alimentación gravable (límite 20%)</span><span class="rv">${fmtS(steps.alimGrav)}</span></div>`
    : '';
  cont.innerHTML = `
    <div class="rs"><span class="rl">Proyección rem. restante (S+AF)×${steps.mult}</span><span class="rv">${fmtS(steps.proyMens - steps.alimGrav)}</span></div>
    ${alimRow}
    <div class="rs"><span class="rl">+ Gratificaciones (S+AF)×2 + bonif. ${bonifLbl}</span><span class="rv">${fmtS(steps.proyGrats)}</span></div>
    ${ingAntRow}
    <div class="rs"><span class="rl">= Ingresos anuales proyectados</span><span class="rv">${fmtS(steps.ingAnual)}</span></div>
    <div class="rs"><span class="rl">− 7 UIT (S/ ${steps.uit.toLocaleString('es-PE')} c/u)</span><span class="rv">−${fmtS(steps.uit7)}</span></div>
    <div class="rs highlight"><span class="rl">= Renta neta imponible</span><span class="rv">${fmtS(steps.rNeta)}</span></div>
    <div class="rs"><span class="rl">Tramo aplicable</span><span class="rv">${steps.tramo}</span></div>
    <div class="rs highlight"><span class="rl">Impuesto anual</span><span class="rv">${fmtS(steps.anual)}</span></div>
    <div class="rs"><span class="rl">÷ ${steps.div} = Mensual base (${mesNombre})</span><span class="rv">${fmtS(steps.mensual)}</span></div>
    <div class="rs highlight"><span class="rl">Proporcional (${fmt(diasSueldo)} días)</span><span class="rv">${fmtS(steps.proporcional)}</span></div>
  `;
}

function toggleRenta() {
  const body = document.getElementById('renta-body');
  const btn  = document.getElementById('renta-toggle-btn');
  body.classList.toggle('open');
  btn.classList.toggle('open');
}

function esc(s) {
  return String(s || '').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}
/** Normaliza string: mayúsculas + sin tildes. Usada para comparaciones de nombres. */
function norm(s) {
  return String(s || '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

// ── EXPORTAR / IMPORTAR PERFILES ────────────────────────────────────────────

/**
 * Descarga un JSON con todos los perfiles guardados en localStorage.
 */
function exportarPerfiles() {
  const perfiles = loadPerfiles();
  const current  = loadLS();
  const blob = new Blob([JSON.stringify({ perfiles, current, ts: new Date().toISOString() }, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'haberes_backup_' + new Date().toISOString().slice(0,10) + '.json';
  a.click();
  URL.revokeObjectURL(url);
  showToast('Backup descargado ✓');
}

/**
 * Importa un backup JSON generado por exportarPerfiles().
 * Fusiona los perfiles importados con los existentes (no borra los actuales).
 */
function importarPerfiles() {
  const inp = document.createElement('input');
  inp.type   = 'file';
  inp.accept = '.json,application/json';
  inp.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data     = JSON.parse(ev.target.result);
        const imported = data.perfiles || [];
        if (!Array.isArray(imported) || imported.length === 0) {
          showToast('El archivo no contiene perfiles válidos');
          return;
        }
        const existing = loadPerfiles();
        const merged   = [...existing];
        let added = 0;
        for (const p of imported) {
          const key = p.nombre + '|' + p.anio;
          if (!merged.find(x => x.nombre + '|' + x.anio === key)) {
            merged.push(p);
            added++;
          }
        }
        localStorage.setItem(LS_PERFILES, JSON.stringify(merged.slice(-20)));
        showToast(added + ' perfil(es) importado(s) ✓');
        showPerfilSelector();
      } catch (err) {
        showToast('Error al leer el archivo: ' + err.message);
      }
    };
    reader.readAsText(file);
  };
  inp.click();
}

// ── EXPORTAR PERFIL INDIVIDUAL ───────────────────────────────────────────────

/**
 * Descarga el JSON de un único perfil.
 * @param {Object} p  — entrada del array de perfiles
 */
function exportarPerfil(p) {
  const blob = new Blob([JSON.stringify({ perfiles: [p], ts: new Date().toISOString() }, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'perfil_' + (p.nombre || 'sin_nombre').replace(/\s+/g, '_') + '_' + p.anio + '.json';
  a.click();
  URL.revokeObjectURL(url);
  showToast('Perfil exportado ✓');
}

// ── TOP NAV ───────────────────────────────────────────────────────────────────

/**
 * Actualiza el estado visual del nav bar permanente.
 * @param {'perfiles'|'individual'} screen
 */
function updateTopNav(screen) {
  const nav = document.getElementById('top-nav');
  if (!nav) return;
  const tnNombre = document.getElementById('tn-nombre');
  const tnHome   = document.getElementById('tn-home');
  if (tnNombre) tnNombre.textContent = perfil.nombre ? '👤 ' + perfil.nombre : '';
  if (tnHome)   tnHome.classList.toggle('active', screen === 'perfiles');
}

// ── FINANCE TRACKER — CATEGORÍAS POR DEFECTO ─────────────────────────────────

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function getCatsDefault() {
  return {
    gastos: [
      { id:'g-alim',   emoji:'🍽️', nombre:'Alimentación',    color:'#e67e22', budget:0 },
      { id:'g-trans',  emoji:'🚌', nombre:'Transporte',      color:'#3498db', budget:0 },
      { id:'g-casa',   emoji:'🏠', nombre:'Vivienda',        color:'#9b59b6', budget:0 },
      { id:'g-serv',   emoji:'💡', nombre:'Servicios',       color:'#1abc9c', budget:0 },
      { id:'g-salud',  emoji:'💊', nombre:'Salud',           color:'#e74c3c', budget:0 },
      { id:'g-educ',   emoji:'📚', nombre:'Educación',       color:'#2980b9', budget:0 },
      { id:'g-ropa',   emoji:'👔', nombre:'Ropa y calzado',  color:'#e91e63', budget:0 },
      { id:'g-entret', emoji:'🎮', nombre:'Entretenimiento', color:'#ff5722', budget:0 },
      { id:'g-rest',   emoji:'☕', nombre:'Restaurantes',    color:'#795548', budget:0 },
      { id:'g-super',  emoji:'🛒', nombre:'Supermercado',    color:'#43a047', budget:0 },
      { id:'g-telco',  emoji:'📱', nombre:'Telefonía',       color:'#00bcd4', budget:0 },
      { id:'g-inter',  emoji:'🌐', nombre:'Internet / TV',   color:'#607d8b', budget:0 },
      { id:'g-subs',   emoji:'📺', nombre:'Suscripciones',   color:'#ab47bc', budget:0 },
      { id:'g-lavand', emoji:'👕', nombre:'Lavandería',      color:'#26c6da', budget:0 },
      { id:'g-aseo',   emoji:'🧴', nombre:'Aseo personal',   color:'#66bb6a', budget:0 },
      { id:'g-taxi',   emoji:'🚕', nombre:'Taxi / Uber',     color:'#ffa726', budget:0 },
      { id:'g-aero',   emoji:'✈️', nombre:'Pasajes / vuelos',color:'#42a5f5', budget:0 },
      { id:'g-hotel',  emoji:'🏨', nombre:'Alojamiento',     color:'#ec407a', budget:0 },
      { id:'g-hijos',  emoji:'👶', nombre:'Hijos / colegio', color:'#ef5350', budget:0 },
      { id:'g-mascot', emoji:'🐕', nombre:'Mascotas',        color:'#8d6e63', budget:0 },
      { id:'g-giftgo', emoji:'🎁', nombre:'Regalos',         color:'#f06292', budget:0 },
      { id:'g-deport', emoji:'⚽', nombre:'Deporte',         color:'#29b6f6', budget:0 },
      { id:'g-banca',  emoji:'🏦', nombre:'Banco / cuotas',  color:'#5c6bc0', budget:0 },
      { id:'g-seguro', emoji:'🛡️', nombre:'Seguros',         color:'#26a69a', budget:0 },
      { id:'g-cafe',   emoji:'☕', nombre:'Café / snacks',   color:'#a1887f', budget:0 },
      { id:'g-belleza',emoji:'💅', nombre:'Belleza',         color:'#f48fb1', budget:0 },
      { id:'g-muebles',emoji:'🛋️', nombre:'Muebles / deco',  color:'#bcaaa4', budget:0 },
      { id:'g-tecnol', emoji:'💻', nombre:'Tecnología',      color:'#78909c', budget:0 },
      { id:'g-ahorro', emoji:'🐷', nombre:'Ahorro',          color:'#ffca28', budget:0 },
      { id:'g-otros',  emoji:'📦', nombre:'Otros gastos',    color:'#90a4ae', budget:0 },
    ],
    ingresos: [
      { id:'i-sueldo', emoji:'💰', nombre:'Sueldo neto',       color:'#2ecc71', budget:0 },
      { id:'i-aloj',   emoji:'🏨', nombre:'Alojamiento',       color:'#3498db', budget:0 },
      { id:'i-alim',   emoji:'🍽️', nombre:'RC Alimentación',   color:'#e67e22', budget:0 },
      { id:'i-movil',  emoji:'🚗', nombre:'Movilidad',         color:'#1abc9c', budget:0 },
      { id:'i-cts',    emoji:'🏦', nombre:'CTS',               color:'#9b59b6', budget:0 },
      { id:'i-grati',  emoji:'🎁', nombre:'Gratificación',     color:'#e91e63', budget:0 },
      { id:'i-extra',  emoji:'⭐', nombre:'Horas extras',      color:'#f39c12', budget:0 },
      { id:'i-freelan',emoji:'💻', nombre:'Freelance',         color:'#1abc9c', budget:0 },
      { id:'i-alquil', emoji:'🏠', nombre:'Alquiler',          color:'#e74c3c', budget:0 },
      { id:'i-divid',  emoji:'📈', nombre:'Dividendos',        color:'#27ae60', budget:0 },
      { id:'i-transf', emoji:'🔄', nombre:'Transferencia',     color:'#2980b9', budget:0 },
      { id:'i-liquid', emoji:'💳', nombre:'Liquidación',       color:'#607d8b', budget:0 },
      { id:'i-afp',    emoji:'🔒', nombre:'AFP (retiro)',      color:'#78909c', budget:0 },
      { id:'i-otros',  emoji:'💵', nombre:'Otros ingresos',    color:'#95a5a6', budget:0 },
    ],
  };
}

// ── FINANCE TRACKER — AUTO-REGISTRO DE PLANILLA ──────────────────────────────

/**
 * Auto-registra los ingresos de planilla en el Flujo de Efectivo.
 * El sueldo neto de Individual ya incluye viáticos → lo desglosamos así:
 *   i-sueldo  = r.neto − r.alojamiento − r.alimentacion − r.movilidad
 *   i-aloj    = r.alojamiento   (no sujeto a descuentos)
 *   i-alim    = r.alimentacion  (Proviz, no sujeto a descuentos)
 *   i-movil   = r.movilidad     (no sujeto a descuentos)
 *   i-cts     = acumulado CTS   (solo Mayo=mes4 y Noviembre=mes10)
 *   i-grati   = acumulado Grati (solo Julio=mes6 y Diciembre=mes11)
 * Total = r.neto (los CTS/Grati son adicionales al neto mensual)
 */
function autoRegistrarIngresos(anio, mes, r) {
  if (!r) return;
  const y    = String(anio);
  const m    = String(mes + 1).padStart(2, '0');
  const dStr = y + '-' + m + '-01';

  const sueldoBase = r.neto - (r.alojamiento || 0) - (r.alimentacion || 0) - (r.movilidad || 0);

  const autos = [];

  if (sueldoBase > 0.01)
    autos.push({ catId:'i-sueldo', monto: sueldoBase,    desc: 'Sueldo neto' });
  if ((r.alojamiento || 0) > 0.01)
    autos.push({ catId:'i-aloj',   monto: r.alojamiento, desc: 'Alojamiento' });
  if ((r.alimentacion || 0) > 0.01)
    autos.push({ catId:'i-alim',   monto: r.alimentacion,desc: 'RC Alimentación (Proviz)' });
  if ((r.movilidad || 0) > 0.01)
    autos.push({ catId:'i-movil',  monto: r.movilidad,   desc: 'Movilidad mensual' });

  // CTS — solo en Mayo (mes=4) y Noviembre (mes=10) según ley peruana
  if (mes === 4 || mes === 10) {
    const cts = calcCTSAcumulado(anio, mes);
    if (cts > 0.01) autos.push({ catId:'i-cts', monto: cts,
      desc: 'CTS ' + (mes === 4 ? 'May (Nov–Abr)' : 'Nov (May–Oct)') });
  }

  // Gratificación — solo en Julio (mes=6) y Diciembre (mes=11) según ley peruana
  if (mes === 6 || mes === 11) {
    const grati = calcGratiAcumulado(anio, mes);
    if (grati > 0.01) autos.push({ catId:'i-grati', monto: grati,
      desc: 'Gratificación ' + (mes === 6 ? 'Jul (Fiestas Patrias)' : 'Dic (Navidad)') });
  }

  for (const a of autos) {
    const autoId = 'auto-' + anio + '-' + mes + '-' + a.catId;
    const idx    = transacciones.findIndex(t => t.autoId === autoId);
    const entry  = {
      id:     idx >= 0 ? transacciones[idx].id : genId(),
      tipo:   'ingreso',
      catId:  a.catId,
      monto:  parseFloat(a.monto.toFixed(2)),
      desc:   a.desc,
      fecha:  dStr,
      autoId: autoId,
    };
    if (idx >= 0) transacciones[idx] = entry;
    else          transacciones.push(entry);
  }
}

/**
 * CTS acumulada para el período que corresponde al mes de pago.
 * Mayo:       suma ctsMens de Nov(año-1)–Abr(año actual) [meses 10,11 + 0,1,2,3]
 * Noviembre:  suma ctsMens de May–Oct [meses 4,5,6,7,8,9]
 */
function calcCTSAcumulado(anio, mes) {
  let pares = [];
  if (mes === 4) {                                              // Mayo
    pares = [[anio-1,10],[anio-1,11],[anio,0],[anio,1],[anio,2],[anio,3]];
  } else if (mes === 10) {                                      // Noviembre
    pares = [[anio,4],[anio,5],[anio,6],[anio,7],[anio,8],[anio,9]];
  }
  return pares.reduce((s, [y, m]) => s + ((planillaData[y+'-'+m] || {}).ctsMens || 0), 0);
}

/**
 * Gratificación acumulada para el semestre correspondiente.
 * Julio:     suma gratiMes de Ene–Jun [0..5]
 * Diciembre: suma gratiMes de Jul–Dic [6..11]
 */
function calcGratiAcumulado(anio, mes) {
  const inicio = mes === 6 ? 0 : 6;
  const fin    = mes === 6 ? 5 : 11;
  let total = 0;
  for (let m = inicio; m <= fin; m++) {
    total += ((planillaData[anio+'-'+m] || {}).gratiMes || 0);
  }
  return total;
}

// ── FINANCE TRACKER — PERÍODO ─────────────────────────────────────────────────

function getFeRange() {
  if (feState.periodo === 'custom' && feState.customFrom && feState.customTo) {
    const [fy, fm, fd] = feState.customFrom.split('-').map(Number);
    const [ty, tm, td] = feState.customTo.split('-').map(Number);
    return { from: new Date(fy, fm-1, fd), to: new Date(ty, tm-1, td) };
  }
  const now   = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const off   = feState.offset;

  if (feState.periodo === 'dia') {
    const d = new Date(today);
    d.setDate(d.getDate() + off);
    return { from: d, to: d };
  }
  if (feState.periodo === 'semana') {
    const dow = today.getDay() === 0 ? 6 : today.getDay() - 1;
    const mon = new Date(today);
    mon.setDate(today.getDate() - dow + off * 7);
    const sun = new Date(mon);
    sun.setDate(mon.getDate() + 6);
    return { from: mon, to: sun };
  }
  if (feState.periodo === 'mes') {
    const m  = now.getMonth() + off;
    const d1 = new Date(now.getFullYear(), m, 1);
    const d2 = new Date(now.getFullYear(), m + 1, 0);
    return { from: d1, to: d2 };
  }
  // anio
  const y = now.getFullYear() + off;
  return { from: new Date(y, 0, 1), to: new Date(y, 11, 31) };
}

function renderFePeriodoLabel() {
  const { from, to } = getFeRange();
  const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                 'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  let label = '';
  if (feState.periodo === 'dia') {
    label = from.getDate() + ' de ' + MESES[from.getMonth()] + ' ' + from.getFullYear();
  } else if (feState.periodo === 'semana') {
    const mF = MESES[from.getMonth()].slice(0, 3);
    const mT = MESES[to.getMonth()].slice(0, 3);
    label = from.getDate() + ' ' + mF + ' – ' + to.getDate() + ' ' + mT + ' ' + to.getFullYear();
  } else if (feState.periodo === 'mes') {
    label = MESES[from.getMonth()] + ' ' + from.getFullYear();
  } else if (feState.periodo === 'custom') {
    const mF = MESES[from.getMonth()].slice(0, 3);
    const mT = MESES[to.getMonth()].slice(0, 3);
    label = from.getDate() + ' ' + mF + ' – ' + to.getDate() + ' ' + mT + ' ' + to.getFullYear();
  } else {
    label = String(from.getFullYear());
  }
  const el = document.getElementById('fe-per-label');
  if (el) el.textContent = label;
}

// skipCatFilter=true → solo filtra por período+tipo (para cat list y donut)
function filterTx(skipCatFilter) {
  const { from, to } = getFeRange();
  const fromT = from.getTime();
  const toT   = to.getTime() + 86399999;
  const tipoFiltro = feState.tipo === 'gastos' ? 'gasto'
                   : feState.tipo === 'ingresos' ? 'ingreso'
                   : null;

  return transacciones.filter(t => {
    if (tipoFiltro && t.tipo !== tipoFiltro) return false;
    const parts = t.fecha.split('-').map(Number);
    const dt    = new Date(parts[0], parts[1] - 1, parts[2]).getTime();
    if (dt < fromT || dt > toT) return false;
    if (!skipCatFilter && feState.catFilter && t.catId !== feState.catFilter) return false;
    return true;
  });
}

// ── FINANCE TRACKER — RENDER PRINCIPAL ──────────────────────────────────────

function renderFlujoTab() {
  const tabEl = document.getElementById('module-flujo') || document.getElementById('tab-flujo');
  if (!tabEl) return;

  // ── FAB visible solo en sección inicio ──
  const fab = document.getElementById('fe-fab');
  if (fab) fab.style.display = feState.section === 'inicio' ? '' : 'none';

  // ── Render según sección activa ──
  if (feState.section === 'inicio') {
    renderFePeriodoLabel();
    updateFeBalance();
    const allTxs = filterTx(true);   // todas las txs del período (sin filtro de cat)
    renderFeDonut(allTxs);
    renderFeCatList(allTxs);         // lista-acordeón unificada (categorías + detalle inline)
  } else if (feState.section === 'graficos') {
    renderSbGrafico();
  } else if (feState.section === 'categorias') {
    renderSbCatsList();
  } else if (feState.section === 'cuentas') {
    renderSbCuentas();
  }
}

function updateFeBalance() {
  const { from, to } = getFeRange();
  const fromT = from.getTime();
  const toT   = to.getTime() + 86399999;
  let totalGas = 0, totalIng = 0;

  for (const t of transacciones) {
    const parts = t.fecha.split('-').map(Number);
    const dt    = new Date(parts[0], parts[1] - 1, parts[2]).getTime();
    if (dt < fromT || dt > toT) continue;
    if (t.tipo === 'ingreso') totalIng += t.monto;
    else                      totalGas += t.monto;
  }

  const valEl = document.getElementById('fe-bal-val');
  const lblEl = document.getElementById('fe-bal-lbl') || document.querySelector('.fe-lbl');
  if (!valEl) return;

  if (feState.tipo === 'gastos') {
    valEl.textContent = fmtS(totalGas);
    valEl.style.color = '#e74c3c';
    if (lblEl) lblEl.textContent = 'Total gastos';
  } else if (feState.tipo === 'ingresos') {
    valEl.textContent = fmtS(totalIng);
    valEl.style.color = 'var(--green)';
    if (lblEl) lblEl.textContent = 'Total ingresos';
  } else {
    const bal = totalIng - totalGas;
    valEl.textContent = fmtS(Math.abs(bal));
    valEl.style.color = bal >= 0 ? 'var(--green)' : '#e74c3c';
    if (lblEl) lblEl.textContent = bal >= 0 ? 'Balance positivo' : 'Balance negativo';
  }
}

function setFeTipo(tipo) {
  if (tipo === 'todos') return; // removed
  feState.tipo = tipo;
  const btns = document.querySelectorAll('.fe-topbar .fe-tipo-btn');
  const vals = ['gastos', 'ingresos'];
  btns.forEach((b, i) => b.classList.toggle('fe-active', vals[i] === tipo));
  renderFlujoTab();
}

function setFePeriodo(periodo) {
  feState.periodo = periodo;
  feState.offset  = 0;
  const btns = document.querySelectorAll('.fe-per-btn');
  const vals = ['dia', 'semana', 'mes', 'anio', 'custom'];
  btns.forEach((b, i) => b.classList.toggle('fe-active', vals[i] === periodo));
  const rangeEl = document.getElementById('fe-custom-range');
  if (rangeEl) rangeEl.style.display = periodo === 'custom' ? '' : 'none';
  renderFlujoTab();
}

function navFePeriodo(dir) {
  feState.offset += dir;
  renderFlujoTab();
}

function setFeView(view) {
  if (view !== 'transacciones') feState.catFilter = null;
  feState.view = view;
  ['categorias', 'grafico', 'transacciones'].forEach(v => {
    const el = document.getElementById('fe-view-' + v);
    if (el) el.style.display = v === view ? '' : 'none';
  });
  const btns = document.querySelectorAll('.fe-nav-btn');
  const vals = ['categorias', 'grafico', 'transacciones'];
  btns.forEach((b, i) => b.classList.toggle('fe-active', vals[i] === view));
  renderFlujoTab();
}

function setFeGrafico(tipo) {
  feState.grafico = tipo;
  const btns = document.querySelectorAll('.fe-g-tab');
  const vals = ['general', 'gastos', 'ingresos'];
  btns.forEach((b, i) => b.classList.toggle('fe-active', vals[i] === tipo));
  renderFeBarChart();
}

// ── FINANCE TRACKER — DONUT CHART ────────────────────────────────────────────

function renderFeDonut(txs) {
  const svg     = document.getElementById('fe-donut-svg');
  const totalEl = document.getElementById('fe-donut-total');
  const lblEl   = document.getElementById('fe-donut-lbl');
  if (!svg) return;

  const totales = {};
  let grand = 0;
  for (const t of txs) {
    totales[t.catId] = (totales[t.catId] || 0) + t.monto;
    grand += t.monto;
  }

  svg.innerHTML = '';
  if (grand === 0) {
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', '100'); circle.setAttribute('cy', '100');
    circle.setAttribute('r', '70');   circle.setAttribute('fill', 'none');
    circle.setAttribute('stroke', 'var(--border)'); circle.setAttribute('stroke-width', '28');
    svg.appendChild(circle);
    if (totalEl) totalEl.textContent = '0.00';
    if (lblEl)   lblEl.textContent   = 'Sin datos';
    return;
  }

  if (totalEl) totalEl.textContent = fmt(grand);
  if (lblEl)   lblEl.textContent   =
    feState.tipo === 'gastos' ? 'Gastos' : feState.tipo === 'ingresos' ? 'Ingresos' : 'Total';

  const R       = 70;
  const circumf = 2 * Math.PI * R;
  let dashOffset = 0;
  let sliceIdx = 0;
  const allCats = [...categorias.gastos, ...categorias.ingresos];

  // Tooltip flotante (se crea una sola vez y se mueve con el mouse)
  let tip = document.getElementById('donut-tooltip');
  if (!tip) {
    tip = document.createElement('div');
    tip.id = 'donut-tooltip';
    tip.style.cssText = 'position:fixed;background:rgba(0,0,0,.78);color:#fff;padding:5px 10px;'
      + 'border-radius:7px;font-size:11px;font-family:var(--mono);pointer-events:none;'
      + 'z-index:9000;white-space:nowrap;display:none;';
    document.body.appendChild(tip);
  }

  for (const [catId, monto] of Object.entries(totales)) {
    const pct    = monto / grand;
    const pctStr = (pct * 100).toFixed(1) + '%';
    const dash   = pct * circumf;
    const cat    = allCats.find(c => c.id === catId) || { emoji:'📦', nombre: catId, color: '#90a4ae' };

    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', '100'); circle.setAttribute('cy', '100');
    circle.setAttribute('r', String(R)); circle.setAttribute('fill', 'none');
    circle.setAttribute('stroke', cat.color); circle.setAttribute('stroke-width', '28');
    circle.setAttribute('stroke-dasharray', dash + ' ' + (circumf - dash));
    circle.setAttribute('stroke-dashoffset', String(circumf - dashOffset));
    circle.style.transform = 'rotate(-90deg)';
    circle.style.transformOrigin = '100px 100px';
    circle.style.cursor = 'pointer';
    circle.setAttribute('class', 'fe-anim-slice');
    circle.style.animationDelay = (sliceIdx * 0.08) + 's';

    // ── Hover tooltip ──────────────────────────────────────────────────────
    circle.addEventListener('mouseenter', () => {
      tip.innerHTML =
        `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${cat.color};margin-right:5px;vertical-align:middle"></span>` +
        `${cat.emoji} ${esc(cat.nombre)} · <b>${pctStr}</b> · ${fmtS(monto)}`;
      tip.style.display = 'block';
    });
    circle.addEventListener('mousemove', (e) => {
      tip.style.left = (e.clientX + 14) + 'px';
      tip.style.top  = (e.clientY - 28) + 'px';
    });
    circle.addEventListener('mouseleave', () => {
      tip.style.display = 'none';
    });

    svg.appendChild(circle);
    dashOffset += dash;
    sliceIdx++;
  }
}

// ── FINANCE TRACKER — CAT LIST + ACORDEÓN INLINE ─────────────────────────────
// Muestra categorías con barra de progreso. Clic → detalle de movimientos
// se inserta INLINE empujando hacia abajo las demás categorías.
// Solo una categoría puede estar expandida a la vez.

function renderFeCatList(txs) {
  const el = document.getElementById('fe-cat-list');
  if (!el) return;
  el.innerHTML = '';

  if (txs.length === 0) {
    el.innerHTML = '<div style="padding:24px;text-align:center;color:var(--muted);font-size:13px">Sin transacciones en este período</div>';
    return;
  }

  // Agrupar por categoría manteniendo tipo y lista de transacciones
  const byCat = {};
  let grand = 0;
  for (const t of txs) {
    if (!byCat[t.catId]) byCat[t.catId] = { total: 0, txs: [], tipo: t.tipo };
    byCat[t.catId].total += t.monto;
    byCat[t.catId].txs.push(t);
    grand += t.monto;
  }

  const allCats = [...categorias.gastos, ...categorias.ingresos];
  const MESES   = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  const sorted  = Object.entries(byCat).sort(([,a],[,b]) => b.total - a.total);

  for (const [catId, data] of sorted) {
    const cat     = allCats.find(c => c.id === catId) || { emoji:'📦', nombre: catId, color:'#90a4ae' };
    const pct     = grand > 0 ? (data.total / grand * 100).toFixed(1) : '0.0';
    const isGasto = data.tipo === 'gasto';
    const isOpen  = feState.txAccordion === catId;
    const count   = data.txs.length;

    const wrap = document.createElement('div');
    wrap.className = 'fe-cat-acc' + (isOpen ? ' fe-cat-acc-open' : '');

    // ── Cabecera: emoji + nombre + chevron + barra + total + pct ──────────
    const hdr = document.createElement('div');
    hdr.className = 'fe-cat-item fe-cat-acc-hdr';
    hdr.innerHTML =
      `<div class="fe-cat-icon" style="background:${cat.color}22;color:${cat.color}">${cat.emoji}</div>` +
      `<div class="fe-cat-info">` +
        `<div class="fe-cat-name-row">` +
          `<span class="fe-cat-name">${esc(cat.nombre)}</span>` +
          `<span class="fe-acc-chevron">${isOpen ? '▲' : '▼'}</span>` +
        `</div>` +
        `<div class="fe-cat-bar-wrap">` +
          `<div class="fe-cat-bar" style="width:${pct}%;background:${cat.color}"></div>` +
        `</div>` +
      `</div>` +
      `<div class="fe-cat-right">` +
        `<div class="fe-cat-amt">${fmtS(data.total)}</div>` +
        `<div class="fe-cat-pct">${isOpen ? count + ' mov.' : pct + '%'}</div>` +
      `</div>`;

    hdr.onclick = () => {
      feState.txAccordion = (feState.txAccordion === catId) ? null : catId;
      renderFlujoTab();
    };
    wrap.appendChild(hdr);

    // ── Detalle inline (solo si está abierto) ─────────────────────────────
    if (isOpen) {
      const body = document.createElement('div');
      body.className = 'fe-cat-acc-body';

      const sortedTxs = [...data.txs].sort((a, b) => b.fecha.localeCompare(a.fecha));
      for (const t of sortedTxs) {
        const autoTag = t.autoId && !t.autoId.startsWith('demo-') ? ' <span class="fe-auto-tag">auto</span>'
                      : t.boletaId ? ' <span class="fe-auto-tag">boleta</span>' : '';
        const parts   = t.fecha.split('-').map(Number);
        const dateStr = parts[2] + ' ' + MESES[parts[1] - 1];

        const row = document.createElement('div');
        row.className = 'fe-acc-row fe-acc-row-edit';
        row.onclick = (e) => { e.stopPropagation(); editTx(t.id); };
        row.innerHTML =
          `<div class="fe-acc-row-date">${dateStr}</div>` +
          `<div class="fe-acc-row-desc">${esc(t.desc || '—')}${autoTag}</div>` +
          `<div class="fe-acc-row-monto ${isGasto ? 'fe-neg' : 'fe-pos'}">${fmtS(t.monto)}</div>`;
        body.appendChild(row);
      }
      wrap.appendChild(body);
    }

    el.appendChild(wrap);
  }
}

// ── FINANCE TRACKER — BAR CHART ──────────────────────────────────────────────

function renderFeBarChart() {
  const svg = document.getElementById('fe-barchart-svg');
  const leg = document.getElementById('fe-legend');
  if (!svg) return;
  svg.innerHTML = '';
  if (leg) leg.innerHTML = '';

  const now  = new Date();
  const tipo = feState.grafico;
  const W = 400, H = 200, padL = 42, padR = 10, padT = 10, padB = 30;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;

  const labels = [], gasArr = [], ingArr = [];

  for (let i = 5; i >= 0; i--) {
    let from, to, label;
    const per = feState.periodo;

    if (per === 'dia') {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      d.setDate(d.getDate() - i);
      from = to = d;
      label = ['Do','Lu','Ma','Mi','Ju','Vi','Sa'][d.getDay()];
    } else if (per === 'semana') {
      const dow = now.getDay() === 0 ? 6 : now.getDay() - 1;
      const mon = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      mon.setDate(now.getDate() - dow - i * 7);
      const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
      from = mon; to = sun;
      const MESES_C = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
      label = mon.getDate() + '/' + MESES_C[mon.getMonth()];
    } else if (per === 'mes') {
      const m  = now.getMonth() - i;
      from = new Date(now.getFullYear(), m, 1);
      to   = new Date(now.getFullYear(), m + 1, 0);
      label = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'][from.getMonth()];
    } else {
      const y = now.getFullYear() - i;
      from = new Date(y, 0, 1); to = new Date(y, 11, 31);
      label = String(y);
    }

    const fromT = from.getTime();
    const toT   = to.getTime() + 86399999;
    let g = 0, ing = 0;
    for (const t of transacciones) {
      const parts = t.fecha.split('-').map(Number);
      const dt    = new Date(parts[0], parts[1] - 1, parts[2]).getTime();
      if (dt < fromT || dt > toT) continue;
      if (t.tipo === 'gasto')   g   += t.monto;
      if (t.tipo === 'ingreso') ing += t.monto;
    }
    labels.push(label); gasArr.push(g); ingArr.push(ing);
  }

  let maxVal = 0;
  for (let i = 0; i < 6; i++) {
    if (tipo === 'general')  maxVal = Math.max(maxVal, gasArr[i], ingArr[i]);
    else if (tipo === 'gastos')   maxVal = Math.max(maxVal, gasArr[i]);
    else                          maxVal = Math.max(maxVal, ingArr[i]);
  }
  if (maxVal === 0) maxVal = 1;

  const GROUP_W = chartW / 6;
  const BAR_W   = tipo === 'general' ? GROUP_W * 0.35 : GROUP_W * 0.55;

  // Líneas de referencia + etiquetas Y
  for (let l = 0; l <= 4; l++) {
    const y = padT + chartH - (l / 4) * chartH;
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', padL); line.setAttribute('y1', y);
    line.setAttribute('x2', W - padR); line.setAttribute('y2', y);
    line.setAttribute('stroke', 'var(--border)'); line.setAttribute('stroke-width', '0.5');
    svg.appendChild(line);
    if (l > 0) {
      const val = maxVal * l / 4;
      const txt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      txt.setAttribute('x', padL - 3); txt.setAttribute('y', y + 3);
      txt.setAttribute('text-anchor', 'end'); txt.setAttribute('font-size', '7');
      txt.setAttribute('fill', 'var(--muted)');
      txt.textContent = val >= 1000 ? (val / 1000).toFixed(1) + 'k' : val.toFixed(0);
      svg.appendChild(txt);
    }
  }

  for (let i = 0; i < 6; i++) {
    const cx = padL + i * GROUP_W + GROUP_W / 2;

    if (tipo === 'general') {
      const barG = (gasArr[i] / maxVal) * chartH;
      const barI = (ingArr[i] / maxVal) * chartH;
      [[gasArr[i], '#e74c3c', -BAR_W - 1], [ingArr[i], '#2ecc71', 1]].forEach(([val, col, xOff]) => {
        const bh = (val / maxVal) * chartH;
        const r  = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        r.setAttribute('x', cx + xOff); r.setAttribute('y', padT + chartH - bh);
        r.setAttribute('width', BAR_W); r.setAttribute('height', Math.max(bh, 0.5));
        r.setAttribute('fill', col); r.setAttribute('rx', '2');
        svg.appendChild(r);
      });
    } else {
      const vals  = tipo === 'gastos' ? gasArr : ingArr;
      const color = tipo === 'gastos' ? '#e74c3c' : '#2ecc71';
      const bh    = (vals[i] / maxVal) * chartH;
      const r     = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      r.setAttribute('x', cx - BAR_W / 2); r.setAttribute('y', padT + chartH - bh);
      r.setAttribute('width', BAR_W); r.setAttribute('height', Math.max(bh, 0.5));
      r.setAttribute('fill', color); r.setAttribute('rx', '2');
      svg.appendChild(r);
    }

    const lbl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    lbl.setAttribute('x', cx); lbl.setAttribute('y', H - 4);
    lbl.setAttribute('text-anchor', 'middle'); lbl.setAttribute('font-size', '7');
    lbl.setAttribute('fill', 'var(--muted)');
    lbl.textContent = labels[i];
    svg.appendChild(lbl);
  }

  if (leg) {
    if (tipo === 'general') {
      leg.innerHTML = `
        <span class="fe-leg-dot" style="background:#e74c3c"></span>Gastos
        &nbsp;<span class="fe-leg-dot" style="background:#2ecc71"></span>Ingresos
      `;
    } else {
      const col = tipo === 'gastos' ? '#e74c3c' : '#2ecc71';
      const lbl = tipo === 'gastos' ? 'Gastos' : 'Ingresos';
      leg.innerHTML = `<span class="fe-leg-dot" style="background:${col}"></span>${lbl}`;
    }
  }
}

// ── FINANCE TRACKER — TX LIST ────────────────────────────────────────────────

// ── LISTA TRANSACCIONES — ACORDEÓN POR CATEGORÍA ─────────────────────────────
// Vista colapsada: categoría + total  |  expandida: detalle de cada movimiento
function renderFeTxList(txs) {
  const el = document.getElementById('fe-tx-list');
  if (!el) return;
  el.innerHTML = '';

  if (txs.length === 0) {
    el.innerHTML = '<div style="padding:24px;text-align:center;color:var(--muted);font-size:13px">Sin transacciones en este período</div>';
    return;
  }

  const allCats = [...categorias.gastos, ...categorias.ingresos];
  const MESES   = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

  // ── Agrupar por categoría ──────────────────────────────────────────────────
  const byCat = {};
  for (const t of txs) {
    if (!byCat[t.catId]) byCat[t.catId] = { txs: [], total: 0, tipo: t.tipo };
    byCat[t.catId].txs.push(t);
    byCat[t.catId].total += t.monto;
  }

  // Ordenar: mayor total primero
  const catEntries = Object.entries(byCat)
    .sort(([, a], [, b]) => b.total - a.total);

  // ── Render acordeón ────────────────────────────────────────────────────────
  for (const [catId, data] of catEntries) {
    const cat     = allCats.find(c => c.id === catId) || { emoji:'📦', nombre: catId, color:'#90a4ae' };
    const isGasto = data.tipo === 'gasto';
    const isOpen  = feState.txAccordion === catId;
    const count   = data.txs.length;

    const wrap = document.createElement('div');
    wrap.className = 'fe-acc-wrap' + (isOpen ? ' fe-acc-open' : '');

    // ── Cabecera clicable ──────────────────────────────────────────────────
    const hdr = document.createElement('div');
    hdr.className = 'fe-acc-hdr';
    hdr.innerHTML =
      `<div class="fe-cat-icon" style="background:${cat.color}22;color:${cat.color}">${cat.emoji}</div>` +
      `<div class="fe-acc-info">` +
        `<div class="fe-acc-name">${esc(cat.nombre)}</div>` +
        `<div class="fe-acc-count">${count} movimiento${count !== 1 ? 's' : ''}</div>` +
      `</div>` +
      `<div class="fe-acc-total ${isGasto ? 'fe-neg' : 'fe-pos'}">${isGasto ? '−' : '+'}${fmtS(data.total)}</div>` +
      `<div class="fe-acc-chevron">${isOpen ? '▲' : '▼'}</div>`;

    hdr.onclick = () => {
      feState.txAccordion = (feState.txAccordion === catId) ? null : catId;
      renderFlujoTab();
    };
    wrap.appendChild(hdr);

    // ── Detalle expandido ──────────────────────────────────────────────────
    if (isOpen) {
      const body = document.createElement('div');
      body.className = 'fe-acc-body';

      const sorted = [...data.txs].sort((a, b) => b.fecha.localeCompare(a.fecha));
      for (const t of sorted) {
        const isProtected = (t.autoId && !t.autoId.startsWith('demo-')) || !!t.boletaId;
        const autoTag     = t.autoId && !t.autoId.startsWith('demo-') ? '<span class="fe-auto-tag">auto</span>'
                          : t.boletaId ? '<span class="fe-auto-tag">boleta</span>' : '';
        const parts    = t.fecha.split('-').map(Number);
        const dateStr  = parts[2] + ' ' + MESES[parts[1] - 1];

        const row = document.createElement('div');
        row.className = 'fe-acc-row' + (isProtected ? '' : ' fe-acc-row-edit');
        if (!isProtected) row.onclick = (e) => { e.stopPropagation(); editTx(t.id); };
        row.innerHTML =
          `<div class="fe-acc-row-date">${dateStr}</div>` +
          `<div class="fe-acc-row-desc">${esc(t.desc || '—')} ${autoTag}</div>` +
          `<div class="fe-acc-row-monto ${isGasto ? 'fe-neg' : 'fe-pos'}">${isGasto ? '−' : '+'}${fmtS(t.monto)}</div>`;
        body.appendChild(row);
      }
      wrap.appendChild(body);
    }

    el.appendChild(wrap);
  }
}

// ── FINANCE TRACKER — MODAL TRANSACCIÓN ─────────────────────────────────────

function openAddTx(editId) {
  feModalTx.open   = true;
  feModalTx.editId = editId || null;

  if (editId) {
    const t = transacciones.find(x => x.id === editId);
    if (!t) return;
    feModalTx.tipo        = t.tipo;
    feModalTx.catId       = t.catId;
    feModalTx.fecha       = 'custom';
    feModalTx.customFecha = t.fecha;
    document.getElementById('fe-tx-modal-title').textContent = 'Editar transacción';
    document.getElementById('fe-tx-monto').value             = t.monto;
    document.getElementById('fe-tx-desc').value              = t.desc || '';
    document.getElementById('fe-btn-del-tx').style.display   = '';
  } else {
    feModalTx.tipo        = 'gasto';
    feModalTx.catId       = null;
    feModalTx.fecha       = 'hoy';
    feModalTx.customFecha = null;
    document.getElementById('fe-tx-modal-title').textContent = 'Nueva transacción';
    document.getElementById('fe-tx-monto').value             = '';
    document.getElementById('fe-tx-desc').value              = '';
    document.getElementById('fe-btn-del-tx').style.display   = 'none';
  }

  setModalTipo(feModalTx.tipo);
  setTxFecha(feModalTx.fecha);
  renderTxCatsGrid(feModalTx.tipo);
  document.getElementById('fe-overlay-tx').style.display = 'flex';
  // Hide FAB while modal is open
  const fab = document.getElementById('fe-fab');
  if (fab) fab.style.display = 'none';
  // Lock body scroll (prevents background scroll-through on mobile)
  document.body.style.overflow = 'hidden';
}

function editTx(id) { openAddTx(id); }

function closeAddTx() {
  feModalTx.open = false;
  document.getElementById('fe-overlay-tx').style.display = 'none';
  // Restore FAB visibility (only on Inicio section)
  const fab = document.getElementById('fe-fab');
  if (fab) fab.style.display = (feState.section === 'inicio') ? '' : 'none';
  // Restore body scroll
  document.body.style.overflow = '';
}

function setModalTipo(tipo) {
  feModalTx.tipo = tipo;
  document.getElementById('fe-tx-tipo-gasto').classList.toggle('fe-active',   tipo === 'gasto');
  document.getElementById('fe-tx-tipo-ingreso').classList.toggle('fe-active', tipo === 'ingreso');
  const boletaBar = document.getElementById('fe-boleta-bar');
  if (boletaBar) boletaBar.style.display = (tipo === 'ingreso' && !feModalTx.editId) ? '' : 'none';
  renderTxCatsGrid(tipo);
}

function generarDesdeBoleta() {
  // Determinar mes activo del tracker
  const now    = new Date();
  const offset = feState.offset || 0;
  let anio, mes;
  if (feState.periodo === 'mes') {
    const d = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    anio = d.getFullYear(); mes = d.getMonth();
  } else {
    anio = now.getFullYear(); mes = now.getMonth();
  }

  const lr = window._lastResult;
  const pd = planillaData[anio + '-' + mes];

  // Necesitamos al menos datos de planilla o último resultado
  if (!lr && !pd) {
    showToast('Calcula la planilla en Individual primero');
    return;
  }

  const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const mesNombre = MESES[mes] + ' ' + anio;

  // Usar _lastResult si es del mes activo, si no usar planillaData
  let netBase, netAlim, netAloj, netMovil;
  if (lr && calState.anio === anio && calState.mes === mes) {
    netBase  = lr.neto - (lr.alojamiento || 0) - (lr.alimentacion || 0) - (lr.movilidad || 0);
    netAlim  = lr.alimentacion || 0;
    netAloj  = lr.alojamiento  || 0;
    netMovil = lr.movilidad    || 0;
  } else if (pd) {
    // Estimación desde planillaData
    netAlim  = pd.alimentacion || 0;
    netAloj  = 0; // no stored in planillaData
    netMovil = params.planilla.movilidadMensual || 0;
    netBase  = (pd.sueldo || 0) - netMovil - netAlim; // rough
    if (netBase < 0) netBase = 0;
  } else {
    showToast('Sin datos de planilla para ' + mesNombre);
    return;
  }

  // Verificar si ya existe sueldo neto para este mes (no duplicar)
  const mesPrefix = anio + '-' + String(mes + 1).padStart(2,'0');
  const yaExisteSueldo = transacciones.some(t =>
    t.catId === 'i-sueldo' && t.fecha.startsWith(mesPrefix)
  );
  if (yaExisteSueldo) {
    showToast('⚠️ Ya existe un Sueldo Neto para ' + mesNombre);
    if (!confirm('Ya registraste Sueldo Neto para ' + mesNombre + '.\n¿Deseas reemplazarlo?')) return;
    // Eliminar el existente
    transacciones = transacciones.filter(t => !(t.catId === 'i-sueldo' && t.fecha.startsWith(mesPrefix)));
  } else {
    if (!confirm('¿Registrar ingresos de boleta para ' + mesNombre + '?')) return;
  }

  const dStr = anio + '-' + String(mes + 1).padStart(2,'0') + '-01';
  const toAdd = [];
  if (netBase  > 0.01) toAdd.push({ catId:'i-sueldo', monto: netBase,  desc: 'Sueldo neto · ' + mesNombre });
  if (netAlim  > 0.01) toAdd.push({ catId:'i-alim',   monto: netAlim,  desc: 'RC Alimentación · ' + mesNombre });
  if (netAloj  > 0.01) toAdd.push({ catId:'i-aloj',   monto: netAloj,  desc: 'Alojamiento · ' + mesNombre });
  if (netMovil > 0.01) toAdd.push({ catId:'i-movil',  monto: netMovil, desc: 'Movilidad · ' + mesNombre });

  for (const e of toAdd) {
    const tx = { id: genId(), tipo:'ingreso', catId: e.catId,
      monto: parseFloat(e.monto.toFixed(2)), desc: e.desc, fecha: dStr };
    // Sueldo neto se marca como protegido (no editable, no duplicable)
    if (e.catId === 'i-sueldo') tx.boletaId = mesPrefix;
    transacciones.push(tx);
  }

  saveAll();
  closeAddTx();
  renderFlujoTab();
  showToast(toAdd.length + ' ingresos de boleta registrados ✓');
}

function setTxFecha(mode) {
  feModalTx.fecha = mode;
  ['hoy', 'ayer', 'custom'].forEach(m => {
    const btn = document.getElementById('fe-fecha-' + m);
    if (btn) btn.classList.toggle('fe-active', m === mode);
  });
  const inp = document.getElementById('fe-fecha-inp');
  if (!inp) return;
  if (mode === 'custom') {
    inp.style.display = '';
    const today = new Date();
    inp.value = feModalTx.customFecha ||
      (today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0'));
  } else {
    inp.style.display = 'none';
  }
}

function txFechaManual() {
  feModalTx.customFecha = document.getElementById('fe-fecha-inp').value;
}

function renderTxCatsGrid(tipo) {
  const grid = document.getElementById('fe-cats-grid');
  if (!grid) return;
  grid.innerHTML = '';
  const cats = tipo === 'ingreso' ? categorias.ingresos : categorias.gastos;
  for (const cat of cats) {
    const btn = document.createElement('button');
    btn.className = 'fe-cat-btn' + (feModalTx.catId === cat.id ? ' fe-selected' : '');
    btn.style.borderColor = cat.color;
    btn.innerHTML = `<span class="fe-cat-btn-emoji">${cat.emoji}</span><span style="font-size:9px;line-height:1.2">${esc(cat.nombre)}</span>`;
    btn.onclick = () => {
      feModalTx.catId = cat.id;
      grid.querySelectorAll('.fe-cat-btn').forEach(b => b.classList.remove('fe-selected'));
      btn.classList.add('fe-selected');
    };
    grid.appendChild(btn);
  }
}

function saveTx() {
  const monto = parseFloat(document.getElementById('fe-tx-monto').value);
  if (!monto || monto <= 0) { showToast('Ingresa un monto válido'); return; }
  if (!feModalTx.catId)     { showToast('Selecciona una categoría'); return; }

  const today = new Date();
  let fechaStr;
  if (feModalTx.fecha === 'hoy') {
    fechaStr = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
  } else if (feModalTx.fecha === 'ayer') {
    const ayer = new Date(today); ayer.setDate(today.getDate() - 1);
    fechaStr = ayer.getFullYear() + '-' + String(ayer.getMonth() + 1).padStart(2, '0') + '-' + String(ayer.getDate()).padStart(2, '0');
  } else {
    fechaStr = feModalTx.customFecha || document.getElementById('fe-fecha-inp').value;
  }
  if (!fechaStr) { showToast('Selecciona una fecha'); return; }

  const desc = document.getElementById('fe-tx-desc').value.trim();
  const id   = feModalTx.editId || genId();

  const entry = {
    id, tipo: feModalTx.tipo, catId: feModalTx.catId,
    monto: parseFloat(monto.toFixed(2)), desc, fecha: fechaStr,
  };

  if (feModalTx.editId) {
    const idx = transacciones.findIndex(t => t.id === feModalTx.editId);
    if (idx >= 0) transacciones[idx] = entry;
  } else {
    transacciones.push(entry);
  }

  saveAll();
  closeAddTx();
  renderFlujoTab();
  showToast('Transacción guardada ✓');
  _playTxSound(entry.tipo);
}

function deleteTx() {
  if (!feModalTx.editId) return;
  if (!confirm('¿Eliminar esta transacción?')) return;
  transacciones = transacciones.filter(t => t.id !== feModalTx.editId);
  saveAll();
  closeAddTx();
  renderFlujoTab();
  showToast('Transacción eliminada ✓');
}

// ── FINANCE TRACKER — MODAL CATEGORÍAS ──────────────────────────────────────

function openCatModal() {
  feCatModal.tipo = 'gasto';
  setCatModalTipo('gasto');
  document.getElementById('fe-overlay-cats').style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function closeCatModal() {
  document.getElementById('fe-overlay-cats').style.display = 'none';
  document.body.style.overflow = '';
}

function setCatModalTipo(tipo) {
  feCatModal.tipo = tipo;
  document.getElementById('fe-cm-gasto').classList.toggle('fe-active',   tipo === 'gasto');
  document.getElementById('fe-cm-ingreso').classList.toggle('fe-active', tipo === 'ingreso');
  renderCatsList();
}

function renderCatsList() {
  const el = document.getElementById('cats-list');
  if (!el) return;
  el.innerHTML = '';
  const cats = feCatModal.tipo === 'gasto' ? categorias.gastos : categorias.ingresos;
  for (const cat of cats) {
    const item = document.createElement('div');
    item.className = 'cat-list-item';
    item.innerHTML = `
      <div class="cat-list-icon" style="background:${cat.color}22;color:${cat.color}">${cat.emoji}</div>
      <div class="cat-list-info">
        <div class="cat-list-name">${esc(cat.nombre)}</div>
        ${cat.budget > 0 ? `<div class="cat-list-budget">Límite: ${fmtS(cat.budget)}</div>` : ''}
      </div>
      <button class="cat-list-edit btn btn-ghost btn-sm" onclick="openEditCat('${cat.id}')">✎</button>
    `;
    el.appendChild(item);
  }
}

// ── FINANCE TRACKER — MODAL EDITAR CATEGORÍA ────────────────────────────────

const CAT_EMOJIS = [
  // Alimentación y bebidas
  '🍽️','☕','🍕','🍺','🥗','🍜','🥩','🍱','🧋','🥪','🍔','🌮','🍦','🎂','🥐',
  // Transporte y movilidad
  '🚌','🚕','✈️','🚂','🚗','🛵','🚲','⛽','🅿️','🚢',
  // Hogar y servicios
  '🏠','💡','🔧','🛋️','🏡','🪴','🧹','🔑','🏗️','📦',
  // Salud y bienestar
  '💊','🏥','🩺','🧘','💪','🦷','👓','🩹','🧬','🛁',
  // Educación y trabajo
  '📚','💻','🎓','📝','🖥️','📊','✏️','🔬','📐','🎒',
  // Ropa y estilo
  '👔','👟','👗','🧥','🎩','💍','💄','🧢','👜','🕶️',
  // Entretenimiento
  '🎮','🎵','🎬','🎨','🎭','📸','🎪','🎯','🎲','🎤',
  // Compras
  '🛒','🛍️','💳','🏬','🏷️','💎','🧸','📱','⌚','🎁',
  // Mascotas y familia
  '🐕','🐈','👶','👨‍👩‍👧','🌸','🌺','🌳','🌊','🏖️','⛺',
  // Finanzas
  '💰','🏦','📈','💵','🐷','🔄','⭐','🛡️','📉','🏧',
  // Varios
  '🎉','🔔','📦','🌍','⚽','🏋️','💅','🍀','🌙','☀️',
];
const CAT_COLORS = [
  '#e74c3c','#e67e22','#f39c12','#f1c40f','#2ecc71','#1abc9c',
  '#3498db','#2980b9','#9b59b6','#8e44ad','#e91e63','#f06292',
  '#ec407a','#ef5350','#ff5722','#795548','#607d8b','#78909c',
  '#26c6da','#00bcd4','#43a047','#66bb6a','#42a5f5','#ab47bc',
  '#ffa726','#ffca28','#26a69a','#90a4ae',
];

function openEditCat(id) {
  feEditCat.id   = id;
  feEditCat.tipo = feCatModal.tipo;

  if (id) {
    const cats = feCatModal.tipo === 'gasto' ? categorias.gastos : categorias.ingresos;
    const cat  = cats.find(c => c.id === id);
    if (!cat) return;
    document.getElementById('fe-ec-nombre').value = cat.nombre;
    document.getElementById('fe-ec-budget').value = cat.budget || '';
    feEditCat.emoji = cat.emoji;
    feEditCat.color = cat.color;
    document.getElementById('fe-editcat-title').textContent = 'Editar categoría';
    document.getElementById('fe-btn-del-cat').style.display = '';
  } else {
    document.getElementById('fe-ec-nombre').value = '';
    document.getElementById('fe-ec-budget').value = '';
    feEditCat.emoji = '📦';
    feEditCat.color = '#90a4ae';
    document.getElementById('fe-editcat-title').textContent = 'Nueva categoría';
    document.getElementById('fe-btn-del-cat').style.display = 'none';
  }
  document.getElementById('fe-ec-tipo').value = feCatModal.tipo;
  document.getElementById('fe-ec-id').value   = id || '';

  renderCatEmojiGrid();
  renderCatColorGrid();
  document.getElementById('fe-overlay-editcat').style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function closeEditCat() {
  document.getElementById('fe-overlay-editcat').style.display = 'none';
  document.body.style.overflow = '';
}

function renderCatEmojiGrid() {
  const grid = document.getElementById('cat-emoji-grid');
  if (!grid) return;
  grid.innerHTML = '';
  for (const e of CAT_EMOJIS) {
    const btn = document.createElement('button');
    btn.className = 'cat-emoji-opt' + (feEditCat.emoji === e ? ' fe-selected' : '');
    btn.textContent = e;
    btn.onclick = () => {
      feEditCat.emoji = e;
      grid.querySelectorAll('.cat-emoji-opt').forEach(b => b.classList.remove('fe-selected'));
      btn.classList.add('fe-selected');
    };
    grid.appendChild(btn);
  }
}

function renderCatColorGrid() {
  const grid = document.getElementById('cat-color-grid');
  if (!grid) return;
  grid.innerHTML = '';
  for (const c of CAT_COLORS) {
    const btn = document.createElement('button');
    btn.className = 'cat-color-opt' + (feEditCat.color === c ? ' fe-selected' : '');
    btn.style.background = c;
    btn.onclick = () => {
      feEditCat.color = c;
      grid.querySelectorAll('.cat-color-opt').forEach(b => b.classList.remove('fe-selected'));
      btn.classList.add('fe-selected');
    };
    grid.appendChild(btn);
  }
}

function saveCatEdit() {
  const nombre = document.getElementById('fe-ec-nombre').value.trim();
  if (!nombre) { showToast('Ingresa un nombre'); return; }
  const budget = parseFloat(document.getElementById('fe-ec-budget').value) || 0;
  const tipo   = document.getElementById('fe-ec-tipo').value;
  const id     = document.getElementById('fe-ec-id').value;
  const cats   = tipo === 'gasto' ? categorias.gastos : categorias.ingresos;

  // Validar nombre duplicado
  const nombreNorm = norm(nombre);
  const duplicate  = cats.find(c => norm(c.nombre) === nombreNorm && c.id !== id);
  if (duplicate) { showToast('Ya existe una categoría con ese nombre'); return; }

  if (id) {
    // Advertir si la categoría ya tiene transacciones
    const usos = transacciones.filter(t => t.catId === id).length;
    if (usos > 0) {
      if (!confirm(`Esta categoría se usa en ${usos} transacción(es). ¿Guardar cambios? Se actualizará en todas ellas.`)) return;
    }
    const idx = cats.findIndex(c => c.id === id);
    if (idx >= 0) cats[idx] = { ...cats[idx], nombre, emoji: feEditCat.emoji, color: feEditCat.color, budget };
  } else {
    cats.push({ id: genId(), nombre, emoji: feEditCat.emoji, color: feEditCat.color, budget });
  }

  saveAll();
  closeEditCat();
  renderCatsList();
  renderSbCatsList();
  renderFlujoTab();
  showToast('Categoría guardada ✓');
}

function deleteCat() {
  const id   = document.getElementById('fe-ec-id').value;
  const tipo = document.getElementById('fe-ec-tipo').value;
  if (!id) return;

  const usadas = transacciones.filter(t => t.catId === id);
  let msg = '¿Eliminar esta categoría?';
  if (usadas.length > 0) {
    msg = `Esta categoría se usa en ${usadas.length} transacción(es).\n¿Eliminar? Las transacciones se moverán a "Otros".`;
  }
  if (!confirm(msg)) return;

  // Reasignar a "Otros" si hay transacciones
  if (usadas.length > 0) {
    const otrosId = _getOrCreateOtros(tipo);
    for (const t of usadas) t.catId = otrosId;
  }

  if (tipo === 'gasto') categorias.gastos   = categorias.gastos.filter(c => c.id !== id);
  else                  categorias.ingresos = categorias.ingresos.filter(c => c.id !== id);

  saveAll();
  closeEditCat();
  renderCatsList();
  renderSbCatsList();
  renderFlujoTab();
  showToast('Categoría eliminada ✓');
}

// También para eliminar directamente desde el thumbnail (sin abrir modal)
function deleteCatById(id) {
  const tipo = feCatModal.tipo;
  const cats = tipo === 'gasto' ? categorias.gastos : categorias.ingresos;
  const cat  = cats.find(c => c.id === id);
  if (!cat) return;

  const usadas = transacciones.filter(t => t.catId === id);
  let msg = `¿Eliminar la categoría "${cat.nombre}"?`;
  if (usadas.length > 0) {
    msg = `La categoría "${cat.nombre}" se usa en ${usadas.length} transacción(es).\n¿Eliminar? Las transacciones se moverán a "Otros".`;
  }
  if (!confirm(msg)) return;

  if (usadas.length > 0) {
    const otrosId = _getOrCreateOtros(tipo);
    for (const t of usadas) t.catId = otrosId;
  }

  if (tipo === 'gasto') categorias.gastos   = categorias.gastos.filter(c => c.id !== id);
  else                  categorias.ingresos = categorias.ingresos.filter(c => c.id !== id);

  saveAll();
  renderCatsList();
  renderSbCatsList();
  renderFlujoTab();
  showToast('Categoría eliminada ✓');
}

function _getOrCreateOtros(tipo) {
  const cats    = tipo === 'gasto' ? categorias.gastos : categorias.ingresos;
  const otrosId = tipo === 'gasto' ? 'g-otros' : 'i-otros';
  let otros = cats.find(c => c.id === otrosId);
  if (!otros) {
    otros = { id: otrosId, emoji: '📦', nombre: 'Otros', color: '#90a4ae', budget: 0 };
    cats.push(otros);
  }
  return otrosId;
}

// ── FINANCE TRACKER — OVERLAY CLICK ─────────────────────────────────────────

function feOverlayClick(event, modal) {
  if (event.target !== event.currentTarget) return;
  if (modal === 'tx')      closeAddTx();
  if (modal === 'cats')    closeCatModal();
  if (modal === 'editcat') closeEditCat();
  if (modal === 'period')  closePeriodPicker();
}

// ── FINANCE TRACKER — EXPORT CSV ────────────────────────────────────────────

function exportarFlujoCSV() {
  let csv = 'Fecha,Tipo,Categoría,Descripción,Monto\n';
  const allCats = [...categorias.gastos, ...categorias.ingresos];
  const sorted  = [...transacciones].sort((a, b) => a.fecha.localeCompare(b.fecha));
  for (const t of sorted) {
    const cat  = allCats.find(c => c.id === t.catId);
    const cNom = cat ? cat.nombre : t.catId;
    csv += `${t.fecha},${t.tipo},"${cNom}","${(t.desc || '').replace(/"/g, '""')}",${t.monto.toFixed(2)}\n`;
  }
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'flujo_' + (perfil.nombre || 'perfil').replace(/\s+/g, '_') + '_' + new Date().getFullYear() + '.csv';
  a.click();
  URL.revokeObjectURL(url);
  showToast('Flujo exportado como CSV ✓');
}

// ── FINANCE TRACKER — SIDEBAR ────────────────────────────────────────────────

function setFeSection(section) {
  feState.section = section;
  // Al ir a Inicio siempre posicionar en "Día"
  if (section === 'inicio') {
    feState.periodo = 'dia';
    feState.offset  = 0;
    const btns = document.querySelectorAll('.fe-per-btn');
    const vals  = ['dia', 'semana', 'mes', 'anio', 'custom'];
    btns.forEach((b, i) => b.classList.toggle('fe-active', vals[i] === 'dia'));
    const rangeEl = document.getElementById('fe-custom-range');
    if (rangeEl) rangeEl.style.display = 'none';
  }

  // Actualizar estado activo en nav (old sidebar - may not exist)
  document.querySelectorAll('.fe-sb-item[data-sec]').forEach(btn => {
    btn.classList.toggle('fe-sb-active', btn.dataset.sec === section);
  });

  // Mostrar/ocultar secciones
  ['inicio', 'cuentas', 'graficos', 'categorias', 'ajustes'].forEach(s => {
    const el = document.getElementById('fe-section-' + s);
    if (el) el.style.display = s === section ? '' : 'none';
  });

  // FAB: solo visible en Inicio
  const fab = document.getElementById('fe-fab');
  if (fab) fab.style.display = section === 'inicio' ? '' : 'none';

  // Sync global sidebar sub-nav active state
  document.querySelectorAll('.app-sb-sub[data-sec]').forEach(btn => {
    btn.classList.toggle('app-sb-sub-active', btn.dataset.sec === section);
  });

  // Sync mobile horizontal sub-nav
  document.querySelectorAll('.fe-msn-btn[data-sec]').forEach(btn => {
    btn.classList.toggle('fe-msn-active', btn.dataset.sec === section);
  });

  // Render contenido específico de la sección
  if (section === 'graficos')   renderSbGrafico();
  if (section === 'categorias') renderSbCatsList();
  if (section === 'cuentas')    renderSbCuentas();
}

function setSgPeriod(per) {
  feState.sbGrafPer    = per;
  feState.sbGrafOffset = 0;
  document.querySelectorAll('.fe-g-pill').forEach(b => {
    b.classList.toggle('fe-active', b.dataset.per === per);
  });
  renderSbGrafico();
}

function navSgPeriodo(dir) {
  feState.sbGrafOffset = (feState.sbGrafOffset || 0) + dir;
  renderSbGrafico();
}

function setSbCatTipo(tipo) {
  feState.sbCatTipo = tipo;
  const g = document.getElementById('fe-sbc-gasto');
  const i = document.getElementById('fe-sbc-ingreso');
  if (g) g.classList.toggle('fe-active', tipo === 'gasto');
  if (i) i.classList.toggle('fe-active', tipo === 'ingreso');
  feCatModal.tipo = tipo;  // sincronizar para que openEditCat funcione
  renderSbCatsList();
}

// ── Gráfico de la sección "Gráficos" — 4 filas simultáneas ──

function renderSbGrafico() {
  _renderChart4('dia',    14, 'fe-chart-dia',    'fe-chart-leg-dia');
  _renderChart4('semana', 8,  'fe-chart-semana', 'fe-chart-leg-semana');
  _renderChart4('mes',    12, 'fe-chart-mes',    'fe-chart-leg-mes');
  _renderChart4('anio',   5,  'fe-chart-anio',   'fe-chart-leg-anio');
}

function _renderChart4(per, n, svgId, legId) {
  const svgEl = document.getElementById(svgId);
  const legEl = document.getElementById(legId);
  if (!svgEl) return;

  const now = new Date();
  const MESES_C = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  const buckets = [];

  if (per === 'dia') {
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(now); d.setDate(now.getDate() - i);
      const key = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
      buckets.push({ key, label: String(d.getDate()) + '/' + String(d.getMonth()+1), g:0, i:0, tipoBucket:'dia' });
    }
  } else if (per === 'semana') {
    const dow = now.getDay() || 7;
    const mon = new Date(now); mon.setDate(now.getDate() - dow + 1); mon.setHours(0,0,0,0);
    for (let i = n - 1; i >= 0; i--) {
      const s = new Date(mon); s.setDate(mon.getDate() - i * 7);
      const e = new Date(s); e.setDate(s.getDate() + 6); e.setHours(23,59,59,999);
      const key = s.getFullYear() + '-' + String(s.getMonth()+1).padStart(2,'0') + '-' + String(s.getDate()).padStart(2,'0');
      buckets.push({ key, label: String(s.getDate()) + '/' + String(s.getMonth()+1), g:0, i:0, tipoBucket:'semana', startOfWk:s, endOfWk:e });
    }
  } else if (per === 'mes') {
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0');
      const suffix = d.getFullYear() !== now.getFullYear() ? ' ' + String(d.getFullYear()).slice(2) : '';
      buckets.push({ key, label: MESES_C[d.getMonth()] + suffix, g:0, i:0, tipoBucket:'mes', anio:d.getFullYear(), mes:d.getMonth() });
    }
  } else {
    for (let y = now.getFullYear() - n + 1; y <= now.getFullYear(); y++) {
      buckets.push({ key: String(y), label: String(y), g:0, i:0, tipoBucket:'anio' });
    }
  }

  // Acumular transacciones en buckets
  for (const t of transacciones) {
    const parts = t.fecha.split('-').map(Number);
    const tDate = new Date(parts[0], parts[1]-1, parts[2]);
    for (const b of buckets) {
      let match = false;
      if (b.tipoBucket === 'mes') {
        match = String(parts[0]) + '-' + String(parts[1]).padStart(2,'0') === b.key;
      } else if (b.tipoBucket === 'semana') {
        match = tDate >= b.startOfWk && tDate <= b.endOfWk;
      } else if (b.tipoBucket === 'anio') {
        match = String(parts[0]) === b.key;
      } else {
        match = t.fecha === b.key;
      }
      if (match) {
        if (t.tipo === 'gasto') b.g += t.monto;
        else                    b.i += t.monto;
      }
    }
  }

  _renderBarChartSvg(svgEl, legEl, buckets, true); // compact=true para 4 filas
}

function _renderBarChartSvg(svgEl, legendEl, buckets, compact) {
  svgEl.innerHTML = '';
  if (legendEl) legendEl.innerHTML = '';

  // Adapt width to container for full-screen fill
  const containerW = svgEl.parentElement ? svgEl.parentElement.offsetWidth : 800;
  const W = Math.max(containerW || 800, 480);
  const H = compact ? Math.max(Math.round(W * 0.22), 140) : Math.max(Math.round(W * 0.42), 260);
  svgEl.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svgEl.setAttribute('preserveAspectRatio', 'none');

  const padL = compact ? 44 : 52, padR = 10, padT = compact ? 12 : 20, padB = compact ? 30 : 44;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;

  const C_GAS  = '#e74c3c';
  const C_ING  = '#27ae60';
  const C_BEN  = '#2980b9';
  const C_PER  = '#e67e22';

  const maxVal = Math.max(...buckets.map(b => Math.max(b.g, b.i)), 1);

  // Y grid lines + labels
  const steps = 5;
  for (let i = 0; i <= steps; i++) {
    const y = padT + (chartH / steps) * i;
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', String(padL)); line.setAttribute('x2', String(W - padR));
    line.setAttribute('y1', String(y));    line.setAttribute('y2', String(y));
    line.setAttribute('stroke', 'var(--border)'); line.setAttribute('stroke-width', '0.5');
    svgEl.appendChild(line);

    const val = maxVal * (1 - i / steps);
    if (val <= 0 && i > 0) continue;
    const lbl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    lbl.setAttribute('x', String(padL - 4)); lbl.setAttribute('y', String(y + 3.5));
    lbl.setAttribute('text-anchor', 'end'); lbl.setAttribute('font-size', compact ? '7' : '8.5');
    lbl.setAttribute('fill', 'var(--muted)');
    lbl.textContent = val >= 1000 ? (val / 1000).toFixed(1) + 'k' : Math.round(val);
    svgEl.appendChild(lbl);
  }

  const bw     = chartW / buckets.length;
  const innerW = bw * 0.82;
  const barW   = innerW / 3;
  const gap    = 0.5;

  for (let bi = 0; bi < buckets.length; bi++) {
    const b      = buckets[bi];
    const xBase  = padL + bi * bw + (bw - innerW) / 2;
    const balance = b.i - b.g;

    // Bar: Gastos
    const hG = (b.g / maxVal) * chartH;
    const rG = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rG.setAttribute('x', String(xBase));
    rG.setAttribute('width', String(barW - gap));
    rG.setAttribute('y', String(padT + chartH - hG));
    rG.setAttribute('height', String(Math.max(hG, 1)));
    rG.setAttribute('fill', C_GAS); rG.setAttribute('rx', '2');
    rG.setAttribute('class', 'fe-anim-bar');
    rG.style.animationDelay = (bi * 0.025) + 's';
    svgEl.appendChild(rG);

    // Bar: Ingresos
    const hI = (b.i / maxVal) * chartH;
    const rI = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rI.setAttribute('x', String(xBase + barW));
    rI.setAttribute('width', String(barW - gap));
    rI.setAttribute('y', String(padT + chartH - hI));
    rI.setAttribute('height', String(Math.max(hI, 1)));
    rI.setAttribute('fill', C_ING); rI.setAttribute('rx', '2');
    rI.setAttribute('class', 'fe-anim-bar');
    rI.style.animationDelay = (bi * 0.025) + 's';
    svgEl.appendChild(rI);

    // Bar: Balance (Beneficiado o Pérdida)
    const hB = (Math.abs(balance) / maxVal) * chartH;
    const rB = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rB.setAttribute('x', String(xBase + barW * 2));
    rB.setAttribute('width', String(barW - gap));
    rB.setAttribute('y', String(padT + chartH - hB));
    rB.setAttribute('height', String(Math.max(hB, 1)));
    rB.setAttribute('fill', balance >= 0 ? C_BEN : C_PER); rB.setAttribute('rx', '2');
    rB.setAttribute('class', 'fe-anim-bar');
    rB.style.animationDelay = (bi * 0.025) + 's';
    svgEl.appendChild(rB);

    // X label
    const txt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    txt.setAttribute('x', String(padL + bi * bw + bw / 2));
    txt.setAttribute('y', String(H - 8));
    txt.setAttribute('text-anchor', 'middle');
    txt.setAttribute('font-size', compact ? '7' : '8.5');
    txt.setAttribute('fill', 'var(--muted)');
    txt.textContent = b.label;
    svgEl.appendChild(txt);
  }

  // Legend
  if (legendEl) {
    const items = [
      { color: C_ING, label: 'Ingresos' },
      { color: C_GAS, label: 'Gastos'   },
      { color: C_BEN, label: 'Beneficiado' },
      { color: C_PER, label: 'Pérdida'  },
    ];
    const fs = compact ? '10px' : '11px';
    const sw = compact ? '8px' : '10px';
    legendEl.innerHTML = items.map(it =>
      `<span style="display:inline-flex;align-items:center;gap:4px;font-size:${fs};font-family:var(--mono);color:var(--muted)">` +
      `<span style="display:inline-block;width:${sw};height:${sw};border-radius:2px;background:${it.color}"></span>${it.label}</span>`
    ).join('');
  }
}

// ── Lista de categorías (sección Categorías) ──

function renderSbCatsList() {
  const el = document.getElementById('fe-sb-cats-grid');
  if (!el) return;
  el.innerHTML = '';
  const tipo = feState.sbCatTipo;
  feCatModal.tipo = tipo;
  const cats = tipo === 'gasto' ? categorias.gastos : categorias.ingresos;

  for (const cat of cats) {
    const card = document.createElement('div');
    card.className = 'fe-sb-cat-card';
    card.title = 'Clic para editar ' + cat.nombre;
    card.innerHTML =
      `<div class="fe-sb-cat-icon" style="background:${cat.color}22;color:${cat.color}">${cat.emoji}</div>` +
      `<div class="fe-sb-cat-name">${esc(cat.nombre)}</div>`;
    card.onclick = () => openEditCat(cat.id);
    el.appendChild(card);
  }
}

// ── Cuentas: actualizar saldo ──

function renderSbCuentas() {
  let totalIng = 0, totalGas = 0;
  for (const t of transacciones) {
    if (t.tipo === 'ingreso') totalIng += t.monto;
    else                      totalGas += t.monto;
  }
  const bal = totalIng - totalGas;
  const el  = document.getElementById('fe-cuenta-saldo');
  if (el) {
    el.textContent = fmtS(Math.abs(bal));
    el.style.color = bal >= 0 ? 'var(--green)' : '#e74c3c';
  }
}

// ── Soporte ──

function abrirSoporte() {
  showToast('Soporte: contacto a través del desarrollador');
}

function compartirApp() { showToast('Función disponible próximamente'); }
function valorarApp()   { showToast('¡Gracias por su apoyo! Función próximamente'); }

// ── PARÁMETROS ────────────────────────────────────────────────────────────────

function renderParams() {
  document.getElementById('p-empresa-nombre').value = params.empresa.nombre || '';
  document.getElementById('p-empresa-ruc').value    = params.empresa.ruc    || '';
  document.getElementById('p-empresa-dir').value    = params.empresa.direccion || '';
  document.getElementById('p-empresa-logo').value   = params.empresa.logo   || '';
  document.getElementById('p-anio').value           = params.empresa.anio   || 2026;
  document.getElementById('p-af').value             = params.planilla.af    || 102.50;
  document.getElementById('p-movilidad').value      = params.planilla.movilidadMensual || 679.00;
  document.getElementById('p-viat-alim').value      = params.planilla.viaticosAlim || 39.00;
  document.getElementById('p-viat-aloj').value      = params.planilla.viaticosAloj || 65.00;
  document.getElementById('p-moneda').value         = params.apariencia.moneda || 'PEN';
  document.getElementById('p-sep-decimal').value    = params.apariencia.sepDecimal || '.';
  document.getElementById('p-primer-dia').value     = String(params.apariencia.primerDia ?? 1);
  document.getElementById('p-redondeo').checked     = params.apariencia.redondeo || false;
  document.getElementById('p-tipo-cambio').value    = params.apariencia.tipoCambio || 3.85;
  const gemKeyEl = document.getElementById('p-gemini-key');
  if (gemKeyEl) gemKeyEl.value = (params.ia && params.ia.geminiKey) ? params.ia.geminiKey : '';
  const tcRow = document.getElementById('p-tipo-cambio-row');
  if (tcRow) tcRow.style.display = params.apariencia.moneda === 'USD' ? '' : 'none';
  document.getElementById('p-moneda').onchange = () => {
    const tcRow2 = document.getElementById('p-tipo-cambio-row');
    if (tcRow2) tcRow2.style.display = document.getElementById('p-moneda').value === 'USD' ? '' : 'none';
  };
}

function saveParams() {
  params.empresa.nombre       = document.getElementById('p-empresa-nombre').value.trim();
  params.empresa.ruc          = document.getElementById('p-empresa-ruc').value.trim();
  params.empresa.direccion    = document.getElementById('p-empresa-dir').value.trim();
  params.empresa.logo         = document.getElementById('p-empresa-logo').value.trim();
  params.empresa.anio         = parseInt(document.getElementById('p-anio').value) || 2026;
  params.planilla.af          = parseFloat(document.getElementById('p-af').value) || 102.50;
  params.planilla.movilidadMensual = parseFloat(document.getElementById('p-movilidad').value) || 679.00;
  params.planilla.viaticosAlim = parseFloat(document.getElementById('p-viat-alim').value) || 39.00;
  params.planilla.viaticosAloj = parseFloat(document.getElementById('p-viat-aloj').value) || 65.00;
  params.apariencia.moneda    = document.getElementById('p-moneda').value;
  params.apariencia.sepDecimal = document.getElementById('p-sep-decimal').value;
  params.apariencia.primerDia = parseInt(document.getElementById('p-primer-dia').value);
  params.apariencia.redondeo  = document.getElementById('p-redondeo').checked;
  params.apariencia.tipoCambio = parseFloat(document.getElementById('p-tipo-cambio').value) || 3.85;
  if (!params.ia) params.ia = { geminiKey: DEFAULT_GEMINI_KEY, vozActiva: false };
  const gemKeyEl = document.getElementById('p-gemini-key');
  if (gemKeyEl) {
    const key = gemKeyEl.value.trim();
    params.ia.geminiKey = key || DEFAULT_GEMINI_KEY; // si borra la key, restaura la default
  }
  saveAll();
  showToast('Parámetros guardados ✓');
}

// ── DATE PICKER FUNCTIONS ────────────────────────────────────────────────────

function abrirDatePicker() {
  if (feState.periodo === 'dia') {
    // Single day mode: open native date input
    const inp = document.getElementById('fe-dia-picker');
    if (!inp) return;
    const d = new Date();
    d.setDate(d.getDate() + (feState.offset || 0));
    inp.value = d.toISOString().split('T')[0];
    inp.showPicker?.();
    return;
  }
  // All other modes: open custom range picker
  openPeriodPicker();
}

function setFeDia(dateStr) {
  if (!dateStr) return;
  const [y, m, d] = dateStr.split('-').map(Number);
  const today = new Date();
  today.setHours(0,0,0,0);
  const sel = new Date(y, m-1, d);
  const diff = Math.round((today - sel) / 86400000);
  feState.offset = diff;
  feState.periodo = 'dia';
  document.querySelectorAll('.fe-per-btn').forEach(b => b.classList.remove('fe-active'));
  const diaBtn = document.getElementById('fe-per-dia');
  if (diaBtn) diaBtn.classList.add('fe-active');
  renderFlujoTab();
}

function setCustomRange() {
  const from = document.getElementById('fe-range-from').value;
  const to   = document.getElementById('fe-range-to').value;
  if (!from || !to) return;
  feState.customFrom = from;
  feState.customTo   = to;
  feState.periodo    = 'custom';
  renderFlujoTab();
}

function openPeriodPicker() {
  const { from, to } = getFeRange();
  const fd = d => d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  const fromInp = document.getElementById('period-from');
  const toInp   = document.getElementById('period-to');
  const chk     = document.getElementById('period-todo');
  if (fromInp) { fromInp.value = fd(from); fromInp.disabled = false; }
  if (toInp)   { toInp.value   = fd(to);   toInp.disabled   = false; }
  if (chk)     chk.checked = false;
  document.getElementById('fe-overlay-period').style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function closePeriodPicker() {
  const el = document.getElementById('fe-overlay-period');
  if (el) el.style.display = 'none';
  document.body.style.overflow = '';
}

function togglePeriodTodo(cb) {
  const fromInp = document.getElementById('period-from');
  const toInp   = document.getElementById('period-to');
  if (cb.checked) {
    // Earliest transaction date
    const sorted = transacciones.map(t => t.fecha).filter(Boolean).sort();
    const fd = d => d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
    const earliest = sorted.length ? sorted[0] : fd(new Date(2022,0,1));
    if (fromInp) { fromInp.value = earliest; fromInp.disabled = true; }
    if (toInp)   { toInp.value   = fd(new Date()); toInp.disabled = true; }
  } else {
    if (fromInp) fromInp.disabled = false;
    if (toInp)   toInp.disabled   = false;
  }
}

function applyPeriodPicker() {
  const from = document.getElementById('period-from')?.value;
  const to   = document.getElementById('period-to')?.value;
  if (!from || !to) { showToast('Selecciona ambas fechas'); return; }
  if (from > to)    { showToast('La fecha inicial debe ser anterior a la final'); return; }
  feState.customFrom = from;
  feState.customTo   = to;
  feState.periodo    = 'custom';
  feState.offset     = 0;
  // Update period bar buttons
  const btns = document.querySelectorAll('.fe-per-btn');
  const vals  = ['dia','semana','mes','anio','custom'];
  btns.forEach((b, i) => b.classList.toggle('fe-active', vals[i] === 'custom'));
  const rangeEl = document.getElementById('fe-custom-range');
  if (rangeEl) rangeEl.style.display = 'none';
  closePeriodPicker();
  renderFlujoTab();
}

// ── FINANCE TRACKER — DATOS DE PRUEBA ────────────────────────────────────────

function generarDatosPrueba() {
  if (!confirm('¿Cargar datos de muestra desde Ene 2022 hasta hoy?\n\nSe agregarán ingresos y gastos de ejemplo. Las transacciones existentes NO se borrarán.')) return;

  const _now = new Date();
  const MESES = [];
  for (let _y = 2022; _y <= _now.getFullYear(); _y++) {
    const _endM = _y === _now.getFullYear() ? _now.getMonth() : 11;
    for (let _m = 0; _m <= _endM; _m++) MESES.push([_y, _m]);
  }

  let added = 0;
  for (const [anio, mes] of MESES) added += _genMesDemo(anio, mes);

  if (!added) { showToast('Ya existen datos de prueba para todos los meses'); return; }
  saveAll();
  renderFlujoTab();
  showToast(added + ' transacciones de muestra cargadas ✓');
}

function limpiarDatosPrueba() {
  const isDemo = t => t.demoId || (t.autoId && t.autoId.startsWith('demo-'));
  const count  = transacciones.filter(isDemo).length;
  if (!count) { showToast('No hay datos de prueba que limpiar'); return; }
  if (!confirm('¿Eliminar ' + count + ' transacciones de prueba?')) return;
  transacciones = transacciones.filter(t => !isDemo(t));
  saveAll();
  renderFlujoTab();
  showToast(count + ' transacciones de prueba eliminadas ✓');
}

function _autoLoadDemoSilent() {
  // Called on first launch: silently loads demo data Jan 2022 → today
  const now = new Date();
  const MESES = [];
  for (let y = 2022; y <= now.getFullYear(); y++) {
    const endM = y === now.getFullYear() ? now.getMonth() : 11;
    for (let m = 0; m <= endM; m++) MESES.push([y, m]);
  }
  let added = 0;
  for (const [anio, mes] of MESES) added += _genMesDemo(anio, mes);
  if (added > 0) {
    saveAll();
    setTimeout(() => {
      renderFlujoTab();
      showToast('📊 ' + added + ' transacciones de muestra cargadas (Ene 2022 – hoy)');
    }, 400);
  }
}

function _genMesDemo(anio, mes) {
  const pfx = 'demo-' + anio + '-' + mes + '-';
  if (transacciones.some(t => (t.demoId || t.autoId || '').startsWith(pfx))) return 0;

  const rnd  = (a, b) => Math.round((a + Math.random() * (b - a)) * 100) / 100;
  const rInt = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
  const dim  = new Date(anio, mes + 1, 0).getDate();
  const rDay = () => rInt(1, dim);
  const dStr = d => anio + '-' + String(mes + 1).padStart(2,'0') + '-' + String(Math.min(d, dim)).padStart(2,'0');
  let seq = 0, count = 0;

  const push = (tipo, catId, monto, desc, dia) => {
    transacciones.push({ id: genId(), tipo, catId,
      monto: parseFloat(Math.max(0.01, monto).toFixed(2)),
      desc, fecha: dStr(dia), demoId: pfx + (seq++) });
    count++;
  };

  // ── Ingresos ──
  const jornada = perfil.jornada || 'FORANEO';
  let netBase, netAlim, netAloj, netMovil;
  if (jornada === 'FORANEO') {
    netBase  = rnd(3700, 4200);
    netAlim  = rnd(950,  1100);
    netAloj  = rnd(1550, 1800);
    netMovil = rnd(180,  220);
  } else {
    netBase  = rnd(4800, 5600);
    netAlim  = 0; netAloj = 0;
    netMovil = rnd(150, 220);
  }
  const totalNet = netBase + netAlim + netAloj + netMovil;

  push('ingreso', 'i-sueldo', netBase, 'Sueldo neto', 1);
  if (netAlim > 0.01) push('ingreso', 'i-alim',  netAlim,  'RC Alimentación (Proviz)', 1);
  if (netAloj > 0.01) push('ingreso', 'i-aloj',  netAloj,  'Alojamiento', 1);
  if (netMovil > 0.01) push('ingreso', 'i-movil', netMovil, 'Movilidad mensual', 1);

  if (mes === 4 || mes === 10)
    push('ingreso', 'i-cts',   rnd(1800, 2500), mes === 4 ? 'CTS May (Nov–Abr)' : 'CTS Nov (May–Oct)', 15);
  if (mes === 6 || mes === 11)
    push('ingreso', 'i-grati', rnd(4200, 5500), mes === 6 ? 'Gratificación Fiestas Patrias' : 'Gratificación Navidad', 15);

  // ── Gastos ──
  let budget = totalNet - rnd(1200, 1600);

  const alquiler = rnd(1200, 1500);
  push('gasto', 'g-casa',  alquiler, 'Alquiler', 1);                    budget -= alquiler;
  push('gasto', 'g-telco', rnd(79, 99),   ['Claro','Movistar','Entel'][rInt(0,2)], rDay()); budget -= 90;
  push('gasto', 'g-inter', rnd(79, 119),  'Internet cable', rDay());     budget -= 100;

  const TMPL = [
    { catId:'g-super',  pct:.14, n:rInt(4,6),  d:['Wong','Plaza Vea','Tottus','Metro','Vivanda'] },
    { catId:'g-alim',   pct:.11, n:rInt(8,12), d:['Almuerzo','Desayuno','Cena','Menú del día','Lunch','Snack'] },
    { catId:'g-rest',   pct:.08, n:rInt(5,8),  d:['Cevichería','Pollería','Chifa','Restaurante','Parrilla','Anticuchería'] },
    { catId:'g-trans',  pct:.06, n:rInt(14,20),d:['Bus','Combi','Pasaje','Metro de Lima','Línea bus'] },
    { catId:'g-taxi',   pct:.04, n:rInt(3,6),  d:['Uber','InDrive','Taxi','Beat'] },
    { catId:'g-subs',   pct:.02, n:rInt(2,4),  d:['Netflix','Spotify','YouTube Premium','Disney+'] },
    { catId:'g-aseo',   pct:.03, n:rInt(1,3),  d:['Barbería','Peluquería','Cuidado personal'] },
    { catId:'g-entret', pct:.05, n:rInt(2,5),  d:['Cine','Cinemark','UVK','Salida fin de semana','Karaoke'] },
    { catId:'g-serv',   pct:.04, n:rInt(1,3),  d:['Luz','Agua','Gas','Recibo servicio'] },
    { catId:'g-salud',  pct:.03, n:rInt(0,2),  d:['Farmacia','Consulta médica','Medicamentos'] },
    { catId:'g-educ',   pct:.015,n:rInt(0,2),  d:['Libro','Curso online','Material estudio'] },
  ];
  const totalPct = TMPL.reduce((s, t) => s + t.pct, 0);

  for (const tmpl of TMPL) {
    if (tmpl.n === 0) continue;
    const catBgt = budget * (tmpl.pct / totalPct);
    const perTx  = catBgt / tmpl.n;
    for (let i = 0; i < tmpl.n; i++)
      push('gasto', tmpl.catId, Math.max(3, rnd(perTx * .7, perTx * 1.3)),
        tmpl.d[rInt(0, tmpl.d.length - 1)], rDay());
  }

  if (Math.random() < .40) push('gasto','g-ropa',   rnd(80,380), ['Ropa nueva','Zapatillas','Saga','Ripley'][rInt(0,3)], rDay());
  if (Math.random() < .55) push('gasto','g-lavand',  rnd(25,65),  'Lavandería', rDay());
  if (Math.random() < .25) push('gasto','g-salud',   rnd(120,300),'Consulta médica extra', rDay());
  if (Math.random() < .20) push('gasto','g-educ',    rnd(50,200), 'Libro / Curso', rDay());

  return count;
}

// ── TOAST ────────────────────────────────────────────────────────────────────

// ── SONIDOS (Web Audio API) ───────────────────────────────────────────────────

function _playTxSound(tipo) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (tipo === 'gasto') {
      // Moneda: ping corto descendente
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.2);
    } else {
      // Caja registradora: dos pings ascendentes rápidos
      [0, 0.08].forEach((delay, i) => {
        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = 'triangle';
        const freq = i === 0 ? 600 : 900;
        osc.frequency.setValueAtTime(freq, ctx.currentTime + delay);
        gain.gain.setValueAtTime(0.2, ctx.currentTime + delay);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.15);
        osc.start(ctx.currentTime + delay);
        osc.stop(ctx.currentTime + delay + 0.18);
      });
    }
  } catch(e) { /* silencioso si falla */ }
}

function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2500);
}

// ── INIT ─────────────────────────────────────────────────────────────────────

window.addEventListener('DOMContentLoaded', () => {
  loadAll();
  // Siempre mostrar selector de perfiles al inicio
  showPerfilSelector();

  document.getElementById('ind-anio').addEventListener('change', () => {
    calState.anio = parseInt(document.getElementById('ind-anio').value);
    buildCal();
    recalcular();
  });
  document.getElementById('ind-mes').addEventListener('change', () => {
    calState.mes = parseInt(document.getElementById('ind-mes').value);
    buildCal();
    recalcular();
  });
});
