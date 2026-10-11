#!/usr/bin/env node
// Fase 26: importa a agenda do Google Calendar (giselelimaclinica@gmail.com)
// e as clientes da planilha CRM pro Supabase, antes de desligar o n8n.
//
// Não escreve no banco e não precisa de nenhuma chave do Supabase:
//
//   node scripts/importar-agenda.mjs --simular
//       só gera importacao/relatorio.md, pra conferir antes;
//
//   node scripts/importar-agenda.mjs
//       gera importacao/importar.sql, pra colar no SQL Editor. É uma
//       transação só (begin/commit): se der erro, nada fica gravado.
//
// Entrada (pasta importacao/, que está no .gitignore — dado pessoal real):
//   importacao/agenda.ics  exportação do Calendar
//   importacao/crm.csv     aba Página1 da planilha CRM
//   importacao/banco.json  opcional: retrato do banco, gerado colando
//                          scripts/estado-banco-importacao.sql no SQL Editor
//                          (só leitura). Com ele o relatório já diz quem já
//                          existe e o que bate com agendamento do sistema novo.
//
// Regras (PENDENCIAS.md, passo 8k):
//   - eventos de 35 dias atrás em diante; um evento = um agendamento, com o
//     UID do Calendar em origem_externa_id (rodar de novo não duplica);
//   - quem já começou entra como concluído, com 24h, 1h, confirmação e
//     protocolo pós marcados como enviados. O de 28 dias só fica marcado
//     quando o dia dele já chegou; os outros o sistema novo manda no dia;
//   - quem ainda vai começar: confirmação sempre marcada (o protocolo pré
//     sai junto com ela, então também não sai), 24h marcado se falta menos
//     de 24h, 1h marcado se falta menos de 1h;
//   - evento de dia inteiro (data, ou 00:00 até 00:00) vira bloqueio, só os
//     que ainda não passaram;
//   - cliente entra pelo telefone (com ou sem o 9); quem já existe no banco
//     não é tocada;
//   - nenhum WhatsApp sai: o importar.sql desliga o trigger
//     on_agendamento_notificar dentro da transação e religa antes do commit.
//
// "Passou ou não" e "falta menos de 24h" são decididos pelo now() do banco,
// na hora em que o importar.sql roda, não na hora em que ele foi gerado.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// =============================================================
// TABELA DE MAPEAMENTO (editável)
// =============================================================

// Serviço como aparece no evento (sem o " — R$ 30,00"; maiúscula, acento e
// espaço sobrando não importam) -> nome do serviço no banco. Evento com mais
// de um serviço vira um agendamento só, com o primeiro serviço reconhecido;
// a lista completa fica nas observações.
export const SERVICOS = {
  "design personalizado": "Design personalizado",
  "design personalizado + henna": "Design personalizado + Henna",
  "design personalizado + coloracao": "Design personalizado + Coloração",
  "brow lamination": "Brow Lamination",
  "limpeza de pele profunda": "Limpeza de pele profunda",
  "epilacao intima": "Epilação íntima",
  "epilacao axilas": "Epilação axilas",
  "epilacao meia perna": "Epilação meia perna",
  "epilacao perna completa": "Epilação perna completa",
};

// A agenda exportada é a da Gisele: todo evento é dela, a não ser que o
// título ou a descrição case com uma linha de PROFISSIONAL_POR_TEXTO.
export const PROFISSIONAL_PADRAO = "Gisele Lima";
// [expressão procurada no título/descrição, nome da profissional no banco]
// ex: [/\belaine\b/i, "Elaine Souza"]
export const PROFISSIONAL_POR_TEXTO = [];

// Evento de dia inteiro (feriado, studio fechado) bloqueia a agenda de quem
// está aqui.
export const PROFISSIONAIS_DO_BLOQUEIO = ["Gisele Lima"];

// Ajuste de um evento específico, pelo UID que aparece no relatório:
//   "abc@google.com": { telefone: "99 98888-7777", nome: "Sheila", servico: "Epilação íntima" },
//   "def@google.com": { bloqueio: true },   // horário ocupado sem cliente
//   "ghi@google.com": { ignorar: true },
export const AJUSTES_POR_EVENTO = {};

// =============================================================

// O próprio WhatsApp do studio (a instância da Evolution API) aparece na
// planilha como cliente; mensagem pra ele mesmo não é entregue.
export const TELEFONES_DO_STUDIO = ["+5599984183784"];

export const FUSO = "America/Fortaleza";
export const JANELA_DIAS = 35;
const MINUTO = 60_000;
const DIA = 86_400_000;

// Mesma regra de telefone do app (web/src/lib/telefone.ts) e da resposta
// automática (supabase/functions/responder-whatsapp/regras.ts). O
// web/package.json não declara "type" e o Node avisaria ao ler o .ts de lá;
// o aviso não diz nada de útil pra quem roda o script.
const emitWarning = process.emitWarning;
process.emitWarning = (aviso, ...resto) => {
  const codigo = typeof resto[0] === "object" ? resto[0]?.code : resto[1];
  if (codigo !== "MODULE_TYPELESS_PACKAGE_JSON") emitWarning.call(process, aviso, ...resto);
};
const { paraE164 } = await import(pathToFileURL(join(RAIZ, "web", "src", "lib", "telefone.ts")).href);
const { variantesTelefone } = await import(pathToFileURL(join(RAIZ, "supabase", "functions", "responder-whatsapp", "regras.ts")).href);
process.emitWarning = emitWarning;

// ---------- texto ----------

export const chave = (s) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const temLetra = (s) => /\p{L}/u.test(s ?? "");

/** Só os 4 últimos dígitos de qualquer sequência que pareça telefone. */
export const mascarar = (s) => String(s ?? "").replace(/\d[\d ()+-]{6,}\d/g, (m) => `…${m.replace(/\D/g, "").slice(-4)}`);

const final4 = (e164) => `…${e164.slice(-4)}`;

// ---------- telefone ----------

/**
 * Telefone como vem da planilha ou do evento -> E.164 com o 9 do celular.
 * Aceita "5599984183784", "(99) 98418-3784", "559984183784@s.whatsapp.net".
 */
export function normalizarTelefone(bruto) {
  const texto = String(bruto ?? "").trim();
  if (!texto) return { erro: "sem telefone" };
  const digitos = texto.replace(/@.*$/, "").replace(/\D/g, "");
  // Bug antigo do cadastro: punha o 55 na frente de quem já tinha digitado o
  // 55 e cortava em 13 dígitos. Sobra 55 + 55 + 9 dígitos, e os dois últimos
  // dígitos do número de verdade se perderam.
  if (digitos.length === 13 && digitos.startsWith("5555")) {
    return { erro: "55 duplicado: os 2 últimos dígitos se perderam" };
  }
  // 55 duplicado com o número inteiro: tira um
  const e164 = paraE164(digitos.length === 15 && digitos.startsWith("5555") ? digitos.slice(2) : digitos);
  if (!e164 || digitos.length > 15 || !/^\+55[1-9][1-9]\d{8,9}$/.test(e164)) {
    return { erro: "telefone inválido" };
  }
  // celular sem o 9 (8 dígitos começando com 6–9): grava com o 9, que é como o app grava
  const ddd = e164.slice(3, 5);
  const numero = e164.slice(5);
  if (numero.length === 8 && /^[6-9]/.test(numero)) {
    return { e164: variantesTelefone(e164).find((v) => v.length === 14) ?? `+55${ddd}9${numero}` };
  }
  return { e164 };
}

