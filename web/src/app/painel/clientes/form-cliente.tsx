"use client";

import { useActionState } from "react";
import { Botao, Caixa, Campo } from "@/components/ui";
import { exibirTelefone, mascaraTelefone } from "@/lib/telefone";
import type { Cliente } from "@/lib/tipos";
import { salvarCliente } from "../actions";

export function FormCliente({ cliente }: { cliente: Pick<Cliente, "id" | "nome" | "whatsapp" | "endereco" | "data_nascimento"> | null }) {
  const [estado, acao, pendente] = useActionState(salvarCliente.bind(null, cliente?.id ?? null), null);
  return (
    <form action={acao} className="space-y-4">
      <Campo rotulo="Nome" name="nome" defaultValue={cliente?.nome ?? ""} required />
      <Campo
        rotulo="WhatsApp"
        name="whatsapp"
        type="tel"
        inputMode="numeric"
        placeholder="(99) 99999-9999"
        defaultValue={cliente ? exibirTelefone(cliente.whatsapp) : ""}
        onChange={(e) => (e.target.value = mascaraTelefone(e.target.value))}
        dica={cliente ? "Trocar o número muda pra onde vão os lembretes e com qual número ela entra no app." : undefined}
        required
      />
      <Campo rotulo="Endereço" name="endereco" defaultValue={cliente?.endereco ?? ""} />
      <Campo rotulo="Data de nascimento" name="data_nascimento" type="date" defaultValue={cliente?.data_nascimento ?? ""} />
      {estado?.erro && <Caixa tipo="erro">{estado.erro}</Caixa>}
      {estado?.ok && <Caixa tipo="ok">Salvo.</Caixa>}
      <Botao type="submit" disabled={pendente}>
        {pendente ? "Salvando…" : cliente ? "Salvar" : "Cadastrar cliente"}
      </Botao>
    </form>
  );
}
