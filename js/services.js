/* ════════════════════════════════════════════════════════════════
   Serviços — dados reais e definitivos da cliente
   price: null → exibir "Consulte o valor" (valor ainda não confirmado)
   premium: true → badge "Premium" discreto no card
   ════════════════════════════════════════════════════════════════ */

var SERVICES = [
  {
    id: '1',
    name: 'Buço',
    description: 'Depilação premium da região do buço',
    price: 12,
    duration: 10,
    category: 'epilacao'
  },
  {
    id: '2',
    name: 'Design personalizado',
    description: 'Design de sobrancelha sob medida para o seu formato de rosto',
    price: 30,
    duration: 30,
    category: 'sobrancelha'
  },
  {
    id: '3',
    name: 'Design personalizado + Henna',
    description: 'Design premium com aplicação de henna para preenchimento',
    price: 40,
    duration: 60,
    category: 'sobrancelha',
    premium: true
  },
  {
    id: '4',
    name: 'Design personalizado + Coloração',
    description: 'Design premium com coloração para realçar o olhar',
    price: 50,
    duration: 60,
    category: 'sobrancelha',
    premium: true
  },
  {
    id: '5',
    name: 'Brow Lamination',
    description: 'Técnica premium de alinhamento e fixação dos fios',
    price: 110,
    duration: 60,
    category: 'sobrancelha',
    premium: true
  },
  {
    id: '6',
    name: 'Limpeza de pele profunda',
    description: 'Limpeza facial completa para renovar a pele',
    price: 110,
    duration: 90,
    category: 'facial',
    premium: true
  },
  {
    id: '7',
    name: 'Epilação completa',
    description: 'Íntima, axilas e pernas — pacote completo',
    price: null, // CONFIRMAR VALOR COM A CLIENTE — não exibir preço até confirmar
    duration: 120,
    category: 'epilacao'
  },
  {
    id: '8',
    name: 'Epilação íntima',
    description: 'Depilação completa da região íntima',
    price: 60,
    duration: 60,
    category: 'epilacao'
  },
  {
    id: '9',
    name: 'Epilação axilas',
    description: 'Depilação completa das axilas',
    price: 30,
    duration: 30,
    category: 'epilacao'
  },
  {
    id: '10',
    name: 'Epilação pernas',
    description: 'Depilação completa das pernas',
    price: 30, // CONFIRMAR se corresponde à "meia perna" do cardápio antigo (perna completa era R$60)
    duration: 30,
    category: 'epilacao'
  }
];

/* photo/alt: banner de contexto no topo de cada grupo de cards
   (fotos reaproveitadas da antiga galeria da home)              */
var CATS = [
  { key: 'all',         label: 'Todos' },
  { key: 'sobrancelha', label: 'Sobrancelha', photo: 'assets/fotos/sobrancelha-01.jpg', alt: 'Design de sobrancelha finalizado no Studio Gisele Lima' },
  { key: 'epilacao',    label: 'Epilação',    photo: 'assets/fotos/epilacao-02.jpg',    alt: 'Epilação premium no Studio Gisele Lima' },
  { key: 'facial',      label: 'Facial',      photo: 'assets/fotos/facial-02.jpg',      alt: 'Procedimento facial no Studio Gisele Lima' }
];

function getByCategory(cat) {
  return cat === 'all' ? SERVICES : SERVICES.filter(function (s) { return s.category === cat; });
}

function getServiceById(id) {
  for (var i = 0; i < SERVICES.length; i++) {
    if (SERVICES[i].id === id) return SERVICES[i];
  }
  return null;
}
