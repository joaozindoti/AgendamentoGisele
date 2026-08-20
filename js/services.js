/* ════════════════════════════════════════════════════════════════
   Serviços — dados reais e definitivos da cliente
   Durações medidas com cronômetro pela Gisele (ago/2026).
   Combos de "Epilação completa" removidos: a cliente monta a
   combinação selecionando os serviços separadamente.
   ════════════════════════════════════════════════════════════════ */

var SERVICES = [{
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
        price: 120,
        duration: 60,
        category: 'sobrancelha',
        premium: true
    },
    {
        id: '6',
        name: 'Limpeza de pele profunda',
        description: 'Limpeza facial completa para renovar a pele',
        price: 120,
        duration: 90,
        category: 'facial',
        premium: true
    },
    {
        id: '8',
        name: 'Epilação íntima',
        description: 'Depilação completa da região íntima',
        price: 60,
        duration: 45,
        category: 'epilacao'
    },
    {
        id: '9',
        name: 'Epilação axilas',
        description: 'Depilação completa das axilas',
        price: 30,
        duration: 15,
        category: 'epilacao'
    },
    {
        id: '10',
        name: 'Epilação meia perna',
        description: 'Depilação da região da meia perna',
        price: 30,
        duration: 30,
        category: 'epilacao'
    },
    {
        id: '11',
        name: 'Epilação perna completa',
        description: 'Depilação da perna completa',
        price: 60,
        duration: 45,
        category: 'epilacao'
    }
];

/* photo/alt: banner de contexto no topo de cada grupo de cards
   (fotos reaproveitadas da antiga galeria da home)
   sub: subtítulo herdado dos tiles da antiga seção Categorias   */
var CATS = [
    { key: 'all', label: 'Todos' },
    { key: 'sobrancelha', label: 'Sobrancelha', sub: 'Design & Brow Lamination', photo: 'assets/fotos/sobrancelha-01.webp', alt: 'Design de sobrancelha finalizado no Studio Gisele Lima' },
    { key: 'epilacao', label: 'Epilação', sub: 'Epilação Premium', photo: 'assets/fotos/epilacao-02.webp', alt: 'Epilação premium no Studio Gisele Lima' },
    { key: 'facial', label: 'Facial', sub: 'Limpeza de Pele', photo: 'assets/fotos/facial-nova.webp', alt: 'Máscara facial dourada com toalha personalizada Gisele Lima Estética Feminina' }
];

function getByCategory(cat) {
    return cat === 'all' ? SERVICES : SERVICES.filter(function(s) { return s.category === cat; });
}

function getServiceById(id) {
    for (var i = 0; i < SERVICES.length; i++) {
        if (SERVICES[i].id === id) return SERVICES[i];
    }
    return null;
}