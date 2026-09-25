#!/usr/bin/env node
// Gera supabase/colar/: tudo que o PENDENCIAS.md manda colar no dashboard.
//
//   - 01..03: as migrations de supabase/migrations com os secrets já
//     preenchidos e embrulhadas em begin/commit (ou roda tudo, ou nada).
//   - 04: seed de produção.
//   - 05: importação da planilha a partir de uma tabela criada pelo import
//     de CSV do Table Editor (sem Node, sem terminal).
//   - 06: dispara os 3 lembretes na hora (pra teste).
//   - functions/<nome>.ts: cada Edge Function num arquivo só (o editor do
//     dashboard cria uma função por vez; imports de ../_shared não existem lá).
//   - SECRETS.txt: nome = valor de cada secret das Edge Functions.
//
// A pasta está no .gitignore: o repositório é público e ela tem secrets e
// o telefone pessoal da Gisele. Os valores ficam em
// supabase/colar/.segredos.json e são reaproveitados a cada execução —
// rodar de novo não troca secret que já foi configurado. Os 3 secrets são
// gerados aleatórios na primeira vez; TELEFONE_GISELE precisa estar lá
// (o gerador para com erro se não estiver).
//
//   node scripts/gerar-colar.mjs

import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SUPA = join(RAIZ, "supabase");
const SAIDA = join(SUPA, "colar");
mkdirSync(join(SAIDA, "functions"), { recursive: true });

// ---------- secrets ----------
const arqSegredos = join(SAIDA, ".segredos.json");
const segredos = existsSync(arqSegredos) ? JSON.parse(readFileSync(arqSegredos, "utf8")) : {};
for (const nome of ["WEBHOOK_VALIDAR_FOTO_SECRET", "WEBHOOK_NOTIFICAR_AGENDAMENTO_SECRET", "CRON_SECRET"]) {
  segredos[nome] ??= randomBytes(32).toString("hex");
}
// Dado pessoal, não secret de function: não dá pra gerar aleatório, e sem
// ele o seed não serve pra nada — melhor parar aqui do que gerar um 04 quebrado.
if (!/^\+[1-9]\d{7,14}$/.test(segredos.TELEFONE_GISELE ?? "")) {
  throw new Error(`Falta "TELEFONE_GISELE" (E.164, ex: +5599999999999) em ${arqSegredos}.`);
}
writeFileSync(arqSegredos, JSON.stringify(segredos, null, 2));
const SECRETS_DE_FUNCTION = ["WEBHOOK_VALIDAR_FOTO_SECRET", "WEBHOOK_NOTIFICAR_AGENDAMENTO_SECRET", "CRON_SECRET"];

const PLACEHOLDERS = {
  "<COLE_O_SECRET_AQUI>": segredos.WEBHOOK_VALIDAR_FOTO_SECRET,
  "<COLE_O_WEBHOOK_NOTIFICAR_SECRET_AQUI>": segredos.WEBHOOK_NOTIFICAR_AGENDAMENTO_SECRET,
  "<COLE_O_CRON_SECRET_AQUI>": segredos.CRON_SECRET,
};

const aviso = (origem) =>
  `-- GERADO por scripts/gerar-colar.mjs a partir de ${origem}.\n` +
  `-- Contém secrets: não commitar, não compartilhar. Colar inteiro no SQL Editor e rodar.\n\n`;

// ---------- migrations ----------
const migrations = readdirSync(join(SUPA, "migrations")).filter((f) => f.endsWith(".sql")).sort();
migrations.forEach((arquivo, i) => {
  let sql = readFileSync(join(SUPA, "migrations", arquivo), "utf8");
  // Os blocos "ANTES DE RODAR... troque o placeholder" não fazem sentido no
  // arquivo pronto pra colar: vira uma linha dizendo que já está preenchido.
  const linhas = [];
  let pulando = false;
  for (const linha of sql.split(/\r?\n/)) {
    if (linha.startsWith("-- ANTES DE RODAR")) {
      pulando = true;
      linhas.push("-- Secret já preenchido pelo gerador (mesmo valor de supabase/colar/SECRETS.txt).");
      continue;
    }
    if (pulando && linha.startsWith("-- ")) continue;
    pulando = false;
    linhas.push(linha);
  }
  sql = linhas.join("\n");
  for (const [ph, valor] of Object.entries(PLACEHOLDERS)) sql = sql.replaceAll(ph, valor);
  if (/<COLE_[A-Z_]+>/.test(sql)) throw new Error(`placeholder não preenchido em ${arquivo}`);
  const nome = `${String(i + 1).padStart(2, "0")}-${arquivo.replace(/^\d+_/, "").replaceAll("_", "-")}`;
  writeFileSync(join(SAIDA, nome), `${aviso(`supabase/migrations/${arquivo}`)}begin;\n\n${sql}\n\ncommit;\n`);
});

