// Testes de RLS e regras de negócio no banco, papel por papel (seção 12:
// "cada policy tem que ser testada com um usuário de teste de cada papel
// antes de ir pro ar"). Roda contra as migrations reais.
//
//   cd supabase/tests && npm install && npm test

import assert from "node:assert/strict";
import { before, describe, test } from "node:test";
import { TELEFONE_GISELE, como, criarBanco, criarLogin, instante, proximoDia } from "./ambiente.mjs";

let db, sr, anon;
let gisele, staff, clienteA, clienteB; // auth.users.id
let idGisele, idStaff, idClienteA, idClienteB; // ids de negócio
let design, henna, limpeza; // servicos
const TERCA = proximoDia(2, 3);
const QUARTA = proximoDia(3, 3);

before(async () => {
  db = await criarBanco();
  sr = como(db, "service_role");
  anon = como(db, "anon");

  gisele = await criarLogin(db, TELEFONE_GISELE);
  [{ id: idGisele }] = (await db.query(`select id from profissionais where papel = 'owner'`)).rows;

  const servs = (await db.query(`select id, nome from servicos`)).rows;
  design = servs.find((s) => s.nome === "Design personalizado").id;
  henna = servs.find((s) => s.nome === "Design personalizado + Henna").id;
  limpeza = servs.find((s) => s.nome === "Limpeza de pele profunda").id;

  // Gisele cadastra a profissional nova pelo painel, antes dela logar
  const comoGisele = como(db, "authenticated", gisele);
  [{ id: idStaff }] = await comoGisele(
    `insert into profissionais (nome, telefone, papel) values ('Ana Staff', '+5599922220000', 'staff') returning id`,
  );
  await comoGisele(`insert into profissional_servicos (profissional_id, servico_id) values ($1, $2)`, [idStaff, henna]);
  await comoGisele(
    `insert into disponibilidade_profissional (profissional_id, dia_semana, hora_inicio, hora_fim) values ($1, 2, '09:00', '18:00')`,
    [idStaff],
  );
  staff = await criarLogin(db, "+5599922220000");

  // Cliente A entra direto pelo app; cliente B veio do pré-cadastro antes
  clienteA = await criarLogin(db, "+5599933330000");
  await sr(`insert into clientes (nome, whatsapp, consentimento) values ('Bruna Pré', '+5599944440000', true)`);
  clienteB = await criarLogin(db, "+5599944440000");

  [{ id: idClienteA }] = (await db.query(`select id from clientes where user_id = $1`, [clienteA])).rows;
  [{ id: idClienteB }] = (await db.query(`select id from clientes where user_id = $1`, [clienteB])).rows;
});

describe("vínculo de login (seção 4, ponto 5)", () => {
  test("owner do seed é vinculada pelo telefone no primeiro login", async () => {
    const [p] = (await db.query(`select user_id from profissionais where id = $1`, [idGisele])).rows;
    assert.equal(p.user_id, gisele);
  });

  test("staff cadastrada antes de logar é vinculada, e não vira cliente", async () => {
    const [p] = (await db.query(`select user_id from profissionais where id = $1`, [idStaff])).rows;
    assert.equal(p.user_id, staff);
    const cl = (await db.query(`select 1 from clientes where user_id = $1`, [staff])).rows;
    assert.equal(cl.length, 0);
  });

  test("cliente do pré-cadastro é vinculada, sem duplicar", async () => {
    const linhas = (await db.query(`select nome, user_id from clientes where whatsapp = '+5599944440000'`)).rows;
    assert.equal(linhas.length, 1);
    assert.equal(linhas[0].nome, "Bruna Pré");
    assert.equal(linhas[0].user_id, clienteB);
  });

  test("login novo sem cadastro cria cliente com whatsapp em E.164", async () => {
    const [c] = (await db.query(`select whatsapp from clientes where user_id = $1`, [clienteA])).rows;
    assert.equal(c.whatsapp, "+5599933330000");
  });

  test("profissional cadastrada DEPOIS de já ter login é vinculada", async () => {
    const u = await criarLogin(db, "+5599955550000"); // entrou como cliente antes
    const [p] = await como(db, "authenticated", gisele)(
      `insert into profissionais (nome, telefone) values ('Carla', '+5599955550000') returning user_id`,
    );
    assert.equal(p.user_id, u);
  });

  test("troca de número pelo studio: entrar com o número novo assume o cadastro", async () => {
    const antigo = await criarLogin(db, "+5599966660000");
    await como(db, "authenticated", gisele)(`update clientes set whatsapp = '+5599977770000' where user_id = $1`, [antigo]);
    const novo = await criarLogin(db, "+5599977770000");
    const linhas = (await db.query(`select user_id from clientes where whatsapp = '+5599977770000'`)).rows;
    assert.equal(linhas.length, 1);
    assert.equal(linhas[0].user_id, novo);
  });
});

