// Resposta automática a mensagem recebida (fase 17): a lógica pura de
// supabase/functions/responder-whatsapp/regras.ts (o Node 22.6+ lê .ts
// direto) e, no banco, o cooldown e o acesso às tabelas novas.

import assert from "node:assert/strict";
import { before, describe, test } from "node:test";
import { classificar, lerMensagem, mensagemLink, normalizar, variantesTelefone } from "../functions/responder-whatsapp/regras.ts";
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
    outro: [
      "Bom dia!",
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

  test("prioridade: curso > link > masculino", () => {
    assert.equal(classificar("tem curso? qual o link pra agendar?"), "curso");
    assert.equal(classificar("curso pra homem?"), "curso");
    assert.equal(classificar("atende homem? como faço pra agendar?"), "link");
    assert.equal(classificar("é só mulher? me manda o link"), "link");
  });

  test("normalizar tira acento, caixa e pontuação", () => {
    assert.equal(normalizar("  Só pra MULHER?!  "), "so pra mulher");
    assert.equal(normalizar("Horário—amanhã"), "horario amanha");
  });

  test("mensagem de link leva o endereço", () => {
    assert.ok(mensagemLink("https://exemplo.app/instalar").includes("https://exemplo.app/instalar"));
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
