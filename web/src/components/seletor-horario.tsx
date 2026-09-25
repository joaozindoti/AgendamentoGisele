"use client";

import { useEffect, useMemo, useState } from "react";
import { chaveDia, diaDaSemana, hora, inicioDoDia, somaDias } from "@/lib/formato";
import { criarClienteNavegador } from "@/lib/supabase/client";
import { Vazio } from "./ui";

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const DIAS_CURTOS = ["D", "S", "T", "Q", "Q", "S", "S"];

// Calendário + grade de horários, alimentados pelo motor de agendamento do
// banco (dias_disponiveis / horarios_disponiveis, seção 5). O front nunca
// calcula disponibilidade por conta própria — era exatamente essa duplicação
// (site x n8n) que fazia o site oferecer horário que o backend recusava.
export function SeletorHorario({
  profissionalId,
  servicoId,
  ignorarAgendamentoId,
  diasMaximos,
  valor,
  aoEscolher,
  versao = 0,
}: {
  profissionalId: string;
  servicoId: string;
  ignorarAgendamentoId?: string;
  diasMaximos: number;
  valor: string | null;
  aoEscolher: (inicioIso: string) => void;
  /** incrementar força recarregar (ex: depois de "horário acabou de ser ocupado") */
  versao?: number;
}) {
  const hoje = chaveDia();
  const limite = somaDias(hoje, Math.min(diasMaximos, 62));

  // Cada resposta do banco fica guardada junto com a "chave" da consulta que
  // a gerou; se a chave atual é outra (trocou profissional, dia, versão), a
  // resposta antiga simplesmente não vale — sem precisar zerar estado dentro
  // de effect.
  const chaveDias = [profissionalId, servicoId, ignorarAgendamentoId ?? "", hoje, limite, versao].join("|");
  const [respDias, setRespDias] = useState<{ chave: string; livres: Set<string> } | null>(null);
  const diasLivres = respDias?.chave === chaveDias ? respDias.livres : null;

  const [diaEscolhido, setDiaEscolhido] = useState<string | null>(valor ? chaveDia(new Date(valor)) : null);
  const dia = !diasLivres
    ? null
    : diaEscolhido && diasLivres.has(diaEscolhido)
    ? diaEscolhido
    : ([...diasLivres].sort()[0] ?? null);

  const chaveHorarios = dia ? [dia, profissionalId, servicoId, ignorarAgendamentoId ?? "", versao].join("|") : null;
  const [respHorarios, setRespHorarios] = useState<{ chave: string; lista: string[] } | null>(null);
  const horarios = chaveHorarios && respHorarios?.chave === chaveHorarios ? respHorarios.lista : null;

  // mês navegado à mão pelas setas; sem isso, o calendário mostra o mês do
  // dia escolhido (ex: primeiro dia livre é no mês que vem)
  const [mesManual, setMesManual] = useState<string | null>(null);
  const mes = mesManual ?? (dia ?? hoje).slice(0, 7);

  useEffect(() => {
    let vivo = true;
    criarClienteNavegador()
      .rpc("dias_disponiveis", {
        p_profissional_id: profissionalId,
        p_servico_id: servicoId,
        p_de: hoje,
        p_ate: limite,
        p_ignorar_agendamento_id: ignorarAgendamentoId ?? null,
      })
      .then(({ data }) => {
        if (vivo) setRespDias({ chave: chaveDias, livres: new Set(((data ?? []) as string[]).map((d) => d.slice(0, 10))) });
      });
    return () => {
      vivo = false;
    };
  }, [chaveDias, profissionalId, servicoId, ignorarAgendamentoId, hoje, limite]);

  useEffect(() => {
    if (!dia || !chaveHorarios) return;
    let vivo = true;
    criarClienteNavegador()
      .rpc("horarios_disponiveis", {
        p_profissional_id: profissionalId,
        p_servico_id: servicoId,
        p_data: dia,
        p_ignorar_agendamento_id: ignorarAgendamentoId ?? null,
      })
      .then(({ data }) => {
        if (vivo) setRespHorarios({ chave: chaveHorarios, lista: ((data ?? []) as string[]).map((h) => new Date(h).toISOString()) });
      });
    return () => {
      vivo = false;
    };
  }, [chaveHorarios, dia, profissionalId, servicoId, ignorarAgendamentoId]);

  const setDia = (d: string) => {
    setDiaEscolhido(d);
    setMesManual(null);
  };
  const setMes = setMesManual;

  const celulas = useMemo(() => {
    const primeiro = `${mes}-01`;
    const vazios = diaDaSemana(primeiro);
    const lista: (string | null)[] = Array(vazios).fill(null);
    for (let d = primeiro; d.startsWith(mes); d = somaDias(d, 1)) lista.push(d);
    return lista;
  }, [mes]);

  const [ano, mesNum] = mes.split("-").map(Number);
  const mesAnterior = `${mesNum === 1 ? ano - 1 : ano}-${String(mesNum === 1 ? 12 : mesNum - 1).padStart(2, "0")}`;
  const mesSeguinte = `${mesNum === 12 ? ano + 1 : ano}-${String(mesNum === 12 ? 1 : mesNum + 1).padStart(2, "0")}`;

  const periodos = useMemo(() => {
    const grupos: { rotulo: string; itens: string[] }[] = [
      { rotulo: "Manhã", itens: [] },
      { rotulo: "Tarde", itens: [] },
      { rotulo: "Noite", itens: [] },
    ];
    for (const h of horarios ?? []) {
      const hh = Number(hora(new Date(h)).slice(0, 2));
      grupos[hh < 12 ? 0 : hh < 18 ? 1 : 2].itens.push(h);
    }
    return grupos.filter((g) => g.itens.length);
  }, [horarios]);

  return (
    <div className="space-y-5">
      <div className="rounded-card border border-line bg-surface p-3">
        <div className="mb-2 flex items-center justify-between">
          <button
            type="button"
            aria-label="Mês anterior"
            className="px-3 py-1 text-[18px] text-ink-muted disabled:opacity-30"
            disabled={mesAnterior < hoje.slice(0, 7)}
            onClick={() => setMes(mesAnterior)}
          >
            ‹
          </button>
          <p className="text-[15px] font-semibold">
            {MESES[mesNum - 1]} {ano}
          </p>
          <button
            type="button"
            aria-label="Próximo mês"
            className="px-3 py-1 text-[18px] text-ink-muted disabled:opacity-30"
            disabled={mesSeguinte > limite.slice(0, 7)}
            onClick={() => setMes(mesSeguinte)}
          >
            ›
          </button>
        </div>
        <div className="grid grid-cols-7 text-center text-[11px] font-medium text-ink-muted">
          {DIAS_CURTOS.map((d, i) => (
            <span key={i} className="py-1">
              {d}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-y-1 text-center">
          {celulas.map((c, i) => {
            if (!c) return <span key={`v${i}`} />;
            const livre = diasLivres?.has(c) ?? false;
            const escolhido = c === dia;
            return (
              <button
                key={c}
                type="button"
                disabled={!livre}
                onClick={() => setDia(c)}
                aria-pressed={escolhido}
                aria-label={inicioDoDia(c).toLocaleDateString("pt-BR", { day: "numeric", month: "long" })}
                className={`mx-auto flex h-10 w-10 items-center justify-center rounded-full text-[14px] transition-colors ${
                  escolhido
                    ? "bg-accent text-white"
                    : livre
                    ? "text-ink hover:bg-base"
                    : "text-ink-muted/35"
                } ${c === hoje && !escolhido ? "ring-1 ring-accent/40" : ""}`}
              >
                {Number(c.slice(8))}
              </button>
            );
          })}
        </div>
        {diasLivres === null && <p className="mt-2 text-center text-[12px] text-ink-muted">Carregando agenda…</p>}
      </div>

      {diasLivres && diasLivres.size === 0 && (
        <Vazio>Sem horários livres nos próximos dias para essa combinação. Tente outra profissional ou fale com o studio.</Vazio>
      )}

      {dia && (
        <div>
          <p className="mb-2 text-[14px] font-medium text-ink">Horários disponíveis</p>
          {horarios === null ? (
            <p className="text-[13px] text-ink-muted">Carregando horários…</p>
          ) : periodos.length === 0 ? (
            <Vazio>Nenhum horário livre neste dia.</Vazio>
          ) : (
            <div className="space-y-3">
              {periodos.map((p) => (
                <div key={p.rotulo}>
                  <p className="mb-1.5 text-[12px] uppercase tracking-wider text-ink-muted">{p.rotulo}</p>
                  <div className="grid grid-cols-4 gap-2">
                    {p.itens.map((h) => (
                      <button
                        key={h}
                        type="button"
                        onClick={() => aoEscolher(h)}
                        aria-pressed={valor === h}
                        className={`min-h-11 rounded-input border text-[14px] font-medium transition-colors ${
                          valor === h ? "border-accent bg-accent text-white" : "border-line bg-surface text-ink hover:border-accent"
                        }`}
                      >
                        {hora(new Date(h))}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