// ---------- data e hora ----------

function offsetMinutos(instante, fuso) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: fuso,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(instante)
      .map((x) => [x.type, x.value]),
  );
  return (Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - instante.getTime()) / MINUTO;
}

/** Horário de parede num fuso -> instante. */
export function localParaInstante(ano, mes, dia, hora, min, seg, fuso) {
  const comoUtc = Date.UTC(ano, mes - 1, dia, hora, min, seg);
  let r = comoUtc - offsetMinutos(new Date(comoUtc), fuso) * MINUTO;
  const corrigido = comoUtc - offsetMinutos(new Date(r), fuso) * MINUTO;
  if (corrigido !== r) r = corrigido;
  return new Date(r);
}

const fmtDia = new Intl.DateTimeFormat("en-CA", { timeZone: FUSO, year: "numeric", month: "2-digit", day: "2-digit" });
const fmtHora = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, hour: "2-digit", minute: "2-digit" });
const fmtDiaSemana = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, weekday: "short" });
/** YYYY-MM-DD no fuso do studio */
export const diaLocal = (d) => fmtDia.format(d);
export const horaLocal = (d) => fmtHora.format(d);
const diaBr = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const somaDias = (iso, n) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * DIA).toISOString().slice(0, 10);
/** Como o Postgres mostra o timestamptz no fuso do studio: 2026-10-13 09:30:00-03 */
export const comoNoBanco = (d) => {
  const off = offsetMinutos(d, FUSO);
  const sinal = off < 0 ? "-" : "+";
  const hh = String(Math.floor(Math.abs(off) / 60)).padStart(2, "0");
  const mm = Math.abs(off) % 60 ? `:${String(Math.abs(off) % 60).padStart(2, "0")}` : "";
  return `${diaLocal(d)} ${horaLocal(d)}:${String(new Date(d.getTime() + off * MINUTO).getUTCSeconds()).padStart(2, "0")}${sinal}${hh}${mm}`;
};

// ---------- ICS ----------

const desescapar = (v) => v.replace(/\\([\\;,nN])/g, (_, c) => (c === "n" || c === "N" ? "\n" : c));

/** Lê o .ics: só as propriedades do próprio VEVENT (ignora os VALARM de dentro dele). */
export function lerIcs(texto) {
  const linhas = texto.replace(/\r\n?/g, "\n").replace(/\n[ \t]/g, "").split("\n");
  const pilha = [];
  const eventos = [];
  let fusoCalendario = null;
  let atual = null;
  for (const linha of linhas) {
    const m = linha.match(/^([A-Za-z0-9-]+)((?:;[^:]*)?):(.*)$/);
    if (!m) continue;
    const nome = m[1].toUpperCase();
    const valor = m[3];
    if (nome === "BEGIN") {
      pilha.push(valor.trim().toUpperCase());
      if (pilha.at(-1) === "VEVENT") atual = {};
      continue;
    }
    if (nome === "END") {
      if (pilha.pop() === "VEVENT" && atual) eventos.push(atual);
      if (!pilha.includes("VEVENT")) atual = null;
      continue;
    }
    if (pilha.at(-1) === "VCALENDAR" && nome === "X-WR-TIMEZONE") fusoCalendario = valor.trim();
    if (pilha.at(-1) !== "VEVENT" || !atual || nome in atual) continue;
    const params = {};
    for (const p of m[2].split(";").filter(Boolean)) {
      const i = p.indexOf("=");
      params[p.slice(0, i).toUpperCase()] = p.slice(i + 1).replace(/^"|"$/g, "");
    }
    atual[nome] = { params, valor };
  }
  return { fusoCalendario, eventos };
}

/** DTSTART/DTEND -> { dia: "YYYY-MM-DD" } (dia inteiro) ou { instante: Date, bruto }. */
export function lerDataHora(prop, fusoCalendario) {
  if (!prop) return null;
  const v = prop.valor.trim();
  if (prop.params.VALUE === "DATE" || /^\d{8}$/.test(v)) {
    return { dia: `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`, bruto: v };
  }
  const m = v.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/);
  if (!m) throw new Error(`data/hora que não sei ler: "${v}"`);
  const [, a, me, d, h, mi, s, z] = m.map((x, i) => (i > 0 && i < 7 ? Number(x) : x));
  if (z === "Z") return { instante: new Date(Date.UTC(a, me - 1, d, h, mi, s)), bruto: `${v} (UTC)` };
  const fuso = prop.params.TZID ?? fusoCalendario ?? FUSO;
  try {
    return { instante: localParaInstante(a, me, d, h, mi, s, fuso), bruto: `${v} (${fuso})` };
  } catch {
    throw new Error(`fuso que não conheço: "${fuso}"`);
  }
}

/** Campos que o node "Create an event" do n8n escreve na descrição. */
export function camposN8n(descricao) {
  const campo = (rotulo) => descricao.match(new RegExp(`^\\s*${rotulo}:[ \\t]*(.*)$`, "mi"))?.[1]?.trim() || null;
  return { nome: campo("Nome"), telefone: campo("Telefone"), servicos: campo("Servi[cç]os") };
}

/** "Design personalizado — R$ 30,00, Epilação íntima — R$ 60,00" -> ["Design personalizado", "Epilação íntima"] */
export function listaServicos(texto) {
  if (!texto) return [];
  return texto
    .split(/(?<=\d,\d{2})\s*,\s*|\s*\|\s*/)
    .map((s) => s.replace(/\s+[—–-]\s*(R\$.*)?$/, "").replace(/\s+R\$.*$/, "").trim())
    .filter(Boolean);
}

// ---------- CSV ----------

export function lerCsv(texto) {
  const linhas = [];
  let linha = [];
  let campo = "";
  let aspas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (aspas) {
      if (c === '"' && texto[i + 1] === '"') {
        campo += '"';
        i++;
      } else if (c === '"') aspas = false;
      else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === ",") {
      linha.push(campo);
      campo = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && texto[i + 1] === "\n") i++;
      linha.push(campo);
      linhas.push(linha);
      linha = [];
      campo = "";
    } else campo += c;
  }
  if (campo !== "" || linha.length) {
    linha.push(campo);
    linhas.push(linha);
  }
  const [cab = [], ...resto] = linhas;
  const colunas = cab.map(chave);
  const achar = (...nomes) => colunas.findIndex((c) => nomes.includes(c));
  const idx = {
    nome: achar("nome", "cliente"),
    telefone: achar("whatsapp", "telefone", "celular", "numero", "fone"),
    nascimento: achar("data de nascimento", "data_nascimento", "nascimento", "aniversario"),
    bloqueado: achar("bloqueado", "bloqueada"),
  };
  if (idx.nome < 0 || idx.telefone < 0) throw new Error(`crm.csv sem coluna de nome e/ou WhatsApp (colunas: ${cab.join(", ")})`);
  return resto.map((l, i) => ({
    linha: i + 2,
    nome: (l[idx.nome] ?? "").trim(),
    telefone: (l[idx.telefone] ?? "").trim(),
    nascimento: idx.nascimento < 0 ? "" : (l[idx.nascimento] ?? "").trim(),
    bloqueado: idx.bloqueado < 0 ? "" : (l[idx.bloqueado] ?? "").trim(),
  }));
}

