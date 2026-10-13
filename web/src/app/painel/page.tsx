import Link from "next/link";
import { LinkBotao } from "@/components/ui";
import { exigirProfissional } from "@/lib/auth";
import { SELECT_AGENDAMENTO_PAINEL, servicosDoAgendamento, type AgendamentoComDetalhes } from "@/lib/consultas";
import { chaveDia, dataCurta, diaDaSemana, faixa, hora, inicioDoDia, lerPeriodo, somaDias } from "@/lib/formato";
import { CalendarioMes, type EventoMes } from "./calendario-mes";
import { ListaAgenda } from "./lista-agenda";

const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

/** "YYYY-MM" somado de n meses -> primeiro dia "YYYY-MM-01". */
function primeiroDoMes(mes: string, n: number) {
  const [a, m] = mes.split("-").map(Number);
  const t = a * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}-01`;
}

export default async function Agenda({ searchParams }: PageProps<"/painel">) {
  const { supabase, ehOwner } = await exigirProfissional();
  const sp = await searchParams;
  const hoje = chaveDia();
  const dia = typeof sp.data === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.data) ? sp.data : hoje;
  const filtroProf = ehOwner && typeof sp.prof === "string" ? sp.prof : "";
  // mês (estilo Google Agenda) é a visão padrão; "dia" é a lista detalhada
  const vista = sp.vista === "dia" ? "dia" : "mes";

  // grade do mês: começa no domingo antes do dia 1 e fecha semanas inteiras
  const mes = dia.slice(0, 7);
  const primeiro = `${mes}-01`;
  const proximoMes = primeiroDoMes(mes, 1);
  const diasNoMes = Math.round((inicioDoDia(proximoMes).getTime() - inicioDoDia(primeiro).getTime()) / 86_400_000);
  const inicioGrade = somaDias(primeiro, -diaDaSemana(primeiro));
  const totalGrade = Math.ceil((diaDaSemana(primeiro) + diasNoMes) / 7) * 7;
  const diasGrade = Array.from({ length: totalGrade }, (_, i) => somaDias(inicioGrade, i));

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
  let consultaMes = supabase
    .from("agendamentos")
    .select("id, periodo, status, cliente:clientes(nome)")
    .neq("status", "cancelado")
    .filter("periodo", "ov", faixa(inicioDoDia(inicioGrade), inicioDoDia(somaDias(inicioGrade, totalGrade))))
    .order("periodo");
  if (filtroProf) {
    consultaMes = consultaMes.eq("profissional_id", filtroProf);
    consultaSemana = consultaSemana.eq("profissional_id", filtroProf);
    consultaPendentes = consultaPendentes.eq("profissional_id", filtroProf);
  }

  const [{ data: semana }, { data: pendentes }, { data: equipe }, { data: doMes }] = await Promise.all([
    consultaSemana,
    consultaPendentes,
    ehOwner
      ? supabase.from("profissionais").select("id, nome").eq("ativo", true).order("nome")
      : Promise.resolve({ data: [] as { id: string; nome: string }[] }),
    vista === "mes" ? consultaMes : Promise.resolve({ data: [] }),
  ]);

  const eventosMes: EventoMes[] = (
    (doMes ?? []) as unknown as { id: string; periodo: string; status: EventoMes["status"]; cliente: { nome: string } | { nome: string }[] | null }[]
  ).map((a) => {
    const { inicio } = lerPeriodo(a.periodo);
    const cliente = Array.isArray(a.cliente) ? a.cliente[0] : a.cliente;
    return { id: a.id, dia: chaveDia(inicio), hora: hora(inicio), cliente: cliente?.nome ?? "", status: a.status };
  });
  const ativosNoMes = eventosMes.filter((e) => e.dia.startsWith(mes)).length;

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
      clienteFoto: a.cliente?.foto_url ?? null,
      servico: servicosDoAgendamento(a).nomes,
      profissional: a.profissional?.nome ?? "",
      canal: a.canal,
    }));

  const qs = (d: string, v: string = vista) => `/painel?data=${d}${v === "dia" ? "&vista=dia" : ""}${filtroProf ? `&prof=${filtroProf}` : ""}`;
  const qsProf = (p: string) => `/painel?data=${dia}${vista === "dia" ? "&vista=dia" : ""}${p ? `&prof=${p}` : ""}`;
  const listaPendentes = ((pendentes ?? []) as unknown as AgendamentoComDetalhes[]).map((a) => ({ ...a, ...lerPeriodo(a.periodo) }));

  // resumo do dia escolhido, logo abaixo do título: quantos e qual o próximo
  const ativosDoDia = doDia.filter((a) => a.status !== "cancelado");
  const proximoDoDia = dia === hoje ? itensSemana.find((a) => a.status === "confirmado" && chaveDia(a.inicio) === dia && a.inicio > agora) : null;

  return (
    <div className="space-y-5">
      <header className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display text-[11px] font-bold uppercase tracking-[0.2em] text-gold-ink">Lindeza Premium</p>
          <h1 className="mt-1 text-[30px] leading-none font-extrabold tracking-[-0.03em]">Agenda</h1>
          <p className="mt-1.5 text-[13px] text-ink-muted">
            {vista === "mes"
              ? ativosNoMes === 0
                ? "Nenhum atendimento neste mês"
                : `${ativosNoMes} atendimento${ativosNoMes > 1 ? "s" : ""} no mês`
              : ativosDoDia.length === 0
              ? "Nenhum atendimento neste dia"
              : `${ativosDoDia.length} atendimento${ativosDoDia.length > 1 ? "s" : ""}`}
            {vista === "dia" && proximoDoDia && <> · próximo às <strong className="font-semibold text-ink">{hora(proximoDoDia.inicio)}</strong></>}
          </p>
        </div>
        <LinkBotao href={`/painel/novo?data=${dia}`} className="shrink-0 px-4">
          + Novo
        </LinkBotao>
      </header>

      <div className="flex rounded-pill border border-line bg-surface p-1 text-[13px] font-semibold">
        {(["mes", "dia"] as const).map((v) => (
          <Link
            key={v}
            href={qs(dia, v)}
            aria-current={vista === v ? "page" : undefined}
            className={`flex-1 rounded-pill py-1.5 text-center ${vista === v ? "bg-accent text-white" : "text-ink-muted hover:text-ink"}`}
          >
            {v === "mes" ? "Mês" : "Dia"}
          </Link>
        ))}
      </div>

      {vista === "mes" ? (
        <div className="flex items-center gap-2">
          <Link href={qs(primeiroDoMes(mes, -1))} aria-label="Mês anterior" className="rounded-input border border-line bg-surface px-3 py-2 text-ink-muted">
            ‹
          </Link>
          <p className="flex-1 text-center text-[17px] font-bold tracking-[-0.02em]">
            {MESES[Number(mes.slice(5)) - 1]} {mes.slice(0, 4)}
          </p>
          <Link href={qs(proximoMes)} aria-label="Próximo mês" className="rounded-input border border-line bg-surface px-3 py-2 text-ink-muted">
            ›
          </Link>
          {!hoje.startsWith(mes) && (
            <Link href={qs(hoje)} className="rounded-input border border-line bg-surface px-3 py-2 text-[13px] text-accent">
              Hoje
            </Link>
          )}
        </div>
      ) : (
        <>
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
        </>
      )}

      {ehOwner && equipe && equipe.length > 1 && (
        <div className="flex flex-wrap gap-2 text-[13px]">
          <Link
            href={qsProf("")}
            className={`rounded-pill px-3 py-1 ${!filtroProf ? "bg-accent text-white" : "bg-surface text-ink-muted"}`}
          >
            Todas
          </Link>
          {equipe.map((p) => (
            <Link
              key={p.id}
              href={qsProf(p.id)}
              className={`rounded-pill px-3 py-1 ${filtroProf === p.id ? "bg-accent text-white" : "bg-surface text-ink-muted"}`}
            >
              {p.nome}
            </Link>
          ))}
        </div>
      )}

      {vista === "mes" ? (
        <CalendarioMes dias={diasGrade} mes={mes} hoje={hoje} eventos={eventosMes} hrefDia={(d) => qs(d, "dia")} />
      ) : (
        <ListaAgenda itens={doDia} mostrarProfissional={ehOwner && !filtroProf} diaTexto={dia === hoje ? "Hoje" : dataCurta(inicioDoDia(dia))} />
      )}

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
                    <span className="block text-[13px] text-ink-muted">{servicosDoAgendamento(a).nomes}</span>
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
