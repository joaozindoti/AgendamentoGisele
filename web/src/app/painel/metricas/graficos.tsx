"use client";

import { useState } from "react";
import { dataCurta, inicioDoDia, somaDias } from "@/lib/formato";

// Uma série só (agendamentos por dia): cor única = accent, sem legenda (o
// título nomeia a série). Barras finas com ponta arredondada, base reta,
// 2px de respiro entre elas, tooltip no hover/toque e tabela como
// alternativa acessível.
export function ColunasPorDia({ de, ate, dados }: { de: string; ate: string; dados: { dia: string; total: number }[] }) {
  const [foco, setFoco] = useState<number | null>(null);
  const mapa = new Map(dados.map((d) => [d.dia, d.total]));
  const dias: { dia: string; total: number }[] = [];
  for (let d = de; d <= ate && dias.length < 120; d = somaDias(d, 1)) dias.push({ dia: d, total: mapa.get(d) ?? 0 });
  const max = Math.max(1, ...dias.map((d) => d.total));
  const altura = 140;

  return (
    <figure className="rounded-card border border-line bg-surface p-4">
      <figcaption className="mb-3 text-[15px] font-semibold">Agendamentos por dia</figcaption>
      <div className="relative" style={{ height: altura + 24 }}>
        {/* grade recessiva: só o topo e a base */}
        <div className="absolute inset-x-0 top-0 border-t border-dashed border-line" />
        <span className="absolute -top-2 right-0 bg-surface pl-1 text-[11px] text-ink-muted tabular-nums">{max}</span>
        <div className="absolute inset-x-0 border-t border-line" style={{ top: altura }} />
        <div className="absolute inset-x-0 top-0 flex items-end gap-[2px]" style={{ height: altura }} role="img" aria-label="Agendamentos por dia no período">
          {dias.map((d, i) => (
            <button
              key={d.dia}
              type="button"
              className="relative flex h-full flex-1 items-end justify-center focus:outline-none"
              onMouseEnter={() => setFoco(i)}
              onMouseLeave={() => setFoco(null)}
              onFocus={() => setFoco(i)}
              onBlur={() => setFoco(null)}
              onClick={() => setFoco(foco === i ? null : i)}
              aria-label={`${dataCurta(inicioDoDia(d.dia))}: ${d.total}`}
            >
              <span
                className={`block w-full max-w-6 rounded-t-[4px] ${foco === i ? "bg-accent-hover" : "bg-accent"}`}
                style={{ height: d.total ? Math.max(3, (d.total / max) * altura) : 0 }}
              />
              {foco === i && (
                <span className="pointer-events-none absolute bottom-full z-10 mb-1 whitespace-nowrap bg-ink px-2 py-1 text-[12px] text-white shadow-[var(--shadow-overlay)]">
                  {dataCurta(inicioDoDia(d.dia))} · {d.total} agendamento{d.total === 1 ? "" : "s"}
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="absolute inset-x-0 flex justify-between text-[11px] text-ink-muted" style={{ top: altura + 6 }}>
          <span>{dataCurta(inicioDoDia(de))}</span>
          <span>{dataCurta(inicioDoDia(ate))}</span>
        </div>
      </div>
      <details className="mt-2 text-[13px]">
        <summary className="cursor-pointer text-ink-muted">Ver em tabela</summary>
        <table className="mt-2 w-full">
          <tbody>
            {dias
              .filter((d) => d.total)
              .map((d) => (
                <tr key={d.dia} className="border-t border-line">
                  <td className="py-1">{dataCurta(inicioDoDia(d.dia))}</td>
                  <td className="py-1 text-right tabular-nums">{d.total}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

// Ranking (serviço/profissional mais agendado): barras horizontais de uma
// série só; o valor fica em texto (ink), fora da barra.
export function Ranking({ titulo, itens }: { titulo: string; itens: { nome: string; total: number }[] }) {
  const max = Math.max(1, ...itens.map((i) => i.total));
  return (
    <figure className="rounded-card border border-line bg-surface p-4">
      <figcaption className="mb-3 text-[15px] font-semibold">{titulo}</figcaption>
      {itens.length === 0 ? (
        <p className="text-[13px] text-ink-muted">Sem dados no período.</p>
      ) : (
        <ul className="space-y-2.5">
          {itens.map((i) => (
            <li key={i.nome} title={`${i.nome}: ${i.total}`}>
              <div className="mb-1 flex justify-between gap-2 text-[13px]">
                <span className="truncate text-ink">{i.nome}</span>
                <span className="shrink-0 tabular-nums text-ink-muted">{i.total}</span>
              </div>
              <div className="h-2.5 w-full">
                <div className="h-full rounded-r-[4px] bg-accent" style={{ width: `${(i.total / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </figure>
  );
}