/** Data de nascimento da planilha; null se vazia, ilegível ou recente demais pra ser verdade. */
export function lerNascimento(texto, agora) {
  const t = texto.trim();
  if (!t) return { data: null };
  let iso = null;
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) iso = t.slice(0, 10);
  const br = t.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (br) iso = `${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
  const d = iso && new Date(`${iso}T12:00:00Z`);
  if (!d || Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso) return { data: null, aviso: `data de nascimento "${t}" não reconhecida` };
  // A planilha tem cliente "nascida" este ano: é a data de hoje que o formulário sugeria.
  if (iso > somaDias(diaLocal(agora), -3 * 365) || iso < "1900-01-01") return { data: null, aviso: `data de nascimento ${diaBr(iso)}/${iso.slice(0, 4)} não é plausível` };
  return { data: iso };
}

// ---------- plano ----------

const mapearServico = (texto) => SERVICOS[chave(texto)] ?? null;

function profissionalDo(texto) {
  for (const [re, nome] of PROFISSIONAL_POR_TEXTO) if (re.test(texto)) return nome;
  return PROFISSIONAL_PADRAO;
}

// Sem letra nenhuma (só emoji, ".", o próprio telefone) vira "Cliente", e o
// cadastro no app troca pelo nome que ela digitar (cadastrar_cliente).
function nomeDoEvento(n8n, resumo) {
  if (temLetra(n8n.nome)) return n8n.nome;
  const doTitulo = resumo.includes(" - ") ? resumo.split(/\s+-\s+/)[0].trim() : "";
  if (temLetra(doTitulo) && doTitulo.length <= 60) return doTitulo;
  return "Cliente";
}

/**
 * Lê agenda e planilha e decide o que entra. `banco` (opcional) é o retrato
 * do banco de scripts/estado-banco-importacao.sql.
 */
export function montarPlano({ ics, csv, agora = new Date(), banco = null }) {
  const desde = new Date(agora.getTime() - JANELA_DIAS * DIA);
  const { fusoCalendario, eventos } = lerIcs(ics);
  const plano = {
    agora,
    desde,
    fusoCalendario,
    totalEventos: eventos.length,
    clientes: new Map(), // e164 -> cliente
    crmIgnoradas: [],
    crmAvisos: [],
    agendamentos: [],
    bloqueios: [],
    naoMapeados: [],
    conflitos: [],
    formato: { n8n: 0, semTelefone: 0, tituloEditado: 0, jid: 0, variosServicos: 0, diaInteiro: 0, foraDaJanela: 0 },
    banco,
  };

  // ---- planilha ----
  const daPlanilha = new Map();
  for (const r of lerCsv(csv)) {
    if (!r.nome && !r.telefone) continue; // linha em branco
    if (!r.nome) {
      plano.crmIgnoradas.push({ linha: r.linha, nome: "(sem nome)", motivo: "sem nome" });
      continue;
    }
    if (chave(r.nome) === "teste") {
      plano.crmIgnoradas.push({ linha: r.linha, nome: r.nome, motivo: "linha de teste" });
      continue;
    }
    if (r.bloqueado) {
      plano.crmIgnoradas.push({ linha: r.linha, nome: r.nome, motivo: "marcada como bloqueada na planilha" });
      continue;
    }
    const tel = normalizarTelefone(r.telefone);
    if (tel.erro) {
      plano.crmIgnoradas.push({ linha: r.linha, nome: r.nome, motivo: `${tel.erro} (${mascarar(r.telefone)})` });
      continue;
    }
    if (TELEFONES_DO_STUDIO.includes(tel.e164)) {
      plano.crmIgnoradas.push({ linha: r.linha, nome: r.nome, motivo: "é o WhatsApp do próprio studio" });
      continue;
    }
    const nasc = lerNascimento(r.nascimento, agora);
    if (nasc.aviso) plano.crmAvisos.push({ linha: r.linha, nome: r.nome, motivo: `${nasc.aviso} — entra sem data` });
    if (daPlanilha.has(tel.e164)) {
      plano.crmAvisos.push({ linha: daPlanilha.get(tel.e164).linha, nome: daPlanilha.get(tel.e164).nome, motivo: `telefone ${final4(tel.e164)} repetido na planilha — vale a linha ${r.linha}` });
    }
    daPlanilha.set(tel.e164, { linha: r.linha, nome: r.nome, nascimento: nasc.data });
  }
  for (const [e164, r] of daPlanilha) {
    plano.clientes.set(e164, { whatsapp: e164, nome: temLetra(r.nome) ? r.nome : "Cliente", nascimento: r.nascimento, origem: new Set(["planilha"]) });
  }

  // ---- agenda ----
  for (const ev of eventos) {
    const uid = ev.UID?.valor.trim() + (ev["RECURRENCE-ID"] ? `#${ev["RECURRENCE-ID"].valor.trim()}` : "");
    const resumo = desescapar(ev.SUMMARY?.valor ?? "").trim();
    const descricao = desescapar(ev.DESCRIPTION?.valor ?? "");
    const ajuste = AJUSTES_POR_EVENTO[uid] ?? {};
    const naoMapeado = (motivo, inicio = null) => plano.naoMapeados.push({ uid, resumo, inicio, motivo });

    let ini, fim;
    try {
      ini = lerDataHora(ev.DTSTART, fusoCalendario);
      fim = lerDataHora(ev.DTEND, fusoCalendario);
    } catch (e) {
      naoMapeado(e.message);
      continue;
    }
    if (!ini) {
      naoMapeado("sem data de início");
      continue;
    }
    const inicioOrdem = ini.instante ?? localParaInstante(...ini.dia.split("-").map(Number), 0, 0, 0, FUSO);

    if (ev.STATUS?.valor.trim().toUpperCase() === "CANCELLED") {
      if (inicioOrdem >= desde) naoMapeado("cancelado no Calendar", inicioOrdem);
      continue;
    }
    if (ev.RRULE) {
      naoMapeado("evento que se repete (RRULE) — cadastre à mão", inicioOrdem);
      continue;
    }

    // ---- dia inteiro: data pura, ou 00:00 até 00:00 no fuso do studio ----
    let dias = null;
    if (ini.dia) {
      const ultimo = fim?.dia ? somaDias(fim.dia, -1) : ini.dia;
      dias = [ini.dia, ultimo < ini.dia ? ini.dia : ultimo];
    } else if (fim?.instante && fim.instante > ini.instante && horaLocal(ini.instante) === "00:00" && horaLocal(fim.instante) === "00:00") {
      dias = [diaLocal(ini.instante), somaDias(diaLocal(fim.instante), -1)];
    }
    if (dias || ajuste.bloqueio) {
      const periodo = dias
        ? [localParaInstante(...dias[0].split("-").map(Number), 0, 0, 0, FUSO), localParaInstante(...dias[1].split("-").map(Number), 23, 59, 0, FUSO)]
        : [ini.instante, fim?.instante];
      if (dias) plano.formato.diaInteiro++;
      if (!periodo[1] || periodo[1] <= periodo[0]) {
        naoMapeado("bloqueio sem horário de fim", periodo[0]);
        continue;
      }
      if (periodo[1] <= agora || ajuste.ignorar) continue; // bloqueio que já passou não serve pra nada
      for (const profissional of PROFISSIONAIS_DO_BLOQUEIO) {
        plano.bloqueios.push({ uid, profissional, inicio: periodo[0], fim: periodo[1], motivo: resumo || "Bloqueio do Google Agenda", dias, bruto: ini.bruto });
      }
      continue;
    }

    if (ini.instante < desde) {
      plano.formato.foraDaJanela++;
      continue;
    }
    if (ajuste.ignorar) {
      naoMapeado("ignorado em AJUSTES_POR_EVENTO", ini.instante);
      continue;
    }
    if (!fim?.instante || fim.instante <= ini.instante) {
      naoMapeado("sem horário de fim", ini.instante);
      continue;
    }

    const n8n = camposN8n(descricao);
    if (n8n.telefone) plano.formato.n8n++;
    if (/@/.test(n8n.telefone ?? "")) plano.formato.jid++;
    if (n8n.nome && resumo && !chave(resumo).startsWith(chave(n8n.nome))) plano.formato.tituloEditado++;

    const telefoneBruto = ajuste.telefone ?? n8n.telefone;
    if (!telefoneBruto) {
      plano.formato.semTelefone++;
      naoMapeado("sem telefone (evento criado à mão no Calendar)", ini.instante);
      continue;
    }
    const tel = normalizarTelefone(telefoneBruto);
    if (tel.erro) {
      naoMapeado(`${tel.erro} (${mascarar(telefoneBruto)})`, ini.instante);
      continue;
    }

    const textos = ajuste.servico ? [ajuste.servico] : listaServicos(n8n.servicos ?? resumo.split(/\s+-\s+/).slice(1).join(" - "));
    if (textos.length > 1) plano.formato.variosServicos++;
    const servico = textos.map(mapearServico).find(Boolean);
    if (!servico) {
      naoMapeado(`serviço não reconhecido: "${textos.join(", ") || resumo}" — acrescente em SERVICOS`, ini.instante);
      continue;
    }

    const nome = ajuste.nome ?? nomeDoEvento(n8n, resumo);
    const cliente = plano.clientes.get(tel.e164);
    if (cliente) {
      cliente.origem.add("agenda");
      if (cliente.nome === "Cliente" && nome !== "Cliente") cliente.nome = nome;
    } else {
      plano.clientes.set(tel.e164, { whatsapp: tel.e164, nome, nascimento: null, origem: new Set(["agenda"]) });
    }

    const observacoes = [
      `Importado do Google Agenda: ${resumo || "(sem título)"}`,
      textos.length > 1 ? `Serviços no evento: ${textos.join(", ")}` : null,
    ]
      .filter(Boolean)
      .join("\n")
      .slice(0, 1000);

    plano.agendamentos.push({
      uid,
      whatsapp: tel.e164,
      nomeCliente: plano.clientes.get(tel.e164).nome,
      servico,
      profissional: profissionalDo(`${resumo}\n${descricao}`),
      inicio: ini.instante,
      fim: fim.instante,
      bruto: ini.bruto,
      observacoes,
      resumo,
    });
  }

  plano.agendamentos.sort((a, b) => a.inicio - b.inicio);
  plano.bloqueios.sort((a, b) => a.inicio - b.inicio);
  plano.naoMapeados.sort((a, b) => (a.inicio ?? 0) - (b.inicio ?? 0));

  // ---- conflitos (só de quem ainda vai acontecer: o banco só impede sobreposição de confirmado) ----
  const futuros = plano.agendamentos.filter((a) => a.inicio > agora);
  const jaImportados = new Set((banco?.agendamentos ?? []).map((a) => a.origem).filter(Boolean));
  const ocupados = (banco?.agendamentos ?? [])
    .filter((a) => !a.origem)
    .map((a) => ({ profissional: a.profissional, inicio: new Date(a.inicio), fim: new Date(a.fim), rotulo: "agendamento que já está no sistema novo" }));
  for (const a of futuros) {
    if (jaImportados.has(a.uid)) {
      a.jaImportado = true;
      continue;
    }
    const choque = ocupados.find((o) => chave(o.profissional) === chave(a.profissional) && o.inicio < a.fim && a.inicio < o.fim);
    if (choque) {
      a.conflito = choque;
      plano.conflitos.push({ ag: a, com: choque });
    } else {
      ocupados.push({ profissional: a.profissional, inicio: a.inicio, fim: a.fim, rotulo: `outro evento da agenda (${mascarar(a.nomeCliente)}, ${horaLocal(a.inicio)}–${horaLocal(a.fim)})` });
    }
  }
  for (const a of plano.agendamentos) if (a.inicio <= agora && jaImportados.has(a.uid)) a.jaImportado = true;

  // ---- quem já existe no banco (só com banco.json) ----
  if (banco) {
    const existentes = new Map();
    for (const c of banco.clientes ?? []) for (const v of variantesTelefone(c.whatsapp)) existentes.set(v, c);
    for (const c of plano.clientes.values()) c.noBanco = existentes.get(c.whatsapp) ?? null;
    const servicosBanco = new Set((banco.servicos ?? []).map(chave));
    const profsBanco = new Set((banco.profissionais ?? []).filter((p) => p.ativo !== false).map((p) => chave(p.nome)));
    plano.faltaNoBanco = [
      ...new Set([
        ...plano.agendamentos.filter((a) => !servicosBanco.has(chave(a.servico))).map((a) => `serviço "${a.servico}"`),
        ...[...plano.agendamentos, ...plano.bloqueios].filter((a) => !profsBanco.has(chave(a.profissional))).map((a) => `profissional "${a.profissional}"`),
      ]),
    ];
  }

  return plano;
}

