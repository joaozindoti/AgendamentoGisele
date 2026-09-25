"use client";

import { useActionState } from "react";
import { AreaTexto, Botao, Caixa, Campo, Selecao } from "@/components/ui";
import { exibirTelefone, mascaraTelefone } from "@/lib/telefone";
import type { ProfissionalAdmin } from "@/lib/tipos";
import { salvarProfissional } from "../actions";

export function FormProfissional({ profissional }: { profissional: ProfissionalAdmin | null }) {
  const [estado, acao, pendente] = useActionState(salvarProfissional.bind(null, profissional?.id ?? null), null);
  return (
    <form action={acao} className="space-y-4">
      <Campo rotulo="Nome" name="nome" defaultValue={profissional?.nome ?? ""} required />
      <Campo
        rotulo="Celular (WhatsApp) pra entrar no painel"
        name="telefone"
        type="tel"
        inputMode="numeric"
        placeholder="(99) 99999-9999"
        defaultValue={profissional?.telefone ? exibirTelefone(profissional.telefone) : ""}
        onChange={(e) => (e.target.value = mascaraTelefone(e.target.value))}
        dica="É com esse número que ela recebe o código de acesso e os avisos de agendamento."
      />
      <AreaTexto rotulo="Bio (aparece pra cliente na hora de escolher)" name="bio" defaultValue={profissional?.bio ?? ""} maxLength={300} />
      <Selecao rotulo="Acesso" name="papel" defaultValue={profissional?.papel ?? "staff"}>
        <option value="staff">Profissional — vê só a própria agenda e as próprias clientes</option>
        <option value="owner">Dona — acesso total (equipe, serviços, métricas)</option>
      </Selecao>
      <label className="flex items-center gap-3 text-[14px]">
        <input type="checkbox" name="ativo" defaultChecked={profissional?.ativo ?? true} className="h-5 w-5 accent-[var(--color-accent)]" />
        Ativa (aparece pra cliente e consegue entrar no painel)
      </label>
      {estado?.erro && <Caixa tipo="erro">{estado.erro}</Caixa>}
      {estado?.ok && <Caixa tipo="ok">Salvo.</Caixa>}
      <Botao type="submit" disabled={pendente}>
        {pendente ? "Salvando…" : profissional ? "Salvar" : "Cadastrar"}
      </Botao>
    </form>
  );
}
