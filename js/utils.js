function fmtCurrency(val) {
  return val.toLocaleString('pt-BR', { style:'currency', currency:'BRL' });
}

function fmtDuration(min) {
  if (min < 60) return min + 'min';
  var h = Math.floor(min / 60);
  var m = min % 60;
  return m > 0 ? h + 'h ' + m + 'min' : h + 'h';
}

function fmtDateFull(y, mo, d) {
  return new Date(y, mo, d).toLocaleDateString('pt-BR', {
    weekday:'long', day:'numeric', month:'long', year:'numeric'
  });
}

function fmtMonthYear(y, mo) {
  return new Date(y, mo, 1).toLocaleDateString('pt-BR', {
    month:'long', year:'numeric'
  });
}

function isPast(y, mo, d) {
  var t = new Date(); t.setHours(0,0,0,0);
  return new Date(y, mo, d) < t;
}

function isToday(y, mo, d) {
  var t = new Date();
  return y === t.getFullYear() && mo === t.getMonth() && d === t.getDate();
}

function isSunday(y, mo, d) {
  return new Date(y, mo, d).getDay() === 0;
}
