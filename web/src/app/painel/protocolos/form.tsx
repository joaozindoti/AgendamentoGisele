"use client";

import { useActionState } from "react";
import { AreaTexto, Botao, Caixa } from "@/components/ui";
import { salvarProtocolo } from "../actions";

export function FormProtocolo({ servicoId, servicoNome, protocolo }: { servicoId: string; servicoNome: string; protocolo: string | null }) {
  const [estado, acao, pendente] = useActionState(salvarProtocolo.bind(null, servicoId), null);
  return (
    <form action={acao} className="space-y-3">
      <AreaTexto
        rotulo={servicoNome}
        name="protocolo"
        rows={5}
        maxLength={2000}
        defaultValue={protocolo ?? ""}
        placeholder="Ex: Não molhe a região por 24h. Evite maquiagem e sol no local por 48h."
      />
      {estado?.erro && <Caixa tipo="erro">{estado.erro}</Caixa>}
      {estado?.ok && <Caixa tipo="ok">Protocolo salvo.</Caixa>}
      <Botao type="submit" variante="secundario" disabled={pendente}>
        {pendente ? "Salvando…" : "Salvar"}
      </Botao>
    </form>
  );
}
