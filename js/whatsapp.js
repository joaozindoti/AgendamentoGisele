/* Mensagem de agendamento → WhatsApp
   O número vem de WHATSAPP_NUMBER (js/utils.js). Enquanto for
   placeholder, abre o WhatsApp só com a mensagem (sem destinatário). */

function buildMessage(services, y, mo, d, time) {
  var lines = services.map(function (s) {
    return '- ' + s.name + ' — ' + fmtPrice(s.price);
  }).join('\n');

  // Se algum serviço está sem preço confirmado, o total fica "A confirmar"
  var total = Store.hasUnpriced(services)
    ? 'A confirmar'
    : fmtCurrency(Store.totalPrice(services));

  return 'Olá! Gostaria de agendar no Studio Gisele Lima ✨\n\n'
    + lines
    + '\n\n📅 ' + fmtDateFull(y, mo, d)
    + '\n⏰ ' + time
    + '\n💰 Total: ' + total
    + '\n⏱️ Duração: ' + Store.totalDuration(services) + ' min'
    + '\n\nPode confirmar?';
}

function openWhatsApp(services, y, mo, d, time) {
  var msg = encodeURIComponent(buildMessage(services, y, mo, d, time));
  var hasNumber = /^\d{10,15}$/.test(WHATSAPP_NUMBER);
  var url = hasNumber
    ? 'https://wa.me/' + WHATSAPP_NUMBER + '?text=' + msg
    : 'https://api.whatsapp.com/send?text=' + msg; // placeholder: sem destinatário
  window.open(url, '_blank');
}
