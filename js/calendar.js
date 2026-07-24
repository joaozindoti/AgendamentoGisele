/* ════════════════════════════════════════════════════════════════
   Horário de funcionamento — dados reais
   0=Dom, 1=Seg, 2=Ter, 3=Qua, 4=Qui, 5=Sex, 6=Sáb
   ════════════════════════════════════════════════════════════════ */

var BUSINESS_HOURS = {
  1: { start: '14:00', end: '19:00' },  // Segunda (abre após o almoço)
  2: { start: '09:30', end: '20:00' },  // Terça
  3: { start: '09:30', end: '20:00' },  // Quarta
  4: { start: '09:30', end: '20:00' },  // Quinta
  5: { start: '09:30', end: '20:00' },  // Sexta
  6: { start: '09:30', end: '18:00' }   // Sábado
  // 0 (domingo): fechado
};

/* Almoço — válido de terça a sábado (segunda já abre às 14h) */
var LUNCH_BREAK = {
  start: '12:00',
  end: '14:00', // corrigido de 13:40 para 14:00
  days: [2, 3, 4, 5, 6]
};

var SLOT_INTERVAL = 30; // minutos entre inícios de horário

function toMin(str) {
  var p = str.split(':');
  return parseInt(p[0], 10) * 60 + parseInt(p[1], 10);
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

/* Janelas de atendimento do dia, já pulando completamente o almoço.
   Segunda: janela única 14:00–19:00 (sem bloqueio de almoço).
   Terça a sábado: manhã até 12:00, retorno às 14:00.               */
function getDayWindows(weekday) {
  var hours = BUSINESS_HOURS[weekday];
  if (!hours) return []; // domingo: fechado

  var open = toMin(hours.start);
  var close = toMin(hours.end);

  if (LUNCH_BREAK.days.indexOf(weekday) === -1) {
    return [{ open: open, close: close }];
  }

  return [
    { open: open,                    close: toMin(LUNCH_BREAK.start) },
    { open: toMin(LUNCH_BREAK.end),  close: close                    }
  ];
}

/* Gera os horários do dia: o atendimento completo (duração total dos
   serviços) precisa caber dentro da janela — nunca invade o almoço
   nem passa do fechamento.                                          */
function generateSlots(y, mo, d, serviceDuration) {
  var weekday = new Date(y, mo, d).getDay();
  var windows = getDayWindows(weekday);
  if (!windows.length) return [];

  var now = new Date();
  var nowMin = now.getHours() * 60 + now.getMinutes();
  var today = isToday(y, mo, d);
  var slots = [];

  windows.forEach(function (w) {
    var cur = w.open;
    while (cur + serviceDuration <= w.close) {
      slots.push({
        time: pad2(Math.floor(cur / 60)) + ':' + pad2(cur % 60),
        minutes: cur,
        available: !(today && cur <= nowMin)
      });
      cur += SLOT_INTERVAL;
    }
  });

  return slots;
}

/* Busca os horários livres de um dia específico no webhook real de
   disponibilidade (DISPONIBILIDADE_API, em js/utils.js). Usado só no
   clique de um dia já selecionado no calendário — getAvailableDays()
   acima continua 100% local, sem rede, para decidir quais dias ficam
   clicáveis no mês.
   mes: 1-12 (calendário humano, não o índice 0-11 do Date do JS). */
async function fetchHorariosDisponiveis(ano, mes, dia, duracaoMinutos) {
  var dataStr = ano + '-' + pad2(mes) + '-' + pad2(dia);
  var url = DISPONIBILIDADE_API + '?data=' + dataStr + '&duracao=' + duracaoMinutos;
  var controller = new AbortController();
  var timeoutId = setTimeout(function () { controller.abort(); }, 8000);
  try {
    var res = await fetch(url, { signal: controller.signal, cache: 'no-store' });
    clearTimeout(timeoutId);
    if (!res.ok) throw new Error('Resposta não OK');
    var data = await res.json();
    return data.horarios || [];
  } catch (e) {
    clearTimeout(timeoutId);
    throw e;
  }
}

function getAvailableDays(y, mo, serviceDuration) {
  var total = new Date(y, mo + 1, 0).getDate();
  var result = [];
  for (var d = 1; d <= total; d++) {
    if (isPast(y, mo, d) || isSunday(y, mo, d)) continue;
    if (generateSlots(y, mo, d, serviceDuration).some(function (s) { return s.available; })) {
      result.push(d);
    }
  }
  return result;
}
