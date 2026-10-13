// Fase 25 — migration 20261007120000 e o aviso de remarcação pra Gisele em
// supabase/functions/notificar-agendamento/mensagens.ts. Pelo app, a cliente
// só remarca (ou cancela) com pelo menos 4h de antecedência; toda remarcação
// avisa a Gisele, mesmo quando o atendimento é de outra profissional.

import assert from "node:assert/strict";
import { before, describe, test } from "node:test";
import { mensagemGiseleRemarcacao, mensagemProfissional } from "../functions/notificar-agendamento/mensagens.ts";
import { TELEFONE_GISELE, como, criarBanco, criarLogin, criarLoginAnonimo, instante, proximoDia } from "./ambiente.mjs";

const QUARTA = proximoDia(3, 3);
const DADOS = {
  clienteNome: "Ana",
  servicoNome: "Henna",
  profissionalNome: "Ana Staff",
  data: "08/10",
  hora: "15:00",
  dataAnterior: "06/10",
  horaAnterior: "14:00",
};

describe("aviso de remarcação", () => {
  test("Gisele recebe quem atende, o horário novo e o antigo", () => {
    assert.equal(
      mensagemGiseleRemarcacao(DADOS),
      "Remarcação: Ana — Henna com Ana Staff passou para 08/10 às 15:00 (antes: 06/10 às 14:00).",
    );
  });

  test("profissional também vê o horário antigo; sem ele, o texto de antes", () => {
    assert.equal(
      mensagemProfissional("remarcacao", DADOS),
      "Remarcação: Ana — Henna passou para 08/10 às 15:00 (antes: 06/10 às 14:00).",
    );
    const { dataAnterior, horaAnterior, ...semAntes } = DADOS;
    assert.equal(mensagemProfissional("remarcacao", semAntes), "Remarcação: Ana — Henna passou para 08/10 às 15:00.");
  });
});

describe("antecedência mínima de 4h", () => {
  let db, sr, gisele, idGisele, design, clienteSessao, clienteId;

  const emHoras = async (h) => {
    const inicio = new Date(Date.now() + h * 3600_000);
    inicio.setUTCSeconds(0, 0);
    const [{ id }] = await sr(
      `insert into agendamentos (cliente_id, profissional_id, servico_id, periodo) values ($1, $2, $3, tstzrange($4::timestamptz, $4::timestamptz + interval '30 min')) returning id`,
      [clienteId, idGisele, design, inicio.toISOString()],
    );
    return id;
  };

  before(async () => {
    db = await criarBanco();
    sr = como(db, "service_role");
    gisele = await criarLogin(db, TELEFONE_GISELE);
    [{ id: idGisele }] = (await db.query(`select id from profissionais where papel = 'owner'`)).rows;
    [{ id: design }] = (await db.query(`select id from servicos where nome = 'Design personalizado'`)).rows;
    clienteSessao = await criarLoginAnonimo(db);
    [{ cadastrar_cliente: clienteId }] = await como(db, "authenticated", clienteSessao)(`select cadastrar_cliente('Ana', '+5599977770000')`);
  });

  test("configuração e padrão da função valem 4h", async () => {
    const [{ valor }] = (await db.query(`select valor from configuracoes where chave = 'horas_minimas_remarcacao'`)).rows;
    assert.equal(valor, 4);
    const [{ h }] = (await db.query(`select extract(epoch from horas_minimas_remarcacao()) / 3600 as h`)).rows;
    assert.equal(Number(h), 4);
  });

  test("a 3h do horário a cliente não remarca nem cancela pelo app", async () => {
    const id = await emHoras(3);
    const c = como(db, "authenticated", clienteSessao);
    await assert.rejects(c(`select remarcar($1, $2)`, [id, instante(QUARTA, "17:00")]), /fora_da_janela/);
    await assert.rejects(c(`select cancelar($1)`, [id]), /fora_da_janela/);
  });

  test("a 5h do horário a cliente ainda cancela", async () => {
    const id = await emHoras(5);
    await como(db, "authenticated", clienteSessao)(`select cancelar($1)`, [id]);
    const [{ status }] = await sr(`select status from agendamentos where id = $1`, [id]);
    assert.equal(status, "cancelado");
  });

  test("o studio continua remarcando dentro das 4h", async () => {
    const id = await emHoras(2);
    const novo = new Date(Date.now() + 2.5 * 3600_000);
    novo.setUTCSeconds(0, 0);
    await como(db, "authenticated", gisele)(
      `update agendamentos set periodo = tstzrange($2::timestamptz, $2::timestamptz + interval '30 min') where id = $1`,
      [id, novo.toISOString()],
    );
  });

  test("rodar a migration de novo não baixa um valor maior que a Gisele escolheu", async () => {
    await como(db, "authenticated", gisele)(`update configuracoes set valor = '6' where chave = 'horas_minimas_remarcacao'`);
    const { readFileSync } = await import("node:fs");
    await db.exec(readFileSync(new URL("../migrations/20261007120000_remarcacao_4_horas.sql", import.meta.url), "utf8"));
    const [{ valor }] = (await db.query(`select valor from configuracoes where chave = 'horas_minimas_remarcacao'`)).rows;
    assert.equal(valor, 6);
  });
});
