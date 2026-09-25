#!/usr/bin/env node
// Fase 1, item 4 (seção 11 do documento de arquitetura) — migração dos
// dados da planilha "CRM Studio Gisele Lima" pra tabela `clientes`.
//
// NÃO escreve direto no banco: lê o CSV exportado da aba "Página1", normaliza
// telefone pra E.164 e gera um arquivo .sql com `insert ... on conflict
// (whatsapp) do update`, pra você revisar antes de rodar (SQL Editor do
// Supabase ou `psql`). Decisão deliberada — dado de cliente real, prefiro
// que você veja exatamente o que vai entrar antes de qualquer escrita em
// produção, e o CLI está sem permissão de database_write mesmo (ver
// PENDENCIAS.md).
//
// Uso:
//   node scripts/migrar-planilha.mjs <caminho-do-csv-exportado> [--consentimento=true|false]
//
// O CSV precisa ter cabeçalho na primeira linha. Nomes de coluna aceitos
// (case-insensitive, com ou sem acento):
//   nome        -> nome, cliente
//   whatsapp    -> whatsapp, telefone, celular, numero, fone
//   endereco    -> endereco, endereço
//   nascimento  -> data_nascimento, nascimento, aniversario, data de nascimento
//
// Saída: supabase/dados-migrados/clientes_migrados.sql
//
// --consentimento=true assume que todo cliente já migrado deu consentimento
// (dado que já existia uma relação comercial ativa via WhatsApp/planilha).
// Default é false (mais seguro; força revisão manual antes de marcar
// consentimento = true em produção) — essa é uma decisão de produto/LGPD,
// não técnica, documentada em PENDENCIAS.md pra você confirmar.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const csvPath = args.find((a) => !a.startsWith("--"));
const consentimentoFlag = args.find((a) => a.startsWith("--consentimento="));
const consentimentoPadrao = consentimentoFlag?.split("=")[1] === "true";

if (!csvPath) {
  console.error("Uso: node scripts/migrar-planilha.mjs <caminho-do-csv-exportado> [--consentimento=true|false]");
  process.exit(1);
}

function normalizaCabecalho(h) {
  return h
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, ""); // remove acentos
}

const MAPA_COLUNAS = {
  nome: ["nome", "cliente"],
  whatsapp: ["whatsapp", "telefone", "celular", "numero", "fone"],
  endereco: ["endereco"],
  nascimento: ["data_nascimento", "nascimento", "aniversario", "data de nascimento"],
};

function acheColuna(cabecalhosNormalizados, candidatos) {
  for (const candidato of candidatos) {
    const idx = cabecalhosNormalizados.indexOf(candidato);
    if (idx !== -1) return idx;
  }
  return -1;
}

// Parser de CSV simples, com suporte a campos entre aspas contendo vírgula.
function parseCsv(texto) {
  const linhas = [];
  let linhaAtual = [];
  let campoAtual = "";
  let dentroDeAspas = false;

  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    const proximo = texto[i + 1];

    if (dentroDeAspas) {
      if (c === '"' && proximo === '"') {
        campoAtual += '"';
        i++;
      } else if (c === '"') {
        dentroDeAspas = false;
      } else {
        campoAtual += c;
      }
    } else if (c === '"') {
      dentroDeAspas = true;
    } else if (c === ",") {
      linhaAtual.push(campoAtual);
      campoAtual = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && proximo === "\n") i++;
      linhaAtual.push(campoAtual);
      linhas.push(linhaAtual);
      linhaAtual = [];
      campoAtual = "";
    } else {
      campoAtual += c;
    }
  }
  if (campoAtual.length > 0 || linhaAtual.length > 0) {
    linhaAtual.push(campoAtual);
    linhas.push(linhaAtual);
  }
  return linhas.filter((l) => l.some((campo) => campo.trim() !== ""));
}

// Normaliza telefone brasileiro pra E.164. Assume DDI 55 quando ausente.
// Remove tudo que não é dígito, depois decide o prefixo pelo tamanho.
function normalizaTelefoneE164(bruto) {
  if (!bruto) return null;
  const digitos = String(bruto).replace(/\D/g, "");
  if (!digitos) return null;

  let comDdi = digitos;
  if (!digitos.startsWith("55")) {
    comDdi = "55" + digitos;
  }

  // 55 + DDD (2) + numero (8 ou 9) = 12 ou 13 dígitos
  if (comDdi.length < 12 || comDdi.length > 13) return null;

  return "+" + comDdi;
}

function normalizaData(bruto) {
  if (!bruto) return null;
  const s = bruto.trim();

  // já em YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // DD/MM/YYYY ou DD-MM-YYYY
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) {
    const [, d, mo, y] = m;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  return null; // formato não reconhecido — fica de fora, listado nos avisos
}

function escapaSql(valor) {
  if (valor === null || valor === undefined) return "null";
  return `'${String(valor).replace(/'/g, "''")}'`;
}

