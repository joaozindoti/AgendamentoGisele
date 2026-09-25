export type Papel = "owner" | "staff";
export type StatusAgendamento = "confirmado" | "cancelado" | "concluido" | "no_show";

export interface Servico {
  id: string;
  nome: string;
  descricao: string | null;
  foto_url: string | null;
  preco: number | null;
  duracao_min: number;
  ativo: boolean;
  categoria: string | null;
  destaque: boolean;
}

export interface ProfissionalPublica {
  id: string;
  nome: string;
  bio: string | null;
  foto_url: string | null;
}

export interface ProfissionalAdmin extends ProfissionalPublica {
  user_id: string | null;
  telefone: string | null;
  papel: Papel;
  ativo: boolean;
  criado_em: string;
}

export interface ProfissionalDoServico extends ProfissionalPublica {
  preco: number | null;
  duracao_min: number;
}

export interface Cliente {
  id: string;
  user_id: string | null;
  nome: string;
  whatsapp: string;
  endereco: string | null;
  data_nascimento: string | null;
  consentimento: boolean;
  consentimento_em: string | null;
  consentimento_versao: string | null;
  criado_em: string;
}

export interface Agendamento {
  id: string;
  cliente_id: string;
  profissional_id: string;
  servico_id: string;
  periodo: string;
  status: StatusAgendamento;
  canal: "app" | "painel";
  observacoes: string | null;
}

export interface Disponibilidade {
  id: string;
  profissional_id: string;
  dia_semana: number;
  hora_inicio: string;
  hora_fim: string;
}

export interface Bloqueio {
  id: string;
  profissional_id: string;
  periodo: string;
  motivo: string | null;
}

export interface MeuPapel {
  profissional_id: string | null;
  papel: Papel | null;
  nome_profissional: string | null;
  cliente_id: string | null;
}

export const ROTULO_STATUS: Record<StatusAgendamento, string> = {
  confirmado: "Confirmado",
  cancelado: "Cancelado",
  concluido: "Atendido",
  no_show: "Não compareceu",
};

export const CATEGORIAS: { chave: string; rotulo: string; sub: string; foto: string; alt: string }[] = [
  {
    chave: "sobrancelha",
    rotulo: "Sobrancelha",
    sub: "Design & Brow Lamination",
    foto: "/fotos/sobrancelha-01.webp",
    alt: "Design de sobrancelha finalizado no Studio Gisele Lima",
  },
  {
    chave: "epilacao",
    rotulo: "Epilação",
    sub: "Epilação Premium",
    foto: "/fotos/epilacao-02.webp",
    alt: "Epilação premium no Studio Gisele Lima",
  },
  {
    chave: "facial",
    rotulo: "Facial",
    sub: "Limpeza de Pele",
    foto: "/fotos/facial-nova.webp",
    alt: "Máscara facial dourada com toalha personalizada Gisele Lima Estética Feminina",
  },
];

// Chaves de `configuracoes` editáveis pela Gisele no painel, com o texto de
// ajuda de cada uma.
export const CHAVES_CONFIG = [
  "horas_minimas_remarcacao",
  "passo_minutos",
  "dias_maximos_agendamento",
  "dias_lembrete_pos_procedimento",
] as const;

export const DESCRICAO_CONFIG: Record<(typeof CHAVES_CONFIG)[number], { rotulo: string; dica: string; padrao: number }> = {
  horas_minimas_remarcacao: {
    rotulo: "Antecedência mínima pra remarcar/cancelar (horas)",
    dica: "Depois disso, a cliente só consegue mudar falando com o studio.",
    padrao: 2,
  },
  passo_minutos: {
    rotulo: "Grade de horários (minutos)",
    dica: "De quanto em quanto tempo os horários aparecem pra cliente. Hoje: 30.",
    padrao: 30,
  },
  dias_maximos_agendamento: {
    rotulo: "Até quantos dias à frente a cliente pode marcar",
    dica: "Máximo que o app mostra no calendário: 62.",
    padrao: 60,
  },
  dias_lembrete_pos_procedimento: {
    rotulo: "Lembrete de manutenção (dias depois do atendimento)",
    dica: "Mensagem automática convidando a voltar.",
    padrao: 28,
  },
};

// Versão do texto de consentimento — mesma constante da Edge Function
// pre-cadastro. Trocar as duas juntas quando o texto mudar.
export const CONSENTIMENTO_VERSAO = "v1-25092026";
export const TEXTO_CONSENTIMENTO = "Concordo em receber promoções e novidades do Studio Gisele Lima via WhatsApp.";
