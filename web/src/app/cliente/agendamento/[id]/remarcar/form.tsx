"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { SeletorHorario } from "@/components/seletor-horario";
import { Botao, Caixa } from "@/components/ui";
import { mensagemDeErro } from "@/lib/erros";
import { dataLonga, hora } from "@/lib/formato";
import { criarClienteNavegador } from "@/lib/supabase/client";

export function FormRemarcar({
  agendamentoId,
  profissionalId,
  servicoId,
  diasMaximos,
}: {
  agendamentoId: string;
  profissionalId: string;
  servicoId: string;
  diasMaximos: number;
}) {
  const router = useRouter();
  const [inicio, setInicio] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [versao, setVersao] = useState(0);

  async function confirmar() {
    if (!inicio) return;
    setEnviando(true);
    setErro(null);
    const { error } = await criarClienteNavegador().rpc("remarcar", {
      p_agendamento_id: agendamentoId,
      p_novo_inicio: inicio,
    });
    if (error) {
      setEnviando(false);
      setErro(mensagemDeErro(error));
      setInicio(null);
      setVersao((v) => v + 1);
      return;
    }
    router.push("/cliente?aviso=remarcado");
    router.refresh();
  }

  return (
    <div className="space-y-5">
      <SeletorHorario
        profissionalId={profissionalId}
        servicoId={servicoId}
        ignorarAgendamentoId={agendamentoId}
        diasMaximos={diasMaximos}
        valor={inicio}
        aoEscolher={setInicio}
        versao={versao}
      />
      {erro && <Caixa tipo="erro">{erro}</Caixa>}
      <Botao largo onClick={confirmar} disabled={!inicio || enviando}>
        {enviando
          ? "Remarcando…"
          : inicio
          ? `Remarcar para ${dataLonga(new Date(inicio))} · ${hora(new Date(inicio))}`
          : "Escolha o novo horário"}
      </Botao>
    </div>
  );
}