// ── Execução ─────────────────────────────────────────────────────
const texto = readFileSync(resolve(csvPath), "utf-8");
const linhas = parseCsv(texto);

if (linhas.length < 2) {
  console.error("CSV vazio ou só com cabeçalho.");
  process.exit(1);
}

const cabecalhoOriginal = linhas[0];
const cabecalhoNormalizado = cabecalhoOriginal.map(normalizaCabecalho);

const idxNome = acheColuna(cabecalhoNormalizado, MAPA_COLUNAS.nome);
const idxWhatsapp = acheColuna(cabecalhoNormalizado, MAPA_COLUNAS.whatsapp);
const idxEndereco = acheColuna(cabecalhoNormalizado, MAPA_COLUNAS.endereco);
const idxNascimento = acheColuna(cabecalhoNormalizado, MAPA_COLUNAS.nascimento);

if (idxNome === -1 || idxWhatsapp === -1) {
  console.error(
    `Não achei coluna de nome e/ou whatsapp. Cabeçalho encontrado: ${cabecalhoOriginal.join(", ")}\n` +
      `Renomeie a coluna no CSV pra um dos nomes aceitos (ver comentário no topo deste script) e rode de novo.`,
  );
  process.exit(1);
}

const registros = [];
const avisos = [];

for (let i = 1; i < linhas.length; i++) {
  const linha = linhas[i];
  const numeroLinha = i + 1; // +1 porque linha 1 é o cabeçalho

  const nome = (linha[idxNome] ?? "").trim();
  const whatsappBruto = linha[idxWhatsapp] ?? "";
  const endereco = idxEndereco !== -1 ? (linha[idxEndereco] ?? "").trim() : "";
  const nascimentoBruto = idxNascimento !== -1 ? (linha[idxNascimento] ?? "").trim() : "";

  if (!nome) {
    avisos.push(`linha ${numeroLinha}: sem nome, pulei.`);
    continue;
  }

  const whatsapp = normalizaTelefoneE164(whatsappBruto);
  if (!whatsapp) {
    avisos.push(`linha ${numeroLinha} (${nome}): telefone "${whatsappBruto}" não deu pra normalizar, pulei.`);
    continue;
  }

  let dataNascimento = null;
  if (nascimentoBruto) {
    dataNascimento = normalizaData(nascimentoBruto);
    if (!dataNascimento) {
      avisos.push(
        `linha ${numeroLinha} (${nome}): data de nascimento "${nascimentoBruto}" não reconhecida, deixei em branco.`,
      );
    }
  }

  registros.push({ nome, whatsapp, endereco: endereco || null, dataNascimento });
}

// Detecta whatsapp duplicado dentro do próprio CSV (a unique constraint da
// tabela pegaria isso de qualquer forma, mas é melhor avisar aqui).
const vistos = new Map();
for (const r of registros) {
  if (vistos.has(r.whatsapp)) {
    avisos.push(`whatsapp duplicado no CSV: ${r.whatsapp} (${vistos.get(r.whatsapp)} e ${r.nome}) — o segundo sobrescreve o primeiro no upsert.`);
  }
  vistos.set(r.whatsapp, r.nome);
}

const linhasSql = registros.map((r) => {
  return `  (${escapaSql(r.nome)}, ${escapaSql(r.whatsapp)}, ${escapaSql(r.endereco)}, ${
    r.dataNascimento ? escapaSql(r.dataNascimento) : "null"
  }, ${consentimentoPadrao})`;
});

const sql = `-- Gerado por scripts/migrar-planilha.mjs a partir de ${csvPath}
-- ${new Date().toISOString()}
-- ${registros.length} cliente(s) normalizados, ${avisos.length} aviso(s) (ver console/log ao gerar).
--
-- REVISAR ANTES DE RODAR. consentimento = ${consentimentoPadrao} pra todo mundo
-- nesta leva — confirmar se é essa a base legal correta antes de aplicar em
-- produção (ver PENDENCIAS.md).

insert into clientes (nome, whatsapp, endereco, data_nascimento, consentimento)
values
${linhasSql.join(",\n")}
on conflict (whatsapp) do update set
  nome = excluded.nome,
  endereco = coalesce(excluded.endereco, clientes.endereco),
  data_nascimento = coalesce(excluded.data_nascimento, clientes.data_nascimento);
`;

const __dirname = dirname(fileURLToPath(import.meta.url));
const dirSaida = resolve(__dirname, "..", "supabase", "dados-migrados");
mkdirSync(dirSaida, { recursive: true });
const caminhoSaida = resolve(dirSaida, "clientes_migrados.sql");
writeFileSync(caminhoSaida, sql, "utf-8");

console.log(`${registros.length} cliente(s) escritos em ${caminhoSaida}`);
if (avisos.length > 0) {
  console.log(`\n${avisos.length} aviso(s):`);
  for (const a of avisos) console.log(`  - ${a}`);
}
