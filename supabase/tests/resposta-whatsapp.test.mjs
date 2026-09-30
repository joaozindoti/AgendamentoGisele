// Resposta automática a mensagem recebida (fase 17): a lógica pura de
// supabase/functions/responder-whatsapp/regras.ts (o Node 22.6+ lê .ts
// direto) e, no banco, o cooldown e o acesso às tabelas novas.

import assert from "node:assert/strict";
import { before, describe, test } from "node:test";
import { classificar, decidir, exibirTelefone, lerMensagem, mensagemAlertaGisele, mensagemLink, normalizar, variantesTelefone } from "../functions/responder-whatsapp/regras.ts";
import { TELEFONE_GISELE, como, criarBanco, criarLogin } from "./ambiente.mjs";

describe("classificação por palavra-chave", () => {
  const casos = {
    link: [
      "Oi, qual o link pra agendar?",
      "me manda o LINK",
      "vcs tem aplicativo?",
      "como faço para agendar",
      "Como faço pra agendar??",
      "queria marcar horário",
      "tem horario amanha?",
      "Tem vaga sexta?",
      "qual o site de vcs",
      "quero remarcar",
      "preciso cancelar meu horário",
      "ajendar sombrancelha",
      "manda o app",
      "quero fazer um agendamento",
      "Agendamento?",
      "queria uma marcação",
      "agendei ontem, confirmou?",
      "tem disponibilidade sábado?",
      "quero reservar",
    ],
    masculino: [
      "Vocês atendem homem?",
      "é só pra mulher?",
      "Só para mulheres?",
      "atende público masculino?",
      "posso levar meu marido?",
      "fazem barba?",
      "HOMEM pode ir?",
    ],
    curso: [
      "Vocês têm curso de design de sobrancelha?",
      "quero fazer o curso",
      "Tem cursos?",
      "vocês dão aula?",
      "quero aprender a fazer henna",
      "Tenho um workshop pra oferecer",
    ],
    saudacao: [
      "oi",
      "Oii",
      "Olá!",
      "ola",
      "Bom dia!",
      "bom diaaa",
      "Boa tarde",
      "boa tardee",
      "Boa noite 🌙",
      "oi, tudo bem?",
      "Bom dia gente, td bom?",
      "oie Gisele",
    ],
    outro: [
      "bom dia, quanto custa a sobrancelha?",
      "oi, obrigada",
      "quanto custa a limpeza de pele?",
      "obrigada 💛",
      "mandei whatsapp ontem",
      "vou visitar vocês",
      "",
      "   ",
    ],
  };

  for (const [esperada, textos] of Object.entries(casos)) {
    for (const t of textos) {
      test(`"${t}" -> ${esperada}`, () => assert.equal(classificar(t), esperada));
    }
  }

  test("palavra só casa inteira: whatsapp não é app, visite não é site", () => {
    assert.equal(classificar("chama no whatsapp"), "outro");
    assert.equal(classificar("visite nosso perfil"), "outro");
    assert.equal(classificar("cursor"), "outro");
  });

  test("prioridade: curso > masculino > link > saudação", () => {
    assert.equal(classificar("tem curso? qual o link pra agendar?"), "curso");
    assert.equal(classificar("curso pra homem?"), "curso");
    assert.equal(classificar("oi, vocês tem curso de extensão?"), "curso");
    assert.equal(classificar("atende homem? como faço pra agendar?"), "masculino");
    assert.equal(classificar("é só mulher? me manda o link"), "masculino");
    assert.equal(classificar("oi, queria agendar"), "link");
    assert.equal(classificar("boa tarde, atende homem?"), "masculino");
  });

  test("normalizar tira acento, caixa e pontuação", () => {
    assert.equal(normalizar("  Só pra MULHER?!  "), "so pra mulher");
    assert.equal(normalizar("Horário—amanhã"), "horario amanha");
  });

  test("mensagem de link leva o endereço", () => {
    assert.ok(mensagemLink("https://exemplo.app/instalar").includes("https://exemplo.app/instalar"));
  });
});

