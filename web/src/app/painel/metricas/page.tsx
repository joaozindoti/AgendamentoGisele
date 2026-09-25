import type { Metadata } from "next";
import Link from "next/link";
import { Caixa, Titulo } from "@/components/ui";
import { exigirOwner } from "@/lib/auth";
import { mensagemDeErro } from "@/lib/erros";
import { chaveDia, dataCurta, inicioDoDia, moeda, somaDias } from "@/lib/formato";
import { ROTULO_STATUS, type StatusAgendamento } from "@/lib/tipos";
import { ColunasPorDia, Ranking } from "./graficos";

export const metadata: Metadata = { title: "Métricas" };

interface Metricas {
  total: number;
  por_status: Partial<Record<StatusAgendamento, number>>;
  por_dia: { dia: string; total: number }[];
  taxa_no_show: number | null;
  servicos_mais_agendados: { nome: string; total: number }[];
  profissionais_mais_agendadas: { nome: string; total: number }[];
  receita_estimada: number;
  concluidos_sem_preco: number;
  clientes_novas: number;
  clientes_recorrentes: number;
  taxa_recorrencia: number | null;
}

const pct = (v: number | null) => (v === null ? "—" : `${(v * 100).toFixed(1).replace(".", ",")}%`);

export default async function PaginaMetricas({ searchParams }: PageProps<"/painel/metricas">) {
  const { supabase } = await exigirOwner();
  const sp = await searchParams;
  const hoje = chaveDia();
  const valido = (v: unknown) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

  const atalhos = [
    { rotulo: "7 dias", de: somaDias(hoje, -6), ate: hoje },
    { rotulo: "30 dias", de: somaDias(hoje, -29), ate: hoje },
    { rotulo: "Este mês", de: `${hoje.slice(0, 7)}-01`, ate: hoje },
    { rotulo: "90 dias", de: somaDias(hoje, -89), ate: hoje },
  ];
  const de = valido(sp.de) ? (sp.de as string) : atalhos[1].de;
  const ate = valido(sp.ate) && (sp.ate as string) >= de ? (sp.ate as string) : hoje;

  const { data, error } = await supabase.rpc("metricas", { p_inicio: de, p_fim: ate });
  const m = data as Metricas | null;

  return (
    <div className="space-y-5">
      <Titulo sub={`${dataCurta(inicioDoDia(de))} a ${dataCurta(inicioDoDia(ate))}`}>Métricas</Titulo>

      {/* filtros numa linha só, acima dos números */}
      <form className="flex flex-wrap items-end gap-2">
        {atalhos.map((a) => (
          <Link
            key={a.rotulo}
            href={`/painel/metricas?de=${a.de}&ate=${a.ate}`}
            className={`rounded-pill px-3 py-1.5 text-[13px] ${
              de === a.de && ate === a.ate ? "bg-accent text-white" : "bg-surface text-ink-muted hover:text-accent"
            }`}
          >
            {a.rotulo}
          </Link>
        ))}
        <input type="date" name="de" defaultValue={de} className="min-h-9 rounded-input border border-line bg-surface px-2 text-[13px]" aria-label="De" />
        <input type="date" name="ate" defaultValue={ate} className="min-h-9 rounded-input border border-line bg-surface px-2 text-[13px]" aria-label="Até" />
        <button type="submit" className="rounded-pill bg-base px-3 py-1.5 text-[13px] text-accent">
          Aplicar
        </button>
      </form>

      {error || !m ? (
        <Caixa tipo="erro">{mensagemDeErro(error)}</Caixa>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-card border border-line bg-line">
            <Numero rotulo="Agendamentos" valor={String(m.total - (m.por_status.cancelado ?? 0))} nota={`${m.por_status.cancelado ?? 0} cancelados`} />
            <Numero rotulo="Taxa de não comparecimento" valor={pct(m.taxa_no_show)} nota={`${m.por_status.no_show ?? 0} no período`} />
            <Numero
              rotulo="Receita estimada"
              valor={moeda(Number(m.receita_estimada))}
              nota={
                m.concluidos_sem_preco
                  ? `${m.concluidos_sem_preco} atendimento(s) sem preço não contabilizado(s)`
                  : "soma dos atendidos"
              }
              alerta={m.concluidos_sem_preco > 0}
            />
            <Numero rotulo="Recorrência" valor={pct(m.taxa_recorrencia)} nota="clientes com mais de um atendimento" />
            <Numero rotulo="Clientes novas" valor={String(m.clientes_novas)} nota="primeira vez no período" />
            <Numero rotulo="Clientes recorrentes" valor={String(m.clientes_recorrentes)} nota="já tinham vindo antes" />
          </div>

          <div className="rounded-card border border-line bg-surface p-4">
            <p className="mb-2 text-[15px] font-semibold">Por status</p>
            <ul className="grid grid-cols-2 gap-y-1 text-[14px]">
              {(Object.keys(ROTULO_STATUS) as StatusAgendamento[]).map((s) => (
                <li key={s} className="flex justify-between pr-4">
                  <span className="text-ink-muted">{ROTULO_STATUS[s]}</span>
                  <span className="tabular-nums">{m.por_status[s] ?? 0}</span>
                </li>
              ))}
            </ul>
            {(m.por_status.confirmado ?? 0) > 0 && (
              <p className="mt-2 text-[12px] text-ink-muted">
                &quot;Confirmado&quot; em dia que já passou = falta dar baixa na agenda; a receita só conta os atendidos.
              </p>
            )}
          </div>

          <ColunasPorDia de={de} ate={ate} dados={m.por_dia} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Ranking titulo="Serviços mais agendados" itens={m.servicos_mais_agendados} />
            <Ranking titulo="Profissionais mais agendadas" itens={m.profissionais_mais_agendadas} />
          </div>
        </>
      )}
    </div>
  );
}

function Numero({ rotulo, valor, nota, alerta }: { rotulo: string; valor: string; nota: string; alerta?: boolean }) {
  return (
    <div className="bg-surface p-4">
      <p className="text-[12px] text-ink-muted">{rotulo}</p>
      <p className="mt-1 text-[26px] font-semibold tracking-tight tabular-nums">{valor}</p>
      <p className={`mt-0.5 text-[12px] ${alerta ? "text-alerta" : "text-ink-muted"}`}>{nota}</p>
    </div>
  );
}
