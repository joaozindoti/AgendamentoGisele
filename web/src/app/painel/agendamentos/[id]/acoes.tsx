"use client";

import { useActionState, useState, useTransition } from "react";
import { SeletorHorario } from "@/components/seletor-horario";
import { AreaTexto, Botao, Caixa, Campo } from "@/components/ui";
import { chaveDia, dataLonga, hora, instanteLocal } from "@/lib/formato";
import type { StatusAgendamento } from "@/lib/tipos";
import { mudarStatus, remarcarPainel, salvarObservacoes } from "../../actions";

export function AcoesPainel({
  agendamentoId,
  status,
  passou,
  profissionalId,
  servicoId,
  diasMaximos,
}: {
  agendamentoId: string;
  status: StatusAgendamento;
  passou: boolean;
  profissionalId: string;
  servicoId: string;
  diasMaximos: number;
}) {
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [confirmarCancelamento, setConfirmarCancelamento] = useState(false);
  const [remarcando, setRemarcando] = useState(false);
  const [modoLivre, setModoLivre] = useState(false);
  const [inicio, setInicio] = useState<string | null>(null);
  const [diaLivre, setDiaLivre] = useState(chaveDia());
  const [horaLivre, setHoraLivre] = useState("");

  function executar(acao: () => Promise<{ ok?: boolean; erro?: string }>, sucesso: string) {
    setErro(null);
    setOk(null);
    iniciar(async () => {
      const r = await acao();
      if (r.erro) setErro(r.erro);
      else {
        setOk(sucesso);
        setConfirmarCancelamento(false);
        setRemarcando(false);
        setInicio(null);
      }
    });
  }

  const inicioEscolhido = modoLivre ? (horaLivre ? instanteLocal(diaLivre, horaLivre).toISOString() : null) : inicio;

  return (
    <div className="space-y-3">
      {erro && <Caixa tipo="erro">{erro}</Caixa>}
      {ok && <Caixa tipo="ok">{ok}</Caixa>}

      {status === "confirmado" && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Botao
              disabled={pendente}
              onClick={() => executar(() => mudarStatus(agendamentoId, "concluido"), "Marcado como atendido.")}
            >
              Atendido
            </Botao>
            <Botao
              variante="secundario"
              disabled={pendente}
              onClick={() => executar(() => mudarStatus(agendamentoId, "no_show"), "Marcado como não compareceu.")}
            >
              Não compareceu
            </Botao>
          </div>
          {!passou && (
            <p className="text-[12px] text-ink-muted">Atendido/não compareceu normalmente se marca depois do horário.</p>
          )}

          {!remarcando && (
            <div className="flex gap-2">
              <Botao variante="secundario" className="flex-1" onClick={() => setRemarcando(true)} disabled={pendente}>
                Remarcar
              </Botao>
              {confirmarCancelamento ? (
                <Botao
                  variante="perigo"
                  disabled={pendente}
                  onClick={() => executar(() => mudarStatus(agendamentoId, "cancelado"), "Agendamento cancelado. A cliente foi avisada.")}
                >
                  Confirmar cancelamento
                </Botao>
              ) : (
                <Botao variante="perigo" onClick={() => setConfirmarCancelamento(true)} disabled={pendente}>
                  Cancelar
                </Botao>
              )}
            </div>
          )}

          {remarcando && (
            <div className="space-y-4 rounded-card border border-line bg-surface p-4">
              <div className="flex items-center justify-between">
                <p className="text-[15px] font-semibold">Novo horário</p>
                <button type="button" className="text-[13px] text-accent" onClick={() => setModoLivre((v) => !v)}>
                  {modoLivre ? "Usar horários da grade" : "Encaixe (horário livre)"}
                </button>
              </div>
              {modoLivre ? (
                <div className="grid grid-cols-2 gap-3">
                  <Campo rotulo="Dia" type="date" value={diaLivre} onChange={(e) => setDiaLivre(e.target.value)} />
                  <Campo rotulo="Hora" type="time" step={300} value={horaLivre} onChange={(e) => setHoraLivre(e.target.value)} />
                  <p className="col-span-2 text-[12px] text-ink-muted">
                    Encaixe ignora a grade e a disponibilidade, mas nunca deixa sobrepor outro atendimento confirmado.
                  </p>
                </div>
              ) : (
                <SeletorHorario
                  profissionalId={profissionalId}
                  servicoId={servicoId}
                  ignorarAgendamentoId={agendamentoId}
                  diasMaximos={diasMaximos}
                  valor={inicio}
                  aoEscolher={setInicio}
                />
              )}
              <div className="flex gap-2">
                <Botao
                  className="flex-1"
                  disabled={!inicioEscolhido || pendente}
                  onClick={() =>
                    inicioEscolhido &&
                    executar(() => remarcarPainel(agendamentoId, inicioEscolhido), "Remarcado. A cliente foi avisada.")
                  }
                >
                  {inicioEscolhido
                    ? `Remarcar para ${dataLonga(new Date(inicioEscolhido))} · ${hora(new Date(inicioEscolhido))}`
                    : "Escolha o horário"}
                </Botao>
                <Botao variante="fantasma" onClick={() => setRemarcando(false)}>
                  Fechar
                </Botao>
              </div>
            </div>
          )}
        </>
      )}

      {status !== "confirmado" && (
        <Botao
          variante="secundario"
          disabled={pendente}
          onClick={() => executar(() => mudarStatus(agendamentoId, "confirmado"), "Voltou para confirmado.")}
        >
          {status === "cancelado" ? "Reativar agendamento" : "Desfazer (voltar para confirmado)"}
        </Botao>
      )}
    </div>
  );
}

export function FormObservacoes({ agendamentoId, observacoes }: { agendamentoId: string; observacoes: string | null }) {
  const [estado, acao, pendente] = useActionState(salvarObservacoes.bind(null, agendamentoId), null);
  return (
    <form action={acao} className="space-y-2">
      <AreaTexto rotulo="Observações" name="observacoes" defaultValue={observacoes ?? ""} maxLength={1000} />
      {estado?.erro && <Caixa tipo="erro">{estado.erro}</Caixa>}
      {estado?.ok && <Caixa tipo="ok">Observações salvas.</Caixa>}
      <Botao type="submit" variante="secundario" disabled={pendente}>
        {pendente ? "Salvando…" : "Salvar observações"}
      </Botao>
    </form>
  );
}
