# Instruções — Node "Code" do n8n (endpoint de disponibilidade)

Este arquivo contém a lógica que precisa estar dentro do node **Code**
(JavaScript) do workflow n8n que atende
`https://179.197.229.103.nip.io/webhook/disponibilidade`.

## Onde isso se encaixa no workflow

1. **Webhook** recebe `GET ...?data=YYYY-MM-DD&duracao=<minutos>`.
2. **Google Calendar (Get Many / List events)** busca os eventos já
   agendados para o dia pedido.
3. **Este node Code** recebe os eventos do node anterior (via
   `$input.all()`), calcula os horários livres e devolve
   `{"horarios": ["09:30", "09:45", ...]}` — exatamente esse formato,
   sem alterar nomes de campos.
4. **Respond to Webhook** devolve o JSON produzido por este node.

Ajuste os nomes dos nodes/expressões (`$('Webhook').item...`,
`$json.query.data`, etc.) conforme os nomes reais no seu workflow —
o código abaixo assume que a query string chega em
`$('Webhook').item.json.query`.

## Suposição sobre o formato dos eventos do Google Calendar

O node **Google Calendar** do n8n retorna, por item, algo como:

```json
{
  "start": { "dateTime": "2026-08-22T10:00:00-03:00" },
  "end":   { "dateTime": "2026-08-22T10:45:00-03:00" }
}
```

(eventos de dia inteiro viriam com `start.date` / `end.date` em vez de
`dateTime` — não tratados aqui porque a agenda do studio não usa esse
tipo de evento; se isso mudar, será preciso ajustar o código abaixo).

O código lê `start.dateTime` e `end.dateTime` em ISO 8601 com offset e
usa apenas a hora local do dia (o offset já vem embutido na string, o
`Date` do JS resolve isso sozinho).

## Código para colar no node Code