// ---------- importar.sql ----------

const q = (s) => (s === null || s === undefined ? "null" : `'${String(s).replaceAll("'", "''")}'`);
const ts = (d) => `${q(d.toISOString())}::timestamptz`;
const valores = (linhas) => linhas.map((l) => `  (${l.join(", ")})`).join(",\n");

export function gerarSql(plano, geradoEm = new Date()) {
  const clientes = [...plano.clientes.values()];
  const naoMapeados = plano.naoMapeados.filter((n) => !n.inicio || n.inicio >= plano.desde);
  const partes = [];
  partes.push(`-- GERADO por scripts/importar-agenda.mjs em ${geradoEm.toISOString()}
-- a partir de importacao/agenda.ics e importacao/crm.csv.
-- Tem nome e telefone de clientes: não commitar, não compartilhar, apagar
-- depois de usar.
--
-- Colar inteiro no SQL Editor e rodar (depois do 15-importacao-agenda.sql).
-- É uma transação só: se der erro, nada fica gravado. Pode rodar de novo:
-- só entra o que ainda não estava no banco.
--
-- Nenhuma mensagem de WhatsApp sai daqui. O único caminho do banco pro
-- WhatsApp numa inserção é o trigger on_agendamento_notificar (confirmação
-- + protocolo pré pela Edge Function notificar-agendamento); ele fica
-- desligado só dentro desta transação e é religado antes do commit. Os
-- lembretes do pg_cron são evitados marcando em lembretes_enviados (e em
-- protocolo_enviado_em) o que já foi enviado pelo sistema antigo.

drop table if exists pg_temp._imp_clientes, pg_temp._imp_novas, pg_temp._imp_agendamentos, pg_temp._imp_bloqueios, pg_temp._imp_relatorio;

begin;

do $$
begin
  if to_regprocedure('public.variantes_telefone(text)') is null
    or not exists (select 1 from information_schema.columns
                   where table_schema = 'public' and table_name = 'agendamentos' and column_name = 'origem_externa_id')
  then
    raise exception 'Falta colar antes o supabase/colar/15-importacao-agenda.sql (passo 8k do PENDENCIAS.md).';
  end if;
end;
$$;

alter table agendamentos disable trigger on_agendamento_notificar;

create temp table _imp_relatorio (ordem int, secao text, item text, detalhe text);
create temp table _imp_clientes (whatsapp text primary key, nome text not null, data_nascimento date, origem text, rotulo text);
create temp table _imp_novas (whatsapp text primary key);
create temp table _imp_agendamentos (uid text primary key, whatsapp text not null, servico text not null, profissional text not null,
  inicio timestamptz not null, fim timestamptz not null, observacoes text, rotulo text);
create temp table _imp_bloqueios (uid text not null, profissional text not null, inicio timestamptz not null, fim timestamptz not null, motivo text);
`);

  if (clientes.length) {
    partes.push(
      `insert into _imp_clientes (whatsapp, nome, data_nascimento, origem, rotulo) values\n${valores(
        clientes.map((c) => [q(c.whatsapp), q(c.nome), c.nascimento ? `${q(c.nascimento)}::date` : "null", q([...c.origem].join(" + ")), q(mascarar(c.nome))]),
      )};\n`,
    );
  }
  if (plano.agendamentos.length) {
    partes.push(
      `insert into _imp_agendamentos (uid, whatsapp, servico, profissional, inicio, fim, observacoes, rotulo) values\n${valores(
        plano.agendamentos.map((a) => [q(a.uid), q(a.whatsapp), q(a.servico), q(a.profissional), ts(a.inicio), ts(a.fim), q(a.observacoes), q(mascarar(a.nomeCliente))]),
      )};\n`,
    );
  }
  if (plano.bloqueios.length) {
    partes.push(
      `insert into _imp_bloqueios (uid, profissional, inicio, fim, motivo) values\n${valores(
        plano.bloqueios.map((b) => [q(b.uid), q(b.profissional), ts(b.inicio), ts(b.fim), q(b.motivo)]),
      )};\n`,
    );
  }
  if (naoMapeados.length) {
    partes.push(
      `-- eventos que o script não conseguiu ler (detalhes no relatorio.md)\ninsert into _imp_relatorio (ordem, secao, item, detalhe) values\n${valores(
        naoMapeados.map((n) => [
          "6",
          q("evento não importado"),
          q(`${n.inicio ? `${diaBr(diaLocal(n.inicio))} ${horaLocal(n.inicio)} ` : ""}${mascarar(n.resumo || "(sem título)")}`),
          q(n.motivo),
        ]),
      )};\n`,
    );
  }

  partes.push(`-- ---------- clientes: só quem ainda não existe (com ou sem o 9) ----------
with novas as (
  insert into clientes (nome, whatsapp, data_nascimento, consentimento)
  select i.nome, i.whatsapp, i.data_nascimento, false
  from _imp_clientes i
  where not exists (select 1 from clientes c where c.whatsapp = any(public.variantes_telefone(i.whatsapp)))
  on conflict (whatsapp) do nothing
  returning whatsapp
)
insert into _imp_novas select whatsapp from novas;

insert into _imp_relatorio (ordem, secao, item, detalhe)
select 2, 'cliente nova', i.rotulo, 'final ' || right(i.whatsapp, 4) || ' (' || i.origem || ')'
from _imp_clientes i join _imp_novas n using (whatsapp);

insert into _imp_relatorio (ordem, secao, item, detalhe)
select 3, 'cliente já existia (não mexi)', i.rotulo,
       'final ' || right(c.whatsapp, 4) || case when c.user_id is not null then ' — já usa o app' else '' end
from _imp_clientes i
join lateral (
  select * from clientes c where c.whatsapp = any(public.variantes_telefone(i.whatsapp))
  order by (c.whatsapp = i.whatsapp) desc limit 1
) c on true
where not exists (select 1 from _imp_novas n where n.whatsapp = i.whatsapp);

-- Aniversário de hoje: o sistema antigo já mandou (ou manda) o parabéns.
insert into lembretes_enviados (cliente_id, tipo)
select c.id, 'aniversario'
from _imp_clientes i
join clientes c on c.whatsapp = any(public.variantes_telefone(i.whatsapp))
where c.data_nascimento is not null
  and to_char(c.data_nascimento, 'MM-DD') = to_char(now() at time zone 'America/Fortaleza', 'MM-DD')
  and not exists (
    select 1 from lembretes_enviados le
    where le.cliente_id = c.id and le.tipo = 'aniversario'
      and (le.enviado_em at time zone 'America/Fortaleza')::date = (now() at time zone 'America/Fortaleza')::date
  );

-- ---------- agendamentos ----------
do $$
declare
  e record;
  v_cliente uuid;
  v_prof uuid;
  v_serv uuid;
  v_id uuid;
  v_passado boolean;
  v_tipos text[];
  v_rotulo text;
  v_dias_28 int := public.config_int('dias_lembrete_pos_procedimento', 28);
  v_hoje date := (now() at time zone 'America/Fortaleza')::date;
  v_importados int := 0;
  v_ja int := 0;
begin
  for e in select * from _imp_agendamentos order by inicio loop
    v_rotulo := to_char(e.inicio at time zone 'America/Fortaleza', 'DD/MM HH24:MI') || ' ' || e.rotulo || ' — ' || e.servico;

    select c.id into v_cliente from clientes c
    where c.whatsapp = any(public.variantes_telefone(e.whatsapp))
    order by (c.whatsapp = e.whatsapp) desc limit 1;

    select min(p.id::text)::uuid into v_prof from profissionais p
    where lower(p.nome) = lower(e.profissional) and p.ativo
    having count(*) = 1;

    select s.id into v_serv from servicos s
    where lower(s.nome) = lower(e.servico)
    order by s.ativo desc limit 1;

    if v_cliente is null or v_prof is null or v_serv is null then
      insert into _imp_relatorio values (5, 'não achei no banco', v_rotulo,
        case when v_prof is null then 'profissional "' || e.profissional || '" (nenhuma ativa com esse nome, ou mais de uma)'
             when v_serv is null then 'serviço "' || e.servico || '"'
             else 'cliente final ' || right(e.whatsapp, 4) end);
      continue;
    end if;

    if exists (select 1 from agendamentos where origem_externa_id = e.uid) then
      v_ja := v_ja + 1;
      continue;
    end if;

    -- Quem já começou entra como concluído (não é mais horário a proteger).
    v_passado := e.inicio <= now();
    v_tipos := array['confirmacao'];
    if v_passado or e.inicio < now() + interval '24 hours' then v_tipos := v_tipos || '24h'::text; end if;
    if v_passado or e.inicio < now() + interval '1 hour' then v_tipos := v_tipos || '1h'::text; end if;
    -- 28 dias: só marca quando o dia do lembrete já chegou; antes disso é o
    -- sistema novo que manda.
    if v_passado and (e.fim at time zone 'America/Fortaleza')::date + v_dias_28 <= v_hoje then
      v_tipos := v_tipos || '28dias'::text;
    end if;

    begin
      v_id := null;
      insert into agendamentos (cliente_id, profissional_id, servico_id, periodo, status, canal, observacoes,
                                origem_externa_id, protocolo_enviado_em)
      values (v_cliente, v_prof, v_serv, tstzrange(e.inicio, e.fim),
              case when v_passado then 'concluido' else 'confirmado' end::status_agendamento,
              'painel', e.observacoes, e.uid, case when v_passado then now() end)
      on conflict (origem_externa_id) do nothing
      returning id into v_id;

      if v_id is null then
        v_ja := v_ja + 1;
        continue;
      end if;

      insert into lembretes_enviados (agendamento_id, cliente_id, tipo)
      select v_id, v_cliente, t from unnest(v_tipos) t
      on conflict (agendamento_id, tipo) do nothing;
      v_importados := v_importados + 1;
    exception when exclusion_violation then
      insert into _imp_relatorio values (4, 'conflito (não importado)', v_rotulo,
        'já existe agendamento confirmado de ' || e.profissional || ' nesse horário — confira no painel');
    end;
  end loop;

  insert into _imp_relatorio values (1, 'resumo', 'agendamentos importados agora', v_importados::text);
  insert into _imp_relatorio values (1, 'resumo', 'agendamentos que já tinham sido importados', v_ja::text);
end;
$$;

-- ---------- bloqueios de dia inteiro (só os que ainda não passaram) ----------
with novos as (
  insert into bloqueios_agenda (profissional_id, periodo, motivo, origem_externa_id)
  select p.id, tstzrange(b.inicio, b.fim), b.motivo, b.uid
  from _imp_bloqueios b
  join profissionais p on lower(p.nome) = lower(b.profissional) and p.ativo
  where b.fim > now()
  on conflict (profissional_id, origem_externa_id) do nothing
  returning periodo, motivo
)
insert into _imp_relatorio (ordem, secao, item, detalhe)
select 7, 'bloqueio novo', to_char(lower(periodo) at time zone 'America/Fortaleza', 'DD/MM HH24:MI') || ' até ' ||
       to_char(upper(periodo) at time zone 'America/Fortaleza', 'DD/MM HH24:MI'), motivo
from novos;

insert into _imp_relatorio (ordem, secao, item, detalhe)
select 5, 'não achei no banco', 'bloqueio ' || to_char(b.inicio at time zone 'America/Fortaleza', 'DD/MM'), 'profissional "' || b.profissional || '"'
from _imp_bloqueios b
where b.fim > now() and not exists (select 1 from profissionais p where lower(p.nome) = lower(b.profissional) and p.ativo);

insert into _imp_relatorio (ordem, secao, item, detalhe)
select 1, 'resumo', 'clientes novas', count(*)::text from _imp_novas;

-- Religa o aviso de agendamento. Se por algum motivo não religou, aborta
-- tudo em vez de deixar o app sem mandar confirmação.
alter table agendamentos enable trigger on_agendamento_notificar;

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.agendamentos'::regclass and tgname = 'on_agendamento_notificar' and tgenabled = 'O'
  ) then
    raise exception 'o aviso de agendamento (on_agendamento_notificar) não ficou ligado — nada foi gravado';
  end if;
end;
$$;

commit;

select secao, item, detalhe from _imp_relatorio order by ordem, secao, item;
`);
  return partes.join("\n");
}

