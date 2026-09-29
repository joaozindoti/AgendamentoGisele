// Conta de dona de teste do João (scripts/conta-teste-joao.sql) e a remoção
// antes do lançamento (scripts/remover-conta-teste.sql): a remoção tem que
// levar só o que é de teste, sem tocar na Gisele, na equipe real nem nas
// clientes reais.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { TELEFONE_GISELE, como, criarBanco, criarLogin } from "./ambiente.mjs";

const SCRIPTS = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "scripts");
const ler = (f) => readFileSync(join(SCRIPTS, f), "utf8");

let db, joao, idGisele;

before(async () => {
  db = await criarBanco();
  await criarLogin(db, TELEFONE_GISELE);
  [{ id: idGisele }] = (await db.query(`select id from profissionais where papel = 'owner'`)).rows;
});

test("conta de teste vira dona, entra pelo celular do João e não aparece pra cliente", async () => {
  await db.exec(ler("conta-teste-joao.sql"));
  await db.exec(ler("conta-teste-joao.sql")); // colar de novo não duplica
  joao = await criarLogin(db, "+5599984994873");
  const [p] = (await db.query(`select nome, papel, user_id from profissionais where telefone = '+5599984994873'`)).rows;
  assert.match(p.nome, /^TESTE/);
  assert.equal(p.papel, "owner");
  assert.equal(p.user_id, joao);
  const [{ eh_owner }] = await como(db, "authenticated", joao)(`select eh_owner()`);
  assert.equal(eh_owner, true);
  // sem serviço vinculado: não aparece na escolha de profissional
  const servicos = (await db.query(`select id from servicos`)).rows;
  for (const s of servicos) {
    const lista = await como(db, "anon")(`select nome from profissionais_do_servico($1)`, [s.id]);
    assert.ok(lista.every((l) => !l.nome.startsWith("TESTE")));
  }
});

test("remoção apaga só o que é TESTE", async () => {
  const j = como(db, "authenticated", joao);
  const [{ id: profTeste }] = await j(`insert into profissionais (nome, telefone) values ('TESTE Profissional', '+5599900009999') returning id`);
  const [{ id: servico }] = (await db.query(`select id from servicos limit 1`)).rows;
  await j(`insert into profissional_servicos (profissional_id, servico_id) values ($1, $2)`, [profTeste, servico]);
  const [{ obter_ou_criar_cliente: cliTeste }] = await j(`select obter_ou_criar_cliente('TESTE Cliente', '+5599900008888')`);
  const [{ obter_ou_criar_cliente: cliReal }] = await j(`select obter_ou_criar_cliente('Maria Real', '+5599900007777')`);
  await j(`select agendar($1, $2, now() + interval '3 days', $3)`, [profTeste, servico, cliReal]);
  await j(`select agendar($1, $2, now() + interval '4 days', $3)`, [idGisele, servico, cliTeste]);
  const [{ agendar: agReal }] = await j(`select agendar($1, $2, now() + interval '5 days', $3)`, [idGisele, servico, cliReal]);

  const [resumo] = (await db.exec(ler("remover-conta-teste.sql"))).at(-1).rows;
  assert.deepEqual([Number(resumo.profissionais_teste), Number(resumo.clientes_teste)], [0, 0]);

  const profs = (await db.query(`select nome from profissionais`)).rows.map((r) => r.nome);
  assert.deepEqual(profs, ["Gisele Lima"]);
  const clis = (await db.query(`select nome from clientes`)).rows.map((r) => r.nome);
  assert.ok(clis.includes("Maria Real"));
  assert.ok(!clis.some((n) => n.startsWith("TESTE")));
  assert.equal((await db.query(`select 1 from agendamentos where id = $1`, [agReal])).rows.length, 1, "agendamento real fica");
  assert.equal((await db.query(`select 1 from agendamentos`)).rows.length, 1);
});