describe("anon (site público, sem login)", () => {
  test("vê serviços ativos e perfil público de profissionais", async () => {
    assert.ok((await anon(`select id from servicos`)).length >= 9);
    assert.ok((await anon(`select id, nome, bio, foto_url from profissionais`)).length >= 2);
  });

  test("NÃO lê telefone de profissional", async () => {
    await assert.rejects(anon(`select telefone from profissionais`), /permission denied/);
  });

  test("não enxerga clientes nem agendamentos", async () => {
    assert.equal((await anon(`select id from clientes`)).length, 0);
    assert.equal((await anon(`select id from agendamentos`)).length, 0);
  });

  test("consulta horários livres (motor da seção 5)", async () => {
    const h = await anon(`select * from horarios_disponiveis($1, $2, $3)`, [idGisele, design, TERCA]);
    assert.ok(h.length > 0);
  });

  test("não chama RPC de lembrete, métricas nem admin", async () => {
    await assert.rejects(anon(`select * from lembretes_pendentes('24h', 24, 10)`), /permission denied/);
    await assert.rejects(anon(`select metricas(current_date, current_date)`), /permission denied/);
    await assert.rejects(anon(`select * from profissionais_admin()`), /permission denied/);
  });

  test("não agenda", async () => {
    await assert.rejects(anon(`select agendar($1, $2, $3)`, [idGisele, design, instante(TERCA, "15:00")]), /permission denied/);
  });
});

describe("motor de agendamento (seção 5)", () => {
  test("grade de 30min respeitando almoço 12:30–14:00", async () => {
    const h = (await anon(`select * from horarios_disponiveis($1, $2, $3)`, [idGisele, design, TERCA])).map((r) =>
      new Date(Object.values(r)[0]).toISOString(),
    );
    assert.ok(h.includes(instante(TERCA, "09:30")));
    assert.ok(h.includes(instante(TERCA, "12:00"))); // 12:00–12:30 cabe
    assert.ok(!h.includes(instante(TERCA, "12:30")));
    assert.ok(!h.includes(instante(TERCA, "13:30")));
    assert.ok(h.includes(instante(TERCA, "14:00")));
    assert.ok(h.includes(instante(TERCA, "19:30"))); // 19:30–20:00 cabe
    assert.ok(!h.includes(instante(TERCA, "20:00")));
  });

  test("serviço de 90min não invade o almoço", async () => {
    const h = (await anon(`select * from horarios_disponiveis($1, $2, $3)`, [idGisele, limpeza, TERCA])).map((r) =>
      new Date(Object.values(r)[0]).toISOString(),
    );
    assert.ok(h.includes(instante(TERCA, "11:00"))); // 11:00–12:30
    assert.ok(!h.includes(instante(TERCA, "11:30")));
  });

  test("domingo fechado", async () => {
    const domingo = proximoDia(0, 3);
    assert.equal((await anon(`select * from horarios_disponiveis($1, $2, $3)`, [idGisele, design, domingo])).length, 0);
  });

  test("profissional que não faz o serviço não tem horário", async () => {
    assert.equal((await anon(`select * from horarios_disponiveis($1, $2, $3)`, [idStaff, design, TERCA])).length, 0);
  });
});

