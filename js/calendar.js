// Horário: 9h-12h e 14h-18h (com pausa para almoço)
var BUSINESS = {
  1: [{ open:'09:00', close:'12:00' }, { open:'14:00', close:'18:00' }],
  2: [{ open:'09:00', close:'12:00' }, { open:'14:00', close:'18:00' }],
  3: [{ open:'09:00', close:'12:00' }, { open:'14:00', close:'18:00' }],
  4: [{ open:'09:00', close:'12:00' }, { open:'14:00', close:'18:00' }],
  5: [{ open:'09:00', close:'12:00' }, { open:'14:00', close:'18:00' }],
  6: [{ open:'09:00', close:'12:00' }, { open:'14:00', close:'18:00' }],
  // domingo (0): fechado
};

var SLOT_INTERVAL = 30;
var BUFFER        = 10;

function toMin(str) {
  var parts = str.split(':');
  return parseInt(parts[0]) * 60 + parseInt(parts[1]);
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function generateSlots(y, mo, d, serviceDuration) {
  var weekday  = new Date(y, mo, d).getDay();
  var periods  = BUSINESS[weekday];
  if (!periods) return [];

  var now    = new Date();
  var today  = isToday(y, mo, d);
  var slots  = [];

  for (var p = 0; p < periods.length; p++) {
    var open  = toMin(periods[p].open);
    var close = toMin(periods[p].close);
    var cur   = open;

    while (cur + serviceDuration + BUFFER <= close) {
      var nowMin = now.getHours() * 60 + now.getMinutes();
      var avail  = !(today && cur <= nowMin);
      slots.push({
        time: pad2(Math.floor(cur/60)) + ':' + pad2(cur%60),
        available: avail
      });
      cur += SLOT_INTERVAL;
    }
  }

  return slots;
}

function getAvailableDays(y, mo, serviceDuration) {
  var total  = new Date(y, mo + 1, 0).getDate();
  var result = [];

  for (var d = 1; d <= total; d++) {
    if (isPast(y, mo, d) || isSunday(y, mo, d)) continue;
    var slots = generateSlots(y, mo, d, serviceDuration);
    if (slots.some(function(s){ return s.available; })) {
      result.push(d);
    }
  }

  return result;
}
