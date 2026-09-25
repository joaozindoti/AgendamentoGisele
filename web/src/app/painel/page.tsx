import Link from "next/link";
import { LinkBotao } from "@/components/ui";
import { exigirProfissional } from "@/lib/auth";
import { SELECT_AGENDAMENTO_PAINEL, type AgendamentoComDetalhes } from "@/lib/consultas";
import { chaveDia, dataCurta, diaDaSemana, faixa, hora, inicioDoDia, lerPeriodo, somaDias } from "@/lib/formato";
import { ListaAgenda } from "./lista-agenda";

const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export default async function Agenda({ searchParams }: PageProps<"/painel">) {
  const { supabase, ehOwner } = await exigirProfissional();
  const sp = await searchParams;
  const hoje = chaveDia();
  const dia = typeof sp.data === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.data) ? sp.data : hoje;
  const filtroProf = ehOwner && typeof sp.prof === "string" ? sp.prof : "";

  // semana começando na segunda
  const segunda = somaDias(dia, -((diaDaSemana(dia) + 6) % 7));
  const inicioSemana = inicioDoDia(segunda);
  const fimSemana = inicioDoDia(somaDias(segunda, 7));
  const agora = new Date();

  let consultaSemana = supabase
    .from("agendamentos")
    .select(SELECT_AGENDAMENTO_PAINEL)
    .filter("periodo", "ov", faixa(inicioSemana, fimSemana))
    .order("periodo");
  let consultaPendentes = supabase
    .from("agendamentos")
    .select(SELECT_AGENDAMENTO_PAINEL)
    .eq("status", "confirmado")
    .filter("periodo", "sl", faixa(agora, new Date(agora.getTime() + 1)))
    .order("periodo", { ascending: false })
    .limit(20);
  if (filtroProf) {
    consultaSemana = consultaSemana.eq("profissional_id", filtroProf);
    consultaPendentes = consultaPendentes.eq("profissional_id", filtroProf);
  }

  const [{ data: semana }, { data: pendentes }, { data: equipe }] = await Promise.all([
    consultaSemana,
    consultaPendentes,
    ehOwner
      ? supabase.from("profissionais").select("id, nome").eq("ativo", true).order("nome")
      : Promise.resolve({ data: [] as { id: string; nome: string }[] }),
  ]);

  const itensSemana = ((semana ?? []) as unknown as AgendamentoComDetalhes[]).map((a) => ({ ...a, ...lerPeriodo(a.periodo) }));
  const contagem = new Map<string, number>();
  for (const a of itensSemana) {
    if (a.status === "cancelado") continue;
    const k = chaveDia(a.inicio);
    contagem.set(k, (contagem.get(k) ?? 0) + 1);
  }
  const doDia = itensSemana
    .filter((a) => chaveDia(a.inicio) === dia)
    .map((a) => ({
      id: a.id,
      hora: hora(a.inicio),
      fim: hora(a.fim),
      status: a.status,
      cliente: a.cliente?.nome ?? "",
      servico: a.servico?.nome ?? "",
      profissional: a.profissional?.nome ?? "",
      canal: a.canal,
    }));

  const qs = (d: string) => `/painel?data=${d}${filtroProf ? `&prof=${filtroProf}` : ""}`;
  const listaPendentes = ((pendentes ?? []) as unknown as AgendamentoComDetalhes[]).map((a) => ({ ...a, ...lerPeriodo(a.periodo) }));

  return (
    <div className="space-y-5">
      <header className="flex items-end justify-between gap-3">
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-gold-ink">Lindeza Premium</p>
          <h1 className="text-[28px] font-semibold tracking-tight">Agenda</h1>
        </div>
        <LinkBotao href={`/painel/novo?data=${dia}`}>+ Novo agendamento</LinkBotao>
      </header>

      <div className="flex items-center gap-2">
        <Link href={qs(somaDias(segunda, -7))} aria-label="Semana anterior" className="rounded-input border border-line bg-surface px-3 py-2 text-ink-muted">
          ‹
        </Link>
        <p className="flex-1 text-center text-[14px] font-medium">
          {dataCurta(inicioSemana)} – {dataCurta(inicioDoDia(somaDias(segunda, 6)))}
        </p>
        <Link href={qs(somaDias(segunda, 7))} aria-label="Próxima semana" className="rounded-input border border-line bg-surface px-3 py-2 text-ink-muted">
          ›
        </Link>
        {dia !== hoje && (
          <Link href={qs(hoje)} className="rounded-input border border-line bg-surface px-3 py-2 text-[13px] text-accent">
            Hoje
          </Link>
        )}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: 7 }, (_, i) => somaDias(segunda, i)).map((d) => {
          const ativo = d === dia;
          const n = contagem.get(d) ?? 0;
          return (
            <Link
              key={d}
              href={qs(d)}
              aria-current={ativo ? "date" : undefined}
              className={`flex flex-col items-center rounded-input border py-2 text-center ${
                ativo ? "border-accent bg-accent text-white" : "border-line bg-surface text-ink"
              }`}
            >
              <span className={`text-[11px] uppercase ${ativo ? "text-white/80" : "text-ink-muted"}`}>{DIAS[diaDaSemana(d)]}</span>
              <span className="text-[17px] font-semibold">{Number(d.slice(8))}</span>
              <span className={`text-[11px] ${ativo ? "text-white/80" : n ? "text-accent" : "text-ink-muted/50"}`}>{n || "–"}</span>
            </Link>
          );
        })}
      </div>

      {ehOwner && equipe && equipe.length > 1 && (
        <div className="flex flex-wrap gap-2 text-[13px]">
          <Link
            href={`/painel?data=${dia}`}
            className={`rounded-pill px-3 py-1 ${!filtroProf ? "bg-accent text-white" : "bg-surface text-ink-muted"}`}
          >
            Todas
          </Link>
          {equipe.map((p) => (
            <Link
              key={p.id}
              href={`/painel?data=${dia}&prof=${p.id}`}
              className={`rounded-pill px-3 py-1 ${filtroProf === p.id ? "bg-accent text-white" : "bg-surface text-ink-muted"}`}
            >
              {p.nome}
            </Link>
          ))}
        </div>
      )}

      <ListaAgenda itens={doDia} mostrarProfissional={ehOwner && !filtroProf} diaTexto={dia === hoje ? "Hoje" : dataCurta(inicioDoDia(dia))} />

      {listaPendentes.length > 0 && (
        <section>
          <h2 className="mb-1 text-[15px] font-semibold">Pendentes de baixa</h2>
          <p className="mb-2 text-[13px] text-ink-muted">
            Já passaram e continuam como &quot;confirmado&quot;. Marque como atendido ou não compareceu — é isso que alimenta
            as métricas e o lembrete de manutenção.
          </p>
          <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
            {listaPendentes.map((a) => (
              <li key={a.id}>
                <Link href={`/painel/agendamentos/${a.id}`} className="flex justify-between gap-3 px-4 py-3 hover:bg-base">
                  <span className="min-w-0">
                    <span className="block truncate text-[15px] font-medium">{a.cliente?.nome}</span>
                    <span className="block text-[13px] text-ink-muted">{a.servico?.nome}</span>
                  </span>
                  <span className="shrink-0 text-right text-[13px] text-ink-muted">
                    {dataCurta(a.inicio)}
                    <br />
                    {hora(a.inicio)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
