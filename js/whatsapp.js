// ⚠️ Substituir pelo número real: 55 + DDD + número sem traços ou espaços
var WA_NUMBER = '5599999999999';

function buildMessage(services, y, mo, d, time) {
  var lines = services.map(function(s){
    return '• ' + s.name + ' — ' + fmtCurrency(s.price);
  }).join('\n');

  var total = services.reduce(function(a,s){ return a + s.price; }, 0);

  return 'Olá! Gostaria de agendar no Studio Gisele Lima:\n\n'
    + lines
    + '\n\n📅 ' + fmtDateFull(y, mo, d)
    + '\n⏰ ' + time
    + '\n💰 Total: ' + fmtCurrency(total)
    + '\n\nPode confirmar?';
}

function openWhatsApp(services, y, mo, d, time) {
  var msg = buildMessage(services, y, mo, d, time);
  window.open('https://wa.me/' + WA_NUMBER + '?text=' + encodeURIComponent(msg), '_blank');
}
