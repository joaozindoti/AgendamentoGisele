"use client";

import { useActionState } from "react";
import { Botao, Caixa, Campo } from "@/components/ui";
import { CHAVES_CONFIG, DESCRICAO_CONFIG } from "@/lib/tipos";
import { salvarConfiguracoes } from "../actions";

export function FormConfiguracoes({ valores }: { valores: Record<(typeof CHAVES_CONFIG)[number], number> }) {
  const [estado, acao, pendente] = useActionState(salvarConfiguracoes, null);
  return (
    <form action={acao} className="space-y-5">
      {CHAVES_CONFIG.map((chave) => (
        <Campo
          key={chave}
          rotulo={DESCRICAO_CONFIG[chave].rotulo}
          dica={DESCRICAO_CONFIG[chave].dica}
          name={chave}
          type="number"
          inputMode="numeric"
          min={0}
          max={365}
          defaultValue={valores[chave]}
          required
        />
      ))}
      {estado?.erro && <Caixa tipo="erro">{estado.erro}</Caixa>}
      {estado?.ok && <Caixa tipo="ok">Configurações salvas. Já valem pro app.</Caixa>}
      <Botao type="submit" disabled={pendente}>
        {pendente ? "Salvando…" : "Salvar"}
      </Botao>
    </form>
  );
}
