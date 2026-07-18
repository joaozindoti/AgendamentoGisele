/* ════════════════════════════════════════════════════════════════
   ⚠️⚠️⚠️  DADOS PENDENTES — ATUALIZAR AQUI ASSIM QUE CHEGAREM  ⚠️⚠️⚠️
   ════════════════════════════════════════════════════════════════

   1) NÚMERO DO WHATSAPP — pendente até a criação formal do agente.
      Formato: 55 + DDD + número, só dígitos. Ex.: '5599988887777'
      Enquanto for placeholder, o site abre o WhatsApp com a mensagem
      pronta, mas sem destinatário (a cliente escolhe o contato).     */
var WHATSAPP_NUMBER = 'SUBSTITUIR_QUANDO_TIVER_O_NUMERO';

/* 2) ENDEREÇO — cliente está mudando de local; definitivo pendente. */
var ADDRESS_PLACEHOLDER = 'Endereço em atualização — consulte pelo WhatsApp';

/* 3) LINK DO GOOGLE MAPS — atualizar a query junto com o item 2,
      assim que a cliente confirmar a nova localização.             */
var MAPS_URL_PLACEHOLDER = 'https://www.google.com/maps/search/?api=1&query=SUBSTITUIR_QUANDO_TIVER_ENDERECO';

/* ════════════════════════════════════════════════════════════════ */

/* Botão "Ver no mapa" da home */
function openMaps() {
  window.open(MAPS_URL_PLACEHOLDER, '_blank');
}

/* ── Formatação ── */

function fmtCurrency(val) {
  return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/* Preço pode ser null (ex.: Epilação completa) → "Consulte o valor" */
function fmtPrice(price) {
  return price === null ? 'Consulte o valor' : fmtCurrency(price);
}

function fmtDuration(min) {
  if (min < 60) return min + 'min';
  var h = Math.floor(min / 60);
  var m = min % 60;
  return m > 0 ? h + 'h ' + m + 'min' : h + 'h';
}

function fmtDateFull(y, mo, d) {
  return new Date(y, mo, d).toLocaleDateString('pt-BR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });
}

function fmtMonthYear(y, mo) {
  return new Date(y, mo, 1).toLocaleDateString('pt-BR', {
    month: 'long', year: 'numeric'
  });
}

/* ── Datas ── */

function isPast(y, mo, d) {
  var t = new Date(); t.setHours(0, 0, 0, 0);
  return new Date(y, mo, d) < t;
}

function isToday(y, mo, d) {
  var t = new Date();
  return y === t.getFullYear() && mo === t.getMonth() && d === t.getDate();
}

function isSunday(y, mo, d) {
  return new Date(y, mo, d).getDay() === 0;
}

/* ── Reveal ao rolar (fade + slight scale nas fotos) ── */

function initReveal() {
  var els = document.querySelectorAll('.reveal, .reveal-photo');
  if (!els.length) return;
  if (!('IntersectionObserver' in window)) {
    els.forEach(function (el) { el.classList.add('in-view'); });
    return;
  }
  var obs = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('in-view');
        obs.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
  els.forEach(function (el) { obs.observe(el); });
}

/* ── Injeta os placeholders nos elementos [data-address] ── */

function initPlaceholders() {
  document.querySelectorAll('[data-address]').forEach(function (el) {
    el.textContent = ADDRESS_PLACEHOLDER;
  });
}

/* ── Status "Aberto agora" na home ──
   Usa BUSINESS_HOURS / LUNCH_BREAK via getDayWindows() de js/calendar.js —
   a página precisa carregar calendar.js antes deste arquivo. Nas páginas
   sem calendar.js (ou sem o elemento), a função simplesmente não faz nada. */

var WEEKDAY_SHORT = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

function fmtHourMin(min) {
  var h = Math.floor(min / 60);
  var m = min % 60;
  return m > 0 ? h + 'h' + String(m).padStart(2, '0') : h + 'h';
}

function initOpenStatus() {
  var el = document.querySelector('[data-open-status]');
  if (!el || typeof getDayWindows !== 'function') return;

  var now = new Date();
  var nowMin = now.getHours() * 60 + now.getMinutes();
  var windows = getDayWindows(now.getDay());
  var open = false;
  var text = '';

  for (var i = 0; i < windows.length; i++) {
    var w = windows[i];
    if (nowMin >= w.open && nowMin < w.close) {
      open = true;
      text = 'Aberto agora · até ' + fmtHourMin(w.close);
      break;
    }
    if (nowMin < w.open) {
      text = 'Fechado no momento · abre hoje às ' + fmtHourMin(w.open);
      break;
    }
  }

  /* Já passou do último horário de hoje (ou é domingo): acha o próximo dia */
  if (!open && !text) {
    for (var d = 1; d <= 7; d++) {
      var wd = (now.getDay() + d) % 7;
      var next = getDayWindows(wd);
      if (next.length) {
        var dia = d === 1 ? 'amanhã' : WEEKDAY_SHORT[wd];
        text = 'Fechado no momento · abre ' + dia + ' às ' + fmtHourMin(next[0].open);
        break;
      }
    }
  }

  el.classList.toggle('closed', !open);
  el.querySelector('.open-status__text').textContent = text;
  el.hidden = false;
}

document.addEventListener('DOMContentLoaded', function () {
  initReveal();
  initPlaceholders();
  initOpenStatus();
});
