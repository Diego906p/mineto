// ── CONSTANTES ────────────────────────────────────────────────────────────────
const UIT = { 2024: 5150, 2025: 5350, 2026: 5500 };
// AFP Seguro: 1.37% universal (uniforms all AFPs per user spec)
const AFP_SEGURO_PCT = 0.0137;
const ALIM_DIA  = 39;
const ALOJ_DIA  = 65;

// Renta 5ta — multiplicadores y divisores por mes (fórmula SUNAT progresiva)
// Derivados de Victor02.html, verificados con boleta real Enero 2026 → S/179.42
// mult: meses proyectados hacia adelante | div: divisor de distribución mensual
const R5_MULT = [12,11,10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
const R5_DIV  = [12,12,12, 9, 8, 8, 8, 5, 4, 4, 4, 1];

function getUIT(anio) {
  return UIT[anio] || UIT[2026];
}

// ── FERIADOS PERUANOS ─────────────────────────────────────────────────────────

/** Algoritmo de Meeus/Jones/Butcher para calcular Pascua (Domingo de Resurrección) */
function calcEaster(anio) {
  const a = anio % 19;
  const b = Math.floor(anio / 100);
  const c = anio % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const ii = Math.floor(c / 4);
  const k  = c % 4;
  const l  = (32 + 2 * e + 2 * ii - h - k) % 7;
  const m  = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31) - 1; // 0-indexed
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return { mes, dia };
}

/**
 * Retorna array con los días (1-indexed) de feriados del mes indicado.
 * Incluye: Año Nuevo, Semana Santa, Día del Trabajo, San Pedro y San Pablo,
 * Independencia (28 y 29 Jul), Santa Rosa, Angamos, Todos Santos,
 * Inmaculada Concepción, Navidad.
 */
function getFeriadosMes(anio, mes) {
  const easter     = calcEaster(anio);
  const easterDate = new Date(anio, easter.mes, easter.dia);
  const juevesSanto   = new Date(+easterDate - 3 * 864e5);
  const viernesSanto  = new Date(+easterDate - 2 * 864e5);

  const todos = [
    { mes: 0,  dia: 1  },  // Año Nuevo
    { mes: juevesSanto.getMonth(),  dia: juevesSanto.getDate()  }, // Jueves Santo
    { mes: viernesSanto.getMonth(), dia: viernesSanto.getDate() }, // Viernes Santo
    { mes: 4,  dia: 1  },  // Día del Trabajo
    { mes: 5,  dia: 29 },  // San Pedro y San Pablo
    { mes: 6,  dia: 28 },  // Independencia (día 1)
    { mes: 6,  dia: 29 },  // Independencia (día 2)
    { mes: 7,  dia: 30 },  // Santa Rosa de Lima
    { mes: 9,  dia: 8  },  // Combate de Angamos
    { mes: 10, dia: 1  },  // Todos los Santos
    { mes: 11, dia: 8  },  // Inmaculada Concepción
    { mes: 11, dia: 25 },  // Navidad
  ];

  return todos.filter(f => f.mes === mes).map(f => f.dia);
}

function isFeriadoDia(anio, mes, dia) {
  return getFeriadosMes(anio, mes).includes(dia);
}

// ── RENTA 5TA CATEGORÍA ───────────────────────────────────────────────────────

function escalaR5Anio(rNeta, anio) {
  if (rNeta <= 0) return 0;
  const uit = getUIT(anio);
  const tramos = [
    { hasta: 5,         tasa: 0.08 },
    { hasta: 20,        tasa: 0.14 },
    { hasta: 35,        tasa: 0.17 },
    { hasta: 45,        tasa: 0.20 },
    { hasta: Infinity,  tasa: 0.30 },
  ];
  let impuesto = 0, acum = 0;
  for (const t of tramos) {
    const limite = t.hasta === Infinity ? Infinity : t.hasta * uit;
    const tramo  = Math.min(Math.max(rNeta - acum, 0), limite - acum);
    impuesto += tramo * t.tasa;
    acum = Math.min(rNeta, limite);
    if (acum >= rNeta) break;
  }
  return impuesto;
}