describe("cliente", () => {
  let agA; // agendamento da cliente A

  test("lê só o próprio cadastro", async () => {
    const r = await como(db, "authenticated", clienteA)(`select id from clientes`);
    assert.deepEqual(r.map((x) => x.id), [idClienteA]);
  });

  test("agenda horário válido pela RPC", async () => {
    [{ agendar: agA }] = await como(db, "authenticated", clienteA)(`select agendar($1, $2, $3)`, [
      idGisele,
      design,
      instante(TERCA, "15:00"),
    ]);
    const [a] = (await db.query(`select status, canal, upper(periodo) - lower(periodo) as dur from agendamentos where id = $1`, [agA])).rows;
    assert.equal(a.status, "confirmado");
    assert.equal(a.canal, "app");
  });

  test("dispara o Database Webhook de notificação", async () => {
    const w = (await db.query(`select url from webhooks_disparados where tabela = 'agendamentos'`)).rows;
    assert.ok(w.some((x) => x.url.endsWith("/notificar-agendamento")));
  });

  test("horário ocupado some da grade pra outra cliente", async () => {
    const h = (await como(db, "authenticated", clienteB)(`select * from horarios_disponiveis($1, $2, $3)`, [idGisele, design, TERCA])).map(
      (r) => new Date(Object.values(r)[0]).toISOString(),
    );
    assert.ok(!h.includes(instante(TERCA, "15:00")));
  });

  test("outra cliente tentando o mesmo horário é recusada", async () => {
    await assert.rejects(
      como(db, "authenticated", clienteB)(`select agendar($1, $2, $3)`, [idGisele, design, instante(TERCA, "15:00")]),
      /horario_indisponivel/,
    );
  });

  test("não agenda fora da grade (madrugada, almoço, fora do passo)", async () => {
    const c = como(db, "authenticated", clienteA);
    await assert.rejects(c(`select agendar($1, $2, $3)`, [idGisele, design, instante(TERCA, "03:00")]), /horario_indisponivel/);
    await assert.rejects(c(`select agendar($1, $2, $3)`, [idGisele, design, instante(TERCA, "13:00")]), /horario_indisponivel/);
    await assert.rejects(c(`select agendar($1, $2, $3)`, [idGisele, design, instante(TERCA, "15:10")]), /horario_indisponivel/);
  });

  test("não agenda serviço com profissional que não faz", async () => {
    await assert.rejects(
      como(db, "authenticated", clienteA)(`select agendar($1, $2, $3)`, [idStaff, design, instante(TERCA, "10:00")]),
      /servico_nao_oferecido/,
    );
  });

  test("insert direto não consegue marcar já 'concluido' nem em nome de outra", async () => {
    const c = como(db, "authenticated", clienteA);
    const periodo = `[${instante(QUARTA, "10:00")},${instante(QUARTA, "10:30")})`;
    await assert.rejects(
      c(`insert into agendamentos (cliente_id, profissional_id, servico_id, periodo, status) values ($1, $2, $3, $4, 'concluido')`, [
        idClienteA,
        idGisele,
        design,
        periodo,
      ]),
      /row-level security/,
    );
    await assert.rejects(
      c(`insert into agendamentos (cliente_id, profissional_id, servico_id, periodo) values ($1, $2, $3, $4)`, [
        idClienteB,
        idGisele,
        design,
        periodo,
      ]),
      /row-level security/,
    );
  });

  test("não vê agendamento de outra cliente", async () => {
    assert.equal((await como(db, "authenticated", clienteB)(`select id from agendamentos where id = $1`, [agA])).length, 0);
  });

  test("não consegue cancelar nem remarcar agendamento de outra", async () => {
    await assert.rejects(como(db, "authenticated", clienteB)(`select cancelar($1)`, [agA]), /fora_da_janela/);
  });

  test("não troca profissional/serviço/status do próprio agendamento", async () => {
    const c = como(db, "authenticated", clienteA);
    await assert.rejects(c(`update agendamentos set servico_id = $2 where id = $1`, [agA, henna]), /cliente só pode/);
    await assert.rejects(c(`update agendamentos set status = 'concluido' where id = $1`, [agA]), /cliente só pode cancelar/);
  });

  test("remarca pela RPC pra outro horário livre, e os lembretes 24h/1h rearmam", async () => {
    await sr(`insert into lembretes_enviados (agendamento_id, tipo) values ($1, '24h'), ($1, 'confirmacao')`, [agA]);
    await como(db, "authenticated", clienteA)(`select remarcar($1, $2)`, [agA, instante(QUARTA, "16:00")]);
    const [a] = (await db.query(`select lower(periodo) as inicio from agendamentos where id = $1`, [agA])).rows;
    assert.equal(new Date(a.inicio).toISOString(), instante(QUARTA, "16:00"));
    const tipos = (await db.query(`select tipo from lembretes_enviados where agendamento_id = $1`, [agA])).rows.map((r) => r.tipo);
    assert.deepEqual(tipos, ["confirmacao"]);
  });

  test("não remarca pra horário fora da grade", async () => {
    await assert.rejects(
      como(db, "authenticated", clienteA)(`select remarcar($1, $2)`, [agA, instante(QUARTA, "22:00")]),
      /horario_indisponivel/,
    );
  });

  test("não troca o próprio whatsapp, mas edita nome", async () => {
    const c = como(db, "authenticated", clienteA);
    await assert.rejects(c(`update clientes set whatsapp = '+5599900000000' where id = $1`, [idClienteA]), /whatsapp e vínculo/);
    await c(`update clientes set nome = 'Alice', consentimento = true, consentimento_versao = 'v1-25092026' where id = $1`, [idClienteA]);
    const [cl] = (await db.query(`select nome, consentimento_em from clientes where id = $1`, [idClienteA])).rows;
    assert.equal(cl.nome, "Alice");
    assert.ok(cl.consentimento_em, "consentimento_em carimbado pelo banco");
  });

  test("não lê bloqueios, lembretes, nem chama métricas/admin", async () => {
    const c = como(db, "authenticated", clienteA);
    assert.equal((await c(`select id from bloqueios_agenda`)).length, 0);
    assert.equal((await c(`select id from lembretes_enviados`)).length, 0);
    await assert.rejects(c(`select metricas(current_date, current_date)`), /apenas_owner/);
    await assert.rejects(c(`select * from profissionais_admin()`), /apenas_owner/);
    await assert.rejects(c(`select obter_ou_criar_cliente('X', '+5599900000001')`), /apenas_profissionais/);
  });

  test("não altera serviço nem configuração", async () => {
    const c = como(db, "authenticated", clienteA);
    const r = await c(`update servicos set preco = 1 returning id`);
    assert.equal(r.length, 0);
    await assert.rejects(c(`insert into configuracoes (chave, valor) values ('x', '1')`), /row-level security/);
  });

  test("cancela o próprio fora da janela mínima", async () => {
    await como(db, "authenticated", clienteA)(`select cancelar($1)`, [agA]);
    const [a] = (await db.query(`select status from agendamentos where id = $1`, [agA])).rows;
    assert.equal(a.status, "cancelado");
  });

  // Direto na tabela, sem passar pelas RPCs: quem garante a regra tem que ser
  // a policy + trigger, não o filtro "where status = 'confirmado'" do cancelar().
  test("status pela cliente: só confirmado → cancelado, e com a mesma janela mínima", async () => {
    const c = como(db, "authenticated", clienteA);
    const novo = async (inicio) =>
      (
        await sr(
          `insert into agendamentos (cliente_id, profissional_id, servico_id, periodo) values ($1, $2, $3, tstzrange($4::timestamptz, $4::timestamptz + interval '30 min')) returning id`,
          [idClienteA, idGisele, design, inicio],
        )
      )[0].id;
    const status = async (id) => (await db.query(`select status from agendamentos where id = $1`, [id])).rows[0].status;

    // confirmado, bem fora da janela: no_show/concluido recusados pelo trigger
    const longe = await novo(instante(QUARTA, "11:00"));
    await assert.rejects(c(`update agendamentos set status = 'no_show' where id = $1`, [longe]), /cliente só pode cancelar/);
    await assert.rejects(c(`update agendamentos set status = 'concluido' where id = $1`, [longe]), /cliente só pode cancelar/);

    // cancelado (agA, cancelado no teste anterior): reabrir ou mudar não pega linha nenhuma
    assert.equal((await c(`update agendamentos set status = 'confirmado' where id = $1 returning id`, [agA])).length, 0);
    assert.equal((await c(`update agendamentos set status = 'no_show' where id = $1 returning id`, [agA])).length, 0);
    assert.equal(await status(agA), "cancelado");

    // concluido pelo studio: cliente não mexe
    await sr(`update agendamentos set status = 'concluido' where id = $1`, [longe]);
    assert.equal((await c(`update agendamentos set status = 'cancelado' where id = $1 returning id`, [longe])).length, 0);
    assert.equal(await status(longe), "concluido");

    // confirmado dentro da janela de 2h: cancelar direto também não pega linha
    const perto = new Date(Date.now() + 90 * 60_000);
    perto.setUTCSeconds(0, 0);
    const idPerto = await novo(perto.toISOString());
    assert.equal((await c(`update agendamentos set status = 'cancelado' where id = $1 returning id`, [idPerto])).length, 0);
    assert.equal(await status(idPerto), "confirmado");
  });

  test("dentro da janela mínima não cancela nem remarca pelo app", async () => {
    // agendamento daqui a 1h, criado pelo studio (encaixe)
    const inicio = new Date(Date.now() + 60 * 60_000);
    inicio.setUTCSeconds(0, 0);
    const [{ id }] = await sr(
      `insert into agendamentos (cliente_id, profissional_id, servico_id, periodo) values ($1, $2, $3, tstzrange($4::timestamptz, $4::timestamptz + interval '30 min')) returning id`,
      [idClienteA, idGisele, design, inicio.toISOString()],
    );
    await assert.rejects(como(db, "authenticated", clienteA)(`select cancelar($1)`, [id]), /fora_da_janela/);
    await assert.rejects(
      como(db, "authenticated", clienteA)(`select remarcar($1, $2)`, [id, instante(QUARTA, "17:00")]),
      /fora_da_janela/,
    );
  });
});