// ---------- relatorio.md ----------

const tabela = (cab, linhas) =>
  linhas.length
    ? [`| ${cab.join(" | ")} |`, `|${cab.map(() => "---").join("|")}|`, ...linhas.map((l) => `| ${l.map((c) => String(c ?? "").replaceAll("|", "/").replaceAll("\n", " ")).join(" | ")} |`)].join("\n")
    : "_nenhum_";

const quando = (d) => `${diaBr(diaLocal(d))} (${fmtDiaSemana.format(d).replace(".", "")}) ${horaLocal(d)}`;

function lembretesPrevistos(a, agora) {
  if (a.inicio <= agora) return "concluído; tudo marcado como enviado" + (somaDias(diaLocal(a.fim), 28) > diaLocal(agora) ? " menos o de 28 dias" : "");
  const marcados = ["confirmação/pré"];
  if (a.inicio - agora < DIA) marcados.push("24h");
  if (a.inicio - agora < 60 * MINUTO) marcados.push("1h");
  return `marcados: ${marcados.join(", ")}`;
}

export function gerarRelatorio(plano) {
  const { agora, banco } = plano;
  const passados = plano.agendamentos.filter((a) => a.inicio <= agora);
  const futuros = plano.agendamentos.filter((a) => a.inicio > agora);
  const clientes = [...plano.clientes.values()];
  const s = [];

  s.push(`# Simulação da importação da agenda e das clientes

Gerado em ${quando(agora)} (horário de Fortaleza). **Nada foi gravado no banco.**
Os telefones aparecem só com os 4 últimos dígitos.

Janela: eventos a partir de ${quando(plano.desde)} (${JANELA_DIAS} dias atrás). Fuso do arquivo: ${plano.fusoCalendario ?? "não informado (usei America/Fortaleza)"}.
${banco ? `Banco conferido pelo retrato de ${banco.gerado_em ? quando(new Date(banco.gerado_em)) : "data desconhecida"} (importacao/banco.json).` : `**Sem importacao/banco.json:** o relatório não sabe quem já está no banco nem o que já está agendado no sistema novo. Isso aparece de qualquer jeito no resultado do importar.sql; pra ver antes, siga o item 3 do passo 8k do PENDENCIAS.md.`}

## Resumo

| | |
|---|---|
| Eventos no arquivo | ${plano.totalEventos} |
| Agendamentos que entram | ${plano.agendamentos.length} (${passados.length} passados, como concluídos; ${futuros.length} futuros) |
| Bloqueios de dia inteiro (futuros) | ${new Set(plano.bloqueios.map((b) => b.uid)).size} |
| Eventos não mapeados (ficam de fora) | ${plano.naoMapeados.length} |
| Conflitos | ${plano.conflitos.length}${banco ? "" : " (só entre eventos da própria agenda)"} |
| Clientes no arquivo | ${clientes.length}${banco ? ` (${clientes.filter((c) => !c.noBanco).length} novas, ${clientes.filter((c) => c.noBanco).length} já existem)` : ""} |
| Linhas da planilha que ficam de fora | ${plano.crmIgnoradas.length} |
`);

  if (plano.faltaNoBanco?.length) {
    s.push(`> **Atenção:** não existe no banco: ${plano.faltaNoBanco.join(", ")}. Os agendamentos com esses nomes vão aparecer como "não achei no banco" no resultado. Ajuste a tabela de mapeamento no topo de \`scripts/importar-agenda.mjs\`.\n`);
  }

  // ---- clientes ----
  s.push(`## Clientes

Entram pelo telefone, com o 9 do celular. Quem já existe no banco (com ou sem o 9) não é alterada — nem nome, nem data, nem vínculo com o app. Todas entram com consentimento de promoção desligado.
`);
  const linhaCliente = (c) => [mascarar(c.nome), final4(c.whatsapp), c.nascimento ? diaBr(c.nascimento) + "/" + c.nascimento.slice(0, 4) : "", [...c.origem].join(" + ")];
  if (banco) {
    const novas = clientes.filter((c) => !c.noBanco);
    const existentes = clientes.filter((c) => c.noBanco);
    s.push(`### Novas (${novas.length})\n\n${tabela(["Nome", "Telefone", "Nascimento", "Veio de"], novas.map(linhaCliente))}\n`);
    s.push(
      `### Já existem no banco — não serão tocadas (${existentes.length})\n\n${tabela(
        ["Nome no arquivo", "Telefone", "Situação no banco"],
        existentes.map((c) => [mascarar(c.nome), final4(c.whatsapp), c.noBanco.app ? "já se cadastrou pelo app" : "cadastrada, sem app"]),
      )}\n`,
    );
  } else {
    s.push(`### Todas as do arquivo (${clientes.length}) — sem banco.json não dá pra separar novas de existentes\n\n${tabela(["Nome", "Telefone", "Nascimento", "Veio de"], clientes.map(linhaCliente))}\n`);
  }
  s.push(`### Linhas da planilha que ficam de fora (${plano.crmIgnoradas.length})\n\n${tabela(["Linha", "Nome", "Motivo"], plano.crmIgnoradas.map((r) => [r.linha, mascarar(r.nome), r.motivo]))}\n`);
  s.push(`### Avisos da planilha (${plano.crmAvisos.length})\n\n${tabela(["Linha", "Nome", "Aviso"], plano.crmAvisos.map((r) => [r.linha, mascarar(r.nome), r.motivo]))}\n`);

  // ---- agendamentos por dia ----
  const porDia = new Map();
  for (const a of plano.agendamentos) {
    const k = `${diaLocal(a.inicio)}|${a.profissional}`;
    const v = porDia.get(k) ?? { dia: a.inicio, profissional: a.profissional, passados: 0, futuros: 0 };
    a.inicio <= agora ? v.passados++ : v.futuros++;
    porDia.set(k, v);
  }
  const porProf = new Map();
  for (const a of plano.agendamentos) porProf.set(a.profissional, (porProf.get(a.profissional) ?? 0) + 1);
  s.push(`## Agendamentos

Um evento vira um agendamento, com o horário exato do Calendar. Quando o evento tem mais de um serviço, entra o primeiro reconhecido e a lista completa vai nas observações (o faturamento desses atendimentos antigos conta só o primeiro serviço).

### Por profissional

${tabela(["Profissional", "Agendamentos"], [...porProf].map(([p, n]) => [p, n]))}

### Por dia

${tabela(["Dia", "Profissional", "Passados (concluídos)", "Futuros (confirmados)"], [...porDia.values()].map((v) => [diaBr(diaLocal(v.dia)) + " " + fmtDiaSemana.format(v.dia).replace(".", ""), v.profissional, v.passados || "", v.futuros || ""]))}

### Futuros, um por um

${tabela(
  ["Quando", "Cliente", "Telefone", "Serviço", "Profissional", "Lembretes"],
  futuros.map((a) => [quando(a.inicio) + "–" + horaLocal(a.fim), mascarar(a.nomeCliente), final4(a.whatsapp), a.servico, a.profissional, a.jaImportado ? "já importado antes" : a.conflito ? "**conflito: não entra**" : lembretesPrevistos(a, agora)]),
)}
`);

  // ---- não mapeados ----
  s.push(`## Eventos não mapeados — ficam de fora (${plano.naoMapeados.length})

Pra trazer algum, acrescente o UID em \`AJUSTES_POR_EVENTO\` no topo de \`scripts/importar-agenda.mjs\` (com telefone e serviço, ou \`bloqueio: true\` pra só ocupar o horário) e gere de novo. Os futuros daqui **ficam livres no app** se não forem ajustados.

${tabela(["Quando", "Título no Calendar", "Motivo", "UID"], plano.naoMapeados.map((n) => [n.inicio ? quando(n.inicio) + (n.inicio > agora ? " **(futuro)**" : "") : "", mascarar(n.resumo || "(sem título)"), n.motivo, `\`${n.uid}\``]))}
`);

  // ---- conflitos ----
  s.push(`## Conflitos (${plano.conflitos.length})