/**
 * calcR5Full – impuesto mensual de Renta 5ta categoría (fórmula SUNAT progresiva).
 * Verificada con boleta real Enero 2026: sueldo=4500, AF=113, UIT=5500 → S/179.42 ✓
 *
 * Proyección anual = (S+AF)×mult + alimGravable + (S+AF)×2×(1+essalud) + ingAnterior
 *   · mult/div por mes según R5_MULT/R5_DIV
 *   · alimGravable = min(alimentación del mes, 20% sueldo) — solo FORÁNEO
 *   · ingAnterior  = suma de (S+AF+alimGrav) de meses ya grabados en flujoData
 *
 * @param {number} sueldo      - Sueldo mensual base
 * @param {number} af          - Asignación familiar
 * @param {boolean} epsMode    - true = EPS (bonif 6.75%), false = EsSalud (9%)
 * @param {number} anio        - Año (para UIT)
 * @param {number} [mes=0]     - Mes 0-indexed; default 0 = Enero
 * @param {number} [alimMes=0] - Total alimentación del mes (FORÁNEO); 0 para LOCAL
 * @param {number} [ingAnt=0]  - Ingresos afectos de meses anteriores grabados
 */
function calcR5Full(sueldo, af, epsMode, anio, mes, alimMes, ingAnt) {
  const m         = (typeof mes === 'number') ? mes : 0;
  const mult      = R5_MULT[m];
  const div       = R5_DIV[m];
  const essPct    = epsMode ? 0.0675 : 0.09;
  const remBase   = sueldo + af;
  const alimGrav  = Math.min(alimMes || 0, sueldo * 0.20);
  const proyMens  = remBase * mult + alimGrav;
  const proyGrats = remBase * 2 * (1 + essPct);
  const ingAntAdj = (typeof ingAnt === 'number' && ingAnt > 0) ? ingAnt : 0;
  const rNeta     = proyMens + proyGrats + ingAntAdj - 7 * getUIT(anio);
  return escalaR5Anio(rNeta, anio) / div;
}

// ── DÍAS HÁBILES ──────────────────────────────────────────────────────────────

function diasHabilesDelMes(anio, mes) {
  const total = new Date(anio, mes + 1, 0).getDate();
  let habiles = 0;
  for (let d = 1; d <= total; d++) {
    if (new Date(anio, mes, d).getDay() !== 0) habiles++;
  }
  return habiles;
}

// ── PERÍODO DE PROVISIONES ────────────────────────────────────────────────────
// Período 1 (depósito CTS mayo):   nov(10), dic(11), ene(0), feb(1), mar(2), abr(3)
// Período 2 (depósito CTS noviembre): may(4), jun(5), jul(6), ago(7), sep(8), oct(9)
function getPeriodoProvis(mes) {
  const p1 = [10, 11, 0, 1, 2, 3];
  const periodo      = p1.includes(mes) ? 1 : 2;
  const mesEnPeriodo = periodo === 1
    ? p1.indexOf(mes) + 1
    : mes - 3; // may(4)→1, jun(5)→2, …
  return { periodo, mesEnPeriodo };
}

// ── CTS y GRATIFICACIÓN ───────────────────────────────────────────────────────

/**
 * CTS mensual (provisión del empleador):
 *   Remuneración computable = (S + AF) + (S + AF)/6  [incluye 1/6 de grati]
 *   CTS mensual = computable / 12 = (S+AF) × 7/72
 */
function calcCTSMensual(sueldo, af) {
  return (sueldo + af) * 7 / 72;
}

/**
 * Gratificación mensual (provisión del empleador):
 *   2 gratificaciones/año + 9% bonificación EsSalud (Ley 29351)
 *   Mensual = (S+AF)/6 × (1 + essaludPct)
 */
function calcGratiMensual(sueldo, af, epsMode) {
  const essaludPct = epsMode ? 0.0675 : 0.09;
  return (sueldo + af) / 6 * (1 + essaludPct);
}

/**
 * Provisión mensual total (para base R5).
 * Usa las fórmulas correctas: CTS (7/72) + Grati (×1.09)
 */
function calcProvMensual(sueldo, af, epsMode) {
  return calcCTSMensual(sueldo, af) + calcGratiMensual(sueldo, af, epsMode);
}

// ── CALCULAR FORÁNEO ──────────────────────────────────────────────────────────