describe("staff (profissional nova)", () => {
  let agStaff;
  const s = () => como(db, "authenticated", staff);

  test("marca encaixe fora da grade pra própria agenda, com cliente nova", async () => {
    const [{ obter_ou_criar_cliente: novaId }] = await s()(`select obter_ou_criar_cliente('Dora', '+5599988880000')`);
    [{ agendar: agStaff }] = await s()(`select agendar($1, $2, $3, $4)`, [idStaff, henna, instante(QUARTA, "19:00"), novaId]);
    const [a] = (await db.query(`select canal from agendamentos where id = $1`, [agStaff])).rows;
    assert.equal(a.canal, "painel");
  });

  test("obter_ou_criar_cliente não sobrescreve cadastro existente", async () => {
    const [{ obter_ou_criar_cliente: id }] = await s()(`select obter_ou_criar_cliente('Outro Nome', '+5599944440000')`);
    assert.equal(id, idClienteB);
    const [c] = (await db.query(`select nome from clientes where id = $1`, [idClienteB])).rows;
    assert.equal(c.nome, "Bruna Pré");
  });

  test("vê só a própria agenda", async () => {
    const r = await s()(`select profissional_id from agendamentos`);
    assert.ok(r.length >= 1);
    assert.ok(r.every((x) => x.profissional_id === idStaff));
  });

  test("vê só as próprias clientes", async () => {
    const r = await s()(`select nome from clientes`);
    assert.deepEqual(r.map((x) => x.nome), ["Dora"]);
  });

  test("não agenda na agenda da Gisele", async () => {
    await assert.rejects(
      s()(`insert into agendamentos (cliente_id, profissional_id, servico_id, periodo) values ($1, $2, $3, $4)`, [
        idClienteB,
        idGisele,
        design,
        `[${instante(QUARTA, "10:00")},${instante(QUARTA, "10:30")})`,
      ]),
      /row-level security/,
    );
  });

  test("dá baixa no próprio atendimento", async () => {
    await s()(`update agendamentos set status = 'concluido' where id = $1`, [agStaff]);
    const [a] = (await db.query(`select status from agendamentos where id = $1`, [agStaff])).rows;
    assert.equal(a.status, "concluido");
  });

  test("edita a própria bio, mas não o próprio papel/ativo/telefone", async () => {
    await s()(`update profissionais set bio = 'Especialista em henna' where id = $1`, [idStaff]);
    await assert.rejects(s()(`update profissionais set papel = 'owner' where id = $1`, [idStaff]), /apenas o owner/);
    await assert.rejects(s()(`update profissionais set telefone = '+5599900000002' where id = $1`, [idStaff]), /apenas o owner/);
  });

  test("não mexe em serviço, config, nem em outra profissional", async () => {
    assert.equal((await s()(`update servicos set preco = 1 returning id`)).length, 0);
    assert.equal((await s()(`update profissionais set bio = 'x' where id = $1 returning id`, [idGisele])).length, 0);
    await assert.rejects(s()(`insert into configuracoes (chave, valor) values ('y', '1')`), /row-level security/);
  });

  test("gerencia a própria disponibilidade e bloqueios, não os da Gisele", async () => {
    await s()(`insert into bloqueios_agenda (profissional_id, periodo) values ($1, tstzrange(now() + interval '10 days', now() + interval '11 days'))`, [idStaff]);
    await assert.rejects(
      s()(`insert into bloqueios_agenda (profissional_id, periodo) values ($1, tstzrange(now() + interval '10 days', now() + interval '11 days'))`, [idGisele]),
      /row-level security/,
    );
    assert.equal((await s()(`delete from disponibilidade_profissional where profissional_id = $1 returning id`, [idGisele])).length, 0);
  });

  test("não vê métricas nem telefone da equipe", async () => {
    await assert.rejects(s()(`select metricas(current_date, current_date)`), /apenas_owner/);
    await assert.rejects(s()(`select telefone from profissionais`), /permission denied/);
  });

  test("bloqueio tira o horário da grade", async () => {
    // longe do bloqueio de "daqui a 10–11 dias" do teste anterior
    const dia = proximoDia(2, 20);
    const antes = await anon(`select * from horarios_disponiveis($1, $2, $3)`, [idStaff, henna, dia]);
    await s()(`insert into bloqueios_agenda (profissional_id, periodo) values ($1, tstzrange($2::timestamptz, $3::timestamptz))`, [
      idStaff,
      instante(dia, "00:00"),
      instante(dia, "23:59"),
    ]);
    const depois = await anon(`select * from horarios_disponiveis($1, $2, $3)`, [idStaff, henna, dia]);
    assert.ok(antes.length > 0);
    assert.equal(depois.length, 0);
  });
});

