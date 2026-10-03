// Protocolo pré-atendimento (fase 23) — migration 20261002120000 e os textos
// de supabase/functions/notificar-agendamento/mensagens.ts. O texto sai na
// confirmação do agendamento, logo depois do "Agendamento confirmado!", e
// só a profissional dona do serviço edita o dela, como no protocolo pós.

import assert from "node:assert/strict";
import { before, describe, test } from "node:test";
import { mensagemProfissional, mensagensCliente } from "../functions/notificar-agendamento/mensagens.ts";
import { TELEFONE_GISELE, como, criarBanco, criarLogin, criarLoginAnonimo } from "./ambiente.mjs";

const DADOS = { clienteNome: "Ana", servicoNome: "Henna", profissionalNome: "Ana Staff", data: "06/10", hora: "14:00" };

describe("mensagens da confirmação", () => {
  test("com protocolo_pre: confirmação e, depois, o protocolo", () => {
    const msgs = mensagensCliente("confirmacao", DADOS, "  Venha sem maquiagem.  ");
    assert.equal(msgs.length, 2);
    assert.match(msgs[0], /^Agendamento confirmado! Henna no dia 06\/10 às 14:00, com Ana Staff\./);
    assert.equal(msgs[1], "Cuidados antes do seu Henna (Ana Staff):\n\nVenha sem maquiagem.");
  });

  test("sem protocolo_pre (nulo, vazio ou só espaço): só a confirmação", () => {
    for (const pre of [null, undefined, "", "   \n "]) {
      const msgs = mensagensCliente("confirmacao", DADOS, pre);
      assert.equal(msgs.length, 1, JSON.stringify(pre));
      assert.match(msgs[0], /^Agendamento confirmado!/);
    }
  });

  test("remarcação e cancelamento não mandam o protocolo pré", () => {
    assert.equal(mensagensCliente("remarcacao", DADOS, "Venha sem maquiagem.").length, 1);
    assert.equal(mensagensCliente("cancelamento", DADOS, "Venha sem maquiagem.").length, 1);
  });

  test("profissional continua recebendo o aviso de sempre, sem o protocolo", () => {
    assert.equal(mensagemProfissional("confirmacao", DADOS), "Novo agendamento: Ana — Henna em 06/10 às 14:00.");
  });
});

describe("protocolo_pre no banco", () => {
  let db, sr, anon;
  let gisele, staff, idGisele, idStaff;
  let design, henna;
  let clienteSessao, clienteId;

  // O que notificar-agendamento faz na confirmação: lê protocolo_pre (service
  // role) da profissional + serviço do agendamento e monta as mensagens.
  async function mensagensDaConfirmacao(profissionalId, servicoId) {
    const [ps] = await sr(`select protocolo_pre from profissional_servicos where profissional_id = $1 and servico_id = $2`, [profissionalId, servicoId]);
    return mensagensCliente("confirmacao", DADOS, ps?.protocolo_pre ?? null);
  }

  const pre = async (profissionalId, servicoId) =>
    (await db.query(`select protocolo, protocolo_pre from profissional_servicos where profissional_id = $1 and servico_id = $2`, [profissionalId, servicoId]))
      .rows[0];

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

    clienteSessao = await criarLoginAnonimo(db);
    [{ cadastrar_cliente: clienteId }] = await como(db, "authenticated", clienteSessao)(`select cadastrar_cliente('Ana', '+5599977770000')`);
  });

  test("profissional grava e lê o pré junto com o pós, só dos serviços dela", async () => {
    const s = como(db, "authenticated", staff);
    await s(`select salvar_protocolo($1, 'Não molhe por 24h.', 'Venha sem maquiagem.')`, [henna]);
    assert.deepEqual(await pre(idStaff, henna), { protocolo: "Não molhe por 24h.", protocolo_pre: "Venha sem maquiagem." });
    const [meu] = await s(`select protocolo, protocolo_pre from meus_protocolos() where servico_id = $1`, [henna]);
    assert.equal(meu.protocolo_pre, "Venha sem maquiagem.");
    await assert.rejects(s(`select salvar_protocolo($1, null, 'x')`, [design]), /servico_nao_atendido/);
  });

  test("ninguém mexe no pré de outra profissional (nem a Gisele)", async () => {
    await como(db, "authenticated", gisele)(`select salvar_protocolo($1, null, 'Pré da Gisele')`, [henna]);
    assert.equal((await pre(idStaff, henna)).protocolo_pre, "Venha sem maquiagem.");
    assert.equal((await pre(idGisele, henna)).protocolo_pre, "Pré da Gisele");
  });

  test("cliente e anon não leem nem gravam o pré", async () => {
    const c = como(db, "authenticated", clienteSessao);
    await assert.rejects(c(`select protocolo_pre from profissional_servicos`), /permission denied/);
    await assert.rejects(anon(`select protocolo_pre from profissional_servicos`), /permission denied/);
    await assert.rejects(c(`select salvar_protocolo($1, null, 'x')`, [henna]), /apenas_profissionais/);
    await assert.rejects(anon(`select salvar_protocolo($1, null, 'x')`, [henna]), /permission denied/);
    await assert.rejects(c(`select * from meus_protocolos()`), /apenas_profissionais/);
  });

  test("texto acima de 2000 caracteres é recusado", async () => {
    await assert.rejects(como(db, "authenticated", staff)(`select salvar_protocolo($1, null, repeat('a', 2001))`, [henna]), /protocolo_longo/);
  });

  test("chamada antiga (só o pós) não apaga o pré; texto vazio apaga", async () => {
    const s = como(db, "authenticated", staff);
    await s(`select salvar_protocolo($1, 'Não molhe por 48h.')`, [henna]);
    assert.deepEqual(await pre(idStaff, henna), { protocolo: "Não molhe por 48h.", protocolo_pre: "Venha sem maquiagem." });
    await s(`select salvar_protocolo($1, 'Não molhe por 48h.', '   ')`, [henna]);
    assert.equal((await pre(idStaff, henna)).protocolo_pre, null);
    await s(`select salvar_protocolo($1, 'Não molhe por 48h.', 'Venha sem maquiagem.')`, [henna]);
  });

  test("agendamento confirmado com protocolo_pre: dispara notificar-agendamento e a cliente recebe a mensagem extra", async () => {
    const [{ id }] = await sr(
      `insert into agendamentos (cliente_id, profissional_id, servico_id, periodo, status, canal)
       values ($1, $2, $3, tstzrange(now() + interval '2 days', now() + interval '2 days 1 hour'), 'confirmado', 'painel') returning id`,
      [clienteId, idStaff, henna],
    );
    const disparos = (await db.query(`select url, corpo from webhooks_disparados where corpo->'record'->>'id' = $1`, [id])).rows;
    assert.equal(disparos.length, 1);
    assert.match(disparos[0].url, /functions\/v1\/notificar-agendamento/);
    assert.equal(disparos[0].corpo.type, "INSERT");
    assert.equal(disparos[0].corpo.record.status, "confirmado");

    const msgs = await mensagensDaConfirmacao(idStaff, henna);
    assert.equal(msgs.length, 2);
    assert.match(msgs[1], /Venha sem maquiagem\.$/);
  });

  test("serviço sem protocolo_pre: só a confirmação", async () => {
    assert.equal((await pre(idGisele, design)).protocolo_pre, null);
    const msgs = await mensagensDaConfirmacao(idGisele, design);
    assert.equal(msgs.length, 1);
    assert.match(msgs[0], /^Agendamento confirmado!/);
  });
});
