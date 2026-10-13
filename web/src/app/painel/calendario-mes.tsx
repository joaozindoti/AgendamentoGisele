import Link from "next/link";
import type { StatusAgendamento } from "@/lib/tipos";

export interface EventoMes {
  id: string;
  dia: string;
  hora: string;
  cliente: string;
  status: StatusAgendamento;
}

const SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

// Mês inteiro no estilo do Google Agenda: a Gisele se organiza olhando os
// próximos dias de uma vez. Toque no número abre o dia; no evento, o agendamento.
export function CalendarioMes({
  dias,
  mes,
  hoje,
  eventos,
  hrefDia,
}: {
  /** chaves "YYYY-MM-DD" da grade, começando no domingo, múltiplo de 7 */
  dias: string[];
  /** "YYYY-MM" do mês exibido (os outros dias ficam acinzentados) */
  mes: string;
  hoje: string;
  eventos: EventoMes[];
  hrefDia: (dia: string) => string;
}) {
  const porDia = new Map<string, EventoMes[]>();
  for (const e of eventos) {
    const lista = porDia.get(e.dia) ?? [];
    lista.push(e);
    porDia.set(e.dia, lista);
  }

  return (
    <div className="overflow-hidden rounded-card border border-line bg-surface shadow-soft">
      <div className="grid grid-cols-7 bg-ink text-white">
        {SEMANA.map((d) => (
          <span key={d} className="py-2 text-center font-display text-[11px] font-bold uppercase tracking-[0.08em]">
            {d}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {dias.map((d, i) => {
          const doMes = d.startsWith(mes);
          const ehHoje = d === hoje;
          const passado = d < hoje;
          const lista = porDia.get(d) ?? [];
          return (
            <div
              key={d}
              className={`flex min-h-[86px] min-w-0 flex-col gap-0.5 border-line p-1 sm:min-h-[112px] sm:p-1.5 ${
                i % 7 ? "border-l" : ""
              } ${i >= 7 ? "border-t" : ""} ${doMes ? "" : "bg-base"}`}
            >
              <Link
                href={hrefDia(d)}
                aria-label={`Abrir o dia ${Number(d.slice(8))}`}
                aria-current={ehHoje ? "date" : undefined}
                className={`flex h-6 w-6 items-center justify-center self-start rounded-full text-[12px] font-semibold tabular-nums sm:h-7 sm:w-7 sm:text-[13px] ${
                  ehHoje ? "bg-accent text-white" : doMes ? (passado ? "text-ink-muted" : "text-ink") : "text-ink-muted/50"
                } hover:ring-1 hover:ring-accent`}
              >
                {Number(d.slice(8))}
              </Link>
              {lista.slice(0, 3).map((e, j) => (
                <Link
                  key={e.id}
                  href={`/painel/agendamentos/${e.id}`}
                  title={`${e.hora} ${e.cliente}`}
                  className={`truncate rounded-[4px] px-0.5 py-px text-[10px] sm:px-1 leading-[14px] sm:text-[11px] sm:leading-4 ${
                    j === 2 ? "hidden sm:block" : "block"
                  } ${
                    e.status === "concluido"
                      ? "bg-ok/15 text-ok"
                      : e.status === "no_show"
                      ? "bg-line text-ink-muted line-through"
                      : passado
                      ? "bg-blush/60 text-accent/70"
                      : "bg-accent text-white"
                  }`}
                >
                  {/* no celular a célula é estreita: só o primeiro nome, como o Google Agenda */}
                  <span className="hidden font-semibold tabular-nums sm:inline">{e.hora} </span>
                  {e.cliente.split(" ")[0]}
                </Link>
              ))}
              {lista.length > 2 && (
                <Link
                  href={hrefDia(d)}
                  className={`px-1 text-[10px] font-semibold text-ink-muted hover:text-accent sm:text-[11px] ${lista.length === 3 ? "sm:hidden" : ""}`}
                >
                  <span className="sm:hidden">+{lista.length - 2}</span>
                  <span className="hidden sm:inline">+{lista.length - 3} mais</span>
                </Link>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
