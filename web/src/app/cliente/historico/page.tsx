import type { Metadata } from "next";
import { PontoStatus, Titulo, Vazio } from "@/components/ui";
import { exigirCliente } from "@/lib/auth";
import { SELECT_AGENDAMENTO_CLIENTE, type AgendamentoComDetalhes } from "@/lib/consultas";
import { agoraMs, dataCompleta, hora, lerPeriodo } from "@/lib/formato";
import { ROTULO_STATUS } from "@/lib/tipos";

export const metadata: Metadata = { title: "Histórico" };

export default async function Historico() {
  const { supabase, clienteId } = await exigirCliente();
  const { data } = await supabase
    .from("agendamentos")
    .select(SELECT_AGENDAMENTO_CLIENTE)
    .eq("cliente_id", clienteId)
    .order("periodo", { ascending: false })
    .limit(100);

  const lista = ((data ?? []) as unknown as AgendamentoComDetalhes[]).map((a) => ({ ...a, ...lerPeriodo(a.periodo) }));
  const agora = agoraMs();
  const futuros = lista.filter((a) => a.status === "confirmado" && a.inicio.getTime() > agora).reverse();
  const passados = lista.filter((a) => !(a.status === "confirmado" && a.inicio.getTime() > agora));

  return (
    <>
      <Titulo sub="Todos os seus atendimentos no studio">Histórico</Titulo>
      {lista.length === 0 && <Vazio>Você ainda não tem atendimentos por aqui.</Vazio>}
      {futuros.length > 0 && <Grupo titulo="Próximos" itens={futuros} />}
      {passados.length > 0 && <Grupo titulo="Anteriores" itens={passados} />}
    </>
  );
}

function Grupo({ titulo, itens }: { titulo: string; itens: (AgendamentoComDetalhes & { inicio: Date })[] }) {
  return (
    <section className="mb-6">
      <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wider text-ink-muted">{titulo}</h2>
      <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
        {itens.map((a) => (
          <li key={a.id} className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-[15px] font-medium">{a.servico?.nome}</p>
              <p className="text-[13px] text-ink-muted">
                {dataCompleta(a.inicio)} · {hora(a.inicio)} · {a.profissional?.nome}
              </p>
            </div>
            <PontoStatus status={a.status} rotulo={ROTULO_STATUS[a.status]} />
          </li>
        ))}
      </ul>
    </section>
  );
}
