/* ════════════════════════════════════════════════════════════════
   ⚠️⚠️⚠️  DADOS PENDENTES — ATUALIZAR AQUI ASSIM QUE CHEGAREM  ⚠️⚠️⚠️
   ════════════════════════════════════════════════════════════════

   1) NÚMERO DO WHATSAPP — Número real do WhatsApp do agente.
      Formato: 55 + DDD + número, só dígitos. Ex.: '5599988887777'     */
var WHATSAPP_NUMBER = '5599984642562';

/* 2) ENDEREÇO — cliente está mudando de local; definitivo pendente. */
var ADDRESS_PLACEHOLDER = 'Endereço em atualização — consulte pelo WhatsApp';

/* 3) LINK DO GOOGLE MAPS — atualizar a query junto com o item 2,
      assim que a cliente confirmar a nova localização.             */
var MAPS_URL_PLACEHOLDER = 'https://www.google.com/maps/search/?api=1&query=SUBSTITUIR_QUANDO_TIVER_ENDERECO';

/* 4) WEBHOOK DE PRÉ-CADASTRO (n8n) */
var PRECADASTRO_WEBHOOK_URL = 'https://179.197.229.103.nip.io/webhook/precadastro';

/* ════════════════════════════════════════════════════════════════ */

/* Webhook de disponibilidade — retorna os horários livres de um dia
   específico (usado em horario.html, ver js/calendar.js). */
var DISPONIBILIDADE_API = 'https://179.197.229.103.nip.io/webhook/disponibilidade';

/* Botão "Ver no mapa" da home */
function openMaps() {
  window.open(MAPS_URL_PLACEHOLDER, '_blank');
}

/* ── Formatação ── */

function fmtCurrency(val) {
  return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/* Preço pode ser null (serviço ainda sem valor confirmado) → "Consulte o valor" */
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

/* ── Pré-cadastro (aniversário) — envio para o futuro webhook n8n ──

   O percentual do desconto (30%) não aparece em nenhum texto visível do
   site — só é revelado pela mensagem automática que o agente envia no
   WhatsApp da cliente no mês do aniversário. Esta anotação é só para
   referência de quem for montar o fluxo do n8n.

   Estrutura do JSON enviado ao webhook n8n:
   {
     nome: "Maria Silva",
     whatsapp: "5599999999999",
     endereco: "Rua Exemplo, 123 - Bairro - Cidade/UF",
     dataNascimento: "1995-03-20",
     consentimento: true,
     dataCadastro: "2026-07-21T14:32:00.000Z"
   }

   Espera-se que o n8n escreva uma linha correspondente em uma planilha
   Google Sheets com as colunas:
   Nome | WhatsApp | Endereço | Data de Nascimento | Data de Cadastro   */

async function enviarPreCadastro(dados) {
  // dados = { nome, whatsapp, endereco, dataNascimento, consentimento: true }
  try {
    var response = await fetch(PRECADASTRO_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({}, dados, {
        dataCadastro: new Date().toISOString()
      }))
    });
    if (!response.ok) throw new Error('Falha no envio');
    return true;
  } catch (error) {
    console.warn('Webhook de pré-cadastro ainda não configurado:', error);
    return false;
  }
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
  initPlaceholders();
  initOpenStatus();
});
