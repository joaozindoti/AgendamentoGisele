const SERVICES = [
  { id:'1',  name:'Design de sobrancelha',    desc:'Modelagem e design personalizado',   price:25, duration:30, cat:'sobrancelha' },
  { id:'2',  name:'Sobrancelha + henna',       desc:'Design com aplicação de henna',      price:40, duration:45, cat:'sobrancelha' },
  { id:'3',  name:'Buço',                      desc:'Depilação com linha ou cera',        price:12, duration:20, cat:'buco'        },
  { id:'4',  name:'Epilação axila',            desc:'Depilação com cera quente',          price:15, duration:30, cat:'epilacao'    },
  { id:'5',  name:'Epilação meia perna',       desc:'Depilação com cera quente',          price:20, duration:30, cat:'epilacao'    },
  { id:'6',  name:'Epilação perna inteira',    desc:'Depilação com cera quente',          price:35, duration:45, cat:'epilacao'    },
  { id:'7',  name:'Epilação virilha simples',  desc:'Depilação com cera quente',          price:25, duration:30, cat:'epilacao'    },
  { id:'8',  name:'Epilação virilha completa', desc:'Depilação com cera quente',          price:40, duration:45, cat:'epilacao'    },
  { id:'9',  name:'Limpeza de pele',           desc:'Limpeza facial profunda',            price:70, duration:60, cat:'facial'      },
  { id:'10', name:'Hidratação facial',         desc:'Tratamento hidratante intensivo',    price:55, duration:45, cat:'facial'      },
];

const CATS = [
  { key:'all',         label:'Todos'       },
  { key:'sobrancelha', label:'Sobrancelha' },
  { key:'buco',        label:'Buço'        },
  { key:'epilacao',    label:'Epilação'    },
  { key:'facial',      label:'Facial'      },
];

function getByCategory(cat) {
  return cat === 'all' ? SERVICES : SERVICES.filter(function(s){ return s.cat === cat; });
}
