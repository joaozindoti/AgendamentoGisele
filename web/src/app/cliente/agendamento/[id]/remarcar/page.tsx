import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Caixa, LinkBotao, Titulo } from "@/components/ui";
import { exigirCliente } from "@/lib/auth";
import { SELECT_AGENDAMENTO_CLIENTE, lerConfigNumero, type AgendamentoComDetalhes } from "@/lib/consultas";
import { agoraMs, dataLonga, hora, lerPeriodo } from "@/lib/formato";
import { WHATSAPP_STUDIO } from "@/lib/studio";
import { linkWhatsApp } from "@/lib/telefone";
import { FormRemarcar } from "./form";

export const metadata: Metadata = { title: "Remarcar" };

export default async function PaginaRemarcar({ params }: PageProps<"/cliente/agendamento/[id]/remarcar">) {
  const { id } = await params;
  const { supabase, clienteId } = await exigirCliente();

  const [{ data }, horasMinimas, diasMaximos] = await Promise.all([
    supabase.from("agendamentos").select(SELECT_AGENDAMENTO_CLIENTE).eq("id", id).eq("cliente_id", clienteId).maybeSingle(),
    lerConfigNumero(supabase, "horas_minimas_remarcacao", 2),
    lerConfigNumero(supabase, "dias_maximos_agendamento", 60),
  ]);
  if (!data) notFound();

  const ag = data as unknown as AgendamentoComDetalhes;
  const { inicio } = lerPeriodo(ag.periodo);
  const podeAlterar = ag.status === "confirmado" && inicio.getTime() - agoraMs() > horasMinimas * 3600_000;

  return (
    <>
      <Titulo eyebrow="Remarcar" sub={`Atual: ${dataLonga(inicio)} · ${hora(inicio)}`}>
        {ag.servico?.nome}
      </Titulo>
      {podeAlterar ? (
        <FormRemarcar
          agendamentoId={ag.id}
          profissionalId={ag.profissional_id}
          servicoId={ag.servico_id}
          diasMaximos={diasMaximos}
        />
      ) : (
        <div className="space-y-3">
          <Caixa>
            Pelo app, dá pra remarcar até {horasMinimas}h antes do horário. Pra mudar agora, fale com o studio.
          </Caixa>
          <LinkBotao href={linkWhatsApp(WHATSAPP_STUDIO)} target="_blank" rel="noopener">
            Falar com o studio
          </LinkBotao>
        </div>
      )}
    </>
  );
}
