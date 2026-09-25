import { notFound } from "next/navigation";
import Link from "next/link";
import { Card, Eyebrow, PontoStatus } from "@/components/ui";
import { exigirProfissional } from "@/lib/auth";
import { SELECT_AGENDAMENTO_PAINEL, lerConfigNumero, type AgendamentoComDetalhes } from "@/lib/consultas";
import { agoraMs, chaveDia, dataLonga, hora, lerPeriodo } from "@/lib/formato";
import { exibirTelefone, linkWhatsApp } from "@/lib/telefone";
import { ROTULO_STATUS } from "@/lib/tipos";
import { AcoesPainel, FormObservacoes } from "./acoes";

export default async function DetalheAgendamento({ params }: PageProps<"/painel/agendamentos/[id]">) {
  const { id } = await params;
  const { supabase } = await exigirProfissional();

  const [{ data }, diasMaximos] = await Promise.all([
    supabase.from("agendamentos").select(SELECT_AGENDAMENTO_PAINEL).eq("id", id).maybeSingle(),
    lerConfigNumero(supabase, "dias_maximos_agendamento", 60),
  ]);
  if (!data) notFound();

  const ag = data as unknown as AgendamentoComDetalhes;
  const { inicio, fim } = lerPeriodo(ag.periodo);

  return (
    <div className="space-y-5">
      <Link href={`/painel?data=${chaveDia(inicio)}`} className="text-[14px] text-accent">
        ‹ Agenda
      </Link>
      <Card className="p-5">
        <div className="flex items-start justify-between gap-3">
          <Eyebrow>{ag.canal === "app" ? "Marcado pela cliente no app" : "Marcado pelo painel"}</Eyebrow>
          <PontoStatus status={ag.status} rotulo={ROTULO_STATUS[ag.status]} />
        </div>
        <h1 className="mt-2 text-[24px] font-semibold tracking-tight">{ag.servico?.nome}</h1>
        <p className="mt-1 text-[15px]">
          {dataLonga(inicio)} · {hora(inicio)}–{hora(fim)}
        </p>
        <p className="text-[15px] text-ink-muted">com {ag.profissional?.nome}</p>

        <div className="mt-4 border-t border-line pt-4">
          <p className="text-[13px] text-ink-muted">Cliente</p>
          <Link href={`/painel/clientes/${ag.cliente_id}`} className="text-[17px] font-semibold text-ink hover:text-accent">
            {ag.cliente?.nome}
          </Link>
          {ag.cliente?.whatsapp && (
            <p className="mt-1">
              <a href={linkWhatsApp(ag.cliente.whatsapp)} target="_blank" rel="noopener" className="text-[14px] text-accent">
                WhatsApp {exibirTelefone(ag.cliente.whatsapp)}
              </a>
            </p>
          )}
        </div>
      </Card>

      <AcoesPainel
        agendamentoId={ag.id}
        status={ag.status}
        passou={fim.getTime() <= agoraMs()}
        profissionalId={ag.profissional_id}
        servicoId={ag.servico_id}
        diasMaximos={diasMaximos}
      />

      <FormObservacoes agendamentoId={ag.id} observacoes={ag.observacoes} />
    </div>
  );
}
