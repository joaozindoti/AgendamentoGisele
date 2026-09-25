// Tudo que é data/hora no app é exibido no fuso do studio, não no do
// aparelho: uma cliente viajando veria o horário do atendimento errado.
// America/Fortaleza = UTC-3 fixo (sem horário de verão desde 2019), mesmo
// fuso das migrations.
export const FUSO = "America/Fortaleza";
export const OFFSET_STUDIO = "-03:00";

const fmtDataLonga = new Intl.DateTimeFormat("pt-BR", {
  timeZone: FUSO,
  weekday: "long",
  day: "numeric",
  month: "long",
});
const fmtDataCurta = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, day: "2-digit", month: "2-digit" });
const fmtDataCompleta = new Intl.DateTimeFormat("pt-BR", {
  timeZone: FUSO,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});
const fmtHora = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, hour: "2-digit", minute: "2-digit" });
const fmtChaveDia = new Intl.DateTimeFormat("en-CA", {
  timeZone: FUSO,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const fmtMoeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function capitaliza(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export const dataLonga = (d: Date) => capitaliza(fmtDataLonga.format(d));
export const dataCurta = (d: Date) => fmtDataCurta.format(d);
export const dataCompleta = (d: Date) => fmtDataCompleta.format(d);
export const hora = (d: Date) => fmtHora.format(d);

/** "YYYY-MM-DD" do dia no fuso do studio. */
export const chaveDia = (d: Date = new Date()) => fmtChaveDia.format(d);

/** Meia-noite de um dia "YYYY-MM-DD" no fuso do studio. */
export const inicioDoDia = (chave: string) => new Date(`${chave}T00:00:00${OFFSET_STUDIO}`);

export function somaDias(chave: string, dias: number) {
  const d = inicioDoDia(chave);
  d.setUTCDate(d.getUTCDate() + dias);
  return chaveDia(d);
}

/** Dia da semana (0=dom) de um "YYYY-MM-DD". */
export const diaDaSemana = (chave: string) => new Date(`${chave}T12:00:00Z`).getUTCDay();

/** Data + "HH:MM" digitados no painel -> instante, no fuso do studio. */
export const instanteLocal = (chave: string, horaMinuto: string) =>
  new Date(`${chave}T${horaMinuto}:00${OFFSET_STUDIO}`);

/** Instante atual. Server Components renderizam uma vez por request, então
 *  ler o relógio aqui é seguro — fica isolado pra deixar isso explícito. */
export const agoraMs = () => Date.now();

export const moeda =(valor: number) => fmtMoeda.format(valor);

/** Preço null = "Consulte o valor", mesmo comportamento do site atual. */
export const preco = (valor: number | string | null | undefined) =>
  valor === null || valor === undefined ? "Consulte o valor" : fmtMoeda.format(Number(valor));

export function duracao(min: number) {
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h ${m}min` : `${h}h`;
}

/**
 * tstzrange vem do PostgREST como texto: ["2026-09-26 13:00:00+00","2026-09-26 13:30:00+00")
 * O formato "espaço + offset curto" não é ISO, e new Date() não é confiável
 * com ele fora do V8 — normaliza antes.
 */
export function lerPeriodo(periodo: string): { inicio: Date; fim: Date } {
  const m = periodo.match(/^[[(]"?([^",]+)"?,"?([^",]+)"?[\])]$/);
  if (!m) throw new Error(`período inválido: ${periodo}`);
  return { inicio: lerTimestamp(m[1]), fim: lerTimestamp(m[2]) };
}

function lerTimestamp(s: string) {
  let iso = s.trim().replace(" ", "T");
  if (/[+-]\d{2}$/.test(iso)) iso += ":00";
  return new Date(iso);
}

/** Literal de tstzrange [inicio, fim) pra filtro "ov"/"sl" do PostgREST. */
export const faixa = (inicio: Date, fim: Date) => `[${inicio.toISOString()},${fim.toISOString()})`;

export function saudacao(d: Date = new Date()) {
  const h = Number(new Intl.DateTimeFormat("en-US", { timeZone: FUSO, hour: "numeric", hour12: false }).format(d));
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

export const NOMES_DIAS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
