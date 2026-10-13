// Fase 27 — migration 20261013120000: mais de um serviço por agendamento e
// correção do nome "Cliente". Roda contra as migrations reais.

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { before, describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { TELEFONE_GISELE, como, criarBanco, criarBancoVazio, criarLogin, criarLoginAnonimo, instante, proximoDia } from "./ambiente.mjs";

const MIGRATIONS = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");
const NOVA = "20261013120000_varios_servicos.sql";
const sqlMigration = (f) => readFileSync(join(MIGRATIONS, f), "utf8").replace(/create extension if not exists pg_(cron|net)[^;]*;/g, "");

const QUARTA = proximoDia(3, 3);
const rows = (r) => r;

describe("backfill: agendamentos que já existiam ganham o item ordem 1", () => {
  test("duração e preço da época (override da profissional ou do serviço)", async () => {
    const db = await criarBancoVazio();
    for (const f of readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql") && f < NOVA).sort()) await db.exec(sqlMigration(f));
    const seed = readFileSync(join(MIGRATIONS, "..", "seed-producao.sql"), "utf8").replaceAll("<TELEFONE_PESSOAL_DA_GISELE>", TELEFONE_GISELE);
    await db.exec(seed);

    const [{ id: gisele }] = (await db.query(`select id from profissionais where papel = 'owner'`)).rows;
    const [{ id: design }] = (await db.query(`select id from servicos where nome = 'Design personalizado'`)).rows;
    const [{ id: axilas }] = (await db.query(`select id from servicos where nome = 'Epilação axilas'`)).rows;
    await db.query(`update profissional_servicos set preco_override = 45.50, duracao_override_min = 45 where profissional_id = $1 and servico_id = $2`, [gisele, axilas]);
    const [{ id: cli }] = (await db.query(`insert into clientes (nome, whatsapp) values ('Ana', '+5599911112222') returning id`)).rows;
    const mk = async (servico, hm) =>
      (await db.query(
        `insert into agendamentos (cliente_id, profissional_id, servico_id, periodo, status)
         values ($1, $2, $3, tstzrange($4::timestamptz, $4::timestamptz + interval '30 min'), 'concluido') returning id`,
        [cli, gisele, servico, instante(QUARTA, hm)],
      )).rows[0].id;
    const a1 = await mk(design, "10:00");
    const a2 = await mk(axilas, "11:00");

    await db.exec(sqlMigration(NOVA));
    const itens = (await db.query(`select agendamento_id, servico_id, ordem, duracao_min, preco::float8 preco from agendamento_servicos order by ordem, preco`)).rows;
    assert.equal(itens.length, 2);
    assert.deepEqual(itens.find((i) => i.agendamento_id === a1), { agendamento_id: a1, servico_id: design, ordem: 1, duracao_min: 30, preco: 30 });
    assert.deepEqual(itens.find((i) => i.agendamento_id === a2), { agendamento_id: a2, servico_id: axilas, ordem: 1, duracao_min: 45, preco: 45.5 });

    // rodar de novo não duplica nem quebra
    await db.exec(sqlMigration(NOVA));
    assert.equal((await db.query(`select count(*)::int n from agendamento_servicos`)).rows[0].n, 2);
    const [{ f }] = (await db.query(`select count(*)::int f from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'`)).rows.map((r) => ({ f: r.f }));
    await db.exec(sqlMigration(NOVA));
    assert.equal((await db.query(`select count(*)::int f from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'`)).rows[0].f, f);
  });
});

describe("vários serviços", () => {
  let db, sr, anon, gisele, giseleId, staffUid, staffId, cliUid, cliId, outraUid, outraId;
  let design, axilas, meiaPerna, brow, limpeza, henna;

  const cli = () => como(db, "authenticated", cliUid);
  const g = () => como(db, "authenticated", gisele);
  const itens = async (id) =>
    (await db.query(`select s.nome, i.ordem, i.duracao_min, i.preco::float8 preco from agendamento_servicos i join servicos s on s.id = i.servico_id where i.agendamento_id = $1 order by i.ordem`, [id])).rows;

  before(async () => {
    db = await criarBanco();
    sr = como(db, "service_role");
    anon = como(db, "anon");
    gisele = await criarLogin(db, TELEFONE_GISELE);
    [{ id: giseleId }] = (await db.query(`select id from profissionais where papel = 'owner'`)).rows;
    const s = Object.fromEntries((await db.query(`select id, nome from servicos`)).rows.map((r) => [r.nome, r.id]));
    design = s["Design personalizado"];
    axilas = s["Epilação axilas"];
    meiaPerna = s["Epilação meia perna"];
    brow = s["Brow Lamination"];
    limpeza = s["Limpeza de pele profunda"];
    henna = s["Design personalizado + Henna"];

    // staff que só faz design (qualquer outra combinação com ela não existe)
    [{ id: staffId }] = await g()(`insert into profissionais (nome, telefone, papel) values ('Ana Staff', '+5599922220000', 'staff') returning id`);
    await g()(`insert into profissional_servicos (profissional_id, servico_id) values ($1, $2)`, [staffId, design]);
    await g()(`insert into disponibilidade_profissional (profissional_id, dia_semana, hora_inicio, hora_fim) values ($1, 3, '09:00', '18:00')`, [staffId]);
    staffUid = await criarLogin(db, "+5599922220000");

    cliUid = await criarLoginAnonimo(db);
    [{ cadastrar_cliente: cliId }] = await cli()(`select cadastrar_cliente('Bruna', '+5599977770000')`);
    outraUid = await criarLoginAnonimo(db);
    [{ cadastrar_cliente: outraId }] = await como(db, "authenticated", outraUid)(`select cadastrar_cliente('Carla', '+5599966660000')`);
  });

  const agendar = (quem, prof, ids, hm, extra = []) =>
    quem()(`select agendar($1::uuid, $2::uuid[], $3::timestamptz${extra.length ? ", $4::uuid" : ""}) as id`, [
      prof,
      `{${ids.join(",")}}`,
      instante(QUARTA, hm),
      ...extra,
    ]);

  test("horários: duração = soma; só cabem os inícios em que os dois serviços encaixam", async () => {
    const um = (await anon(`select h from horarios_disponiveis($1::uuid, array[$2::uuid], $3::date) h`, [giseleId, design, QUARTA])).map((r) => r.h);
    const dois = (await anon(`select h from horarios_disponiveis($1::uuid, array[$2::uuid, $3::uuid], $4::date) h`, [giseleId, design, axilas, QUARTA])).map((r) => r.h);
    assert.ok(um.length > dois.length);
    // janela da manhã 09:30–12:30: 60 min → último início 11:30; 12:00 não cabe
    const manha = (lista) => lista.filter((h) => new Date(h).getTime() < new Date(instante(QUARTA, "13:00")).getTime()).map((h) => new Date(h).toISOString());
    assert.ok(manha(um).includes(new Date(instante(QUARTA, "12:00")).toISOString()));
    assert.ok(!manha(dois).includes(new Date(instante(QUARTA, "12:00")).toISOString()));
    assert.ok(manha(dois).includes(new Date(instante(QUARTA, "11:30")).toISOString()));
  });

  test("sobrecarga de serviço único continua igual à de array de um", async () => {
    const a = (await anon(`select h from horarios_disponiveis($1::uuid, $2::uuid, $3::date) h`, [giseleId, design, QUARTA])).map((r) => r.h.toISOString());
    const b = (await anon(`select h from horarios_disponiveis($1::uuid, array[$2::uuid], $3::date) h`, [giseleId, design, QUARTA])).map((r) => r.h.toISOString());
    assert.deepEqual(a, b);
    assert.ok(a.length > 0);
    const dA = (await anon(`select d::text from dias_disponiveis($1::uuid, $2::uuid, $3::date, $4::date) d`, [giseleId, design, QUARTA, QUARTA])).map((r) => r.d);
    const dB = (await anon(`select d::text from dias_disponiveis($1::uuid, array[$2::uuid, $3::uuid], $4::date, $4::date) d`, [giseleId, design, axilas, QUARTA])).map((r) => r.d);
    assert.deepEqual(dA, [QUARTA]);
    assert.deepEqual(dB, [QUARTA]);
  });

  test("lista inválida ou serviço que a profissional não faz: sem horário", async () => {
    const q = (ids) => anon(`select h from horarios_disponiveis($1::uuid, $2::uuid[], $3::date) h`, [giseleId, ids, QUARTA]);
    assert.equal((await q(`{}`)).length, 0);
    assert.equal((await q(`{${design},${design}}`)).length, 0);
    assert.equal((await q(`{${design},${axilas},${meiaPerna},${brow},${limpeza},${henna},${design}}`)).length, 0);
    const staffFaz = (await anon(`select h from horarios_disponiveis($1::uuid, array[$2::uuid, $3::uuid], $4::date) h`, [staffId, design, axilas, QUARTA]));
    assert.equal(staffFaz.length, 0, "staff não faz axilas");
  });

  test("profissionais_dos_servicos: só quem faz todos, com duração e preço somados", async () => {
    const r = await anon(`select id, preco::float8 preco, duracao_min from profissionais_dos_servicos(array[$1::uuid, $2::uuid])`, [design, axilas]);
    assert.deepEqual(r, [{ id: giseleId, preco: 60, duracao_min: 60 }]);
    const so = await anon(`select id from profissionais_dos_servicos(array[$1::uuid])`, [design]);
    assert.deepEqual(so.map((x) => x.id).sort(), [giseleId, staffId].sort());
    assert.equal((await anon(`select id from profissionais_dos_servicos('{}'::uuid[])`)).length, 0);
    assert.equal((await anon(`select id from profissionais_dos_servicos(array[$1::uuid, $1::uuid])`, [design])).length, 0);
    // serviço "consulte o valor" => total desconhecido
    await sr(`update servicos set preco = null where id = $1`, [axilas]);
    const nulo = await anon(`select preco from profissionais_dos_servicos(array[$1::uuid, $2::uuid])`, [design, axilas]);
    assert.equal(nulo[0].preco, null);
    await sr(`update servicos set preco = 30 where id = $1`, [axilas]);
  });

  test("agendar com 2 serviços: servico_id = primeiro, período = soma, itens na ordem", async () => {
    const [{ id }] = await agendar(cli, giseleId, [axilas, design], "10:00");
    const [a] = await sr(`select servico_id, lower(periodo) ini, upper(periodo) fim, canal from agendamentos where id = $1`, [id]);
    assert.equal(a.servico_id, axilas);
    assert.equal(a.fim - a.ini, 60 * 60_000);
    assert.equal(a.canal, "app");
    assert.deepEqual(await itens(id), [
      { nome: "Epilação axilas", ordem: 1, duracao_min: 30, preco: 30 },
      { nome: "Design personalizado", ordem: 2, duracao_min: 30, preco: 30 },
    ]);
    // a configuração temporária não vaza para o próximo insert
    const [{ id: id2 }] = await sr(
      `insert into agendamentos (cliente_id, profissional_id, servico_id, periodo) values ($1, $2, $3, tstzrange($4::timestamptz, $4::timestamptz + interval '30 min')) returning id`,
      [cliId, giseleId, design, instante(QUARTA, "15:00")],
    );
    assert.equal((await itens(id2)).length, 1);
  });

  test("a mesma cliente vê os itens; outra cliente não; ninguém escreve direto", async () => {
    const [{ id }] = await sr(`select id from agendamentos where cliente_id = $1 and servico_id = $2`, [cliId, axilas]);
    assert.equal((await cli()(`select 1 from agendamento_servicos where agendamento_id = $1`, [id])).length, 2);
    assert.equal((await como(db, "authenticated", outraUid)(`select 1 from agendamento_servicos`)).length, 0);
    assert.equal((await g()(`select 1 from agendamento_servicos where agendamento_id = $1`, [id])).length, 2);
    assert.equal((await como(db, "authenticated", staffUid)(`select 1 from agendamento_servicos where agendamento_id = $1`, [id])).length, 0);
    await assert.rejects(anon(`select 1 from agendamento_servicos`), /permission denied/);
    for (const u of [cli, g]) {
      await assert.rejects(u()(`insert into agendamento_servicos (agendamento_id, servico_id, ordem, duracao_min) values ($1, $2, 9, 30)`, [id, design]), /permission denied/);
      await assert.rejects(u()(`update agendamento_servicos set preco = 0`), /permission denied/);
      await assert.rejects(u()(`delete from agendamento_servicos`), /permission denied/);
    }
  });

  test("sobreposição continua impossível; lista inválida é rejeitada com código", async () => {
    await assert.rejects(agendar(cli, giseleId, [design, axilas], "10:30"), /horario_indisponivel|exclusion|conflicting/);
    await assert.rejects(agendar(cli, giseleId, [], "16:00"), /servicos_invalidos/);
    await assert.rejects(agendar(cli, giseleId, [design, design], "16:00"), /servicos_invalidos/);
    await assert.rejects(agendar(cli, giseleId, [design, axilas, meiaPerna, brow, limpeza, henna, brow], "16:00"), /servicos_invalidos/);
    await assert.rejects(agendar(cli, giseleId, [design, "00000000-0000-0000-0000-000000000000"], "16:00"), /servico_nao_oferecido/);
    await assert.rejects(agendar(cli, staffId, [design, axilas], "16:00"), /servico_nao_oferecido/);
  });

  test("cliente não burla a duração com insert direto; horário que não comporta a soma é recusado", async () => {
    await sr(`update configuracoes set valor = '20' where chave = 'max_agendamentos_futuros_cliente'`);
    await assert.rejects(
      cli()(
        `insert into agendamentos (cliente_id, profissional_id, servico_id, periodo, canal) values ($1, $2, $3, tstzrange($4::timestamptz, $4::timestamptz + interval '60 min'), 'app')`,
        [cliId, giseleId, design, instante(QUARTA, "17:00")],
      ),
      /duracao_invalida/, // 1 serviço de 30 min não vira 60 por insert direto
    );
    await assert.rejects(
      cli()(`select agendar($1::uuid, array[$2::uuid, $3::uuid], $4::timestamptz)`, [giseleId, design, axilas, instante(QUARTA, "19:30")]),
      /horario_indisponivel/, // 19:30 + 60 min passa das 20:00
    );
  });

  test("painel: Gisele agenda 2 serviços para a cliente (canal painel) e o antigo de 1 serviço delega", async () => {
    const [{ id }] = await g()(`select agendar($1::uuid, array[$2::uuid, $3::uuid], $4::timestamptz, $5::uuid, ' nota ') as id`, [giseleId, design, meiaPerna, instante(QUARTA, "18:00"), cliId]);
    const [a] = await sr(`select canal, observacoes from agendamentos where id = $1`, [id]);
    assert.equal(a.canal, "painel");
    assert.equal(a.observacoes, "nota");
    assert.equal((await itens(id)).length, 2);
    const [{ id: velho }] = await g()(`select agendar($1::uuid, $2::uuid, $3::timestamptz, $4::uuid) as id`, [giseleId, brow, instante(QUARTA, "16:00"), outraId]);
    assert.deepEqual(await itens(velho), [{ nome: "Brow Lamination", ordem: 1, duracao_min: 60, preco: 120 }]);
  });

  test("remarcar mantém a soma das durações", async () => {
    const [{ id }] = await sr(`select id from agendamentos where cliente_id = $1 and servico_id = $2`, [cliId, axilas]);
    await cli()(`select remarcar($1::uuid, $2::timestamptz)`, [id, instante(QUARTA, "14:00")]);
    const [a] = await sr(`select lower(periodo) ini, upper(periodo) fim from agendamentos where id = $1`, [id]);
    assert.equal(a.fim - a.ini, 60 * 60_000);
    assert.equal(a.ini.toISOString(), new Date(instante(QUARTA, "14:00")).toISOString());
  });

  test("faturamento e métricas somam os serviços (preço da época)", async () => {
    const [{ id }] = await sr(`select id from agendamentos where cliente_id = $1 and servico_id = $2`, [cliId, axilas]);
    await sr(`update agendamentos set status = 'concluido' where id = $1`, [id]);
    // reajuste depois do atendimento não muda o valor histórico
    await sr(`update servicos set preco = 999 where id in ($1, $2)`, [axilas, design]);
    const fat = await g()(`select profissional_nome, atendimentos::int a, sem_preco::int sp, total::float8 t from faturamento_periodo($1::date, $1::date)`, [QUARTA]);
    const total = fat.find((r) => r.profissional_nome === "Total");
    assert.deepEqual({ a: total.a, sp: total.sp, t: total.t }, { a: 1, sp: 0, t: 60 });
    const [{ metricas: m }] = await g()(`select metricas($1::date, $1::date)`, [QUARTA]);
    assert.equal(Number(m.receita_estimada), 60);
    assert.equal(m.concluidos_sem_preco, 0);
    const nomes = Object.fromEntries(m.servicos_mais_agendados.map((x) => [x.nome, x.total]));
    assert.equal(nomes["Epilação axilas"], 1);
    assert.equal(nomes["Design personalizado"], 3); // item 2 do atendimento de 2 serviços, o de 15:00 e o do painel
    await sr(`update servicos set preco = 30 where id in ($1, $2)`, [axilas, design]);
  });

  test("lembretes: nome dos serviços junta com ' + ' na ordem", async () => {
    const [{ id }] = await sr(`select id from agendamentos where cliente_id = $1 and servico_id = $2`, [cliId, axilas]);
    await sr(`update agendamentos set status = 'confirmado', periodo = tstzrange(now() + interval '24 hours', now() + interval '25 hours') where id = $1`, [id]);
    const r = await sr(`select servico_nome from lembretes_pendentes('24h', 24)`);
    assert.deepEqual(r.map((x) => x.servico_nome), ["Epilação axilas + Design personalizado"]);
    await assert.rejects(cli()(`select * from lembretes_pendentes('24h', 24)`), /permission denied/);
  });

  test("protocolo pós junta os protocolos dos serviços com protocolo", async () => {
    const [{ id }] = await sr(`select id from agendamentos where cliente_id = $1 and servico_id = $2`, [cliId, axilas]);
    await sr(`update profissional_servicos set protocolo = 'Sem sol 24h.' where profissional_id = $1 and servico_id = $2`, [giseleId, axilas]);
    await sr(`update agendamentos set status = 'concluido', periodo = tstzrange(now() - interval '2 hours', now() - interval '1 hour') where id = $1`, [id]);
    let r = await sr(`select servico_nome, protocolo from protocolos_pendentes() where agendamento_id = $1`, [id]);
    assert.deepEqual(r, [{ servico_nome: "Epilação axilas + Design personalizado", protocolo: "Sem sol 24h." }]);
    await sr(`update profissional_servicos set protocolo = 'Não molhe.' where profissional_id = $1 and servico_id = $2`, [giseleId, design]);
    r = await sr(`select protocolo from protocolos_pendentes() where agendamento_id = $1`, [id]);
    assert.equal(r[0].protocolo, "*Epilação axilas*\nSem sol 24h.\n\n*Design personalizado*\nNão molhe.");
  });

  test("mudar servico_id (staff/owner) acompanha o item 1", async () => {
    const [{ id }] = await sr(`select id from agendamentos where cliente_id = $1 and servico_id = $2`, [cliId, axilas]);
    await g()(`update agendamentos set servico_id = $2 where id = $1`, [id, meiaPerna]);
    assert.deepEqual((await itens(id)).map((i) => i.nome), ["Epilação meia perna", "Design personalizado"]);
  });
});

describe("nome da cliente", () => {
  let db, sr, gisele, staffUid, staffId, giseleId, design, cliPlaceholder, cliReal, cliSemAtendimento;
  const g = () => como(db, "authenticated", gisele);

  before(async () => {
    db = await criarBanco();
    sr = como(db, "service_role");
    gisele = await criarLogin(db, TELEFONE_GISELE);
    [{ id: giseleId }] = (await db.query(`select id from profissionais where papel = 'owner'`)).rows;
    [{ id: design }] = (await db.query(`select id from servicos where nome = 'Design personalizado'`)).rows;
    [{ id: staffId }] = await g()(`insert into profissionais (nome, telefone, papel) values ('Ana Staff', '+5599922220000', 'staff') returning id`);
    await g()(`insert into profissional_servicos (profissional_id, servico_id) values ($1, $2)`, [staffId, design]);
    staffUid = await criarLogin(db, "+5599922220000");
    // login por código sem nome => "Cliente"
    const u = await criarLogin(db, "+5599933330000");
    [{ id: cliPlaceholder }] = (await db.query(`select id from clientes where user_id = $1`, [u])).rows;
    assert.equal((await db.query(`select nome from clientes where id = $1`, [cliPlaceholder])).rows[0].nome, "Cliente");
    [{ id: cliReal }] = await sr(`insert into clientes (nome, whatsapp) values ('Maria Real', '+5599944440000') returning id`);
    [{ id: cliSemAtendimento }] = await sr(`insert into clientes (nome, whatsapp) values ('99988887777', '+5599955550000') returning id`);
    await sr(`insert into agendamentos (cliente_id, profissional_id, servico_id, periodo) values ($1, $2, $3, tstzrange($4::timestamptz, $4::timestamptz + interval '30 min'))`, [cliPlaceholder, staffId, design, instante(QUARTA, "10:00")]);
  });

  test("obter_ou_criar_cliente troca 'Cliente' e nome sem letra, mas nunca nome de verdade", async () => {
    const s = como(db, "authenticated", staffUid);
    await s(`select obter_ou_criar_cliente('Joana Silva', '+5599933330000')`);
    await s(`select obter_ou_criar_cliente('Fulana Outra', '+5599944440000')`);
    await s(`select obter_ou_criar_cliente('Beltrana', '+5599955550000')`);
    const n = Object.fromEntries((await db.query(`select whatsapp, nome from clientes`)).rows.map((r) => [r.whatsapp, r.nome]));
    assert.equal(n["+5599933330000"], "Joana Silva");
    assert.equal(n["+5599944440000"], "Maria Real");
    assert.equal(n["+5599955550000"], "Beltrana");
    // cliente nova continua sendo criada
    const [{ obter_ou_criar_cliente: novo }] = await s(`select obter_ou_criar_cliente('Nova Cliente', '+5599900001111')`);
    assert.ok(novo);
  });

  test("renomear_cliente: owner qualquer; staff só com atendimento concluído; cliente e anônimo não", async () => {
    await g()(`select renomear_cliente($1::uuid, '  Ana Paula  ')`, [cliReal]);
    assert.equal((await db.query(`select nome from clientes where id = $1`, [cliReal])).rows[0].nome, "Ana Paula");

    const s = como(db, "authenticated", staffUid);
    // só agendamento confirmado (futuro) não dá permissão
    await assert.rejects(s(`select renomear_cliente($1::uuid, 'Joana S. Silva')`, [cliPlaceholder]), /sem_permissao/);
    await sr(`update agendamentos set status = 'concluido' where cliente_id = $1`, [cliPlaceholder]);
    await s(`select renomear_cliente($1::uuid, 'Joana S. Silva')`, [cliPlaceholder]);
    assert.equal((await db.query(`select nome from clientes where id = $1`, [cliPlaceholder])).rows[0].nome, "Joana S. Silva");
    await assert.rejects(s(`select renomear_cliente($1::uuid, 'Intrusa')`, [cliReal]), /sem_permissao/);

    await assert.rejects(g()(`select renomear_cliente($1::uuid, 'A')`, [cliReal]), /nome_invalido/);
    await assert.rejects(g()(`select renomear_cliente($1::uuid, $2)`, [cliReal, "x".repeat(121)]), /nome_invalido/);
    await assert.rejects(g()(`select renomear_cliente($1::uuid, '   ')`, [cliReal]), /nome_invalido/);
    await assert.rejects(g()(`select renomear_cliente($1::uuid, 'Fulana')`, ["00000000-0000-0000-0000-000000000000"]), /cliente_nao_encontrada/);

    const cliUid = await criarLoginAnonimo(db);
    await como(db, "authenticated", cliUid)(`select cadastrar_cliente('Zélia', '+5599912345678')`);
    await assert.rejects(como(db, "authenticated", cliUid)(`select renomear_cliente($1::uuid, 'Hack')`, [cliReal]), /apenas_profissionais/);
    await assert.rejects(como(db, "anon")(`select renomear_cliente($1::uuid, 'Hack')`, [cliReal]), /permission denied/);
  });

  test("staff não renomeia direto pelo UPDATE (a RPC é o caminho)", async () => {
    const r = await como(db, "authenticated", staffUid)(`update clientes set nome = 'Direto' where id = $1 returning id`, [cliPlaceholder]);
    assert.equal(r.length, 0);
  });
});
