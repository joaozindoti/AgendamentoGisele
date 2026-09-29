// Cliente sem login (sessão anônima) e protocolo pós-atendimento — migration
// 20260929150000. A cliente abre o app, o Supabase cria um auth.users sem
// telefone, e ela se cadastra por cadastrar_cliente(). Tudo o que já valia
// pra cliente logada por código (RLS de meu_cliente_id) tem que continuar
// valendo pra ela.

import assert from "node:assert/strict";
import { before, describe, test } from "node:test";
import { TELEFONE_GISELE, como, criarBanco, criarLogin, criarLoginAnonimo, instante, proximoDia } from "./ambiente.mjs";

const FOTOS = "https://pjbcgyzykvidbwdjlnvp.supabase.co/storage/v1/object/public/fotos";
const TERCA = proximoDia(2, 3);
const QUARTA = proximoDia(3, 3);

let db, sr, anon;
let gisele, staff, idGisele, idStaff;
let design, henna, soDaStaff;
let anaSessao, anaId; // cliente anônima cadastrada com número novo
let biaSessao; // outra cliente anônima

before(async () => {
  db = await criarBanco();
  sr = como(db, "service_role");
  anon = como(db, "anon");
  gisele = await criarLogin(db, TELEFONE_GISELE);
  [{ id: idGisele }] = (await db.query(`select id from profissionais where papel = 'owner'`)).rows;
  const servs = (await db.query(`select id, nome from servicos`)).rows;
  design = servs.find((s) => s.nome === "Design personalizado").id;
  henna = servs.find((s) => s.nome === "Design personalizado + Henna").id;

  [{ id: idStaff }] = await como(db, "authenticated", gisele)(
    `insert into profissionais (nome, telefone, papel) values ('Ana Staff', '+5599922220000', 'staff') returning id`,
  );
  await como(db, "authenticated", gisele)(`insert into profissional_servicos (profissional_id, servico_id) values ($1, $2)`, [idStaff, henna]);
  staff = await criarLogin(db, "+5599922220000");
  // serviço que só a staff faz (no seed, a Gisele faz os 9)
  [{ id: soDaStaff }] = await como(db, "authenticated", gisele)(
    `insert into servicos (nome, preco, duracao_min) values ('Só da staff', 50, 30) returning id`,
  );
  await como(db, "authenticated", gisele)(`insert into profissional_servicos (profissional_id, servico_id) values ($1, $2)`, [idStaff, soDaStaff]);
});

