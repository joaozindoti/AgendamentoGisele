// Cliente mínimo pra Evolution API. Compartilhado entre `send-whatsapp`
// (utilitária HTTP, seção 6 do documento de arquitetura) e
// `enviar-otp-whatsapp` (Auth Hook de login, seção 4) por importação direta
// de módulo, não por chamada HTTP entre functions: o hook de OTP está no
// caminho crítico do login e já tem timeout apertado do lado do Supabase
// Auth, então um hop de rede extra (mais autenticação via service role)
// só pra reusar essa lógica não compensa.
//
// Variáveis de ambiente esperadas (Edge Functions → Secrets no dashboard,
// nunca hardcoded):
//   EVOLUTION_API_URL       ex: https://179.197.229.103.nip.io:8080 —
//                           CONFIRMAR a porta exposta publicamente na VPS
//                           antes de usar em produção; 8080 é a porta
//                           interna, pode não ser a externa.
//   EVOLUTION_API_INSTANCE  ex: studio-gisele-lima
//   EVOLUTION_API_KEY       pegar no painel/env da VPS ou do n8n atual.

const E164 = /^\+[1-9]\d{7,14}$/;

export class EvolutionApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

// Formato do body assume Evolution API v2 (`POST /message/sendText/{instance}`
// com `{ number, text }`). Confirmar contra a versão real rodando na VPS
// antes do primeiro envio de verdade — versões 1.x usam um shape diferente
// (`{ number, textMessage: { text } }`).
export async function enviarWhatsApp(telefone: string, mensagem: string): Promise<void> {
  if (!E164.test(telefone)) {
    throw new EvolutionApiError(`telefone fora do formato E.164: ${telefone}`);
  }
  if (typeof mensagem !== "string" || mensagem.trim().length === 0) {
    throw new EvolutionApiError("mensagem vazia");
  }

  const baseUrl = Deno.env.get("EVOLUTION_API_URL");
  const instance = Deno.env.get("EVOLUTION_API_INSTANCE");
  const apiKey = Deno.env.get("EVOLUTION_API_KEY");

  if (!baseUrl || !instance || !apiKey) {
    throw new EvolutionApiError(
      "EVOLUTION_API_URL, EVOLUTION_API_INSTANCE ou EVOLUTION_API_KEY não configurados",
    );
  }

  const numero = telefone.slice(1); // Evolution API espera DDI+número sem "+"

  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/message/sendText/${instance}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: apiKey,
    },
    body: JSON.stringify({ number: numero, text: mensagem }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new EvolutionApiError(`Evolution API respondeu ${res.status}: ${detail}`, res.status);
  }
}
