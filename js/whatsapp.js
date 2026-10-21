/* Mensagem de agendamento → WhatsApp
   O número vem de WHATSAPP_NUMBER (js/utils.js). Enquanto for
   placeholder, abre o WhatsApp só com a mensagem (sem destinatário). */

/* Quem atende: serviços da Lara têm pro: 'Lara'; o resto é da Gisele.
   O Agente do n8n lê as linhas "Nome:" e "Profissional:" (out/2026). */
function profissionalDe(services) {
  var lara = services.some(function (s) { return s.pro === 'Lara'; });
  var gisele = services.some(function (s) { return s.pro !== 'Lara'; });
  return lara && gisele ? 'Gisele e Lara' : lara ? 'Lara' : 'Gisele';
}

function buildMessage(services, y, mo, d, time, nome, whats) {
  var lines = services.map(function (s) {
    return '- ' + s.name + ' — ' + fmtPrice(s.price);
  }).join('\n');

  // Se algum serviço está sem preço confirmado, o total fica "A confirmar"
  var total = Store.hasUnpriced(services)
    ? 'A confirmar'
    : fmtCurrency(Store.totalPrice(services));

  return 'Olá! Gostaria de agendar no Studio Gisele Lima ✨\n\n'
    + '👤 Nome: ' + nome + '\n'
    + '📱 WhatsApp: ' + whats + '\n'
    + '💆 Profissional: ' + profissionalDe(services) + '\n\n'
    + lines
    + '\n\n📅 ' + fmtDateFull(y, mo, d)
    + '\n⏰ ' + time
    + '\n💰 Total: ' + total
    + '\n⏱️ Duração: ' + Store.totalDuration(services) + ' min'
    + '\n\nPode confirmar?';
}

function openWhatsApp(services, y, mo, d, time, nome, whats) {
  var msg = encodeURIComponent(buildMessage(services, y, mo, d, time, nome, whats));
  var hasNumber = /^\d{10,15}$/.test(WHATSAPP_NUMBER);
  var url = hasNumber
    ? 'https://wa.me/' + WHATSAPP_NUMBER + '?text=' + msg
    : 'https://api.whatsapp.com/send?text=' + msg; // placeholder: sem destinatário
  // location em vez de window.open: o clique agora passa por uma conferência
  // assíncrona do horário, e o navegador bloqueia pop-up fora do toque.
  window.location.href = url;
}