describe("cliente anônima: cadastro sem código", () => {
  test("sessão anônima não vira cliente sozinha (sem telefone, handle_new_user não cria nada)", async () => {
    anaSessao = await criarLoginAnonimo(db);
    const c = como(db, "authenticated", anaSessao);
    assert.deepEqual(await c(`select id from clientes`), []);
    assert.deepEqual(await c(`select id from agendamentos`), []);
    await assert.rejects(c(`select agendar($1, $2, $3)`, [idGisele, design, instante(TERCA, "14:00")]), /cliente_nao_encontrada/);
  });

  test("não insere em clientes direto, só pela RPC", async () => {
    await assert.rejects(
      como(db, "authenticated", anaSessao)(`insert into clientes (nome, whatsapp, user_id) values ('X', '+5599911112222', $1)`, [anaSessao]),
      /row-level security/,
    );
  });

  test("recusa número inválido (DDD com zero, dígitos faltando) e nome vazio", async () => {
    const c = como(db, "authenticated", anaSessao);
    await assert.rejects(c(`select cadastrar_cliente('Ana', '+5504962459376')`), /whatsapp_invalido/);
    await assert.rejects(c(`select cadastrar_cliente('Ana', '+55999123')`), /whatsapp_invalido/);
    await assert.rejects(c(`select cadastrar_cliente(' ', '+5599977770000')`), /nome_invalido/);
    await assert.rejects(c(`select cadastrar_cliente('Ana', '+5599977770000', '2999-01-01')`), /nascimento_invalido/);
    await assert.rejects(anon(`select cadastrar_cliente('Ana', '+5599977770000')`), /permission denied/);
  });

  test("cadastro liga a cliente à sessão, e ela só vê o próprio cadastro", async () => {
    const c = como(db, "authenticated", anaSessao);
    [{ cadastrar_cliente: anaId }] = await c(`select cadastrar_cliente('Ana Nova', '+5599977770000', '1995-04-10')`);
    const [linha] = (await db.query(`select user_id, nome, data_nascimento::text d, consentimento from clientes where id = $1`, [anaId])).rows;
    assert.equal(linha.user_id, anaSessao);
    assert.equal(linha.d, "1995-04-10");
    assert.equal(linha.consentimento, false);

    biaSessao = await criarLoginAnonimo(db);
    await como(db, "authenticated", biaSessao)(`select cadastrar_cliente('Bia', '+5599966660000')`);
    assert.deepEqual((await c(`select id from clientes`)).map((r) => r.id), [anaId]);
  });

  test("toque duplo no botão devolve o mesmo cadastro; outro número na mesma sessão é recusado", async () => {
    const c = como(db, "authenticated", anaSessao);
    const [{ cadastrar_cliente: id }] = await c(`select cadastrar_cliente('Ana Nova', '+5599977770000')`);
    assert.equal(id, anaId);
    await assert.rejects(c(`select cadastrar_cliente('Ana', '+5599955554444')`), /cliente_ja_cadastrada/);
  });

  test("agenda e só vê o próprio agendamento", async () => {
    const ana = como(db, "authenticated", anaSessao);
    const bia = como(db, "authenticated", biaSessao);
    const [{ agendar: agAna }] = await ana(`select agendar($1, $2, $3)`, [idGisele, design, instante(TERCA, "14:00")]);
    const [{ agendar: agBia }] = await bia(`select agendar($1, $2, $3)`, [idGisele, design, instante(TERCA, "15:00")]);
    assert.deepEqual((await ana(`select id from agendamentos`)).map((r) => r.id), [agAna]);
    assert.deepEqual((await bia(`select id from agendamentos`)).map((r) => r.id), [agBia]);
    await assert.rejects(ana(`select cancelar($1)`, [agBia]), /fora_da_janela_de_remarcacao/);
  });

  test("não troca o próprio whatsapp nem o vínculo por update direto", async () => {
    const c = como(db, "authenticated", anaSessao);
    await assert.rejects(c(`update clientes set whatsapp = '+5599900001111' where id = $1`, [anaId]), /só podem ser alterados pelo studio/);
    await assert.rejects(c(`update clientes set user_id = $2 where id = $1`, [anaId, biaSessao]), /só podem ser alterados pelo studio/);
  });

  test("teto de agendamentos futuros por cliente", async () => {
    const c = como(db, "authenticated", anaSessao);
    await c(`select agendar($1, $2, $3)`, [idGisele, design, instante(TERCA, "16:00")]);
    await c(`select agendar($1, $2, $3)`, [idGisele, design, instante(QUARTA, "14:00")]);
    await assert.rejects(c(`select agendar($1, $2, $3)`, [idGisele, design, instante(QUARTA, "15:00")]), /limite_agendamentos/);
    // o studio continua podendo encaixar pra ela
    await como(db, "authenticated", gisele)(`select agendar($1, $2, $3, $4)`, [idGisele, design, instante(QUARTA, "15:00"), anaId]);
  });

  test("não chama faturamento, métricas nem RPCs de admin/lembrete", async () => {
    const c = como(db, "authenticated", anaSessao);
    await assert.rejects(c(`select * from faturamento_periodo(current_date, current_date)`), /apenas_owner/);
    await assert.rejects(c(`select metricas(current_date, current_date)`), /apenas_owner/);
    await assert.rejects(c(`select * from profissionais_admin()`), /apenas_owner/);
    await assert.rejects(c(`select obter_ou_criar_cliente('X', '+5599911110001')`), /apenas_profissionais/);
    await assert.rejects(c(`select * from protocolos_pendentes()`), /permission denied/);
    await assert.rejects(c(`select * from lembretes_pendentes('24h', 24)`), /permission denied/);
  });
});

