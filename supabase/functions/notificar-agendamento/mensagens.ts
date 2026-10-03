// Textos de notificar-agendamento, sem Deno nem Supabase: os testes
// (supabase/tests/notificar-agendamento.test.mjs) importam direto.

export type Evento = "confirmacao" | "cancelamento" | "remarcacao";

export interface Dados {
  clienteNome: string;
  servicoNome: string;
  profissionalNome: string;
  data: string;
  hora: string;
}

/**
 * Mensagens da cliente, na ordem de envio. Na confirmação, o protocolo
 * pré-atendimento da profissional + serviço (fase 23) vai logo depois do
 * "Agendamento confirmado!"; sem texto cadastrado, só a confirmação.
 */
export function mensagensCliente(evento: Evento, d: Dados, protocoloPre: string | null = null): string[] {
  const pre = protocoloPre?.trim();
  switch (evento) {
    case "confirmacao":
      return [
        `Agendamento confirmado! ${d.servicoNome} no dia ${d.data} às ${d.hora}, com ${d.profissionalNome}. ` +
          `Studio Gisele Lima te espera 💛`,
        ...(pre ? [`Cuidados antes do seu ${d.servicoNome} (${d.profissionalNome}):\n\n${pre}`] : []),
      ];
    case "remarcacao":
      return [
        `Horário remarcado! ${d.servicoNome} agora é no dia ${d.data} às ${d.hora}, com ${d.profissionalNome}. ` +
          `Studio Gisele Lima te espera 💛`,
      ];
    case "cancelamento":
      return [
        `Seu agendamento de ${d.servicoNome} no dia ${d.data} às ${d.hora} foi cancelado. ` +
          `Se quiser remarcar, é só abrir o app. Studio Gisele Lima`,
      ];
  }
}

export function mensagemProfissional(evento: Evento, d: Dados): string {
  switch (evento) {
    case "confirmacao":
      return `Novo agendamento: ${d.clienteNome} — ${d.servicoNome} em ${d.data} às ${d.hora}.`;
    case "remarcacao":
      return `Remarcação: ${d.clienteNome} — ${d.servicoNome} passou para ${d.data} às ${d.hora}.`;
    case "cancelamento":
      return `Cancelamento: ${d.clienteNome} — ${d.servicoNome} que era em ${d.data} às ${d.hora} foi cancelado.`;
  }
}