```javascript
/* ════════════════════════════════════════════════════════════════
   ATENÇÃO — CONSTANTES DUPLICADAS
   Estas constantes (BUSINESS_HOURS, LUNCH_BREAK, SLOT_INTERVAL)
   também existem em js/calendar.js no site (studio-gisele-lima).
   Qualquer mudança aqui precisa ser replicada lá, e vice-versa,
   senão o site mostra um dia como disponível e este endpoint
   devolve uma lista diferente (ou vazia) para o mesmo dia.
   ════════════════════════════════════════════════════════════════ */

// 0=Dom, 1=Seg, 2=Ter, 3=Qua, 4=Qui, 5=Sex, 6=Sáb
const BUSINESS_HOURS = {
  1: { start: '14:00', end: '19:00' }, // Segunda (abre após o almoço)
  2: { start: '09:30', end: '20:00' }, // Terça
  3: { start: '09:30', end: '20:00' }, // Quarta
  4: { start: '09:30', end: '20:00' }, // Quinta
  5: { start: '09:30', end: '20:00' }, // Sexta
  6: { start: '09:30', end: '18:00' }  // Sábado
  // 0 (domingo): fechado
};

// Almoço — válido de terça a sábado (segunda já abre às 14h, sem bloqueio)
const LUNCH_BREAK = {
  start: '12:30',
  end: '14:00',
  days: [2, 3, 4, 5, 6]
};

const SLOT_INTERVAL = 15; // minutos entre inícios de horário

function toMin(str) {
  const [h, m] = str.split(':');
  return parseInt(h, 10) * 60 + parseInt(m, 10);
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

/* Janelas de atendimento do dia, já pulando completamente o almoço.
   Segunda: janela única (sem bloqueio de almoço).
   Terça a sábado: manhã até o início do almoço, retorno no fim do almoço. */
function getDayWindows(weekday) {
  const hours = BUSINESS_HOURS[weekday];
  if (!hours) return []; // domingo: fechado

  const open = toMin(hours.start);
  const close = toMin(hours.end);

  if (LUNCH_BREAK.days.indexOf(weekday) === -1) {
    return [{ open, close }];
  }

  return [
    { open, close: toMin(LUNCH_BREAK.start) },
    { open: toMin(LUNCH_BREAK.end), close }
  ];
}

/* Converte start.dateTime / end.dateTime (ISO com offset) de um
   evento do Google Calendar para minutos desde 00:00 NO DIA PEDIDO.
   Assume que o evento inteiro ocorre dentro do mesmo dia local
   (agenda do studio não tem eventos que atravessam a meia-noite). */
function eventToMinutesRange(ev, baseDate) {
  const start = new Date(ev.start.dateTime);
  const end = new Date(ev.end.dateTime);
  const startMin = start.getHours() * 60 + start.getMinutes();
  const endMin = end.getHours() * 60 + end.getMinutes();
  return { start: startMin, end: endMin };
}

/* Verifica se o intervalo [slotStart, slotEnd) sobrepõe QUALQUER
   evento já agendado. Sobreposição de intervalos: dois intervalos
   [a,b) e [c,d) se sobrepõem se a < d && c < b. */
function overlapsAnyEvent(slotStart, slotEnd, busyRanges) {
  return busyRanges.some(function (b) {
    return slotStart < b.end && b.start < slotEnd;
  });
}

// ── Entrada ──────────────────────────────────────────────────────
// Ajuste conforme os nomes reais dos nodes no seu workflow.
const query = $('Webhook').item.json.query; // { data: 'YYYY-MM-DD', duracao: '30' }
const dataStr = query.data;
const duracaoMinutos = parseInt(query.duracao, 10);

const [anoStr, mesStr, diaStr] = dataStr.split('-');
const ano = parseInt(anoStr, 10);
const mes = parseInt(mesStr, 10); // 1-12
const dia = parseInt(diaStr, 10);

// new Date(y, mo, d) usa mo 0-11, então mes-1
const baseDate = new Date(ano, mes - 1, dia);
const weekday = baseDate.getDay();

// Eventos do Google Calendar vindos do node anterior
const events = $input.all().map(function (item) { return item.json; });
const busyRanges = events
  .filter(function (ev) { return ev.start && ev.start.dateTime && ev.end && ev.end.dateTime; })
  .map(function (ev) { return eventToMinutesRange(ev, baseDate); });

// ── Geração dos horários ─────────────────────────────────────────
const windows = getDayWindows(weekday);

const now = new Date();
const isToday =
  now.getFullYear() === ano &&
  now.getMonth() === mes - 1 &&
  now.getDate() === dia;
const nowMin = now.getHours() * 60 + now.getMinutes();

const horarios = [];

windows.forEach(function (w) {
  let cur = w.open;
  while (cur + duracaoMinutos <= w.close) {
    const slotEnd = cur + duracaoMinutos;

    const passou = isToday && cur <= nowMin;
    const ocupado = overlapsAnyEvent(cur, slotEnd, busyRanges);

    if (!passou && !ocupado) {
      horarios.push(pad2(Math.floor(cur / 60)) + ':' + pad2(cur % 60));
    }

    cur += SLOT_INTERVAL;
  }
});

return [{ json: { horarios } }];
```

## Casos de verificação (rode manualmente após colar no n8n)

Sem eventos agendados, para as constantes acima:

1. Sábado, duração 30 → `09:30` a `12:00` e `14:00` a `17:30`, de 15 em 15 min.
2. Sábado, duração 45 → último da manhã `11:45`, último da tarde `17:15`.
3. Terça, duração 15 → último da manhã `12:15`, último da tarde `19:45`.
4. Segunda, duração 60 → `14:00` a `18:00`, sem bloqueio de almoço.
5. Domingo → lista vazia (`{"horarios": []}`).

Com eventos agendados, teste também que um horário cujo intervalo
completo (`início → início+duração`) sobrepõe qualquer evento
(mesmo que o horário de início esteja livre) é removido da lista.
