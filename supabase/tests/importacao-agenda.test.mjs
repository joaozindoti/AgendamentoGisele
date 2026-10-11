// Importação da agenda do Google Calendar e da planilha CRM (fase 26):
// scripts/importar-agenda.mjs gera o importar.sql, e ele roda aqui contra o
// banco com todas as migrations, como no SQL Editor. Agenda e planilha são
// fictícias (fixtures/); os horários são relativos a agora ({{H+5}} = daqui
// a 5 horas, {{L+4}} = dia local daqui a 4 dias).

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { before, describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  diaLocal,
  gerarRelatorio,
  gerarSql,
  lerDataHora,
  lerIcs,
  listaServicos,
  montarPlano,
  normalizarTelefone,
} from "../../scripts/importar-agenda.mjs";
import { TELEFONE_GISELE, como, criarBanco, criarLogin, criarLoginAnonimo } from "./ambiente.mjs";

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const AGORA = new Date();
const HORA = 3_600_000;

const utcBasico = (d) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "").replace(/\d{2}Z$/, "00Z");
const diaMais = (n) => diaLocal(new Date(AGORA.getTime() + n * 24 * HORA));

function agendaFicticia(extra = "") {
  return readFileSync(join(FIXTURES, "agenda-ficticia.ics"), "utf8")
    .replace(/\{\{H([+-][\d.]+)\}\}/g, (_, n) => utcBasico(new Date(AGORA.getTime() + Number(n) * HORA)))
    .replace(/\{\{L([+-]\d+)\}\}/g, (_, n) => diaMais(Number(n)).replaceAll("-", ""))
    .replace("END:VCALENDAR", `${extra}END:VCALENDAR`);
}
const crmFicticio = () =>
  readFileSync(join(FIXTURES, "crm-ficticio.csv"), "utf8")
    .replace("{{ANIVERSARIO}}", `1992-${diaLocal(AGORA).slice(5)}`)
    .replace("{{HOJE}}", diaLocal(AGORA));

const NOVO_EVENTO = `BEGIN:VEVENT
DTSTART:${utcBasico(new Date(AGORA.getTime() + 200 * HORA))}
DTEND:${utcBasico(new Date(AGORA.getTime() + 201 * HORA))}
UID:entrou-depois@teste
DESCRIPTION:Nome: Paula\\nTelefone: 5599900014444\\nServiços: Epilação axilas — R$ 30\\,00
SUMMARY:Paula - Epilação axilas — R$ 30\\,00
END:VEVENT
`;

const notificacoes = async (db) =>
  (await db.query(`select count(*)::int n from webhooks_disparados where url like '%notificar-agendamento%'`)).rows[0].n;

const importar = async (db, plano) => (await db.exec(gerarSql(plano))).at(-1).rows;

