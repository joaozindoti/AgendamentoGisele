"use client";

import { useActionState } from "react";
import { AreaTexto, Botao, Caixa, Campo } from "@/components/ui";
import { salvarMeuPerfil } from "../actions";

export function FormMeuPerfil({ nome, bio }: { nome: string; bio: string | null }) {
  const [estado, acao, pendente] = useActionState(salvarMeuPerfil, null);
  return (
    <form action={acao} className="space-y-4">
      <Campo rotulo="Nome" name="nome" defaultValue={nome} required />
      <AreaTexto rotulo="Bio (aparece pra cliente)" name="bio" defaultValue={bio ?? ""} maxLength={300} />
      {estado?.erro && <Caixa tipo="erro">{estado.erro}</Caixa>}
      {estado?.ok && <Caixa tipo="ok">Perfil salvo.</Caixa>}
      <Botao type="submit" variante="secundario" disabled={pendente}>
        {pendente ? "Salvando…" : "Salvar perfil"}
      </Botao>
    </form>
  );
}
