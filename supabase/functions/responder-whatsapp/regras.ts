// Regras da resposta automática (fase 17), sem nada de Deno nem de rede:
// dá pra testar direto no Node (supabase/tests/resposta-whatsapp.test.mjs).

export type Categoria = "curso" | "link" | "masculino" | "outro";

// Texto comparável: minúsculo, sem acento, só letras/números separados por
// um espaço. "Só pra MULHER?!" vira "so pra mulher".
export function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Palavras e expressões já normalizadas. Casam como palavra inteira: "app"
// não casa com "whatsapp", "site" não casa com "visite".
const CURSO = [
  "curso", "cursos", "cursinho", "cursar", "curco", "crso",
  "workshop", "workshops", "mentoria", "mentorias", "masterclass", "imersao",
  "treinamento", "treinamentos", "capacitacao", "formacao", "certificado", "certificacao",
  "aula", "aulas", "turma", "turmas",
  "aprender", "ensina", "ensinam", "ensinar",
];

const LINK = [
  "link", "linck", "linke", "lik", "lynk",
  "app", "aplicativo", "aplicativos", "aplicatico", "aplicatvo", "aplicativu", "aplicacao",
  "site", "sait", "saite",
  "agendar", "agendo", "agende", "agenda", "agendamento", "agendamentos", "ajendar", "ajenda", "agemdar", "agenadr",
  "marcar", "marca um horario", "marco um horario", "quero marcar", "remarcar", "desmarcar", "cancelar",
  "horario", "horarios", "orario", "orarios", "hora marcada",
  "vaga", "vagas", "disponibilidade", "disponivel",
];

const MASCULINO = [
  "homem", "homens", "omem", "masculino", "masculina", "masculinos", "rapaz", "rapazes",
  "marido", "namorado", "noivo", "esposo", "meu filho", "barba", "barbeiro", "unissex",
  "so mulher", "so mulheres", "so pra mulher", "so pra mulheres", "so para mulher", "so para mulheres",
  "apenas mulher", "apenas mulheres", "somente mulher", "somente mulheres",
];

const regex = (lista: string[]) => new RegExp(`(^| )(${lista.join("|")})( |$)`);
const RE_CURSO = regex(CURSO);
const RE_LINK = regex(LINK);
const RE_MASCULINO = regex(MASCULINO);

// Prioridade fixa: curso (silêncio) > link > aviso de público feminino.
export function classificar(texto: string): Categoria {
  const t = normalizar(texto);
  if (!t) return "outro";
  if (RE_CURSO.test(t)) return "curso";
  if (RE_LINK.test(t)) return "link";
  if (RE_MASCULINO.test(t)) return "masculino";
  return "outro";
}

export function mensagemLink(linkApp: string): string {
  return (
    `Oi! 💛 Pra agendar no Studio Gisele Lima é só usar o nosso app:\n${linkApp}\n\n` +
    `Lá você escolhe o serviço, a profissional e o horário livre, e a confirmação chega aqui no WhatsApp. ` +
    `Abrindo o link, ele mostra como instalar o app na tela inicial do celular.\n\n` +
    `Atendimento exclusivo para o público feminino.`
  );
}

export const MENSAGEM_MASCULINO =
  "Oi! Obrigada pelo contato. O atendimento do Studio Gisele Lima é exclusivo para o público feminino. 💛";

// ---------------------------------------------------------------
// Webhook da Evolution API (v2, evento messages.upsert)
// ---------------------------------------------------------------

export type Recebida =
  | { ignorar: string }
  | { ignorar?: undefined; telefone: string; nome: string | null; texto: string; mensagemId: string | null };

// Mensagem "velha": a Evolution reentrega o histórico quando a instância
// reconecta. Nada com mais de 10 minutos recebe resposta automática.
const IDADE_MAXIMA_S = 10 * 60;

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : null);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);

// "559984183784@s.whatsapp.net" -> "+559984183784". Só conversa individual.
function telefoneDoJid(jid: string | null): string | null {
  const m = jid?.match(/^(\d{8,15})(:\d+)?@s\.whatsapp\.net$/);
  return m ? `+${m[1]}` : null;
}