describe("decisão: saudação depende do cadastro, o resto não", () => {
  const acao = (texto, cadastrada) => decidir(classificar(texto), cadastrada);

  test("número novo mandando só \"oi\" recebe o link", () => {
    assert.equal(acao("oi", false), "link");
    assert.equal(acao("Boa tarde!", false), "link");
  });

  test("cliente cadastrada mandando só \"bom dia\" não recebe nada: vai pra não classificadas (e alerta)", () => {
    assert.equal(acao("bom dia", true), "registrar");
    assert.equal(acao("oi, tudo bem?", true), "registrar");
  });

  test("\"quero fazer um agendamento\" é link pra nova e pra cadastrada", () => {
    assert.equal(acao("quero fazer um agendamento", false), "link");
    assert.equal(acao("quero fazer um agendamento", true), "link");
  });

  test("\"oi, vocês tem curso de extensão?\" fica em silêncio pra qualquer uma", () => {
    assert.equal(acao("oi, vocês tem curso de extensão?", false), "silencio");
    assert.equal(acao("oi, vocês tem curso de extensão?", true), "silencio");
  });

  test("masculino responde pra qualquer número; o resto registra", () => {
    assert.equal(acao("atende homem?", true), "masculino");
    assert.equal(acao("atende homem?", false), "masculino");
    assert.equal(acao("quanto custa?", false), "registrar");
  });
});

describe("alerta pra Gisele (mensagem sem categoria)", () => {
  test("traz nome, telefone legível, o texto e o link direto pra conversa", () => {
    const t = mensagemAlertaGisele("+5599984183784", "Maria", "quanto custa a limpeza?");
    assert.match(t, /Nova mensagem sem resposta automática de Maria · \(99\) 98418-3784/);
    assert.ok(t.includes('"quanto custa a limpeza?"'));
    assert.ok(t.includes("https://wa.me/5599984183784"));
  });

  test("sem nome, só o telefone; áudio aparece como rótulo", () => {
    const t = mensagemAlertaGisele("+559984183784", null, "[áudio]");
    assert.match(t, /de \(99\) 8418-3784:/);
    assert.ok(t.includes('"[áudio]"'));
  });

  test("texto longo é cortado", () => {
    const t = mensagemAlertaGisele("+5599984183784", null, "a".repeat(2000));
    assert.ok(t.length < 700);
    assert.ok(t.includes("…"));
  });

  test("telefone de fora do Brasil fica como veio", () => {
    assert.equal(exibirTelefone("+14155550100"), "+14155550100");
  });
});