// ---------- seed ----------
writeFileSync(
  join(SAIDA, "04-seed-producao.sql"),
  aviso("supabase/seed-producao.sql") +
    readFileSync(join(SUPA, "seed-producao.sql"), "utf8").replaceAll("<TELEFONE_PESSOAL_DA_GISELE>", segredos.TELEFONE_GISELE),
);

// ---------- importação da planilha ----------
writeFileSync(join(SAIDA, "05-importar-planilha.sql"), aviso("scripts/gerar-colar.mjs") + readFileSync(join(RAIZ, "scripts", "importar-planilha.sql"), "utf8"));

// ---------- disparo manual dos lembretes ----------
const url = (f) => `https://pjbcgyzykvidbwdjlnvp.supabase.co/functions/v1/${f}`;
const disparo = (f) =>
  `select net.http_post(\n  url := '${url(f)}',\n  headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', '${segredos.CRON_SECRET}'),\n  body := '{}'::jsonb\n) as ${f.replaceAll("-", "_")};`;
writeFileSync(
  join(SAIDA, "06-disparar-lembretes-agora.sql"),
  aviso("scripts/gerar-colar.mjs") +
    "-- Faz na hora o que o pg_cron faz sozinho (lembretes 24h/1h, aniversários,\n" +
    "-- manutenção de 28 dias). O resultado de cada chamada aparece em\n" +
    "-- Edge Functions → <função> → Logs.\n\n" +
    ["enviar-lembretes", "enviar-aniversarios", "lembrete-28-dias"].map(disparo).join("\n\n") +
    "\n",
);

// ---------- Edge Functions em arquivo único ----------
const FUNCS = join(SUPA, "functions");
const reImportRelativo = /^import\s+(?:type\s+)?\{[^}]*\}\s+from\s+"(\.{1,2}\/[^"]+)";\s*$/;
const reImportExterno = /^import\s+.*\s+from\s+"(npm:|jsr:|https:)[^"]+";\s*$/;

function juntar(arquivoFunc) {
  const externos = new Set();
  const incluidos = new Set();
  const partes = [];
  function incluir(caminho) {
    if (incluidos.has(caminho)) return;
    incluidos.add(caminho);
    const corpo = [];
    for (const linha of readFileSync(caminho, "utf8").split(/\r?\n/)) {
      const rel = linha.match(reImportRelativo);
      if (rel) {
        incluir(resolve(dirname(caminho), rel[1]));
        continue;
      }
      if (reImportExterno.test(linha)) {
        externos.add(linha.trim());
        continue;
      }
      corpo.push(linha);
    }
    partes.push(`// ---- ${caminho.slice(FUNCS.length + 1).replaceAll("\\", "/")} ----\n${corpo.join("\n").trim()}\n`);
  }
  incluir(arquivoFunc);
  return [...externos].join("\n") + "\n\n" + partes.join("\n");
}

const funcoes = readdirSync(FUNCS, { withFileTypes: true })
  .filter((d) => d.isDirectory() && !d.name.startsWith("_"))
  .map((d) => d.name)
  .sort();
for (const nome of funcoes) {
  const codigo =
    `// GERADO por scripts/gerar-colar.mjs a partir de supabase/functions/${nome}/ (+ _shared).\n` +
    `// Colar inteiro no editor da função "${nome}" no dashboard. Não editar aqui:\n` +
    `// edite o original e rode o gerador de novo.\n\n` +
    juntar(join(FUNCS, nome, "index.ts"));
  writeFileSync(join(SAIDA, "functions", `${nome}.ts`), codigo);
}

// ---------- lista de secrets ----------
writeFileSync(
  join(SAIDA, "SECRETS.txt"),
  [
    "Secrets das Edge Functions — colar em Edge Functions → Secrets no dashboard.",
    "Não commitar, não compartilhar.",
    "",
    ...SECRETS_DE_FUNCTION.map((k) => `${k}\n${segredos[k]}\n`),
    "EVOLUTION_API_URL\n<url base da Evolution API — ver passo 2 do PENDENCIAS.md>\n",
    "EVOLUTION_API_INSTANCE\nstudio-gisele-lima\n",
    "EVOLUTION_API_KEY\n<pegar no painel/env da VPS ou do n8n atual>\n",
    "SEND_SMS_HOOK_SECRET\n<gerado pelo dashboard no passo 5 do PENDENCIAS.md>\n",
  ].join("\n"),
);

console.log(`supabase/colar/ gerado: ${migrations.length} migrations, seed, importação, disparo, ${funcoes.length} functions, SECRETS.txt`);
