"use client";

import { useEffect, useMemo, useState } from "react";
import { chaveDia, dataLonga, diaDaSemana, hora, inicioDoDia, instanteLocal, somaDias } from "@/lib/formato";
import { montarSlots } from "@/lib/grade-horarios";
import { criarClienteNavegador } from "@/lib/supabase/client";
import { Vazio } from "./ui";

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const DIAS_CURTOS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

interface Janela {
  dia_semana: number;
  hora_inicio: string;
  hora_fim: string;
}

// Semana (7 dias) + grade de horários do dia, alimentadas pelo motor de
// agendamento do banco (dias_disponiveis / horarios_disponiveis, seção 5).
// O front nunca decide o que está livre: só é clicável o que o banco
// devolveu. A grade de trabalho da profissional (disponibilidade, leitura
// pública) e o passo da grade servem só de MOLDURA, pra mostrar também os
// horários ocupados/passados como indisponíveis, em vez de uma lista solta.
export function SeletorHorario({
  profissionalId,
  servicoId,
  ignorarAgendamentoId,
  horarioAtual,
  diasMaximos,
  valor,
  aoEscolher,
  versao = 0,
}: {
  profissionalId: string;
  servicoId: string;
  ignorarAgendamentoId?: string;
  /** remarcação: início (ISO) do horário que a cliente já tem — aparece destacado, não escolhível */
  horarioAtual?: string;
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

  const [respMoldura, setRespMoldura] = useState<{ profissionalId: string; janelas: Janela[]; passo: number } | null>(null);
  const moldura = respMoldura?.profissionalId === profissionalId ? respMoldura : null;

  // semana navegada à mão pelas setas; sem isso, mostra a semana do dia escolhido
  const [semanaManual, setSemanaManual] = useState<string | null>(null);
  const segundaDe = (d: string) => somaDias(d, -((diaDaSemana(d) + 6) % 7));
  const semana = semanaManual ?? segundaDe(dia ?? hoje);
  const diasDaSemana = useMemo(() => Array.from({ length: 7 }, (_, i) => somaDias(semana, i)), [semana]);

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

  useEffect(() => {
    let vivo = true;
    const supabase = criarClienteNavegador();
    Promise.all([
      supabase.from("disponibilidade_profissional").select("dia_semana, hora_inicio, hora_fim").eq("profissional_id", profissionalId),
      supabase.from("configuracoes").select("valor").eq("chave", "passo_minutos").maybeSingle(),
    ]).then(([{ data: janelas }, { data: passo }]) => {
      if (vivo) {
        setRespMoldura({ profissionalId, janelas: (janelas ?? []) as Janela[], passo: Math.max(Number(passo?.valor) || 30, 5) });
      }
    });
    return () => {
      vivo = false;
    };
  }, [profissionalId]);

  // Todos os inícios da grade de trabalho do dia (moldura) + os livres que o
  // banco devolveu. Livre = veio do banco; o resto aparece indisponível.
  const slots = useMemo(() => {
    if (!dia || !horarios) return [];
    const inicios: string[] = [];
    for (const j of moldura?.janelas ?? []) {
      if (j.dia_semana !== diaDaSemana(dia)) continue;
      const [hi, mi] = j.hora_inicio.split(":").map(Number);
      const [hf, mf] = j.hora_fim.split(":").map(Number);
      for (let m = hi * 60 + mi; m < hf * 60 + mf; m += moldura!.passo) {
        const hhmm = `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
        inicios.push(instanteLocal(dia, hhmm).toISOString());
      }
    }
    return montarSlots(horarios, inicios, horarioAtual);
  }, [dia, horarios, moldura, horarioAtual]);

  const periodos = useMemo(() => {
    const grupos: { rotulo: string; itens: typeof slots }[] = [
      { rotulo: "Manhã", itens: [] },
      { rotulo: "Tarde", itens: [] },
      { rotulo: "Noite", itens: [] },
    ];
    for (const s of slots) {
      const hh = Number(hora(new Date(s.iso)).slice(0, 2));
      grupos[hh < 12 ? 0 : hh < 18 ? 1 : 2].itens.push(s);
    }
    return grupos.filter((g) => g.itens.length);
  }, [slots]);

  const semanaAnterior = somaDias(semana, -7);
  const semanaSeguinte = somaDias(semana, 7);
  // semana que cruza o mês: "Setembro – Outubro 2026"
  const [anoIni, mesIni] = semana.split("-").map(Number);
  const [anoFim, mesFim] = somaDias(semana, 6).split("-").map(Number);
  const rotuloMes =
    mesIni === mesFim
      ? `${MESES[mesIni - 1]} ${anoIni}`
      : `${MESES[mesIni - 1]}${anoIni !== anoFim ? ` ${anoIni}` : ""} – ${MESES[mesFim - 1]} ${anoFim}`;
  const qtdLivres = slots.filter((s) => s.estado === "livre").length;
  const temAtual = slots.some((s) => s.estado === "atual");

  return (
    <div className="space-y-4">
      {/* ---------- dias da semana ---------- */}
      <div className="rounded-card bg-surface p-3 shadow-soft">
        <div className="mb-3 flex items-center justify-between">
          <button
            type="button"
            aria-label="Semana anterior"
            className="flex h-9 w-9 items-center justify-center rounded-full text-[18px] text-ink-muted hover:bg-base disabled:opacity-25"
            disabled={somaDias(semana, -1) < hoje}
            onClick={() => setSemanaManual(semanaAnterior)}
          >
            ‹
          </button>
          <p className="font-display text-[15px] font-bold tracking-[-0.01em]">{rotuloMes}</p>
          <button
            type="button"
            aria-label="Próxima semana"
            className="flex h-9 w-9 items-center justify-center rounded-full text-[18px] text-ink-muted hover:bg-base disabled:opacity-25"
            disabled={semanaSeguinte > limite}
            onClick={() => setSemanaManual(semanaSeguinte)}
          >
            ›
          </button>
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {diasDaSemana.map((d) => {
            const livre = diasLivres?.has(d) ?? false;
            const escolhido = d === dia;
            return (
              <button
                key={d}
                type="button"
                disabled={!livre}
                onClick={() => {
                  setDiaEscolhido(d);
                  setSemanaManual(null);
                }}
                aria-pressed={escolhido}
                aria-label={`${dataLonga(inicioDoDia(d))}${livre ? "" : ", sem horários"}`}
                className={`flex flex-col items-center rounded-input py-2 transition-colors ${
                  escolhido
                    ? "bg-accent text-white shadow-[0_8px_18px_-10px_rgba(122,46,62,0.7)]"
                    : livre
                    ? "bg-base text-ink hover:bg-blush"
                    : "text-ink-muted/35"
                }`}
              >
                <span className={`font-display text-[10px] font-bold uppercase tracking-[0.08em] ${escolhido ? "text-white/80" : ""}`}>
                  {DIAS_CURTOS[diaDaSemana(d)]}
                </span>
                <span className="font-display text-[18px] leading-tight font-extrabold tracking-[-0.02em]">{Number(d.slice(8))}</span>
                {/* ponto dourado = tem vaga; hoje ganha um traço embaixo */}
                <span
                  aria-hidden
                  className={`mt-0.5 h-1 rounded-full ${d === hoje ? "w-3" : "w-1"} ${
                    escolhido ? "bg-white/80" : livre ? "bg-gold" : "bg-transparent"
                  }`}
                />
              </button>
            );
          })}
        </div>
        {diasLivres === null && <p className="mt-2 text-center text-[12px] text-ink-muted">Carregando agenda…</p>}
      </div>

      {diasLivres && diasLivres.size === 0 && (
        <Vazio>Sem horários livres nos próximos dias para essa combinação. Tente outra profissional ou fale com o studio.</Vazio>
      )}

      {/* ---------- grade de horários do dia ---------- */}
      {dia && (
        <div className="rounded-card bg-surface p-4 shadow-soft">
          <div className="flex items-baseline justify-between gap-3">
            <p className="font-display text-[16px] font-bold tracking-[-0.02em]">{dataLonga(inicioDoDia(dia))}</p>
            {horarios && (
              <p className="shrink-0 text-[12px] font-medium text-ink-muted">
                {qtdLivres} {qtdLivres === 1 ? "livre" : "livres"}
              </p>
            )}
          </div>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink-muted" aria-label="Legenda">
            <li className="flex items-center gap-1.5">
              <span aria-hidden className="h-2.5 w-2.5 rounded-[3px] border border-ink-muted/50 bg-surface" /> Disponível
            </li>
            <li className="flex items-center gap-1.5">
              <span aria-hidden className="h-2.5 w-2.5 rounded-[3px] bg-accent" /> Selecionado
            </li>
            {temAtual && (
              <li className="flex items-center gap-1.5">
                <span aria-hidden className="h-2.5 w-2.5 rounded-[3px] border border-dashed border-accent bg-blush" /> Seu horário atual
              </li>
            )}
            <li className="flex items-center gap-1.5">
              <span aria-hidden className="h-2.5 w-2.5 rounded-[3px] border border-line bg-base" /> Indisponível
            </li>
          </ul>

          {horarios === null ? (
            <p className="mt-4 text-[13px] text-ink-muted">Carregando horários…</p>
          ) : periodos.length === 0 ? (
            <div className="mt-4">
              <Vazio>Nenhum horário livre neste dia.</Vazio>
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              {periodos.map((p) => (
                <div key={p.rotulo}>
                  <p className="mb-2 flex items-center gap-2 font-display text-[11px] font-bold uppercase tracking-[0.16em] text-gold-ink">
                    {p.rotulo}
                    <span aria-hidden className="h-px flex-1 bg-line" />
                  </p>
                  <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                    {p.itens.map((s) => {
                      const escolhido = valor === s.iso;
                      const livre = s.estado === "livre";
                      if (s.estado === "atual") {
                        return (
                          <div
                            key={s.iso}
                            aria-label={`${hora(new Date(s.iso))}, seu horário atual`}
                            className="flex min-h-11 flex-col items-center justify-center rounded-input border border-dashed border-accent bg-blush text-accent"
                          >
                            <span className="text-[14px] leading-none font-semibold tabular-nums">{hora(new Date(s.iso))}</span>
                            <span className="mt-0.5 font-display text-[9px] font-bold uppercase tracking-[0.08em]">Atual</span>
                          </div>
                        );
                      }
                      return (
                        <button
                          key={s.iso}
                          type="button"
                          disabled={!livre}
                          onClick={() => aoEscolher(s.iso)}
                          aria-pressed={escolhido}
                          aria-label={`${hora(new Date(s.iso))}${livre ? "" : ", indisponível"}`}
                          className={`min-h-11 rounded-input text-[14px] font-semibold tabular-nums transition-all ${
                            escolhido
                              ? "bg-accent text-white shadow-[0_8px_18px_-10px_rgba(122,46,62,0.7)]"
                              : livre
                              ? "border border-line bg-surface text-ink hover:border-accent hover:text-accent"
                              : "cursor-not-allowed bg-base text-ink-muted/40 line-through decoration-ink-muted/30"
                          }`}
                        >
                          {hora(new Date(s.iso))}
                        </button>
                      );
                    })}
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