describe("leitura do webhook da Evolution API", () => {
  const agora = 1_790_000_000;
  const webhook = (data, event = "messages.upsert") => ({ event, instance: "studio-gisele-lima", data });
  const base = (extra = {}) => ({
    key: { remoteJid: "559984183784@s.whatsapp.net", fromMe: false, id: "ABC123", ...extra.key },
    pushName: "Maria",
    message: { conversation: "qual o link?" },
    messageType: "conversation",
    messageTimestamp: agora - 5,
    ...extra.data,
  });

  test("conversa individual com texto", () => {
    assert.deepEqual(lerMensagem(webhook(base()), agora), {
      telefone: "+559984183784",
      nome: "Maria",
      texto: "qual o link?",
      mensagemId: "ABC123",
    });
  });

  test("evento em maiúsculas (MESSAGES_UPSERT) também vale", () => {
    assert.equal(lerMensagem(webhook(base(), "MESSAGES_UPSERT"), agora).telefone, "+559984183784");
  });

  test("ignora eco da própria instância, grupo, status e outros eventos", () => {
    assert.equal(lerMensagem(webhook(base({ key: { fromMe: true } })), agora).ignorar, "fromMe");
    assert.equal(lerMensagem(webhook(base({ key: { remoteJid: "120363000000000000@g.us" } })), agora).ignorar, "grupo");
    assert.equal(lerMensagem(webhook(base({ key: { remoteJid: "status@broadcast" } })), agora).ignorar, "status/canal");
    assert.match(lerMensagem(webhook(base(), "messages.update"), agora).ignorar, /evento/);
    assert.match(lerMensagem(webhook(base(), "connection.update"), agora).ignorar, /evento/);
  });

  test("ignora mensagem antiga reentregue na reconexão", () => {
    const velha = base({ data: { messageTimestamp: agora - 3600 } });
    assert.equal(lerMensagem(webhook(velha), agora).ignorar, "mensagem antiga");
  });

  test("@lid usa o número real de remoteJidAlt; sem número, ignora", () => {
    const lid = base({ key: { remoteJid: "123456789012345@lid", remoteJidAlt: "5599984183784@s.whatsapp.net" } });
    assert.equal(lerMensagem(webhook(lid), agora).telefone, "+5599984183784");
    const semNumero = base({ key: { remoteJid: "123456789012345@lid" } });
    assert.match(lerMensagem(webhook(semNumero), agora).ignorar, /sem número/);
  });

  test("texto de extendedTextMessage, legenda e mensagem temporária", () => {
    const ext = base({ data: { message: { extendedTextMessage: { text: "tem vaga?" } } } });
    assert.equal(lerMensagem(webhook(ext), agora).texto, "tem vaga?");
    const legenda = base({ data: { message: { imageMessage: { caption: "é esse o curso?" } } } });
    assert.equal(lerMensagem(webhook(legenda), agora).texto, "é esse o curso?");
    const temporaria = base({ data: { message: { ephemeralMessage: { message: { conversation: "oi" } } } } });
    assert.equal(lerMensagem(webhook(temporaria), agora).texto, "oi");
  });

  test("áudio vira rótulo; reação e figurinha são ignoradas", () => {
    const audio = base({ data: { message: { audioMessage: { seconds: 12 } } } });
    assert.equal(lerMensagem(webhook(audio), agora).texto, "[áudio]");
    const reacao = base({ data: { message: { reactionMessage: { text: "❤️" } } } });
    assert.equal(lerMensagem(webhook(reacao), agora).ignorar, "sem texto");
    const figurinha = base({ data: { message: { stickerMessage: {} } } });
    assert.equal(lerMensagem(webhook(figurinha), agora).ignorar, "sem texto");
  });

  test("timestamp como string ou Long do protobuf", () => {
    assert.equal(lerMensagem(webhook(base({ data: { messageTimestamp: String(agora) } })), agora).telefone, "+559984183784");
    assert.equal(lerMensagem(webhook(base({ data: { messageTimestamp: { low: agora - 7200, high: 0 } } })), agora).ignorar, "mensagem antiga");
  });

  test("telefone com e sem o 9 pra comparar com a equipe", () => {
    assert.deepEqual(variantesTelefone("+559984183784").sort(), ["+559984183784", "+5599984183784"]);
    assert.deepEqual(variantesTelefone("+5599984183784").sort(), ["+559984183784", "+5599984183784"]);
    assert.deepEqual(variantesTelefone("+14155550100"), ["+14155550100"]);
  });
});