O banco não deixa dois agendamentos confirmados da mesma profissional no mesmo horário. O item em conflito é pulado (o resto entra) e aparece de novo no resultado do importar.sql.${banco ? "" : " Sem banco.json, só dá pra ver aqui o conflito entre eventos da própria agenda; o conflito com agendamento feito no sistema novo aparece só no resultado do importar.sql."}

${tabela(["Quando", "Cliente", "Serviço", "Bate com"], plano.conflitos.map((c) => [quando(c.ag.inicio) + "–" + horaLocal(c.ag.fim), mascarar(c.ag.nomeCliente), c.ag.servico, c.com.rotulo]))}
`);

  // ---- bloqueios ----
  s.push(`## Bloqueios de dia inteiro (${plano.bloqueios.length})

Só os que ainda não passaram. Entram como o painel grava um bloqueio de dia: das 00:00 às 23:59.

${tabela(["Dia(s)", "Profissional", "Motivo", "Formato no Calendar"], plano.bloqueios.map((b) => [b.dias ? (b.dias[0] === b.dias[1] ? diaBr(b.dias[0]) : `${diaBr(b.dias[0])} a ${diaBr(b.dias[1])}`) : `${quando(b.inicio)}–${horaLocal(b.fim)}`, b.profissional, mascarar(b.motivo), b.bruto]))}
`);

  // ---- fuso ----
  const amostra = [...futuros.slice(0, 3), ...passados.slice(-2)].slice(0, 5);
  s.push(`## Amostra de fuso