describe("mesmo número em outro aparelho", () => {
  test("cliente da planilha (sem vínculo) assume o cadastro sem perder nome e nascimento", async () => {
    await sr(`insert into clientes (nome, whatsapp, data_nascimento, endereco) values ('Carla da Planilha', '+5599944443333', '1990-01-02', 'Rua A')`);
    const s = await criarLoginAnonimo(db);
    const [{ cadastrar_cliente: id }] = await como(db, "authenticated", s)(`select cadastrar_cliente('carla', '+5599944443333', '1991-05-05')`);
    const [c] = (await db.query(`select user_id, nome, data_nascimento::text d from clientes where id = $1`, [id])).rows;
    assert.equal(c.user_id, s);
    assert.equal(c.nome, "Carla da Planilha");
    assert.equal(c.d, "1990-01-02");
  });

  test("nome que era só o telefone (planilha) é substituído pelo digitado", async () => {
    await sr(`insert into clientes (nome, whatsapp) values ('5599984936572', '+5599984936572')`);
    const s = await criarLoginAnonimo(db);
    await como(db, "authenticated", s)(`select cadastrar_cliente('Dani', '+5599984936572')`);
    const [c] = (await db.query(`select nome from clientes where whatsapp = '+5599984936572'`)).rows;
    assert.equal(c.nome, "Dani");
  });

  test("sessão nova com o número da Ana leva o cadastro; a sessão antiga perde o acesso", async () => {
    const nova = await criarLoginAnonimo(db);
    const [{ cadastrar_cliente: id }] = await como(db, "authenticated", nova)(`select cadastrar_cliente('Ana Nova', '+5599977770000')`);
    assert.equal(id, anaId);
    assert.equal((await como(db, "authenticated", nova)(`select id from agendamentos`)).length, 4);
    assert.deepEqual(await como(db, "authenticated", anaSessao)(`select id from clientes`), []);
    assert.deepEqual(await como(db, "authenticated", anaSessao)(`select id from agendamentos`), []);
    const trocas = (await db.query(`select user_id_anterior from clientes_trocas_aparelho where cliente_id = $1`, [anaId])).rows;
    assert.deepEqual(trocas.map((t) => t.user_id_anterior), [anaSessao]);
    anaSessao = nova;
  });

  test("no máximo 3 trocas por número em 24h", async () => {
    for (let i = 0; i < 2; i++) {
      const s = await criarLoginAnonimo(db);
      await como(db, "authenticated", s)(`select cadastrar_cliente('Ana', '+5599977770000')`);
      anaSessao = s;
    }
    const s = await criarLoginAnonimo(db);
    await assert.rejects(como(db, "authenticated", s)(`select cadastrar_cliente('Ana', '+5599977770000')`), /muitas_trocas_de_aparelho/);
  });

  test("trocas de aparelho: só a Gisele lê o registro", async () => {
    assert.ok((await como(db, "authenticated", gisele)(`select id from clientes_trocas_aparelho`)).length >= 3);
    assert.equal((await como(db, "authenticated", anaSessao)(`select id from clientes_trocas_aparelho`)).length, 0);
    assert.equal((await como(db, "authenticated", staff)(`select id from clientes_trocas_aparelho`)).length, 0);
  });
});

