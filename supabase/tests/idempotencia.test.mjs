// Cenário real do SQL Editor: um arquivo roda até a metade e para (erro,
// aba fechada, editor que não respeita o begin/commit), deixando tabela,
// function, trigger e policy já criados. Depois a pessoa cola o MESMO
// arquivo inteiro de novo. Isso tem que funcionar, e o banco final tem que
// ficar idêntico ao de uma instalação limpa.
//
// Pra simular "parou no meio" sem depender de transação, cada comando do
// arquivo é executado separadamente (autocommit), até o ponto de corte.

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { before, describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { criarBancoVazio } from "./ambiente.mjs";

const COLAR = join(dirname(fileURLToPath(import.meta.url)), "..", "colar");
const ARQUIVOS = ["01-schema-inicial.sql", "02-lembretes-e-notificacoes.sql", "03-motor-agendamento-e-painel.sql", "04-seed-producao.sql"];
const existe = ARQUIVOS.every((f) => existsSync(join(COLAR, f)));
const ler = (f) => readFileSync(join(COLAR, f), "utf8").replace(/create extension if not exists pg_(cron|net)[^;]*;/g, "");

// Divide SQL em comandos, respeitando '...', "...", $tag$...$tag$ e comentários.
function comandos(sql) {
  const lista = [];
  let atual = "";
  let i = 0;
  while (i < sql.length) {
    const resto = sql.slice(i);
    const dolar = resto.match(/^\$[A-Za-z_]*\$/);
    if (resto.startsWith("--")) {
      const fim = sql.indexOf("\n", i);
      i = fim === -1 ? sql.length : fim + 1;
      continue;
    }
    if (resto.startsWith("/*")) {
      i = sql.indexOf("*/", i) + 2;
      continue;
    }
    if (dolar) {
      const fim = sql.indexOf(dolar[0], i + dolar[0].length) + dolar[0].length;
      atual += sql.slice(i, fim);
      i = fim;
      continue;
    }
    const c = sql[i];
    if (c === "'" || c === '"') {
      let j = i + 1;
      while (j < sql.length && !(sql[j] === c && sql[j + 1] !== c)) j += sql[j] === c ? 2 : 1;
      atual += sql.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (c === ";") {
      if (atual.trim()) lista.push(atual.trim());
      atual = "";
    } else atual += c;
    i++;
  }
  if (atual.trim()) lista.push(atual.trim());
  return lista.filter((c) => !/^(begin|commit)$/i.test(c));
}

const RETRATO = `
  select
    (select count(*)::int from pg_policies where schemaname in ('public', 'storage')) as policies,
    (select count(*)::int from pg_trigger where not tgisinternal) as triggers,
    (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public') as funcoes,
    (select count(*)::int from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'public' and t.typtype = 'e') as enums,
    (select count(*)::int from pg_indexes where schemaname = 'public') as indices,
    (select count(*)::int from cron.job) as jobs,
    (select count(*)::int from storage.buckets) as buckets,
    (select count(*)::int from configuracoes) as configs,
    (select count(*)::int from servicos) as servicos,
    (select count(*)::int from profissionais) as profissionais,
    (select count(*)::int from profissional_servicos) as vinculos,
    (select count(*)::int from disponibilidade_profissional) as janelas`;

async function retrato(db) {
  return (await db.query(RETRATO)).rows[0];
}

describe("arquivos de supabase/colar podem ser colados de novo depois de parar no meio", { skip: !existe && "supabase/colar não gerado" }, () => {
  let limpo;

  before(async () => {
    const db = await criarBancoVazio();
    for (const f of ARQUIVOS) await db.exec(ler(f));
    limpo = await retrato(db);
  });

  test("instalação limpa tem o que se espera", () => {
    assert.equal(limpo.servicos, 9);
    assert.equal(limpo.profissionais, 1);
    assert.equal(limpo.vinculos, 9);
    assert.equal(limpo.janelas, 11);
    assert.equal(limpo.jobs, 3);
    assert.equal(limpo.buckets, 1);
    assert.equal(limpo.policies, 32); // todas as "create policy" da migration 01
    assert.equal(limpo.triggers, 10);
  });

  for (const [indice, arquivo] of ARQUIVOS.entries()) {
    const total = comandos(ler(arquivo)).length;
    const cortes = [...new Set([1, Math.floor(total / 4), Math.floor(total / 2), Math.floor((3 * total) / 4), total - 1])].filter(
      (k) => k > 0 && k < total,
    );

    for (const corte of cortes) {
      test(`${arquivo}: para no comando ${corte} de ${total}, cola inteiro de novo (2x) e fica igual à instalação limpa`, async () => {
        const db = await criarBancoVazio();
        for (const anterior of ARQUIVOS.slice(0, indice)) await db.exec(ler(anterior));

        const lista = comandos(ler(arquivo));
        for (const cmd of lista.slice(0, corte)) await db.exec(cmd);

        await db.exec(ler(arquivo)); // colou de novo, inteiro
        await db.exec(ler(arquivo)); // e mais uma vez, por garantia

        for (const seguinte of ARQUIVOS.slice(indice + 1)) await db.exec(ler(seguinte));
        assert.deepEqual(await retrato(db), limpo);
      });
    }
  }

  test("os 4 arquivos colados duas vezes seguidas, inteiros, não duplicam nada", async () => {
    const db = await criarBancoVazio();
    for (const f of ARQUIVOS) await db.exec(ler(f));
    for (const f of ARQUIVOS) await db.exec(ler(f));
    assert.deepEqual(await retrato(db), limpo);
  });
});
