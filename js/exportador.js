// ── EXPORTADOR MiNeto · jsPDF ────────────────────────────────────────────────

const MESES_FULL = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                    'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const MESES_UP   = MESES_FULL.map(m => m.toUpperCase());

// ── Helpers locales ─────────────────────────────────────────────────────────

function _fmt(n) { return (n || 0).toFixed(2); }
function _fmtS(n) { return 'S/ ' + _fmt(n); }

function _normNombre(nombre) {
  return String(nombre || '').trim().toUpperCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_');
}

// ── buildBoletaPDF ──────────────────────────────────────────────────────────

function buildBoletaPDF(worker, result, anio, mes) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const r        = result;
  const periodo  = MESES_UP[mes] + ' ' + anio;
  const afpLabel = worker.seguro === 'AFP' ? (worker.afpNombre || 'AFP') : 'ONP';

  const pageW   = 210;
  const margin  = 12;
  const cW      = pageW - 2 * margin;   // content width = 186mm
  const thirdW  = cW / 3;               // ~62mm

  // ── 1. HEADER ──────────────────────────────────────────────────────────────
  // Left block
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(20, 20, 20);
  doc.text('CONSORCIO ROVELLA-INMAC', margin, 13);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(100, 100, 100);
  doc.text('Av. La Molina 1234, Lima · RUC 20609117657', margin, 17);
  doc.text('D.S. 001-98-TR', margin, 20.5);

  // Right block
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(20, 20, 20);
  doc.text('BOLETA DE PAGO', pageW - margin, 12, { align: 'right' });
  doc.setFontSize(9);
  doc.setTextColor(60, 60, 60);
  doc.text(periodo, pageW - margin, 17, { align: 'right' });

  // Separator
  doc.setDrawColor(30, 30, 30);
  doc.setLineWidth(0.6);
  doc.line(margin, 23, pageW - margin, 23);

  // ── 2. EMPLOYEE INFO ────────────────────────────────────────────────────────
  let y = 28;
  const rowH = 4.5;

  // Mark counts
  const marcas   = Array.isArray(worker.marcas) ? worker.marcas : [];
  const diasMED  = marcas.filter(m => m === 'MED').length;
  const diasVac  = marcas.filter(m => m === 'V').length;
  const diasFalt = marcas.filter(m => m === 'F' || m === 'SU').length;

  const infoBlock = (labels, values, x, valX) => {
    labels.forEach((lbl, i) => {
      const yy = y + i * rowH;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.setTextColor(130, 130, 130);
      doc.text(lbl, x, yy);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      doc.setTextColor(20, 20, 20);
      // truncate long values
      const val = String(values[i] ?? '—');
      doc.text(val, valX, yy, { maxWidth: thirdW - (valX - x) - 2 });
    });
  };

  const c1x = margin,           c1v = margin + 20;
  const c2x = margin + thirdW,  c2v = margin + thirdW + 24;
  const c3x = margin + 2*thirdW, c3v = margin + 2*thirdW + 24;

  infoBlock(
    ['Nombre','DNI','Cargo','Centro Costo','Jornada','Sistema Pens.','Salud'],
    [worker.nombre, worker.dni||'—', worker.cargo||'—', worker.area||'—',
     worker.jornada||'FORANEO', afpLabel, worker.epsMode ? 'EPS' : 'EsSalud'],
    c1x, c1v
  );

  infoBlock(
    ['Remuneración','Fecha Ingreso','Banco','Cta. Cte.','CCI'],
    [_fmtS(worker.sueldo||0), worker.fechaIngreso||'—',
     worker.banco||'—', worker.cuenta||'—', worker.cuentaCci||'—'],
    c2x, c2v
  );

  infoBlock(
    ['Días Laborados','Días Médico','Vacaciones','Faltas/Susp.','Días Viáticos'],
    [_fmt(r.diasSueldo), diasMED, diasVac, diasFalt, r.diasViat||0],
    c3x, c3v
  );

  y += 7 * rowH + 5;

  doc.setDrawColor(180, 180, 180);
  doc.setLineWidth(0.3);
  doc.line(margin, y, pageW - margin, y);
  y += 4;

  // ── 3. THREE-COLUMN TABLE ───────────────────────────────────────────────────
  // Build column data
  const viatTotal = r.alimentacion + r.alojamiento + r.movilidad;

  const ingrRows = [];
  ingrRows.push(['Sueldo proporcional', _fmtS(r.sueldoProp)]);
  if (r.afProp > 0)       ingrRows.push(['Asig. familiar prop.', _fmtS(r.afProp)]);
  if (r.alimentacion > 0) ingrRows.push(['Alimentación (Viát.)', _fmtS(r.alimentacion)]);
  if (r.alojamiento > 0)  ingrRows.push(['Alojamiento (Viát.)',  _fmtS(r.alojamiento)]);
  if (r.movilidad > 0)    ingrRows.push(['Movilidad (Viát.)',    _fmtS(r.movilidad)]);

  const descRows = [];
  if (worker.seguro === 'AFP') {
    descRows.push([afpLabel + ' Fondo (10%)', _fmtS(r.afpFondo)]);
    descRows.push([afpLabel + ' Seguro',      _fmtS(r.afpSeguro)]);
  } else {
    descRows.push(['ONP (13%)', _fmtS(r.onp)]);
  }
  if (r.r5Prop  > 0) descRows.push(['Renta 5ta categoría', _fmtS(r.r5Prop)]);
  if (r.epsDesc > 0) descRows.push(['EPS copago',           _fmtS(r.epsDesc)]);
  if (r.alimentacion > 0) descRows.push(['Alimentación (pass.)', _fmtS(r.alimentacion)]);
  if (r.alojamiento > 0)  descRows.push(['Alojamiento (pass.)',  _fmtS(r.alojamiento)]);
  if (r.movilidad > 0)    descRows.push(['Movilidad (pass.)',    _fmtS(r.movilidad)]);

  const apteRows = [
    ['EsSalud (9%)',      _fmtS(r.essalud)],
    ['Vida Ley (1.22%)', _fmtS(r.vidaLey)],
    ['CTS mens.',        _fmtS(r.ctsMens)],
    ['Gratificación mens.', _fmtS(r.gratiMes)],
  ];

  // Column headers
  const colHeaders = ['INGRESOS', 'DESCUENTOS', 'APORTES EMPLEADOR'];
  doc.setFillColor(30, 30, 30);
  doc.rect(margin, y, cW, 5.5, 'F');
  colHeaders.forEach((h, i) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(255, 255, 255);
    doc.text(h, margin + i * thirdW + 2, y + 3.8);
  });
  y += 5.5;

  // Rows
  const allCols = [ingrRows, descRows, apteRows];
  const maxRows = Math.max(ingrRows.length, descRows.length, apteRows.length);
  const tRowH   = 4.5;

  doc.setTextColor(20, 20, 20);
  for (let ri = 0; ri < maxRows; ri++) {
    if (ri % 2 === 1) {
      doc.setFillColor(245, 245, 245);
      doc.rect(margin, y, cW, tRowH, 'F');
    }
    allCols.forEach((col, ci) => {
      if (ri >= col.length) return;
      const [label, value] = col[ri];
      const x = margin + ci * thirdW;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.text(label, x + 2, y + 3.2);
      doc.setFont('helvetica', 'bold');
      doc.text(value, x + thirdW - 2, y + 3.2, { align: 'right' });
    });
    // vertical dividers
    doc.setDrawColor(220, 220, 220);
    doc.setLineWidth(0.2);
    doc.line(margin + thirdW, y, margin + thirdW, y + tRowH);
    doc.line(margin + 2*thirdW, y, margin + 2*thirdW, y + tRowH);
    y += tRowH;
  }

  // ── 4. TOTALS BAR ───────────────────────────────────────────────────────────
  y += 2;
  doc.setDrawColor(30, 30, 30);
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageW - margin, y);
  y += 3;

  const montoAfecto  = r.sueldoProp + r.afProp;
  const totalAportes = r.essalud + r.vidaLey;

  doc.setFillColor(235, 235, 235);
  doc.rect(margin, y, cW, 6, 'F');
  const totals = [
    ['Monto Afecto',    _fmtS(montoAfecto)],
    ['Total Descuentos', _fmtS(r.totalDesc)],
    ['Total Aportes',   _fmtS(totalAportes)],
  ];
  totals.forEach(([lbl, val], i) => {
    const x = margin + i * thirdW;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(20, 20, 20);
    doc.text(lbl, x + 2, y + 4);
    doc.text(val, x + thirdW - 2, y + 4, { align: 'right' });
  });
  y += 6;

  // Total Ingresos + NETO
  y += 4;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(20, 20, 20);
  doc.text('Total Ingresos: ' + _fmtS(r.totalIngresos), margin, y);

  doc.setFontSize(12);
  doc.setTextColor(0, 50, 150);
  doc.text('NETO A PAGAR:  ' + _fmtS(r.neto), pageW - margin, y, { align: 'right' });

  // ── 5. SIGNATURES ───────────────────────────────────────────────────────────
  y += 18;
  doc.setDrawColor(100, 100, 100);
  doc.setLineWidth(0.3);

  const sigLabels  = ['', 'REPRESENTANTE LEGAL', 'FIRMA DEL EMPLEADO'];
  const sigSub     = ['', 'Hector Juan Quispe Fernandez', worker.nombre];

  sigLabels.forEach((lbl, i) => {
    const x    = margin + i * thirdW;
    const midX = x + thirdW / 2;
    doc.line(x + 5, y, x + thirdW - 5, y);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6);
    doc.setTextColor(80, 80, 80);
    doc.text(lbl, midX, y + 3.5, { align: 'center' });
    if (sigSub[i]) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.setTextColor(30, 30, 30);
      doc.text(sigSub[i], midX, y + 7, { align: 'center', maxWidth: thirdW - 8 });
    }
  });

  // Footer
  y += 14;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5.5);
  doc.setTextColor(180, 180, 180);
  doc.text(
    'Generado: ' + new Date().toLocaleDateString('es-PE') + ' · MiNeto',
    pageW - margin, y, { align: 'right' }
  );

  return doc;
}