describe("foto da cliente", () => {
  const pasta = () => `clientes/${anaId}`;

  test("envia na própria pasta; na pasta de outra cliente ou de profissional, não", async () => {
    const c = como(db, "authenticated", anaSessao);
    await c(`insert into storage.objects (bucket_id, name) values ('fotos', $1)`, [`${pasta()}/a.webp`]);
    const [{ id: outra }] = (await db.query(`select id from clientes where whatsapp = '+5599966660000'`)).rows;
    await assert.rejects(c(`insert into storage.objects (bucket_id, name) values ('fotos', $1)`, [`clientes/${outra}/x.webp`]), /row-level security/);
    await assert.rejects(c(`insert into storage.objects (bucket_id, name) values ('fotos', $1)`, [`profissionais/${idGisele}/x.webp`]), /row-level security/);
    await assert.rejects(anon(`insert into storage.objects (bucket_id, name) values ('fotos', $1)`, [`${pasta()}/b.webp`]), /row-level security/);
  });

  test("dispara validar-foto, igual às fotos de profissional", async () => {
    const w = (await db.query(`select url from webhooks_disparados where corpo->'record'->>'name' = $1`, [`${pasta()}/a.webp`])).rows;
    assert.equal(w.length, 1);
    assert.ok(w[0].url.endsWith("/functions/v1/validar-foto"));
  });

  test("no máximo 3 arquivos na pasta", async () => {
    const c = como(db, "authenticated", anaSessao);
    await c(`insert into storage.objects (bucket_id, name) values ('fotos', $1), ('fotos', $2)`, [`${pasta()}/b.webp`, `${pasta()}/c.webp`]);
    await assert.rejects(c(`insert into storage.objects (bucket_id, name) values ('fotos', $1)`, [`${pasta()}/d.webp`]), /row-level security/);
    await c(`delete from storage.objects where name = $1`, [`${pasta()}/b.webp`]);
    await c(`insert into storage.objects (bucket_id, name) values ('fotos', $1)`, [`${pasta()}/d.webp`]);
  });

  test("foto_url só aceita arquivo da própria pasta no bucket", async () => {
    const c = como(db, "authenticated", anaSessao);
    await c(`update clientes set foto_url = $2 where id = $1`, [anaId, `${FOTOS}/${pasta()}/a.webp`]);
    await assert.rejects(c(`update clientes set foto_url = 'https://evil.example/x.png' where id = $1`, [anaId]), /foto_invalida/);
    await assert.rejects(c(`update clientes set foto_url = $2 where id = $1`, [anaId, `${FOTOS}/profissionais/${idGisele}/x.webp`]), /foto_invalida/);
  });

  test("profissional vê a foto da cliente que atende", async () => {
    const [c] = await como(db, "authenticated", gisele)(`select foto_url from clientes where id = $1`, [anaId]);
    assert.ok(c.foto_url.endsWith("/a.webp"));
  });
});

