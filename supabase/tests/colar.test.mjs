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
    assert.ok(readFileSync(join(COLAR, "07-disparar-lembretes-agora.sql"), "utf8").includes(cron));

    const foto = secrets.match(/WEBHOOK_VALIDAR_FOTO_SECRET\n([0-9a-f]{64})/)[1];
    const notificar = secrets.match(/WEBHOOK_NOTIFICAR_AGENDAMENTO_SECRET\n([0-9a-f]{64})/)[1];
    const defs = Object.fromEntries(
      (await db.query(`select tgname, pg_get_triggerdef(oid) as d from pg_trigger where tgname in ('on_foto_uploaded', 'on_agendamento_notificar')`)).rows.map(
        (r) => [r.tgname, r.d],
      ),
    );
    assert.ok(defs.on_foto_uploaded.includes(foto), "trigger de foto usa o WEBHOOK_VALIDAR_FOTO_SECRET");
    assert.ok(defs.on_agendamento_notificar.includes(notificar), "trigger de agendamento usa o WEBHOOK_NOTIFICAR_AGENDAMENTO_SECRET");
    assert.ok(!Object.values(defs).some((d) => d.includes("supabase_functions")), "nenhum trigger depende de supabase_functions");
  });

  test("se um arquivo falha no meio, nada dele fica gravado (begin/commit)", async () => {
    const quebrado = ler("02-lembretes-e-notificacoes.sql").replace("commit;", "select 1/0;\ncommit;");
    const antes = (await db.query(`select count(*)::int n from cron.job`)).rows[0].n;
    await assert.rejects(db.exec(quebrado));
    await db.exec("rollback").catch(() => {});
    const depois = (await db.query(`select count(*)::int n from cron.job`)).rows[0].n;
    assert.equal(depois, antes);
  });

  // O import do Table Editor faz exatamente este insert (nomes de coluna do
  // cabeçalho do CSV, inclusive "bloqueado " com espaço) — é o que falhava
  // quando a própria tela criava a tabela.
  const IMPORT_DO_CSV = `
    insert into public.planilha_importada ("Nome","WhatsApp","Endereço","Data de Nascimento","Data de Cadastro","Avaliação Enviada","bloqueado ")
    select "Nome","WhatsApp","Endereço","Data de Nascimento","Data de Cadastro","Avaliação Enviada","bloqueado "
    from jsonb_populate_recordset(null::public.planilha_importada, $1::jsonb)`;
  const linhas = [
    { Nome: "Teste", WhatsApp: "5599900000000", "bloqueado ": "" },
    { Nome: null, WhatsApp: null, "bloqueado ": "" },
    { Nome: null, WhatsApp: null, "bloqueado ": "" },
    { Nome: "Maria do Socorro", WhatsApp: "5555999823696", "Endereço": "Av Zeca Branco", "Data de Nascimento": "1979-05-10", "Data de Cadastro": "2026-08-02T23:17:00.484Z", "bloqueado ": "" },
    { Nome: "Debora Evely", WhatsApp: "5599982766377", "Endereço": "Avenida ze da preta", "Data de Nascimento": "2005-10-15", "bloqueado ": "" },
    { Nome: "Já Existia Nova", WhatsApp: "(98) 99911-2233", "Endereço": "", "Data de Nascimento": "15/03/1990", "bloqueado ": "" },
    { Nome: "Pessoa Bloqueada", WhatsApp: "5599988887777", "bloqueado ": "sim" },
    { Nome: "Numero Ruim", WhatsApp: "1234", "bloqueado ": "" },
    { Nome: "Data Ruim", WhatsApp: "98977776666", "Data de Nascimento": "31/02/1990", "bloqueado ": "" },
    { Nome: "Debora Repetida", WhatsApp: "+55 99 98276-6377", "bloqueado ": "" },
  ];

  test("05 prepara a tabela e o import do CSV (coluna \"bloqueado \" com espaço) funciona", async () => {
    await db.exec(ler("05-preparar-planilha.sql"));
    await db.query(IMPORT_DO_CSV, [JSON.stringify(linhas)]);
    const [{ n }] = (await db.query(`select count(*)::int n from public.planilha_importada`)).rows;
    assert.equal(n, linhas.length);
  });

  test("06 importa, pula teste/bloqueada/sem nome/telefone ruim, relata tudo e apaga a tabela temporária", async () => {
    await db.exec(`insert into clientes (nome, whatsapp, endereco) values ('Já Existia', '+5598999112233', 'Rua Antiga')`);
    const relatorio = (await db.exec(ler("06-importar-planilha.sql"))).at(-1).rows;

    const resumo = relatorio.find((r) => r.nome === "RESUMO").motivo;
    // novas: Maria do Socorro, Debora (2 linhas, mesmo número), Data Ruim; Já Existia foi atualizada
    assert.match(resumo, /^3 clientes novas, 1 já existiam/);
    assert.equal(relatorio.filter((r) => r.motivo.startsWith("sem nome")).length, 2);
    assert.ok(relatorio.some((r) => r.nome === "Teste" && r.motivo.startsWith("linha de teste")));
    assert.ok(relatorio.some((r) => r.nome === "Pessoa Bloqueada" && r.motivo.includes("bloqueada")));
    assert.ok(relatorio.some((r) => r.nome === "Numero Ruim" && r.motivo.includes("inválido")));
    assert.ok(relatorio.some((r) => r.nome === "Data Ruim" && r.motivo.includes("não reconhecida")));
    assert.ok(relatorio.some((r) => r.motivo.includes("repetido")));

    const cl = Object.fromEntries(
      (await db.query(`select whatsapp, nome, endereco, data_nascimento::text d, consentimento from clientes`)).rows.map((r) => [r.whatsapp, r]),
    );
    assert.equal(cl["+5555999823696"].d, "1979-05-10"); // DDD 55 + 55 do país
    assert.equal(cl["+5599982766377"].nome, "Debora Repetida"); // última linha vence
    assert.equal(cl["+5598999112233"].nome, "Já Existia Nova");
    assert.equal(cl["+5598999112233"].endereco, "Rua Antiga"); // não apaga o que já tinha
    assert.equal(cl["+5598999112233"].d, "1990-03-15");
    assert.equal(cl["+5599900000000"], undefined, "linha de teste não entra");
    assert.equal(cl["+5599988887777"], undefined, "bloqueada não entra");
    assert.ok(Object.values(cl).every((c) => c.consentimento === false));

    const [{ existe }] = (await db.query(`select to_regclass('public.planilha_importada') is not null as existe`)).rows;
    assert.equal(existe, false, "tabela temporária com dado pessoal foi apagada");
  });

  test("05 + import + 06 de novo não duplica nem quebra", async () => {
    await db.exec(ler("05-preparar-planilha.sql"));
    await db.query(IMPORT_DO_CSV, [JSON.stringify(linhas)]);
    await db.exec(ler("06-importar-planilha.sql"));
    const [{ n }] = (await db.query(`select count(*)::int n from clientes where whatsapp = '+5599982766377'`)).rows;
    assert.equal(n, 1);
  });

  test("06 sem ter importado o CSV avisa que a planilha está vazia", async () => {
    await db.exec(ler("05-preparar-planilha.sql"));
    const relatorio = (await db.exec(ler("06-importar-planilha.sql"))).at(-1).rows;
    assert.ok(relatorio.some((r) => r.motivo.includes("não tinha nenhuma linha")));
  });
});