describe("owner (Gisele)", () => {
  const g = () => como(db, "authenticated", gisele);

  test("vê todas as clientes e todos os agendamentos", async () => {
    assert.ok((await g()(`select id from clientes`)).length >= 4);
    const profs = new Set((await g()(`select profissional_id from agendamentos`)).map((r) => r.profissional_id));
    assert.ok(profs.has(idStaff) && profs.has(idGisele));
  });

  test("lê telefone da equipe pela RPC admin", async () => {
    const r = await g()(`select nome, telefone from profissionais_admin()`);
    assert.ok(r.some((p) => p.telefone === "+5599922220000"));
  });

  test("vê e reativa serviço inativo", async () => {
    await g()(`update servicos set ativo = false where id = $1`, [limpeza]);
    assert.equal((await anon(`select id from servicos where id = $1`, [limpeza])).length, 0);
    assert.equal((await g()(`select id from servicos where id = $1`, [limpeza])).length, 1);
    await g()(`update servicos set ativo = true where id = $1`, [limpeza]);
  });

  test("ajusta configuração", async () => {
    await g()(`update configuracoes set valor = '3' where chave = 'horas_minimas_remarcacao'`);
    const [c] = (await db.query(`select valor from configuracoes where chave = 'horas_minimas_remarcacao'`)).rows;
    assert.equal(c.valor, 3);
    await g()(`update configuracoes set valor = '2' where chave = 'horas_minimas_remarcacao'`);
  });

  test("encaixe fora da grade é permitido pro studio, sobreposição nunca", async () => {
    const c = g();
    const [{ agendar: id }] = await c(`select agendar($1, $2, $3, $4)`, [idGisele, design, instante(QUARTA, "21:00"), idClienteB]);
    assert.ok(id);
    await assert.rejects(
      c(`select agendar($1, $2, $3, $4)`, [idGisele, design, instante(QUARTA, "21:15"), idClienteA]),
      /conflicting key value violates exclusion constraint/,
    );
  });

  test("métricas batem com os dados", async () => {
    const [{ metricas: m }] = await g()(`select metricas($1::date, $2::date)`, [TERCA < QUARTA ? TERCA : QUARTA, proximoDia(3, 10)]);
    assert.ok(m.total >= 2);
    assert.ok(m.por_status.concluido >= 1);
    assert.ok(Number(m.receita_estimada) >= 40); // henna concluído com a staff
    assert.ok(Array.isArray(m.por_dia));
  });
});

describe("lembretes (Edge Functions via service_role)", () => {
  test("lembretes_pendentes acha agendamento a ~24h e respeita o log", async () => {
    const inicio = new Date(Date.now() + 24 * 3600_000);
    inicio.setUTCSeconds(0, 0);
    const [{ id }] = await sr(
      `insert into agendamentos (cliente_id, profissional_id, servico_id, periodo) values ($1, $2, $3, tstzrange($4::timestamptz, $4::timestamptz + interval '30 min')) returning id`,
      [idClienteB, idStaff, henna, inicio.toISOString()],
    );
    let r = await sr(`select agendamento_id from lembretes_pendentes('24h', 24, 10)`);
    assert.ok(r.some((x) => x.agendamento_id === id));
    await sr(`insert into lembretes_enviados (agendamento_id, cliente_id, tipo) values ($1, $2, '24h')`, [id, idClienteB]);
    r = await sr(`select agendamento_id from lembretes_pendentes('24h', 24, 10)`);
    assert.ok(!r.some((x) => x.agendamento_id === id));
  });

  test("authenticated não chama as RPCs de lembrete", async () => {
    await assert.rejects(como(db, "authenticated", gisele)(`select * from aniversariantes_pendentes()`), /permission denied/);
  });
});