O Calendar exporta em UTC (o "Z" no fim). O studio é UTC-3 (America/Fortaleza): 12:30 UTC = 09:30 no studio. "Vai pro banco" é como o Supabase mostra o horário gravado.

${tabela(
  ["Cliente", "No arquivo (.ics)", "No Calendar (Fortaleza)", "Vai pro banco"],
  amostra.map((a) => [mascarar(a.nomeCliente), `\`${a.bruto}\``, quando(a.inicio), `\`${comoNoBanco(a.inicio)}\``]),
)}
`);

  // ---- formato ----
  const f = plano.formato;
  s.push(`## Formato dos eventos neste arquivo

- ${f.n8n} eventos na janela foram criados pelo n8n (descrição com Nome / Telefone / Serviços).
- ${f.semTelefone} foram criados à mão no Calendar (título livre, sem telefone).
- ${f.tituloEditado} tiveram o título editado depois (o título não começa mais com o nome da descrição).
- ${f.jid} trazem o telefone no formato do WhatsApp (\`…@s.whatsapp.net\`, sem o 9).
- ${f.variosServicos} têm mais de um serviço no mesmo evento.
- ${f.diaInteiro} eventos de dia inteiro no arquivo todo.
`);

  s.push(RESPOSTAS);
  return s.join("\n");
}

