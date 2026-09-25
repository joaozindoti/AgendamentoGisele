// Auth Hook "Send SMS" (seção 4, ponto 2 do documento de arquitetura). O
// Supabase Auth chama isso sempre que alguém pede um OTP via
// `supabase.auth.signInWithOtp({ phone })` — o nome do hook continua sendo
// "send_sms" mesmo o canal de entrega sendo WhatsApp.
//
// Autenticação: NÃO é JWT de usuário — a verificação de JWT desta função
// fica desligada. O Supabase assina o corpo da requisição no padrão
// Standard Webhooks (header `webhook-signature`), verificado abaixo com o
// secret SEND_SMS_HOOK_SECRET, que o próprio dashboard gera ao habilitar o
// hook (Authentication → Hooks → Send SMS). Rejeitar qualquer chamada com
// assinatura inválida é o que impede alguém na internet de usar este
// endpoint como bomba de spam de WhatsApp. Passo a passo: PENDENCIAS.md.

import { Webhook } from "npm:standardwebhooks@1.0.0";
import { enviarWhatsApp } from "../_shared/evolution.ts";

interface EventoSendSms {
  user?: { phone?: string };
  sms?: { otp?: string };
}

Deno.serve(async (req) => {
  const secret = Deno.env.get("SEND_SMS_HOOK_SECRET");
  if (!secret) {
    return new Response(
      JSON.stringify({ error: { http_code: 500, message: "hook não configurado" } }),
      { status: 500 },
    );
  }

  const payload = await req.text();
  const headers = Object.fromEntries(req.headers);

  let evento: EventoSendSms;
  try {
    const wh = new Webhook(secret.replace(/^v1,whsec_/, ""));
    evento = wh.verify(payload, headers) as EventoSendSms;
  } catch {
    return new Response(
      JSON.stringify({ error: { http_code: 401, message: "assinatura inválida" } }),
      { status: 401 },
    );
  }

  const telefoneCru = evento.user?.phone;
  const otp = evento.sms?.otp;

  if (!telefoneCru || !otp) {
    return new Response(
      JSON.stringify({ error: { http_code: 400, message: "payload sem phone/otp" } }),
      { status: 400 },
    );
  }

  // auth.users.phone chega sem "+" — mesma observação já registrada no
  // trigger handle_new_user (migration 20260925153806, seção 4). Confirmar
  // em teste real com número de verdade.
  const telefone = telefoneCru.startsWith("+") ? telefoneCru : `+${telefoneCru}`;

  const mensagem =
    `Studio Gisele Lima\nSeu código de verificação: ${otp}\n` +
    `Válido por alguns minutos. Não compartilhe esse código com ninguém.`;

  try {
    await enviarWhatsApp(telefone, mensagem);
  } catch (err) {
    return new Response(
      JSON.stringify({ error: { http_code: 500, message: `falha ao enviar WhatsApp: ${err}` } }),
      { status: 500 },
    );
  }

  return new Response(JSON.stringify({}), { status: 200 });
});
