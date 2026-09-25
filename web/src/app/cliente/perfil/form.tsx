"use client";

import { useActionState } from "react";
import { Botao, Caixa, Campo } from "@/components/ui";
import { chaveDia } from "@/lib/formato";
import { TEXTO_CONSENTIMENTO, type Cliente } from "@/lib/tipos";
import { salvarPerfil } from "./actions";

export function FormPerfil({
  cliente,
}: {
  cliente: Pick<Cliente, "nome" | "endereco" | "data_nascimento" | "consentimento">;
}) {
  const [estado, acao, pendente] = useActionState(salvarPerfil, null);

  return (
    <form action={acao} className="space-y-4">
      <Campo
        rotulo="Nome completo"
        name="nome"
        autoComplete="name"
        defaultValue={cliente.nome === "Cliente" ? "" : cliente.nome}
        required
        minLength={2}
        maxLength={100}
      />
      <Campo rotulo="Endereço" name="endereco" autoComplete="street-address" defaultValue={cliente.endereco ?? ""} />
      <Campo
        rotulo="Data de nascimento"
        name="data_nascimento"
        type="date"
        min="1900-01-01"
        max={chaveDia()}
        defaultValue={cliente.data_nascimento ?? ""}
        dica="No mês do seu aniversário tem presente."
      />
      <label className="flex items-start gap-3 text-[14px]">
        <input
          type="checkbox"
          name="consentimento"
          defaultChecked={cliente.consentimento}
          className="mt-0.5 h-5 w-5 accent-[var(--color-accent)]"
        />
        <span>{TEXTO_CONSENTIMENTO}</span>
      </label>
      {estado?.erro && <Caixa tipo="erro">{estado.erro}</Caixa>}
      {estado?.ok && <Caixa tipo="ok">Perfil atualizado.</Caixa>}
      <Botao type="submit" largo disabled={pendente}>
        {pendente ? "Salvando…" : "Salvar"}
      </Botao>
    </form>
  );
}
