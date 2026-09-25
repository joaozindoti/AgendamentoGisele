"use client";

import Link from "next/link";
import { useState } from "react";
import { PontoStatus, Vazio } from "@/components/ui";
import { ROTULO_STATUS, type StatusAgendamento } from "@/lib/tipos";

export interface ItemAgenda {
  id: string;
  hora: string;
  fim: string;
  status: StatusAgendamento;
  cliente: string;
  servico: string;
  profissional: string;
  canal: string;
}

export function ListaAgenda({
  itens,
  mostrarProfissional,
  diaTexto,
}: {
  itens: ItemAgenda[];
  mostrarProfissional: boolean;
  diaTexto: string;
}) {
  const [busca, setBusca] = useState("");
  const [mostrarCancelados, setMostrarCancelados] = useState(false);

  const termo = busca.trim().toLowerCase();
  const visiveis = itens.filter(
    (a) => (mostrarCancelados || a.status !== "cancelado") && (!termo || a.cliente.toLowerCase().includes(termo)),
  );
  const cancelados = itens.filter((a) => a.status === "cancelado").length;

  return (
    <section className="space-y-3">
      <input
        type="search"
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        placeholder="Filtrar na agenda por cliente…"
        className="min-h-11 w-full rounded-input border border-line bg-surface px-3 text-[16px] placeholder:text-ink-muted/60 focus:border-accent focus:outline-none"
      />
      <div className="flex items-center justify-between">
        <h2 className="text-[15px] font-semibold">{diaTexto}</h2>
        {cancelados > 0 && (
          <button type="button" onClick={() => setMostrarCancelados((v) => !v)} className="text-[13px] text-ink-muted hover:text-accent">
            {mostrarCancelados ? "Ocultar" : "Mostrar"} cancelados ({cancelados})
          </button>
        )}
      </div>
      {visiveis.length === 0 ? (
        <Vazio>{termo ? "Nenhuma cliente com esse nome neste dia." : "Nenhum atendimento neste dia."}</Vazio>
      ) : (
        <ul className="space-y-2">
          {visiveis.map((a) => (
            <li key={a.id}>
              <Link
                href={`/painel/agendamentos/${a.id}`}
                className={`flex gap-3 rounded-input border-l-[3px] bg-surface px-4 py-3 hover:bg-base ${
                  a.status === "concluido" ? "border-ok" : a.status === "confirmado" ? "border-accent" : "border-line"
                }`}
              >
                <span className="w-12 shrink-0 text-[14px] font-semibold tabular-nums">
                  {a.hora}
                  <span className="block text-[11px] font-normal text-ink-muted">{a.fim}</span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-medium">{a.cliente}</span>
                  <span className="block truncate text-[13px] text-ink-muted">
                    {a.servico}
                    {mostrarProfissional && ` · ${a.profissional}`}
                  </span>
                </span>
                <PontoStatus status={a.status} rotulo={ROTULO_STATUS[a.status]} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