describe("importar-agenda: leitura dos arquivos", () => {
  test("telefone: com e sem o 9, formato do WhatsApp, 55 duplicado", () => {
    assert.equal(normalizarTelefone("5599984183784").e164, "+5599984183784");
    assert.equal(normalizarTelefone("559984183784").e164, "+5599984183784", "celular sem o 9 ganha o 9");
    assert.equal(normalizarTelefone("559984183784@s.whatsapp.net").e164, "+5599984183784");
    assert.equal(normalizarTelefone("(99) 98418-3784").e164, "+5599984183784");
    assert.equal(normalizarTelefone("559932221234").e164, "+559932221234", "fixo continua sem o 9");
    assert.equal(normalizarTelefone("555599984183784").e164, "+5599984183784", "55 duplicado com o número inteiro");
    assert.match(normalizarTelefone("5555999812618").erro, /55 duplicado/, "55 duplicado cortado em 13 dígitos");
    assert.match(normalizarTelefone("5504962459376").erro, /inválido/, "DDD com zero");
    assert.match(normalizarTelefone("").erro, /sem telefone/);
  });

  test("fuso: UTC, TZID e dia inteiro", () => {
    const utc = lerDataHora({ params: {}, valor: "20261013T123000Z" });
    assert.equal(utc.instante.toISOString(), "2026-10-13T12:30:00.000Z");
    const fortaleza = lerDataHora({ params: { TZID: "America/Fortaleza" }, valor: "20261013T093000" });
    assert.equal(fortaleza.instante.toISOString(), "2026-10-13T12:30:00.000Z");
    const manaus = lerDataHora({ params: { TZID: "America/Manaus" }, valor: "20261013T093000" });
    assert.equal(manaus.instante.toISOString(), "2026-10-13T13:30:00.000Z", "Manaus é UTC-4");
    const semFuso = lerDataHora({ params: {}, valor: "20261013T093000" }, "America/Fortaleza");
    assert.equal(semFuso.instante.toISOString(), "2026-10-13T12:30:00.000Z", "hora sem fuso usa o X-WR-TIMEZONE");
    assert.deepEqual(lerDataHora({ params: { VALUE: "DATE" }, valor: "20261012" }).dia, "2026-10-12");
  });

  test("serviços da descrição do n8n, com vírgula no preço", () => {
    assert.deepEqual(listaServicos("Design personalizado — R$ 30,00, Epilação íntima — R$ 60,00, Epilação meia perna — R$ 30,00"), [
      "Design personalizado",
      "Epilação íntima",
      "Epilação meia perna",
    ]);
    assert.deepEqual(listaServicos("Design personalizado + Henna — R$ 40,00"), ["Design personalizado + Henna"]);
  });

  test("ICS: linha dobrada, escape e DESCRIPTION do alarme ignorada", () => {
    const { eventos, fusoCalendario } = lerIcs(agendaFicticia());
    assert.equal(fusoCalendario, "America/Fortaleza");
    const ana = eventos.find((e) => e.UID.valor === "passado-30-dias@teste");
    assert.match(ana.DESCRIPTION.valor, /Design personalizado — R\$ 30\\,00/);
    const manual = eventos.find((e) => e.UID.valor === "manual-sem-telefone@teste");
    assert.equal(manual.DESCRIPTION, undefined, "a descrição do VALARM não é do evento");
  });

  test("plano: o que entra, o que fica de fora e por quê", () => {
    const plano = montarPlano({ ics: agendaFicticia(), csv: crmFicticio(), agora: AGORA });
    const uids = plano.agendamentos.map((a) => a.uid).sort();
    assert.deepEqual(uids, [
      "cliente-do-app@teste",
      "conflito@teste",
      "futuro-2-dias@teste",
      "futuro-30-min@teste",
      "futuro-5-horas@teste",
      "futuro-tzid-manaus@teste",
      "lia-futuro@teste",
      "passado-10-dias@teste",
      "passado-30-dias@teste",
      "passado-hoje@teste",
    ]);
    const motivo = (uid) => plano.naoMapeados.find((n) => n.uid === uid)?.motivo;
    assert.match(motivo("manual-sem-telefone@teste"), /sem telefone/);
    assert.match(motivo("servico-desconhecido@teste"), /serviço não reconhecido/);
    assert.match(motivo("cancelado@teste"), /cancelado/);
    assert.equal(motivo("fora-da-janela@teste"), undefined, "mais de 35 dias atrás nem aparece");

    const fabi = plano.agendamentos.find((a) => a.uid === "futuro-tzid-manaus@teste");
    assert.equal(fabi.inicio.toISOString(), new Date(`${diaMais(3)}T11:00:00-03:00`).toISOString(), "10:00 em Manaus = 11:00 no studio");

    const bia = plano.agendamentos.find((a) => a.uid === "passado-10-dias@teste");
    assert.equal(bia.whatsapp, "+5599981002222");
    assert.equal(bia.servico, "Epilação íntima", "vários serviços: entra o primeiro");
    assert.match(bia.observacoes, /Íntima e axilas com desconto/);
    assert.match(bia.observacoes, /Serviços no evento: Epilação íntima, Epilação axilas/);

    const fora = Object.fromEntries(plano.crmIgnoradas.map((r) => [r.nome, r.motivo]));
    assert.match(fora["Teste"], /teste/);
    assert.match(fora["Kátia Duplicada"], /55 duplicado/);
    assert.match(fora["Mara Bloqueada"], /bloqueada/);
    assert.match(fora["Gisele Lima"], /próprio studio/);
    assert.ok(plano.crmAvisos.some((r) => r.nome === "Nina Data Errada" && /não é plausível/.test(r.motivo)));

    const lia = plano.clientes.get("+5599988887777");
    assert.equal(lia.nome, "Lia Sem Nove", "planilha sem o 9 e evento com o 9 são a mesma cliente");
    assert.deepEqual([...lia.origem], ["planilha", "agenda"]);
  });

  test("relatório da simulação: seções pedidas e telefone só com os 4 últimos dígitos", () => {
    const plano = montarPlano({ ics: agendaFicticia(), csv: crmFicticio(), agora: AGORA });
    const md = gerarRelatorio(plano);
    for (const secao of ["## Clientes", "## Agendamentos", "### Por dia", "## Eventos não mapeados", "## Conflitos", "## Bloqueios de dia inteiro", "## Amostra de fuso", "## Respostas da investigação"]) {
      assert.ok(md.includes(secao), secao);
    }
    for (const tel of ["99900001111", "9981002222", "99900003333", "99988887777", "99900008888", "99911112222", "99984183784"]) {
      assert.ok(!md.includes(tel), `telefone ${tel} aparece inteiro`);
    }
    assert.ok(md.includes("…1111"));
  });

  test("simulação com o retrato do banco: já existentes e conflito com o sistema novo", () => {
    const banco = {
      servicos: ["Design personalizado", "Epilação íntima", "Epilação axilas", "Design personalizado + Henna", "Brow Lamination", "Epilação meia perna"],
      profissionais: [{ nome: "Gisele Lima", ativo: true }],
      clientes: [{ whatsapp: "+5599900007777", app: true }, { whatsapp: "+559981002222", app: false }],
      agendamentos: [
        { profissional: "Gisele Lima", inicio: new Date(AGORA.getTime() + 96.5 * HORA).toISOString(), fim: new Date(AGORA.getTime() + 97.5 * HORA).toISOString(), origem: null },
      ],
    };
    const plano = montarPlano({ ics: agendaFicticia(), csv: crmFicticio(), agora: AGORA, banco });
    assert.deepEqual(plano.conflitos.map((c) => c.ag.uid), ["conflito@teste"]);
    assert.equal(plano.clientes.get("+5599900007777").noBanco.app, true);
    assert.ok(plano.clientes.get("+5599981002222").noBanco, "achou a cliente gravada sem o 9");
    assert.equal(plano.clientes.get("+5599900001111").noBanco, null);
    const md = gerarRelatorio(plano);
    assert.match(md, /já se cadastrou pelo app/);
    assert.match(md, /\*\*conflito: não entra\*\*/);
  });
});