describe("protocolo pós-atendimento", () => {
  test("profissional edita o protocolo só dos serviços que atende", async () => {
    const s = como(db, "authenticated", staff);
    await s(`select salvar_protocolo($1, 'Não molhe por 24h.')`, [henna]);
    await assert.rejects(s(`select salvar_protocolo($1, 'x')`, [design]), /servico_nao_atendido/);
    const meus = await s(`select servico_id, protocolo from meus_protocolos()`);
    assert.deepEqual(meus.map((m) => m.servico_id).sort(), [henna, soDaStaff].sort());
    assert.equal(meus.find((m) => m.servico_id === henna).protocolo, "Não molhe por 24h.");
  });

  test("não mexe no protocolo de outra profissional (nem a Gisele pelo salvar_protocolo)", async () => {
    await como(db, "authenticated", gisele)(`select salvar_protocolo($1, 'Protocolo da Gisele')`, [design]);
    const [linha] = (await db.query(`select protocolo from profissional_servicos where profissional_id = $1 and servico_id = $2`, [idStaff, henna])).rows;
    assert.equal(linha.protocolo, "Não molhe por 24h.");
    await assert.rejects(como(db, "authenticated", gisele)(`select salvar_protocolo($1, 'x')`, [soDaStaff]), /servico_nao_atendido/);
  });

  test("cliente e anon não leem nem gravam protocolo", async () => {
    const c = como(db, "authenticated", anaSessao);
    await assert.rejects(c(`select protocolo from profissional_servicos`), /permission denied/);
    await assert.rejects(anon(`select protocolo from profissional_servicos`), /permission denied/);
    await assert.rejects(c(`select salvar_protocolo($1, 'x')`, [henna]), /apenas_profissionais/);
    await assert.rejects(c(`select * from meus_protocolos()`), /apenas_profissionais/);
    // a leitura pública que a tela de escolher profissional usa continua
    assert.ok((await anon(`select profissional_id, preco_override from profissional_servicos`)).length > 0);
  });

  test("vazio apaga o protocolo", async () => {
    const s = como(db, "authenticated", staff);
    await s(`select salvar_protocolo($1, 'temp')`, [henna]);
    await s(`select salvar_protocolo($1, '   ')`, [henna]);
    const [linha] = (await db.query(`select protocolo from profissional_servicos where profissional_id = $1 and servico_id = $2`, [idStaff, henna])).rows;
    assert.equal(linha.protocolo, null);
    await s(`select salvar_protocolo($1, 'Não molhe por 24h.')`, [henna]);
  });

  let terminou, concluido, cancelado, antigo, recente, semProtocolo;

  test("pendentes: só confirmado/concluído, fim há 10min–24h, com protocolo", async () => {
    const ag = async (prof, serv, inicio, fim, status) =>
      (
        await sr(
          `insert into agendamentos (cliente_id, profissional_id, servico_id, periodo, status, canal)
           values ($1, $2, $3, tstzrange(now() - $4::interval, now() - $5::interval), $6, 'painel') returning id`,
          [anaId, prof, serv, inicio, fim, status],
        )
      )[0].id;
    terminou = await ag(idStaff, henna, "50 minutes", "15 minutes", "confirmado");
    concluido = await ag(idStaff, henna, "3 hours", "2 hours", "concluido");
    cancelado = await ag(idStaff, henna, "5 hours", "4 hours", "cancelado");
    antigo = await ag(idStaff, henna, "30 hours", "29 hours", "confirmado");
    recente = await ag(idStaff, henna, "12 minutes", "5 minutes", "confirmado");
    semProtocolo = await ag(idGisele, henna, "50 minutes", "15 minutes", "confirmado"); // a Gisele não cadastrou protocolo de henna

    const ids = (await sr(`select agendamento_id from protocolos_pendentes()`)).map((r) => r.agendamento_id);
    assert.ok(ids.includes(terminou));
    assert.ok(ids.includes(concluido));
    for (const fora of [cancelado, antigo, recente, semProtocolo]) assert.ok(!ids.includes(fora));

    const [linha] = (await sr(`select * from protocolos_pendentes() where agendamento_id = $1`, [terminou]));
    assert.equal(linha.protocolo, "Não molhe por 24h.");
    assert.equal(linha.cliente_whatsapp, "+5599977770000");
  });

  test("protocolo não é enviado duas vezes", async () => {
    const [{ reivindicar_protocolo: primeira }] = await sr(`select reivindicar_protocolo($1)`, [terminou]);
    const [{ reivindicar_protocolo: segunda }] = await sr(`select reivindicar_protocolo($1)`, [terminou]);
    assert.equal(primeira, true);
    assert.equal(segunda, false);
    const ids = (await sr(`select agendamento_id from protocolos_pendentes()`)).map((r) => r.agendamento_id);
    assert.ok(!ids.includes(terminou));
  });

  test("ninguém do app zera protocolo_enviado_em pra forçar reenvio", async () => {
    await assert.rejects(
      como(db, "authenticated", staff)(`update agendamentos set protocolo_enviado_em = null where id = $1`, [terminou]),
      /controlado pelo sistema/,
    );
    await assert.rejects(
      como(db, "authenticated", gisele)(`update agendamentos set protocolo_enviado_em = null where id = $1`, [terminou]),
      /controlado pelo sistema/,
    );
  });

  test("cron agenda enviar-protocolos a cada 5 minutos, com o secret", async () => {
    const [job] = (await db.query(`select schedule, command from cron.job where jobname = 'enviar-protocolos-5min'`)).rows;
    assert.equal(job.schedule, "*/5 * * * *");
    assert.match(job.command, /functions\/v1\/enviar-protocolos/);
    assert.match(job.command, /x-cron-secret/);
  });
});

describe("lembrete de 28 dias com cliente anônima", () => {
  test("atendimento concluído há 28 dias de cliente cadastrada sem login entra no lembrete", async () => {
    const [{ id }] = await sr(
      `insert into agendamentos (cliente_id, profissional_id, servico_id, periodo, status, canal)
       values ($1, $2, $3, tstzrange(now() - interval '28 days' - interval '1 hour', now() - interval '28 days'), 'concluido', 'painel') returning id`,
      [anaId, idGisele, design],
    );
    const linhas = await sr(`select agendamento_id, cliente_whatsapp from concluidos_para_lembrete_pos_procedimento()`);
    const minha = linhas.find((l) => l.agendamento_id === id);
    assert.ok(minha, "aparece no lembrete");
    assert.equal(minha.cliente_whatsapp, "+5599977770000");
  });
});
