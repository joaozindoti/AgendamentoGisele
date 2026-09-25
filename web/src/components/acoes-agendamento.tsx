"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { mensagemDeErro } from "@/lib/erros";
import { criarClienteNavegador } from "@/lib/supabase/client";
import { linkWhatsApp } from "@/lib/telefone";
import { Botao, Caixa, LinkBotao } from "./ui";

// Remarcar/cancelar do card da cliente. A janela mínima é decidida no
// servidor (podeAlterar) só pra esconder o botão; quem garante a regra de
// verdade é a policy de update + trigger no banco.
export function AcoesAgendamentoCliente({
  agendamentoId,
  podeAlterar,
  horasMinimas,
  whatsappStudio,
}: {
  agendamentoId: string;
  podeAlterar: boolean;
  horasMinimas: number;
  whatsappStudio: string;
}) {
  const router = useRouter();
  const [confirmando, setConfirmando] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  if (!podeAlterar) {
    return (
      <div className="mt-4 border-t border-line pt-4">
        <p className="text-[13px] text-ink-muted">
          Remarcação e cancelamento pelo app vão até {horasMinimas}h antes do horário. Precisa mudar algo?
        </p>
        <LinkBotao href={linkWhatsApp(whatsappStudio)} target="_blank" rel="noopener" variante="secundario" className="mt-3">
          Falar com o studio
        </LinkBotao>
      </div>
    );
  }

  async function cancelar() {
    setCarregando(true);
    setErro(null);
    const { error } = await criarClienteNavegador().rpc("cancelar", { p_agendamento_id: agendamentoId });
    setCarregando(false);
    if (error) {
      setErro(mensagemDeErro(error));
      return;
    }
    setConfirmando(false);
    router.refresh();
  }

  return (
    <div className="mt-4 border-t border-line pt-4">
      {confirmando ? (
        <div className="space-y-3">
          <p className="text-[14px] text-ink">Cancelar este agendamento? O horário fica livre pra outra cliente.</p>
          <div className="flex gap-2">
            <Botao variante="perigo" onClick={cancelar} disabled={carregando}>
              {carregando ? "Cancelando…" : "Sim, cancelar"}
            </Botao>
            <Botao variante="fantasma" onClick={() => setConfirmando(false)} disabled={carregando}>
              Manter
            </Botao>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <LinkBotao href={`/cliente/agendamento/${agendamentoId}/remarcar`} variante="secundario" className="flex-1">
            Remarcar
          </LinkBotao>
          <Botao variante="fantasma" onClick={() => setConfirmando(true)}>
            Cancelar
          </Botao>
        </div>
      )}
      {erro && (
        <div className="mt-3">
          <Caixa tipo="erro">{erro}</Caixa>
        </div>
      )}
    </div>
  );
}