// ── verBoletaIndividual (modo individual) ───────────────────────────────────

function verBoletaIndividual(worker, result, anio, mes) {
  const doc   = buildBoletaPDF(worker, result, anio, mes);
  const fname = anio + '_' + String(mes + 1).padStart(2, '0') + '_BP_' +
                _normNombre(worker.nombre) + '.pdf';
  doc.save(fname);
}

// ── imprimirBoleta (legacy fallback) ────────────────────────────────────────

function imprimirBoleta() {
  const r = window._lastResult;
  const p = window._lastParams;
  if (!r || !p) return;
  const worker = {
    nombre:      perfil.nombre,
    dni:         perfil.dni || '',
    cargo:       perfil.cargo || '',
    area:        perfil.area || '',
    jornada:     perfil.jornada,
    seguro:      perfil.seguro,
    afpNombre:   perfil.afpNombre,
    epsMode:     perfil.epsMode,
    sueldo:      perfil.sueldo,
    banco:       perfil.banco || '',
    cuenta:      perfil.cuenta || '',
    cuentaCci:   perfil.cuentaCci || '',
    fechaIngreso: perfil.fechaIngreso || '',
    marcas:      getMarcasDelMes ? getMarcasDelMes() : [],
  };
  verBoletaIndividual(worker, r, p.anio, p.mes);
}