const RESPOSTAS = `## Respostas da investigação

**1. Como o aviso de agendamento é disparado, e por que a importação não manda mensagem.**
É um trigger no banco: \`on_agendamento_notificar\`, em todo insert e update da tabela de agendamentos, faz um POST (pg_net) pra Edge Function \`notificar-agendamento\`, que manda a confirmação (e o protocolo pré, logo depois) pra cliente e o aviso pra profissional. Não é Database Webhook do dashboard nem chamada do app. O \`importar.sql\` desliga esse trigger dentro da própria transação e religa antes do commit; se não conseguir religar, cancela tudo. Enquanto a transação roda, ninguém mais enxerga o trigger desligado (o app espera alguns segundos). Os testes conferem que nenhuma chamada sai durante a importação e que o trigger volta a funcionar depois.

**2. Como cada lembrete marca "já enviado".**
- 24h e 1h: uma linha em \`lembretes_enviados\` com tipo \`24h\`/\`1h\` (a Edge Function grava antes de mandar; com a linha lá, não manda).
- Protocolo pós: a coluna \`protocolo_enviado_em\` do agendamento.
- Protocolo pré: não tem marca própria. Ele sai junto com a confirmação, que só acontece no trigger do item 1, desligado na importação. Por auditoria a importação grava a linha \`confirmacao\`.
- 28 dias: linha \`28dias\` em \`lembretes_enviados\` (só agendamentos da Gisele, concluídos, no dia exato).
- Aniversário: linha \`aniversario\` em \`lembretes_enviados\` com o dia do envio (uma por dia, por cliente). A importação marca o de hoje pra quem faz aniversário hoje, porque o sistema antigo já mandou.

**3. A cliente importada que depois se cadastra no app vê o agendamento?**
Já via, se digitasse o número exatamente igual: o cadastro procura a ficha pelo telefone e liga a ficha à sessão do aparelho. Faltavam duas coisas, corrigidas no \`15-importacao-agenda.sql\`: (a) se ela digitasse sem o 9 (ou a ficha estivesse sem o 9), o sistema criava uma ficha nova, vazia — agora acha a ficha com ou sem o 9; (b) esse primeiro cadastro gravava uma "troca de aparelho" sem existir aparelho antes — agora só grava quando a ficha já estava ligada a outro aparelho, e só essas contam no limite de 3 trocas por dia.

**4. De onde saem nome, telefone, serviço e profissional.**
O node "Create an event" do n8n grava o título como \`Nome - Serviço — R$ 30,00\` e a descrição em três linhas: \`Nome:\`, \`Telefone:\` (55 + DDD + número; às vezes no formato do WhatsApp, sem o 9) e \`Serviços:\` (um ou mais, separados por vírgula, cada um com o preço). O telefone e os serviços saem da descrição, que o n8n gera e ninguém edita; o título muitas vezes foi editado à mão (outro nome, serviço extra, desconto) e vai inteiro pras observações. O nome sai da planilha quando o telefone está nela; senão, da descrição. Não há profissional no evento: a agenda é da Gisele, então todo evento é dela (dá pra mudar em \`PROFISSIONAL_POR_TEXTO\`). Eventos criados à mão no Calendar não têm telefone e ficam de fora, listados acima.
`;

// ---------- linha de comando ----------

function exigirIgnorado(caminho) {
  try {
    execFileSync("git", ["check-ignore", "-q", caminho], { cwd: RAIZ, stdio: "ignore" });
  } catch {
    throw new Error(`${relative(RAIZ, caminho)} não está no .gitignore. Por segurança (dado pessoal), nada foi gerado.`);
  }
}

async function principal() {
  const args = process.argv.slice(2);
  const simular = args.includes("--simular");
  const pasta = join(RAIZ, "importacao");
  const opcao = (nome, padrao) => {
    const a = args.find((x) => x.startsWith(`--${nome}=`));
    return a ? resolve(a.slice(nome.length + 3)) : join(pasta, padrao);
  };
  const arqAgenda = opcao("agenda", "agenda.ics");
  const arqCrm = opcao("crm", "crm.csv");
  const arqBanco = opcao("banco", "banco.json");
  for (const f of [arqAgenda, arqCrm]) {
    if (!existsSync(f)) throw new Error(`Não achei ${relative(RAIZ, f)}. Coloque o arquivo lá (passo 8k do PENDENCIAS.md).`);
  }
  exigirIgnorado(join(pasta, "relatorio.md"));

  const banco = existsSync(arqBanco) ? JSON.parse(readFileSync(arqBanco, "utf8").replace(/^﻿/, "")) : null;
  const plano = montarPlano({ ics: readFileSync(arqAgenda, "utf8"), csv: readFileSync(arqCrm, "utf8"), banco });

  const relatorio = join(pasta, "relatorio.md");
  writeFileSync(relatorio, gerarRelatorio(plano));
  if (!simular) writeFileSync(join(pasta, "importar.sql"), gerarSql(plano));

  const futuros = plano.agendamentos.filter((a) => a.inicio > plano.agora).length;
  console.log(
    [
      simular ? "Simulação — nada foi gravado no banco." : "importacao/importar.sql gerado (colar no SQL Editor).",
      `Agendamentos: ${plano.agendamentos.length} (${plano.agendamentos.length - futuros} passados, ${futuros} futuros)`,
      `Bloqueios: ${plano.bloqueios.length} | Não mapeados: ${plano.naoMapeados.length} | Conflitos: ${plano.conflitos.length}`,
      `Clientes: ${plano.clientes.size} | Linhas da planilha de fora: ${plano.crmIgnoradas.length}`,
      `Relatório: ${relative(RAIZ, relatorio)}`,
    ].join("\n"),
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  principal().catch((e) => {
    console.error(`Erro: ${e.message}`);
    process.exit(1);
  });
}