describe("cooldown e tabelas (banco)", () => {
  let db, sr, anon, gisele;

  before(async () => {
    db = await criarBanco();
    sr = como(db, "service_role");
    anon = como(db, "anon");
    gisele = await criarLogin(db, TELEFONE_GISELE);
  });

  const reivindicar = (tel, cat = "link") => sr(`select reivindicar_resposta_automatica($1, $2, 10) as ok`, [tel, cat]).then((r) => r[0].ok);

  test("primeira resposta pode; segunda em menos de 10 min, não (mesmo em outra categoria)", async () => {
    assert.equal(await reivindicar("+5599900000001"), true);
    assert.equal(await reivindicar("+5599900000001"), false);
    assert.equal(await reivindicar("+5599900000001", "masculino"), false);
    assert.equal(await reivindicar("+5599900000002"), true, "outro número não é afetado");
  });

  test("passados 10 minutos, responde de novo", async () => {
    await reivindicar("+5599900000003");
    await db.query(`update respostas_automaticas set respondido_em = now() - interval '10 minutes 1 second' where telefone = $1`, ["+5599900000003"]);
    assert.equal(await reivindicar("+5599900000003", "masculino"), true);
    const [linha] = (await db.query(`select categoria from respostas_automaticas where telefone = $1`, ["+5599900000003"])).rows;
    assert.equal(linha.categoria, "masculino");
  });

  const alertar = (tel) => sr(`select reivindicar_alerta_gisele($1, 10) as ok`, [tel]).then((r) => r[0].ok);

  test("alerta pra Gisele: um por número a cada 10 min, e volta depois", async () => {
    assert.equal(await alertar("+5599900000005"), true);
    assert.equal(await alertar("+5599900000005"), false, "segunda mensagem seguida não gera outro alerta");
    assert.equal(await alertar("+5599900000006"), true, "outro número alerta normalmente");
    await db.query(`update alertas_mensagem_nao_classificada set alertado_em = now() - interval '10 minutes 1 second' where telefone = $1`, ["+5599900000005"]);
    assert.equal(await alertar("+5599900000005"), true);
  });

  test("cooldown do alerta é separado do da resposta automática", async () => {
    // cliente recebeu o link e logo depois mandou algo que a automação não entende
    assert.equal(await reivindicar("+5599900000007"), true);
    assert.equal(await alertar("+5599900000007"), true);
    assert.equal(await reivindicar("+5599900000007"), false);
  });

  test("app não chama o alerta nem lê a tabela dele", async () => {
    await assert.rejects(anon(`select reivindicar_alerta_gisele('+5599900000009', 10)`), /permission denied/);
    await assert.rejects(como(db, "authenticated", gisele)(`select reivindicar_alerta_gisele('+5599900000009', 10)`), /permission denied/);
    assert.equal((await como(db, "authenticated", gisele)(`select * from alertas_mensagem_nao_classificada`)).length, 0);
  });

  test("app (anon/authenticated) não chama o cooldown nem lê as respostas", async () => {
    await assert.rejects(anon(`select reivindicar_resposta_automatica('+5599900000009', 'link', 10)`), /permission denied/);
    await assert.rejects(como(db, "authenticated", gisele)(`select reivindicar_resposta_automatica('+5599900000009', 'link', 10)`), /permission denied/);
    assert.equal((await como(db, "authenticated", gisele)(`select * from respostas_automaticas`)).length, 0);
  });

  test("mensagens não classificadas: sem duplicar por mensagem_id; só a Gisele lê", async () => {
    const inserir = (id) =>
      sr(`insert into mensagens_nao_classificadas (telefone, texto, mensagem_id) values ('+5599900000004', 'bom dia', $1) on conflict (mensagem_id) do nothing`, [id]);
    await inserir("MSG1");
    await inserir("MSG1");
    await inserir("MSG2");

    assert.equal((await como(db, "authenticated", gisele)(`select * from mensagens_nao_classificadas`)).length, 2);
    assert.equal((await anon(`select * from mensagens_nao_classificadas`)).length, 0);

    const staff = await criarLogin(db, "+5599911112222");
    await sr(`insert into profissionais (nome, telefone, papel) values ('Staff', '+5599911112222', 'staff')`);
    assert.equal((await como(db, "authenticated", staff)(`select * from mensagens_nao_classificadas`)).length, 0);
    await assert.rejects(
      como(db, "authenticated", staff)(`insert into mensagens_nao_classificadas (telefone, texto) values ('x', 'y')`),
      /row-level security/,
    );
  });
});
