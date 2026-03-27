// ── RECONOCIMIENTO DE VOZ — MiNeto (Modo Palabra Clave) ───────────────────────
//
// Modelo: reconocimiento CONTINUO siempre activo cuando Voz = ON.
// Trigger: al decir "Mi Neto ..." se extrae y procesa el comando.
// No se requiere mantener ningún botón presionado (PTT eliminado).
// El botón flotante es solo un indicador visual de estado.

const VozControl = (function () {

  let recognition    = null;
  let _running       = false;
  let _autoRestart   = false;

  // ── Normalizar texto ──────────────────────────────────────────────────────
  function _n(s) {
    return s.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }
  function _has(text, ...patterns) {
    const t = _n(text);
    return patterns.some(p => t.includes(_n(p)));
  }

  // ── Inicializar reconocimiento continuo ───────────────────────────────────
  function preinit() {
    if (recognition) return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { showToast('🎤 Reconocimiento de voz no disponible en este navegador'); return; }

    recognition = new SR();
    recognition.lang            = 'es-PE';
    recognition.continuous      = true;
    recognition.interimResults  = true;
    recognition.maxAlternatives = 3;

    recognition.onstart = () => { _running = true; _updateBtn(true); };

    recognition.onresult = (ev) => {
      let interim = '', final = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const txt = ev.results[i][0].transcript;
        if (ev.results[i].isFinal) final += txt;
        else interim += txt;
      }

      // Show interim in panel while speaking
      if (interim) _showPanel(interim, 'interim');

      if (final) {
        const up = _n(final);
        // Detect wake word "MI NETO" (with or without space)
        if (/MI\s*NETO\b/.test(up)) {
          // Extract command AFTER the wake word
          const wakeIdx = final.search(/MI\s*NETO\b/i);
          const cmd = (wakeIdx !== -1 ? final.substring(wakeIdx) : final)
            .replace(/^MI\s*NETO\s*/i, '')
            .trim();
          if (cmd) {
            _showPanel('🎤 ' + cmd, 'final');
            _flashBtn();
            _process(cmd);
          } else {
            _showPanel('🎤 ¿Qué necesitas?', 'interim');
            setTimeout(_hidePanel, 3000);
          }
        }
      }
    };

    recognition.onerror = (ev) => {
      if (ev.error === 'no-speech') return;
      if (ev.error === 'aborted')   return;
      const msgs = {
        'not-allowed':         'Permiso de micrófono denegado — actívalo en Configuración del navegador',
        'network':             'Error de red con el servicio de voz',
        'audio-capture':       'Micrófono no encontrado',
        'service-not-allowed': 'Servicio de voz no permitido (usa http://localhost)',
      };
      _updateBtn(false);
      showToast('🎤 ' + (msgs[ev.error] || 'Error de voz: ' + ev.error));
      _running = false;
    };

    recognition.onend = () => {
      _running  = false;
      _updateBtn(false);
      if (_autoRestart) {
        setTimeout(() => {
          try { recognition.start(); } catch(e) {}
        }, 300);
      }
    };

    _autoRestart = true;
    try {
      recognition.start();
      _attachStatusBtn();
    } catch(e) {}
  }

  // ── Detener completamente ─────────────────────────────────────────────────
  function stop() {
    _autoRestart = false;
    _updateBtn(false);
    _hidePanel();
    if (_running && recognition) {
      try { recognition.stop(); } catch(e) {}
    }
    _running = false;
  }

  // ── Botón de estado (clic = mostrar ayuda) ────────────────────────────────
  function _attachStatusBtn() {
    const btn = document.getElementById('voz-btn');
    if (!btn || btn._statusBound) return;
    btn._statusBound = true;
    btn.addEventListener('click', () => _showHelp());
    // Remove old PTT hint text
    const hint = document.getElementById('voz-fab-hint');
    if (hint) hint.textContent = 'Di "Mi Neto [orden]" para actuar';
  }

  function _flashBtn() {
    const btn = document.getElementById('voz-btn');
    if (!btn) return;
    btn.classList.add('voz-active');
    clearTimeout(_flashBtn._t);
    _flashBtn._t = setTimeout(() => btn.classList.remove('voz-active'), 1200);
  }

  // ── Procesador de comandos ────────────────────────────────────────────────
  function _process(raw) {
    const t = raw.trim();

    // ── Navegación ─────────────────────────────────────────────
    if (_has(t, 'ir a flujo', 'flujo de efectivo', 'abrir flujo', 'ver flujo', 'ir a inicio')) {
      showModule('flujo'); setFeSection('inicio'); return _ok('Flujo de efectivo');
    }
    if (_has(t, 'ir a individual', 'modulo individual', 'abrir individual', 'calculadora', 'haberes')) {
      showModule('individual'); return _ok('Módulo Individual');
    }
    if (_has(t, 'ver graficos', 'abrir graficos', 'graficos')) {
      showModule('flujo'); setFeSection('graficos'); return _ok('Gráficos');
    }
    if (_has(t, 'categorias', 'ver categorias', 'abrir categorias')) {
      showModule('flujo'); setFeSection('categorias'); return _ok('Categorías');
    }
    if (_has(t, 'ver cuentas', 'abrir cuentas', 'cuentas')) {
      showModule('flujo'); setFeSection('cuentas'); return _ok('Cuentas');
    }
    if (_has(t, 'parametros', 'configuracion del sistema', 'ajustes generales')) {
      showModule('params'); return _ok('Parámetros');
    }

    // ── Planilla ────────────────────────────────────────────────
    if (_has(t, 'generar planilla', 'calcular planilla', 'calcular sueldo', 'generar boleta', 'calcular haberes')) {
      showModule('individual');
      if (typeof recalcular === 'function') recalcular();
      return _ok('Planilla calculada ✓');
    }
    if (_has(t, 'exportar boleta', 'imprimir boleta', 'descargar boleta', 'exportar pdf')) {
      if (typeof imprimirBoleta === 'function') { imprimirBoleta(); return _ok('Exportando PDF…'); }
      return _err('Calcula la planilla primero');
    }

    // ── Calendario ──────────────────────────────────────────────
    if (_has(t, 'registrar vacaciones', 'marcar vacaciones', 'vacaciones')) {
      _markToday('V'); return _ok('Vacaciones marcadas ✓');
    }
    if (_has(t, 'registrar falta', 'marcar falta', 'falta')) {
      _markToday('F'); return _ok('Falta registrada ✓');
    }
    if (_has(t, 'medico', 'licencia medica', 'descanso medico', 'cita medica', 'incapacidad')) {
      _markToday('MED'); return _ok('Médico registrado ✓');
    }
    if (_has(t, 'suspension', 'marcar suspension')) {
      _markToday('SU'); return _ok('Suspensión registrada ✓');
    }
    if (_has(t, 'teletrabajo', 'trabajo remoto', 'home office')) {
      _markToday('TL'); return _ok('Teletrabajo registrado ✓');
    }
    if (_has(t, 'dia trabajado', 'dia de trabajo', 'registrar trabajo')) {
      _markToday('W'); return _ok('Día de trabajo ✓');
    }
    if (_has(t, 'registrar descanso', 'dia de descanso', 'descanso')) {
      _markToday('R'); return _ok('Descanso registrado ✓');
    }

    // ── Filtros de período ───────────────────────────────────────
    if (_has(t, 'mostrame los gastos del año', 'gastos del año', 'ver gastos del año')) {
      showModule('flujo'); setFeTipo('gastos'); setFePeriodo('anio'); return _ok('Gastos del año ✓');
    }
    if (_has(t, 'mostrame los ingresos del año', 'ingresos del año')) {
      showModule('flujo'); setFeTipo('ingresos'); setFePeriodo('anio'); return _ok('Ingresos del año ✓');
    }
    if (_has(t, 'gastos del mes', 'mostrame los gastos del mes')) {
      showModule('flujo'); setFeTipo('gastos'); setFePeriodo('mes'); return _ok('Gastos del mes ✓');
    }
    if (_has(t, 'ingresos del mes', 'mostrame los ingresos del mes')) {
      showModule('flujo'); setFeTipo('ingresos'); setFePeriodo('mes'); return _ok('Ingresos del mes ✓');
    }

    // ── Eliminar transacción ─────────────────────────────────────
    const delMatch = _n(t).match(/ELIMIN[A-Z]*\s+(.*)/);
    if (delMatch) {
      const hint = delMatch[1];
      return _tryDelete(hint, raw);
    }

    // ── Apariencia ──────────────────────────────────────────────
    if (_has(t, 'modo oscuro', 'tema oscuro', 'dark mode')) {
      if (document.documentElement.getAttribute('data-theme') !== 'dark' && typeof toggleTheme === 'function') toggleTheme();
      return _ok('Modo oscuro ✓');
    }
    if (_has(t, 'modo claro', 'tema claro', 'light mode')) {
      if (document.documentElement.getAttribute('data-theme') !== 'light' && typeof toggleTheme === 'function') toggleTheme();
      return _ok('Modo claro ✓');
    }

    // ── Ayuda ────────────────────────────────────────────────────
    if (_has(t, 'ayuda', 'que puedo decir', 'comandos disponibles', 'help', 'que comandos')) {
      return _showHelp();
    }

    // ── Parser de transacciones ──────────────────────────────────
    const txParsed = _parseTxVoice(t);
    if (txParsed) {
      return _quickTx(txParsed.tipo, txParsed.monto, txParsed.desc, txParsed.fecha);
    }

    // ── Fallback: Gemini AI ──────────────────────────────────────
    const key = (typeof params !== 'undefined' && params.ia) ? params.ia.geminiKey : '';
    if (key) {
      _askGemini(t);
    } else {
      _err('Di "Mi Neto [monto] [descripción]" · Ej: "Mi Neto 50 soles almuerzo"');
    }
  }

  // ── Eliminar transacción por voz ──────────────────────────────────────────
  function _tryDelete(hint, raw) {
    if (typeof transacciones === 'undefined' || !transacciones.length) return _err('No hay transacciones');
    const h = _n(hint);

    // Extract date clues
    const MESES_N = { ENERO:0,FEBRERO:1,MARZO:2,ABRIL:3,MAYO:4,JUNIO:5,JULIO:6,AGOSTO:7,SEPTIEMBRE:8,OCTUBRE:9,NOVIEMBRE:10,DICIEMBRE:11 };
    let targetFecha = null;
    for (const [mn, mi] of Object.entries(MESES_N)) {
      if (h.includes(mn)) {
        const anioM = h.match(/\b(202\d)\b/);
        const anio  = anioM ? parseInt(anioM[1]) : new Date().getFullYear();
        const diaM  = h.match(/\b(\d{1,2})\b/);
        const dia   = diaM ? parseInt(diaM[1]) : 1;
        targetFecha = anio + '-' + String(mi+1).padStart(2,'0') + '-' + String(dia).padStart(2,'0');
        break;
      }
    }
    if (!targetFecha && h.includes('AYER')) {
      const ay = new Date(); ay.setDate(ay.getDate()-1);
      targetFecha = ay.getFullYear() + '-' + String(ay.getMonth()+1).padStart(2,'0') + '-' + String(ay.getDate()).padStart(2,'0');
    }

    // Extract monto
    const montoM = hint.match(/\b(\d{1,6}(?:[.,]\d{1,2})?)\b/);
    const monto  = montoM ? parseFloat(montoM[1].replace(',','.')) : null;

    // Find best match
    let best = -1, bestScore = 0;
    transacciones.forEach((t, i) => {
      let score = 0;
      const d = _n(t.desc || '');
      // Description keyword overlap
      hint.split(/\s+/).forEach(w => { if (w.length > 3 && d.includes(w)) score += 2; });
      if (targetFecha && t.fecha === targetFecha) score += 5;
      if (monto && Math.abs(t.monto - monto) < 0.05) score += 4;
      if (score > bestScore) { bestScore = score; best = i; }
    });

    if (best === -1 || bestScore < 2) return _err('No encontré esa transacción');
    const removed = transacciones.splice(best, 1)[0];
    if (typeof saveAll        === 'function') saveAll();
    if (typeof renderFlujoTab === 'function') renderFlujoTab();
    _showBotBubble('🗑️ Eliminado: S/ ' + removed.monto.toFixed(2) + '\n"' + removed.desc + '" · ' + removed.fecha);
    _ok('Eliminado: ' + removed.desc);
  }

  // ── Parser de transacciones por voz (sin IA) ─────────────────────────────
  function _parseTxVoice(raw) {
    const s = _n(raw);

    if (/\b(FLUJO|INDIVIDUAL|GRAFICOS|CATEGORIAS|PLANILLA|BOLETA|HABERES|VACACIONES|FALTA|MEDICO|SUSPENSION|TELETRABAJO|DESCANSO|ELIMIN)\b/.test(s)) return null;

    const marcasIng = /\b(INGRESO|INGRESOS|COBRE|COBRO|COBRAR|RECIBI|RECIBO|RECIBIR|GANE|GANAR|SUELDO|SALARIO|BONO|GRATIFICACION|GRATI|CTS|DEPOSITO|DEPOSITAR|FACTURE|FACTURAR|FREELANCE|HONORARIO|ENTRADA|DIVIDENDO|ME PAGARON|PAGO RECIBIDO|ENTREGARON)\b/.test(s);
    const marcasGas = /\b(GASTO|GASTE|GASTAR|PAGUE|PAGAR|COMPRE|COMPRAR|EGRESO|SALIDA|COSTO|PAGUE|PAGO|PAGUE)\b/.test(s);

    let tipo;
    if (marcasIng && !marcasGas) {
      tipo = 'ingreso';
    } else if (marcasGas && !marcasIng) {
      tipo = 'gasto';
    } else if (marcasIng && marcasGas) {
      const posIng = s.search(/\b(INGRESO|COBRE|COBRO|RECIBI|GANE|SUELDO|SALARIO|BONO|DEPOSITO|FREELANCE)\b/);
      const posGas = s.search(/\b(GASTO|GASTE|PAGUE|COMPRE|EGRESO)\b/);
      tipo = (posIng !== -1 && posIng <= posGas) ? 'ingreso' : 'gasto';
    } else {
      tipo = 'gasto';
    }

    const monto = _extractMonto(s);
    if (!monto || monto <= 0) return null;

    const fecha = _extractFecha(s);

    let desc = raw.trim();
    desc = desc.replace(/^(agrega|añade|anota|apunta|registra|gasta|gasté|gaste|cobré|cobre|recibí|recibi|puse|pon|ingresa|quito|quité|saco|saqué|marca|suma|sumo|deposita|factura|pague|pago|compre|compré|me\s+prestaron|me\s+entregaron|me\s+pagaron)\s+/i, '');
    desc = desc.replace(/^(un|una)\s+/i, '');
    desc = desc.replace(/^(gasto|ingreso|egreso|entrada|salida)\s+(de\s+)?/i, '');
    desc = desc.replace(/\b(ingreso|ingresos|gasto|gastos|cobré|cobre|cobro|recibí|recibi|gané|gane|deposito|depósito|facture|facturé|entregaron|prestaron|pagaron)\b/gi, ' ');
    desc = desc.replace(/\b\d+([.,]\d+)?\s*(soles?|sol|nuevos?\s+soles?|s\/|pesos?)?\b/gi, '');
    desc = desc.replace(/\b(veinte?|treinta|cuarenta|cincuenta|sesenta|setenta|ochenta|noventa|cien|ciento|doscientos?|trescientos?|cuatrocientos?|quinientos?|seiscientos?|setecientos?|ochocientos?|novecientos?|mil|once|doce|trece|catorce|quince|diecis[ei][ei]s|diecisiete|dieciocho|diecinueve|veintiun[oa]|veintid[oó]s|veintitr[eé]s|veinticuatro|veinticinco|veintis[eé]is|veintisiete|veintiocho|veintinueve|diez|nueve|ocho|siete|seis|cinco|cuatro|tres|dos)\b/gi, '');
    desc = desc.replace(/\b(soles?|sol|nuevos?\s*soles?|s\/)\b/gi, '');
    desc = desc.replace(/\b(de|a|en|para|por|al|el|la|los|las|un|una|categoria|categoría|la|la\s+factura|la\s+cuenta)\b/gi, ' ');
    desc = desc.replace(/\b(hoy|ayer|mañana|manana|esta\s+semana|semana\s+pasada)\b/gi, '');
    desc = desc.replace(/\s{2,}/g, ' ').trim();

    if (!desc || desc.length < 2) desc = raw.replace(/\d+/g, '').trim().substring(0, 30) || 'Gasto';

    return { tipo, monto, desc, fecha };
  }

  function _extractMonto(s) {
    const numMatch = s.match(/\b(\d{1,6}([.,]\d{1,2})?)\b/);
    if (numMatch) return parseFloat(numMatch[1].replace(',', '.'));
    const NUMS = {
      'NOVECIENTOS':900,'OCHOCIENTOS':800,'SETECIENTOS':700,'SEISCIENTOS':600,
      'QUINIENTOS':500,'CUATROCIENTOS':400,'TRESCIENTOS':300,'DOSCIENTOS':200,
      'CIENTO':100,'CIEN':100,
      'NOVENTA':90,'OCHENTA':80,'SETENTA':70,'SESENTA':60,
      'CINCUENTA':50,'CUARENTA':40,'TREINTA':30,
      'VEINTINUEVE':29,'VEINTIOCHO':28,'VEINTISIETE':27,'VEINTISEIS':26,
      'VEINTICINCO':25,'VEINTICUATRO':24,'VEINTITRES':23,'VEINTIDOS':22,
      'VEINTIUNO':21,'VEINTE':20,
      'DIECINUEVE':19,'DIECIOCHO':18,'DIECISIETE':17,'DIECISEIS':16,
      'QUINCE':15,'CATORCE':14,'TRECE':13,'DOCE':12,'ONCE':11,'DIEZ':10,
      'NUEVE':9,'OCHO':8,'SIETE':7,'SEIS':6,'CINCO':5,'CUATRO':4,
      'TRES':3,'DOS':2,
    };
    let total = 0;
    const hasMil = s.includes('MIL');
    for (const [word, val] of Object.entries(NUMS)) {
      if (s.includes(word)) total += hasMil ? val * 1000 : val;
    }
    return total > 0 ? total : null;
  }

  function _extractFecha(s) {
    const hoy  = new Date();
    const ayer = new Date(hoy); ayer.setDate(hoy.getDate() - 1);
    const fd   = d => d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
    if (s.includes('AYER')) return fd(ayer);
    if (s.includes('MANANA') || s.includes('MAÑANA')) {
      const m = new Date(hoy); m.setDate(hoy.getDate() + 1); return fd(m);
    }
    return fd(hoy);
  }

  function _quickTx(tipo, monto, desc, fecha) {
    if (typeof categorias === 'undefined') return _err('App no inicializada');
    const cats = tipo === 'gasto' ? categorias.gastos : categorias.ingresos;
    const cat  = _matchCat(desc, cats, tipo);
    const tx   = {
      id: (typeof genId === 'function') ? genId() : Date.now().toString(36),
      tipo, catId: cat.id,
      monto: parseFloat(monto.toFixed(2)),
      desc, fecha,
    };
    transacciones.push(tx);
    if (typeof saveAll        === 'function') saveAll();
    if (typeof showModule     === 'function') showModule('flujo');
    if (typeof setFeSection   === 'function') setFeSection('inicio');
    if (typeof renderFlujoTab === 'function') renderFlujoTab();
    const icon = tipo === 'gasto' ? '💸' : '💰';
    _showBotBubble(icon + ' S/ ' + monto.toFixed(2) + '\n' + cat.nombre + ' — ' + desc);
    _ok(icon + ' S/ ' + monto.toFixed(2) + ' — ' + desc + ' ✓');
  }

  // ── Gemini AI ─────────────────────────────────────────────────────────────
  async function _askGemini(rawText) {
    const key = (typeof params !== 'undefined' && params.ia) ? params.ia.geminiKey : '';
    if (!key) return;

    _showPanel('🤖 Consultando IA…', 'interim');

    const hoy  = new Date();
    const ayer = new Date(hoy); ayer.setDate(hoy.getDate() - 1);
    const fd   = d => d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
    const nombrePerfil = (typeof perfil !== 'undefined' && perfil.nombre) ? perfil.nombre : 'Usuario';

    const prompt = `Eres el asistente de MiNeto, app peruana de haberes y finanzas.
Hoy: ${fd(hoy)}. Ayer: ${fd(ayer)}. Usuario: ${nombrePerfil}.

Responde SOLO con JSON válido (sin markdown):
{"action":"...","params":{...},"respuesta":"texto corto"}

Acciones:
- registro_gasto: {monto(número),descripcion,fecha:"${fd(hoy)}"|"${fd(ayer)}"|"YYYY-MM-DD"}
- registro_ingreso: {monto,descripcion,fecha}
- navegar: {destino:"flujo"|"individual"|"graficos"|"categorias"|"cuentas"|"ajustes"|"params"}
- ver_periodo: {periodo:"dia"|"semana"|"mes"|"anio",anio?:número,mes?:0-11}
- calcular: {}
- modificar_movilidad: {monto}
- respuesta_solo: {}
- sin_accion: {}

Meses: enero=0,febrero=1,marzo=2,abril=3,mayo=4,junio=5,julio=6,agosto=7,septiembre=8,octubre=9,noviembre=10,diciembre=11.

Usuario dice: "${rawText}"`;

    try {
      const res = await fetch(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=' + key,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.1, maxOutputTokens: 300 }
          })
        }
      );
      if (!res.ok) { const e = await res.json().catch(() => ({})); _err('API Gemini: ' + (e.error?.message || res.status)); return; }
      const data = await res.json();
      let txt = (data.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
      const m = txt.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (m) txt = m[1].trim();
      let parsed;
      try { parsed = JSON.parse(txt); } catch(e) { _err('Respuesta IA inválida'); return; }
      _handleGeminiAction(parsed.action || 'sin_accion', parsed.params || {}, parsed.respuesta || '…');
    } catch(e) {
      _err('Error de red — verifica tu conexión');
    }
  }

  function _handleGeminiAction(action, p, respuesta) {
    _showBotBubble(respuesta);
    _showPanel('🤖 ' + respuesta, 'ok');

    switch (action) {
      case 'registro_gasto':
      case 'registro_ingreso': {
        if (!p.monto || parseFloat(p.monto) <= 0) { _err('Monto inválido'); return; }
        const tipo = action === 'registro_gasto' ? 'gasto' : 'ingreso';
        const cats = tipo === 'gasto' ? categorias.gastos : categorias.ingresos;
        const cat  = _matchCat(p.descripcion || '', cats, tipo);
        const tx   = {
          id: (typeof genId === 'function') ? genId() : Date.now().toString(36),
          tipo, catId: cat.id,
          monto: parseFloat(parseFloat(p.monto).toFixed(2)),
          desc: p.descripcion || '', fecha: _resolveFecha(p.fecha),
        };
        transacciones.push(tx);
        if (typeof saveAll        === 'function') saveAll();
        if (typeof showModule     === 'function') showModule('flujo');
        if (typeof setFeSection   === 'function') setFeSection('inicio');
        if (typeof renderFlujoTab === 'function') renderFlujoTab();
        break;
      }
      case 'navegar': {
        const dst = p.destino || 'flujo';
        if (['graficos','categorias','cuentas','ajustes','inicio'].includes(dst)) {
          if (typeof showModule   === 'function') showModule('flujo');
          if (typeof setFeSection === 'function') setFeSection(dst);
        } else if (dst === 'individual') {
          if (typeof showModule === 'function') showModule('individual');
        } else if (dst === 'params') {
          if (typeof showModule === 'function') showModule('params');
        }
        break;
      }
      case 'ver_periodo': {
        if (typeof showModule   === 'function') showModule('flujo');
        if (typeof setFeSection === 'function') setFeSection('inicio');
        if (p.periodo && typeof setFePeriodo === 'function') {
          setFePeriodo(p.periodo);
          if (p.periodo === 'mes' && p.mes !== undefined) {
            const now = new Date();
            const off = (now.getFullYear() - (p.anio || now.getFullYear())) * 12 + (now.getMonth() - p.mes);
            if (typeof feState !== 'undefined') feState.offset = Math.max(0, off);
            if (typeof renderFlujoTab === 'function') renderFlujoTab();
          }
        }
        break;
      }
      case 'calcular':
        if (typeof showModule === 'function') showModule('individual');
        if (typeof recalcular === 'function') recalcular();
        break;
      case 'modificar_movilidad':
        if (p.monto !== undefined) {
          const inp = document.getElementById('ind-movil');
          if (inp) { inp.value = p.monto; if (typeof recalcular === 'function') recalcular(); }
        }
        break;
      default: break;
    }
  }

  function _resolveFecha(raw) {
    const hoy  = new Date();
    const ayer = new Date(hoy); ayer.setDate(hoy.getDate() - 1);
    const fd   = d => d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
    if (!raw || raw === 'hoy') return fd(hoy);
    if (raw === 'ayer')        return fd(ayer);
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    return fd(hoy);
  }

  function _matchCat(desc, cats, tipo) {
    if (!desc || !cats || cats.length === 0) return cats?.[0] || { id: 'otros', nombre: 'Otros' };
    const d = _n(desc);
    const kw = {
      // Gastos — alimentación
      'ALMUERZO':'g-alim','COMIDA':'g-alim','DESAYUNO':'g-alim','CENA':'g-alim','LUNCH':'g-alim','MENU':'g-alim',
      'GOLOSINA':'g-cafe','SNACK':'g-cafe','CAFE':'g-cafe','CAFETERIA':'g-cafe','BEBIDA':'g-cafe',
      // Transporte
      'TAXI':'g-taxi','UBER':'g-taxi','INDRIVE':'g-taxi','BEAT':'g-taxi','CABIFY':'g-taxi',
      'BUS':'g-trans','COMBI':'g-trans','PASAJE':'g-trans','METRO DE LIMA':'g-trans','LINEA':'g-trans',
      // Supermercado
      'SUPERMERCADO':'g-super','WONG':'g-super','TOTTUS':'g-super','PLAZA VEA':'g-super','VIVANDA':'g-super',
      // Casa
      'ALQUILER':'g-casa','RENTA':'g-casa',
      // Salud
      'FARMACIA':'g-salud','MEDICO':'g-salud','MEDICINA':'g-salud','CLINICA':'g-salud','BOTICA':'g-salud',
      'PASTILLA':'g-salud','PASTILLAS':'g-salud','DOCTOR':'g-salud','HOSPITAL':'g-salud',
      // Suscripciones
      'NETFLIX':'g-subs','SPOTIFY':'g-subs','YOUTUBE':'g-subs','DISNEY':'g-subs','HBO':'g-subs',
      'SUSCRIPCION':'g-subs','STREAMING':'g-subs',
      // Servicios
      'LUZ':'g-serv','AGUA':'g-serv','GAS':'g-serv','RECIBO':'g-serv','ELECTRIC':'g-serv','PENSION DE LUZ':'g-serv',
      // Internet / Telefonía
      'INTERNET':'g-inter','CABLE':'g-inter',
      'CLARO':'g-telco','MOVISTAR':'g-telco','ENTEL':'g-telco','BITEL':'g-telco',
      // Entretenimiento
      'CINE':'g-entret','CINEMARK':'g-entret','KARAOKE':'g-entret','ENTRET':'g-entret',
      // Ropa
      'ROPA':'g-ropa','ZAPATILLA':'g-ropa','CAMISA':'g-ropa','PANTALON':'g-ropa','CASACA':'g-ropa','ZAPATO':'g-ropa','ROPA NUEVA':'g-ropa',
      // Aseo
      'BARBERIA':'g-aseo','PELUQUERIA':'g-aseo','ASEO':'g-aseo',
      // Educación
      'EDUCACION':'g-educ','COLEGIO':'g-educ','PENSION':'g-educ','UNIVERSIDAD':'g-educ','LIBRO':'g-educ','CURSO':'g-educ',
      // Ingresos
      'BONO':'i-extra','EXTRA':'i-extra','HORA EXTRA':'i-extra','TRABAJO EXTRA':'i-extra','TRABAJOS EXTRA':'i-extra',
      'SUELDO':'i-sueldo','SALARIO':'i-sueldo',
      'CTS':'i-cts','GRATIFICACION':'i-grati','GRATI':'i-grati',
      'FREELANCE':'i-freelan','PROYECTO':'i-freelan','HONORARIO':'i-freelan',
      'ALOJAMIENTO':'i-aloj',
      'PRESTAMO':'i-otros','PRESTARON':'i-otros','ME PRESTARON':'i-otros',
    };
    for (const [k, catId] of Object.entries(kw)) {
      if (d.includes(k)) {
        const cat = cats.find(c => c.id === catId);
        if (cat) return cat;
      }
    }
    return cats[cats.length - 1] || cats[0];
  }

  // ── Marcar hoy en calendario ──────────────────────────────────────────────
  function _markToday(mark) {
    if (typeof calState === 'undefined') return;
    const hoy = new Date();
    if (typeof showModule === 'function') showModule('individual');
    if (calState.anio !== hoy.getFullYear() || calState.mes !== hoy.getMonth()) {
      calState.anio = hoy.getFullYear(); calState.mes = hoy.getMonth();
      if (typeof buildCal === 'function') buildCal();
    }
    calState.markActivo = mark;
    if (typeof paintDay   === 'function') paintDay(hoy.getDate());
    if (typeof recalcular === 'function') recalcular();
  }

  // ── UI helpers ────────────────────────────────────────────────────────────
  function _updateBtn(on) {
    const btn = document.getElementById('voz-btn');
    const mtpBtn = document.getElementById('mtp-voz-btn');
    if (btn) btn.classList.toggle('voz-listening', on);
    if (mtpBtn) mtpBtn.classList.toggle('mtp-voz-listening', on);
  }

  function _showPanel(text, state) {
    let p = document.getElementById('voz-panel');
    if (!p) {
      p = document.createElement('div');
      p.id = 'voz-panel';
      p.className = 'voz-panel';
      document.body.appendChild(p);
    }
    const icon = { interim:'🎤', final:'💬', ok:'✅', err:'❌' }[state] || '🎤';
    p.innerHTML = `<div class="voz-icon">${icon}</div><div class="voz-text">${text.replace(/</g,'&lt;')}</div>`;
    p.className = 'voz-panel voz-' + state;
    p.style.display = 'flex';
    clearTimeout(_showPanel._t);
    if (state === 'ok' || state === 'err') _showPanel._t = setTimeout(_hidePanel, 4000);
  }

  function _hidePanel() {
    const p = document.getElementById('voz-panel');
    if (p) p.style.display = 'none';
  }

  function _showBotBubble(text) {
    const bubble = document.getElementById('voz-bot-bubble');
    const txtEl  = document.getElementById('voz-bot-bubble-txt');
    if (!bubble || !txtEl) return;
    txtEl.textContent = text;
    bubble.classList.add('show');
    clearTimeout(_showBotBubble._t);
    _showBotBubble._t = setTimeout(() => bubble.classList.remove('show'), 8000);
  }

  function _ok(msg)  { _showPanel(msg, 'ok');  showToast('🎤 ' + msg); }
  function _err(msg) { _showPanel(msg, 'err'); showToast('⚠️ ' + msg); }

  function _showHelp() {
    const lines = [
      'Ejemplos — di "Mi Neto ..."',
      '• "50 soles almuerzo" → gasto',
      '• "gasté 25 taxi ayer" → gasto ayer',
      '• "cobré 500 freelance" → ingreso',
      '• "pagué la luz 90 soles" → servicio',
      '• "recibí 800 de CTS" → ingreso CTS',
      '• "elimina netflix del 24 de marzo" → borra',
      '• "ver gráficos" / "ver gastos del mes"',
      '• "modo oscuro" / "calcular planilla"',
    ];
    _showBotBubble(lines.join('\n'));
    _ok('Comandos disponibles — ver burbuja');
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (document.readyState === 'complete') preinit();
  });

  return { toggle: () => {}, preinit, stop };

})();