describe("importar-agenda: importar.sql no banco", () => {
  let db, plano, relatorio, idGisele, epilacaoAxilas, antes;

  before(async () => {
    db = await criarBanco();
    await criarLogin(db, TELEFONE_GISELE);
    [{ id: idGisele }] = (await db.query(`select id from profissionais where papel = 'owner'`)).rows;
    [{ id: epilacaoAxilas }] = (await db.query(`select id from servicos where nome = 'Epilação axilas'`)).rows;
    await db.query(`update profissional_servicos set protocolo = 'Não tome sol por 24h.' where profissional_id = $1`, [idGisele]);

    // Joana já se cadastrou pelo app novo
    const sessaoJoana = await criarLoginAnonimo(db);
    await como(db, "authenticated", sessaoJoana)(`select cadastrar_cliente('Joana App', '+5599900007777')`);
    // e já tem um horário marcado pelo sistema novo bem na hora do evento da Iara
    const [{ id: joana }] = (await db.query(`select id from clientes where whatsapp = '+5599900007777'`)).rows;
    await db.query(
      `insert into agendamentos (cliente_id, profissional_id, servico_id, periodo)
       values ($1, $2, $3, tstzrange($4::timestamptz, $4::timestamptz + interval '30 minutes'))`,
      [joana, idGisele, epilacaoAxilas, new Date(AGORA.getTime() + 96.5 * HORA).toISOString()],
    );

    antes = await notificacoes(db);
    plano = montarPlano({ ics: agendaFicticia(), csv: crmFicticio(), agora: AGORA });
    relatorio = await importar(db, plano);
  });

  const ag = async (uid) =>
    (
      await db.query(
        `select a.id, a.status::text, a.protocolo_enviado_em, a.observacoes, a.canal, lower(a.periodo) inicio, c.nome cliente, c.whatsapp, s.nome servico,
                coalesce((select array_agg(tipo order by tipo) from lembretes_enviados le where le.agendamento_id = a.id), '{}') lembretes
         from agendamentos a join clientes c on c.id = a.cliente_id join servicos s on s.id = a.servico_id
         where a.origem_externa_id = $1`,
        [uid],
      )
    ).rows[0];

  test("a importação não dispara nenhuma notificação, e o aviso volta a funcionar depois", async () => {
    assert.equal(await notificacoes(db), antes, "nenhum POST pra notificar-agendamento durante a importação");
    const [{ tgenabled }] = (await db.query(`select tgenabled from pg_trigger where tgname = 'on_agendamento_notificar'`)).rows;
    assert.equal(tgenabled, "O", "trigger religado");

    // depois da importação, mexer num agendamento importado volta a avisar
    const eva = await ag("futuro-2-dias@teste");
    await db.query(`update agendamentos set status = 'cancelado' where id = $1`, [eva.id]);
    assert.equal(await notificacoes(db), antes + 1);
    await db.query(`update agendamentos set status = 'confirmado' where id = $1`, [eva.id]);
    antes = await notificacoes(db);
  });

  test("passados entram concluídos, com lembretes e protocolo marcados", async () => {
    const ana = await ag("passado-30-dias@teste");
    assert.equal(ana.status, "concluido");
    assert.ok(ana.protocolo_enviado_em);
    assert.deepEqual(ana.lembretes, ["1h", "24h", "28dias", "confirmacao"], "o dia do lembrete de 28 dias já passou");

    const bia = await ag("passado-10-dias@teste");
    assert.equal(bia.status, "concluido");
    assert.deepEqual(bia.lembretes, ["1h", "24h", "confirmacao"], "28 dias fica pro sistema novo mandar no dia");

    const olga = await ag("passado-hoje@teste");
    assert.equal(olga.status, "concluido");
    assert.ok(olga.protocolo_enviado_em);
    const pendentes = (await db.query(`select agendamento_id from protocolos_pendentes()`)).rows;
    assert.ok(!pendentes.some((p) => p.agendamento_id === olga.id), "protocolo pós não sai pra quem foi atendida antes da importação");
  });

  test("futuros: 24h e 1h marcados conforme o tempo que falta", async () => {
    assert.deepEqual((await ag("futuro-30-min@teste")).lembretes, ["1h", "24h", "confirmacao"]);
    assert.deepEqual((await ag("futuro-5-horas@teste")).lembretes, ["24h", "confirmacao"]);
    const eva = await ag("futuro-2-dias@teste");
    assert.deepEqual(eva.lembretes, ["confirmacao"]);
    assert.equal(eva.status, "confirmado");
    assert.equal(eva.protocolo_enviado_em, null, "protocolo pós sai normalmente depois do atendimento");

    const pend24 = (await db.query(`select cliente_nome from lembretes_pendentes('24h', 24, 1440)`)).rows.map((r) => r.cliente_nome);
    assert.deepEqual(pend24, ["Eva"], "Carla e Duda já estão marcadas; Eva recebe o de 24h pelo sistema novo");
    assert.deepEqual((await db.query(`select * from lembretes_pendentes('1h', 1, 120)`)).rows, []);
  });

  test("bloqueio de dia inteiro nos dois formatos, só os futuros", async () => {
    const bloqueios = (
      await db.query(
        `select origem_externa_id uid, motivo,
                to_char(lower(periodo) at time zone 'America/Fortaleza', 'YYYY-MM-DD HH24:MI') ini,
                to_char(upper(periodo) at time zone 'America/Fortaleza', 'YYYY-MM-DD HH24:MI') fim
         from bloqueios_agenda where profissional_id = $1 order by lower(periodo)`,
        [idGisele],
      )
    ).rows;
    assert.deepEqual(bloqueios, [
      { uid: "feriado-data@teste", motivo: "Feriado", ini: `${diaMais(4)} 00:00`, fim: `${diaMais(4)} 23:59` },
      { uid: "fechado-meia-noite@teste", motivo: "Studio fechado - curso", ini: `${diaMais(6)} 00:00`, fim: `${diaMais(6)} 23:59` },
    ]);
    const livres = (await db.query(`select * from horarios_disponiveis($1, (select id from servicos where nome = 'Design personalizado'), $2::date)`, [idGisele, diaMais(4)])).rows;
    assert.equal(livres.length, 0, "dia bloqueado não oferece horário no app");
  });

  test("conflito com agendamento do sistema novo é pulado e relatado, sem abortar o resto", async () => {
    assert.equal(await ag("conflito@teste"), undefined);
    assert.ok(relatorio.some((r) => r.secao === "conflito (não importado)" && r.item.includes("Iara")));
    assert.ok(await ag("lia-futuro@teste"), "o que vem depois do conflito entrou");
  });

  test("clientes: não sobrescreve quem já usa o app; planilha entra pelo telefone", async () => {
    const cl = Object.fromEntries(
      (await db.query(`select whatsapp, nome, data_nascimento::text d, user_id is not null app, consentimento from clientes`)).rows.map((r) => [r.whatsapp, r]),
    );
    assert.equal(cl["+5599900007777"].nome, "Joana App", "nome de quem se cadastrou no app não muda");
    assert.equal(cl["+5599900007777"].d, null, "nem a data de nascimento");
    assert.equal((await ag("cliente-do-app@teste")).cliente, "Joana App", "o agendamento foi pra ficha dela");
    assert.equal(cl["+5599900001111"].nome, "Ana Fictícia da Silva");
    assert.equal(cl["+5599900001111"].d, "1990-05-10");
    assert.equal(cl["+5599900012345"].d, null, "data de nascimento implausível entra vazia");
    assert.equal(cl["+5599981002222"].nome, "Bia 💖", "cliente que só existia na agenda");
    assert.equal(cl["+5599900003333"].nome, "Carla");
    for (const fora of ["+5599900000000", "+5555999812618", "+5599911112222", "+5599984183784", "+5599900008888"]) {
      assert.equal(cl[fora], undefined, fora);
    }
    assert.ok(Object.values(cl).filter((c) => !c.app).every((c) => c.consentimento === false));
    assert.ok(relatorio.some((r) => r.secao === "cliente já existia (não mexi)" && r.detalhe.includes("já usa o app")));
  });

  test("aniversário de hoje fica marcado (o sistema antigo já mandou o parabéns)", async () => {
    const pend = (await db.query(`select nome from aniversariantes_pendentes()`)).rows;
    assert.deepEqual(pend, []);
    const [{ n }] = (await db.query(`select count(*)::int n from lembretes_enviados le join clientes c on c.id = le.cliente_id where c.whatsapp = '+5599988887777' and le.tipo = 'aniversario'`)).rows;
    assert.equal(n, 1);
  });

  test("relatório do SQL: resumo e nada de telefone inteiro", async () => {
    const resumo = Object.fromEntries(relatorio.filter((r) => r.secao === "resumo").map((r) => [r.item, r.detalhe]));
    assert.equal(resumo["agendamentos importados agora"], "9");
    assert.equal(resumo["agendamentos que já tinham sido importados"], "0");
    assert.ok(relatorio.some((r) => r.secao === "evento não importado" && r.detalhe.includes("sem telefone")));
    assert.ok(!JSON.stringify(relatorio).match(/\d{8,}/), "telefone aparece só com o final");
  });

  test("reimportar não duplica; a segunda rodada só traz o que é novo", async () => {
    const contar = async () =>
      (await db.query(`select (select count(*) from agendamentos)::int ag, (select count(*) from clientes)::int cl,
                              (select count(*) from bloqueios_agenda)::int bl, (select count(*) from lembretes_enviados)::int le`)).rows[0];
    const antesDeTudo = await contar();

    const rodada2 = await importar(db, montarPlano({ ics: agendaFicticia(), csv: crmFicticio(), agora: AGORA }));
    assert.deepEqual(await contar(), antesDeTudo);
    const r2 = Object.fromEntries(rodada2.filter((r) => r.secao === "resumo").map((r) => [r.item, r.detalhe]));
    assert.equal(r2["agendamentos importados agora"], "0");
    assert.equal(r2["agendamentos que já tinham sido importados"], "9");
    assert.equal(r2["clientes novas"], "0");

    const rodada3 = await importar(db, montarPlano({ ics: agendaFicticia(NOVO_EVENTO), csv: crmFicticio(), agora: AGORA }));
    const depois = await contar();
    assert.equal(depois.ag, antesDeTudo.ag + 1);
    assert.equal(depois.cl, antesDeTudo.cl + 1);
    assert.equal(depois.bl, antesDeTudo.bl);
    assert.ok(await ag("entrou-depois@teste"));
    assert.equal(rodada3.find((r) => r.item === "agendamentos importados agora").detalhe, "1");
    assert.equal(await notificacoes(db), antes, "nem a segunda nem a terceira rodada avisam ninguém");
  });

  test("cliente importada se cadastra depois (sem o 9): mesma ficha, vê o agendamento, sem troca de aparelho", async () => {
    const [{ id: liaId }] = (await db.query(`select id from clientes where whatsapp = '+5599988887777'`)).rows;
    const sessao = await criarLoginAnonimo(db);
    const lia = como(db, "authenticated", sessao);
    const [{ cadastrar_cliente }] = await lia(`select cadastrar_cliente('Lia Nova', '+559988887777')`);
    assert.equal(cadastrar_cliente, liaId);

    const [ficha] = await lia(`select nome, whatsapp from clientes`);
    assert.deepEqual(ficha, { nome: "Lia Sem Nove", whatsapp: "+5599988887777" }, "nome e número da ficha continuam");
    const meus = await lia(`select origem_externa_id from agendamentos`);
    assert.deepEqual(meus, [{ origem_externa_id: "lia-futuro@teste" }]);

    const trocas = (await db.query(`select * from clientes_trocas_aparelho where cliente_id = $1`, [liaId])).rows;
    assert.equal(trocas.length, 0, "primeiro cadastro de ficha importada não é troca de aparelho");
    const vinculo = (await db.query(`select user_id from clientes_primeiro_vinculo where cliente_id = $1`, [liaId])).rows;
    assert.deepEqual(vinculo, [{ user_id: sessao }], "mas fica registrado quem assumiu a ficha, pra auditoria");
    assert.deepEqual(await lia(`select * from clientes_primeiro_vinculo`), [], "a cliente não lê a auditoria");
    const gisele = (await db.query(`select user_id from profissionais where papel = 'owner'`)).rows[0].user_id;
    assert.equal((await como(db, "authenticated", gisele)(`select * from clientes_primeiro_vinculo where cliente_id = $1`, [liaId])).length, 1, "a Gisele lê");

    // aparelho novo depois disso: aí sim é troca
    const outro = await criarLoginAnonimo(db);
    await como(db, "authenticated", outro)(`select cadastrar_cliente('Lia', '+5599988887777')`);
    const depois = (await db.query(`select user_id_anterior, user_id_novo from clientes_trocas_aparelho where cliente_id = $1`, [liaId])).rows;
    assert.deepEqual(depois, [{ user_id_anterior: sessao, user_id_novo: outro }]);
    assert.deepEqual(await lia(`select id from agendamentos`), [], "o aparelho antigo perdeu o acesso");
  });

  test("a migration pode ser colada de novo", async () => {
    const arquivo = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations", "20261011120000_importacao_agenda.sql");
    await db.exec(readFileSync(arquivo, "utf8"));
    const [{ n }] = (await db.query(`select count(*)::int n from agendamentos where origem_externa_id is not null`)).rows;
    assert.ok(n > 0);
  });

  test("sem a migration, o importar.sql para antes de gravar qualquer coisa", async () => {
    const vazio = await criarBanco();
    await vazio.exec(`alter table agendamentos drop column origem_externa_id`);
    await assert.rejects(vazio.exec(gerarSql(plano)), /15-importacao-agenda/);
    await vazio.exec("rollback").catch(() => {});
    const [{ n }] = (await vazio.query(`select count(*)::int n from clientes`)).rows;
    assert.equal(n, 0);
  });
});
