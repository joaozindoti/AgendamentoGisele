var Store = {
  KEY: 'sgl_sel',

  save: function(list) {
    try { sessionStorage.setItem(this.KEY, JSON.stringify(list)); } catch(e) {}
  },

  load: function() {
    try {
      var raw = sessionStorage.getItem(this.KEY);
      return raw ? JSON.parse(raw) : [];
    } catch(e) { return []; }
  },

  clear: function() {
    try { sessionStorage.removeItem(this.KEY); } catch(e) {}
  },

  totalPrice: function() {
    return this.load().reduce(function(a,s){ return a + s.price; }, 0);
  },

  totalDuration: function() {
    return this.load().reduce(function(a,s){ return a + s.duration; }, 0);
  }
};