function segundos(v: unknown): number | null {
  if (typeof v === "number") return v;
  if (typeof v === "string" && /^\d+$/.test(v)) return Number(v);
  const o = obj(v); // Long do protobuf: { low, high }
  if (o && typeof o.low === "number") return (o.low >>> 0) + (typeof o.high === "number" ? o.high * 2 ** 32 : 0);
  return null;
}

// Tira os embrulhos de mensagem temporária / visualização única.
function desembrulhar(m: Obj | null): Obj | null {
  for (let i = 0; m && i < 3; i++) {
    const dentro =
      obj(obj(m.ephemeralMessage)?.message) ??
      obj(obj(m.viewOnceMessage)?.message) ??
      obj(obj(m.viewOnceMessageV2)?.message) ??
      obj(obj(m.documentWithCaptionMessage)?.message);
    if (!dentro) break;
    m = dentro;
  }
  return m;
}

// Texto da mensagem. Mídia sem legenda vira um rótulo (a Gisele precisa ver
// que chegou um áudio); reação, figurinha, apagar/editar e afins: null.
function textoDa(m: Obj | null): string | null {
  if (!m) return null;
  const texto =
    str(m.conversation) ??
    str(obj(m.extendedTextMessage)?.text) ??
    str(obj(m.imageMessage)?.caption) ??
    str(obj(m.videoMessage)?.caption) ??
    str(obj(m.documentMessage)?.caption);
  if (texto) return texto.trim();
  if (m.audioMessage) return "[áudio]";
  if (m.imageMessage) return "[imagem]";
  if (m.videoMessage) return "[vídeo]";
  if (m.documentMessage) return `[documento${str(obj(m.documentMessage)?.fileName) ? `: ${obj(m.documentMessage)!.fileName}` : ""}]`;
  if (m.contactMessage || m.contactsArrayMessage) return "[contato]";
  if (m.locationMessage || m.liveLocationMessage) return "[localização]";
  return null;
}

export function lerMensagem(corpo: unknown, agoraS = Date.now() / 1000): Recebida {
  const c = obj(corpo);
  if (!c) return { ignorar: "corpo inválido" };

  const evento = String(c.event ?? "").toLowerCase().replace(/_/g, ".");
  if (evento !== "messages.upsert") return { ignorar: `evento ${c.event ?? "?"}` };

  const d = obj(Array.isArray(c.data) ? c.data[0] : c.data);
  const key = obj(d?.key);
  if (!d || !key) return { ignorar: "sem data.key" };

  // eco da própria instância (inclusive as respostas desta função)
  if (key.fromMe === true) return { ignorar: "fromMe" };

  const jid = str(key.remoteJid) ?? "";
  if (jid.endsWith("@g.us")) return { ignorar: "grupo" };
  if (jid.endsWith("@broadcast") || jid.endsWith("@newsletter")) return { ignorar: "status/canal" };

  // WhatsApp novo pode endereçar por "@lid" (id anônimo); o número real vem
  // em remoteJidAlt / senderPn quando a Evolution sabe.
  const telefone =
    telefoneDoJid(jid) ?? telefoneDoJid(str(key.remoteJidAlt)) ?? telefoneDoJid(str(key.senderPn)) ?? telefoneDoJid(str(d.senderPn));
  if (!telefone) return { ignorar: `sem número (${jid || "sem remoteJid"})` };

  const ts = segundos(d.messageTimestamp);
  if (ts !== null && agoraS - ts > IDADE_MAXIMA_S) return { ignorar: "mensagem antiga" };

  const texto = textoDa(desembrulhar(obj(d.message)));
  if (!texto) return { ignorar: "sem texto" };

  return { telefone, nome: str(d.pushName), texto, mensagemId: str(key.id) };
}

// O WhatsApp às vezes entrega celular brasileiro sem o 9 (55 99 8418-3784),
// e o cadastro guarda com o 9 (+55 99 98418-3784). Pra comparar com o
// telefone da equipe, tenta as duas formas.
export function variantesTelefone(e164: string): string[] {
  const v = new Set([e164]);
  const br = e164.match(/^\+55(\d{2})(\d+)$/);
  if (br) {
    const [, ddd, resto] = br;
    if (resto.length === 8) v.add(`+55${ddd}9${resto}`);
    if (resto.length === 9 && resto.startsWith("9")) v.add(`+55${ddd}${resto.slice(1)}`);
  }
  return [...v];
}
