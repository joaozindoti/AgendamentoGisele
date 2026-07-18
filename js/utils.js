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

/* ════════════════════════════════════════════════════════════════ */

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

document.addEventListener('DOMContentLoaded', function () {
  initReveal();
  initPlaceholders();
});
