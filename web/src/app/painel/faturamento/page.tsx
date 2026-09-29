import type { Metadata } from "next";
import Link from "next/link";
import { Caixa, Titulo } from "@/components/ui";
import { exigirOwner } from "@/lib/auth";
import { mensagemDeErro } from "@/lib/erros";
import { chaveDia, dataCurta, diaDaSemana, inicioDoDia, moeda, somaDias } from "@/lib/formato";

export const metadata: Metadata = { title: "Faturamento" };

interface LinhaFaturamento {
  profissional_id: string | null; // null = total geral
  profissional_nome: string;
  atendimentos: number;
  sem_preco: number;
  total: number;
}

export default async function PaginaFaturamento({ searchParams }: PageProps<"/painel/faturamento">) {
  // exigirOwner redireciona staff pro /painel; a RPC também recusa quem não é owner.
  const { supabase } = await exigirOwner();
  const sp = await searchParams;
  const hoje = chaveDia();
  const valido = (v: unknown) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

  const segunda = somaDias(hoje, -((diaDaSemana(hoje) + 6) % 7));
  const primeiroDoMes = `${hoje.slice(0, 7)}-01`;
  const atalhos = [
    { rotulo: "Hoje", de: hoje, ate: hoje },
    { rotulo: "Esta semana", de: segunda, ate: somaDias(segunda, 6) },
    { rotulo: "Este mês", de: primeiroDoMes, ate: somaDias(`${somaDias(primeiroDoMes, 31).slice(0, 7)}-01`, -1) },
  ];
  const de = valido(sp.de) ? (sp.de as string) : atalhos[2].de;
  const ate = valido(sp.ate) && (sp.ate as string) >= de ? (sp.ate as string) : valido(sp.de) ? de : atalhos[2].ate;

  const { data, error } = await supabase.rpc("faturamento_periodo", { data_inicio: de, data_fim: ate });
  const linhas = (data ?? []) as LinhaFaturamento[];
  const total = linhas.find((l) => l.profissional_id === null);
  const equipe = linhas.filter((l) => l.profissional_id !== null);

  return (
    <div className="space-y-5">
      <Titulo sub={de === ate ? dataCurta(inicioDoDia(de)) : `${dataCurta(inicioDoDia(de))} a ${dataCurta(inicioDoDia(ate))}`}>
        Faturamento
      </Titulo>

      {/* atalhos + período customizado */}
      <form className="flex flex-wrap items-end gap-2">
        {atalhos.map((a) => (
          <Link
            key={a.rotulo}
            href={`/painel/faturamento?de=${a.de}&ate=${a.ate}`}
            className={`rounded-pill px-3 py-1.5 text-[13px] ${
              de === a.de && ate === a.ate ? "bg-accent text-white" : "bg-surface text-ink-muted hover:text-accent"
            }`}
          >
            {a.rotulo}
          </Link>
        ))}
        <input type="date" name="de" defaultValue={de} className="min-h-9 rounded-input border border-line bg-surface px-2 text-[13px]" aria-label="De" />
        <input type="date" name="ate" defaultValue={ate} className="min-h-9 rounded-input border border-line bg-surface px-2 text-[13px]" aria-label="Até" />
        <button type="submit" className="rounded-pill bg-blush px-3 py-1.5 text-[13px] font-medium text-accent">
          Aplicar
        </button>
      </form>

      {error || !total ? (
        <Caixa tipo="erro">{mensagemDeErro(error)}</Caixa>
      ) : (
        <>
          {/* o número que a Gisele abre a tela pra ver: bloco escuro, o maior da página */}
          <div className="relative overflow-hidden rounded-card bg-ink p-5 text-white shadow-soft">
            <div aria-hidden className="absolute -top-16 -right-16 h-44 w-44 rounded-full border border-gold/40" />
            <p className="font-display text-[11px] font-bold uppercase tracking-[0.2em] text-gold-soft">Total do studio</p>
            <p className="mt-2 font-display text-[38px] leading-none font-extrabold tracking-[-0.03em] tabular-nums">
              {moeda(Number(total.total))}
            </p>
            <p className="mt-2 text-[13px] text-white/70">{Number(total.atendimentos)} atendimento(s) concluído(s)</p>
          </div>

          <section>
            <h2 className="mb-3 text-[17px] font-bold">Por profissional</h2>
            <ul className="space-y-2">
              {equipe.map((l) => {
                const parte = Number(total.total) > 0 ? Number(l.total) / Number(total.total) : 0;
                return (
                  <li key={l.profissional_id} className="rounded-card border border-line bg-surface px-4 py-3">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0 truncate font-display text-[15px] font-bold">{l.profissional_nome}</span>
                      <span className="shrink-0 font-display text-[16px] font-extrabold tabular-nums">{moeda(Number(l.total))}</span>
                    </div>
                    {/* barra = fatia dela no total do período */}
                    <div className="mt-2 h-1.5 overflow-hidden rounded-pill bg-base">
                      <div className="h-full rounded-pill bg-gold" style={{ width: `${Math.round(parte * 100)}%` }} />
                    </div>
                    <p className="mt-1.5 flex justify-between text-[12px] text-ink-muted">
                      <span>{Number(l.atendimentos)} atendimento(s)</span>
                      <span className="tabular-nums">{Math.round(parte * 100)}% do total</span>
                    </p>
                  </li>
                );
              })}
            </ul>
          </section>

          {Number(total.sem_preco) > 0 && (
            <Caixa tipo="info">
              {Number(total.sem_preco)} atendimento(s) de serviço sem preço cadastrado entraram como R$ 0. Cadastre o preço em
              Serviços pra eles contarem.
            </Caixa>
          )}
          <p className="text-[12px] text-ink-muted">
            Conta só atendimentos marcados como &quot;atendido&quot;, pelo preço atual do serviço (ou o preço próprio da
            profissional). Atendimento que já passou e continua &quot;confirmado&quot; precisa de baixa na Agenda.
          </p>
        </>
      )}
    </div>
  );
}