function calcularForaneo(params) {
  const {
    sueldo, af, afpNombre, epsMode, epsMonto, seguro,
    marcas, anio, mes, periodoProvis,
    movilidadMes = 0,
    ingAnt = 0,
    viaticosAlim = ALIM_DIA,
    viaticosAloj = ALOJ_DIA,
  } = params;

  const diasW   = marcas.filter(m => m === 'W').length;
  const diasR   = marcas.filter(m => m === 'R').length;
  const diasV   = marcas.filter(m => m === 'V').length;
  const diasMED = marcas.filter(m => m === 'MED').length;
  const diasTL  = marcas.filter(m => m === 'TL').length;
  const diasF   = marcas.filter(m => m === 'F').length;
  const diasSU  = marcas.filter(m => m === 'SU').length;

  const diasSueldo = Math.min(diasW + diasR + diasV + diasMED + diasTL, 30);
  const diasViat   = diasW + diasMED; // días con viáticos (trabajo activo en campo)
  const valorDia   = sueldo / 30;

  // ── Feriados trabajados (W en día feriado → pago doble para FORÁNEO) ──
  const feriadosDiasMes = getFeriadosMes(anio, mes);
  let diasFeriado = 0;
  marcas.forEach((m, idx) => {
    if (m === 'W' && feriadosDiasMes.includes(idx + 1)) diasFeriado++;
  });
  const feriadoProp = valorDia * diasFeriado; // ingreso extra por feriados

  const sueldoProp = sueldo * (diasSueldo / 30);
  const afProp     = af    * (diasSueldo / 30);

  const alimentacion = viaticosAlim * diasViat;
  const alojamiento  = viaticosAloj * diasViat;
  // movilidadMes es monto fijo mensual no deducible; se paga si hubo días de sueldo
  const movilidad    = diasSueldo > 0 ? (movilidadMes || 0) : 0;

  const totalIngresos = sueldoProp + afProp + feriadoProp
                      + alimentacion + alojamiento + movilidad;

  // ── Base AFP/ONP (incluye extra por feriados, excluye viáticos) ──
  const baseAfp    = sueldoProp + afProp + feriadoProp;
  const essaludPct = epsMode ? 0.0675 : 0.09;

  const provis    = calcProvMensual(sueldo, af, epsMode);
  // R5 con fórmula SUNAT progresiva: pasa mes, alimentación total y acumulado anterior
  const r5Mensual = calcR5Full(sueldo, af, epsMode, anio, mes, alimentacion, ingAnt);
  const r5Prop    = diasSueldo > 0 ? r5Mensual * (diasSueldo / 30) : 0;

  let afpFondo = 0, afpSeguro = 0, onp = 0;
  if (diasSueldo > 0 && seguro === 'AFP') {
    afpFondo  = baseAfp * 0.10;
    afpSeguro = baseAfp * AFP_SEGURO_PCT; // 1.37% universal
  } else if (diasSueldo > 0) {
    onp = baseAfp * 0.13;
  }
  const epsDesc = epsMode && diasSueldo > 0 ? (epsMonto || 0) : 0;

  const totalDesc = afpFondo + afpSeguro + onp + r5Prop + epsDesc;
  const neto      = Math.max(0, totalIngresos - totalDesc);

  const essalud = sueldoProp * essaludPct;
  const vidaLey = sueldoProp * 0.0122;

  const ctsMens  = calcCTSMensual(sueldo, af);
  const gratiMes = calcGratiMensual(sueldo, af, epsMode);

  return {
    diasSueldo, diasViat, diasW, diasR, diasV, diasF, diasSU, diasMED, diasTL,
    diasFeriado,
    valorDia, feriadoProp,
    sueldoProp, afProp,
    alimentacion, alojamiento, movilidad,
    totalIngresos,
    afpFondo, afpSeguro, onp, r5Prop, epsDesc,
    totalDesc, neto,
    essalud, vidaLey,
    ctsMens, gratiMes,
    r5Mensual,
  };
}

// ── CALCULAR LOCAL ────────────────────────────────────────────────────────────

