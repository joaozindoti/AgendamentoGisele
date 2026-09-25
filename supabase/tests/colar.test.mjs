// Testa os arquivos de supabase/colar/ (gerados por scripts/gerar-colar.mjs)
// exatamente como vão ser colados no SQL Editor: 01..04 em sequência e o
// importador da planilha (05) contra uma planilha com os problemas típicos.
// A pasta é gitignored (tem secrets); sem ela, os testes são pulados.

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { before, describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { criarBancoVazio } from "./ambiente.mjs";

const COLAR = join(dirname(fileURLToPath(import.meta.url)), "..", "colar");
const existe = existsSync(join(COLAR, "01-schema-inicial.sql"));
const ler = (f) => readFileSync(join(COLAR, f), "utf8").replace(/create extension if not exists pg_(cron|net)[^;]*;/g, "");

describe("arquivos de supabase/colar", { skip: !existe && "supabase/colar não gerado" }, () => {
  let db;

  before(async () => {
    db = await criarBancoVazio();
  });

  test("01 a 04 rodam em sequência, sem editar nada", async () => {
    for (const f of ["01-schema-inicial.sql", "02-lembretes-e-notificacoes.sql", "03-motor-agendamento-e-painel.sql", "04-seed-producao.sql"]) {
      await db.exec(ler(f));
    }
    const [{ n }] = (await db.query(`select count(*)::int n from servicos`)).rows;
    assert.equal(n, 9);
    const [g] = (await db.query(`select telefone from profissionais where papel = 'owner'`)).rows;
    const { TELEFONE_GISELE } = JSON.parse(readFileSync(join(COLAR, ".segredos.json"), "utf8"));
    assert.equal(g.telefone, TELEFONE_GISELE);
  });

  test("secrets embutidos batem com o SECRETS.txt", async () => {
    const secrets = readFileSync(join(COLAR, "SECRETS.txt"), "utf8");
    const cron = secrets.match(/CRON_SECRET\n([0-9a-f]{64})/)[1];
    const jobs = (await db.query(`select command from cron.job`)).rows;
    assert.equal(jobs.length, 3);
    assert.ok(jobs.every((j) => j.command.includes(cron)));
    assert.ok(readFileSync(join(COLAR, "06-disparar-lembretes-agora.sql"), "utf8").includes(cron));
  });

  test("se um arquivo falha no meio, nada dele fica gravado (begin/commit)", async () => {
    const quebrado = ler("02-lembretes-e-notificacoes.sql").replace("commit;", "select 1/0;\ncommit;");
    const antes = (await db.query(`select count(*)::int n from cron.job`)).rows[0].n;
    await assert.rejects(db.exec(quebrado));
    await db.exec("rollback").catch(() => {});
    const depois = (await db.query(`select count(*)::int n from cron.job`)).rows[0].n;
    assert.equal(depois, antes);
  });

  test("05 importa a planilha normalizando telefone/data e relatando o que ficou de fora", async () => {
    await db.exec(`
      insert into clientes (nome, whatsapp, endereco) values ('Já Existia', '+5598999112233', 'Rua Antiga');
      create table public.planilha_importada ("Nome" text, "Telefone" text, "Endereço" text, "Data de Nascimento" text);
      insert into public.planilha_importada values
        ('Maria Silva', '(98) 99988-7766', 'Rua A 123', '15/03/1990'),
        ('João Souza', '98999112233', '', ''),
        ('Ana Neves', '5598988887777', 'Rua B, 45', '1985-07-20'),
        ('', '98988880000', '', ''),
        ('Numero Ruim', '1234', '', ''),
        ('Data Ruim', '98977776666', '', '31/02/1990'),
        ('Ana Duplicada', '+55 98 98888-7777', '', '');
    `);
    const resultado = await db.exec(ler("05-importar-planilha.sql"));
    const relatorio = resultado.at(-1).rows;

    const resumo = relatorio.find((r) => r.nome === "RESUMO").motivo;
    // Maria, Ana (2 linhas, mesmo número) e Data Ruim; João já existia
    assert.match(resumo, /^3 clientes novas, 1 já existiam/);
    assert.ok(relatorio.some((r) => r.motivo.startsWith("sem nome")));
    assert.ok(relatorio.some((r) => r.nome === "Numero Ruim" && r.motivo.includes("inválido")));
    assert.ok(relatorio.some((r) => r.nome === "Data Ruim" && r.motivo.includes("não reconhecida")));
    assert.ok(relatorio.some((r) => r.motivo.includes("repetido")));

    const cl = Object.fromEntries(
      (await db.query(`select whatsapp, nome, endereco, data_nascimento::text d, consentimento from clientes`)).rows.map((r) => [r.whatsapp, r]),
    );
    assert.equal(cl["+5598999887766"].d, "1990-03-15");
    assert.equal(cl["+5598988887777"].nome, "Ana Duplicada"); // última linha vence
    assert.equal(cl["+5598999112233"].nome, "João Souza");
    assert.equal(cl["+5598999112233"].endereco, "Rua Antiga"); // não apaga o que já tinha
    assert.equal(cl["+5598977776666"].d, null);
    assert.ok(Object.values(cl).every((c) => c.consentimento === false));
  });

  test("05 rodado de novo não duplica nem quebra", async () => {
    await db.exec(ler("05-importar-planilha.sql"));
    const [{ n }] = (await db.query(`select count(*)::int n from clientes where whatsapp = '+5598988887777'`)).rows;
    assert.equal(n, 1);
  });
});
