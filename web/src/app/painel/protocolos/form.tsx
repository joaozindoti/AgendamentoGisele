"use client";

import { useActionState } from "react";
import { AreaTexto, Botao, Caixa } from "@/components/ui";
import { salvarProtocolo } from "../actions";

export function FormProtocolo({
  servicoId,
  servicoNome,
  protocolo,
  protocoloPre,
}: {
  servicoId: string;
  servicoNome: string;
  protocolo: string | null;
  protocoloPre: string | null;
}) {
  const [estado, acao, pendente] = useActionState(salvarProtocolo.bind(null, servicoId), null);
  return (
    <form action={acao} className="space-y-3">
      <h2 className="text-[15px] font-semibold">{servicoNome}</h2>
      <AreaTexto
        rotulo="Antes do atendimento"
        name="protocolo_pre"
        rows={4}
        maxLength={2000}
        defaultValue={protocoloPre ?? ""}
        placeholder="Ex: Venha sem maquiagem na região. Evite tirar os pelos nos 15 dias antes."
      />
      <AreaTexto
        rotulo="Depois do atendimento"
        name="protocolo"
        rows={5}
        maxLength={2000}
        defaultValue={protocolo ?? ""}
        placeholder="Ex: Não molhe a região por 24h. Evite maquiagem e sol no local por 48h."
      />
      {estado?.erro && <Caixa tipo="erro">{estado.erro}</Caixa>}
      {estado?.ok && <Caixa tipo="ok">Protocolos salvos.</Caixa>}
      <Botao type="submit" variante="secundario" disabled={pendente}>
        {pendente ? "Salvando…" : "Salvar"}
      </Botao>
    </form>
  );
}