function calcularLocal(params) {
  const {
    sueldo, af, afpNombre, epsMode, epsMonto, seguro,
    marcas, anio, mes, periodoProvis,
    movilidadMes = 0,
    ingAnt = 0,
  } = params;

  const totalDias = new Date(anio, mes + 1, 0).getDate();
  let habiles = 0;
  for (let d = 1; d <= totalDias; d++) {
    if (new Date(anio, mes, d).getDay() !== 0) habiles++;
  }

  const diasF  = marcas.filter(m => m === 'F').length;
  const diasSU = marcas.filter(m => m === 'SU').length;
  const diasW  = marcas.filter(m => m === 'W').length;
  const diasR  = marcas.filter(m => m === 'R').length;
  const diasV  = marcas.filter(m => m === 'V').length;

  const desc       = diasF + diasSU;
  const diasSueldo = habiles > 0 ? Math.max(0, ((habiles - desc) / habiles) * 30) : 30;
  const valorDia   = sueldo / 30;

  const sueldoProp = sueldo * (diasSueldo / 30);
  const afProp     = af    * (diasSueldo / 30);

  // LOCAL no tiene feriados con doble pago (sólo visual)
  const feriadoProp = 0;

  const totalIngresos = sueldoProp + afProp;

  const baseAfp    = sueldoProp + afProp;
  const essaludPct = epsMode ? 0.0675 : 0.09;

  const provis    = calcProvMensual(sueldo, af, epsMode);
  // LOCAL: sin alimentación (alimMes=0)
  const r5Mensual = calcR5Full(sueldo, af, epsMode, anio, mes, 0, ingAnt);
  const r5Prop    = diasSueldo > 0 ? r5Mensual * (diasSueldo / 30) : 0;

  let afpFondo = 0, afpSeguro = 0, onp = 0;
  if (diasSueldo > 0 && seguro === 'AFP') {
    afpFondo  = baseAfp * 0.10;
    afpSeguro = baseAfp * AFP_SEGURO_PCT;
  } else if (diasSueldo > 0) {
    onp = baseAfp * 0.13;
  }
  const epsDesc = epsMode && diasSueldo > 0 ? (epsMonto || 0) : 0;

  const totalDesc = afpFondo + afpSeguro + onp + r5Prop + epsDesc;
  const neto      = Math.max(0, totalIngresos - totalDesc);

  const essalud = sueldoProp * essaludPct;
  const vidaLey = sueldoProp * 0.0122;

  const ctsMens  = calcCTSMensual(sueldo, af);
  const gratiMes = calcGratiMensual(sueldo, af, epsMode);

  return {
    diasSueldo, diasViat: 0, diasW, diasR, diasV, diasF, diasSU, diasMED: 0, diasTL: 0,
    diasFeriado: 0,
    valorDia, feriadoProp: 0,
    sueldoProp, afProp,
    alimentacion: 0, alojamiento: 0, movilidad: 0,
    totalIngresos,
    afpFondo, afpSeguro, onp, r5Prop, epsDesc,
    totalDesc, neto,
    essalud, vidaLey,
    ctsMens, gratiMes,
    r5Mensual,
  };
}

// ── ENTRY POINT ───────────────────────────────────────────────────────────────

function calcularPlanilla(params) {
  if (params.jornada === 'LOCAL') return calcularLocal(params);
  return calcularForaneo(params);
}

// ── RENTA STEPS PARA DISPLAY ──────────────────────────────────────────────────

/**
 * buildRentaSteps – desglose de cálculo Renta 5ta para mostrar en pantalla.
 * Usa la misma lógica que calcR5Full (fórmula SUNAT progresiva con mult/div).
 */
function buildRentaSteps(sueldo, af, epsMode, anio, diasSueldo, mes, alimMes, ingAnt) {
  const m         = (typeof mes === 'number') ? mes : 0;
  const mult      = R5_MULT[m];
  const div       = R5_DIV[m];
  const essPct    = epsMode ? 0.0675 : 0.09;
  const uit       = getUIT(anio);
  const remBase   = sueldo + af;
  const alimGrav  = Math.min(alimMes || 0, sueldo * 0.20);
  const proyMens  = remBase * mult + alimGrav;
  const gratBase  = remBase * 2;
  const proyGrats = gratBase * (1 + essPct);
  const ingAntAdj = (typeof ingAnt === 'number' && ingAnt > 0) ? ingAnt : 0;
  const ingAnual  = proyMens + proyGrats + ingAntAdj;
  const uit7      = 7 * uit;
  const rNeta     = ingAnual - uit7;
  const anual     = escalaR5Anio(rNeta, anio);
  const mensual   = anual / div;
  const proporcional = diasSueldo > 0 ? mensual * (diasSueldo / 30) : 0;

  return {
    sueldo, af, mes: m, mult, div,
    essPct, remBase, alimGrav, proyMens, gratBase, proyGrats, ingAntAdj,
    ingAnual, rNeta, uit, uit7,
    anual, mensual, proporcional,
    tramo: detectarTramo(rNeta, anio),
  };
}

function detectarTramo(rNeta, anio) {
  const uit = getUIT(anio);
  if (rNeta <= 0)         return 'Inafecto';
  if (rNeta <=  5 * uit)  return '8%';
  if (rNeta <= 20 * uit)  return '14%';
  if (rNeta <= 35 * uit)  return '17%';
  if (rNeta <= 45 * uit)  return '20%';
  return '30%';
}

// ── HELPERS ───────────────────────────────────────────────────────────────────

function fmt(n)  { return (n || 0).toFixed(2); }
function fmtS(n) { return 'S/ ' + fmt(n); }
