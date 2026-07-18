/* Seleção de serviços compartilhada entre as páginas (sessionStorage) */

var Store = {
  KEY: 'sgl_sel',

  save: function (list) {
    try { sessionStorage.setItem(this.KEY, JSON.stringify(list)); } catch (e) {}
  },

  load: function () {
    try {
      var raw = sessionStorage.getItem(this.KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  },

  clear: function () {
    try { sessionStorage.removeItem(this.KEY); } catch (e) {}
  },

  /* Soma apenas os serviços com preço definido */
  totalPrice: function (list) {
    return (list || this.load()).reduce(function (a, s) {
      return a + (s.price === null ? 0 : s.price);
    }, 0);
  },

  /* true se algum serviço selecionado está com preço a confirmar */
  hasUnpriced: function (list) {
    return (list || this.load()).some(function (s) { return s.price === null; });
  },

  totalDuration: function (list) {
    return (list || this.load()).reduce(function (a, s) { return a + s.duration; }, 0);
  }
};
