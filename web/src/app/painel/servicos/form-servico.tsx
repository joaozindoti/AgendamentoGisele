"use client";

import { useActionState, useState } from "react";
import { AreaTexto, Botao, Caixa, Campo, Selecao } from "@/components/ui";
import { ordenarCategorias, type Servico } from "@/lib/tipos";
import { salvarServico } from "../actions";

export function FormServico({
  servico,
  equipe,
  quemFaz,
  categorias,
}: {
  servico: Servico | null;
  equipe: { id: string; nome: string; ativo: boolean }[];
  quemFaz: string[];
  /** Categorias já usadas no catálogo (inclui as criadas aqui antes). */
  categorias: string[];
}) {
  const [estado, acao, pendente] = useActionState(salvarServico.bind(null, servico?.id ?? null), null);
  // As fixas sempre aparecem, mesmo sem serviço nelas ainda.
  const opcoes = ordenarCategorias([...categorias, "sobrancelha", "epilacao", "facial"]);
  const [categoria, setCategoria] = useState(servico?.categoria ?? "");
  return (
    <form action={acao} className="space-y-4">
      <Campo rotulo="Nome" name="nome" defaultValue={servico?.nome ?? ""} required />
      <AreaTexto rotulo="Descrição" name="descricao" defaultValue={servico?.descricao ?? ""} maxLength={300} />
      <div className="grid grid-cols-2 gap-3">
        <Campo
          rotulo="Preço (R$)"
          name="preco"
          inputMode="decimal"
          defaultValue={servico?.preco ?? ""}
          dica='Vazio = "Consulte o valor"'
        />
        <Campo
          rotulo="Duração (min)"
          name="duracao_min"
          inputMode="numeric"
          defaultValue={servico?.duracao_min ?? ""}
          dica="Inclua a folga pra atraso"
          required
        />
      </div>
      <Selecao rotulo="Categoria" name="categoria" value={categoria} onChange={(e) => setCategoria(e.target.value)}>
        <option value="">Sem categoria</option>
        {opcoes.map((c) => (
          <option key={c.chave} value={c.chave}>
            {c.rotulo}
          </option>
        ))}
        <option value="__nova">+ Nova categoria…</option>
      </Selecao>
      {categoria === "__nova" && (
        <Campo
          rotulo="Nome da nova categoria"
          name="categoria_nova"
          maxLength={40}
          placeholder="Ex.: Cílios"
          dica="Aparece como um grupo novo no agendamento e no site."
          required
          autoFocus
        />
      )}
      <label className="flex items-center gap-3 text-[14px]">
        <input type="checkbox" name="destaque" defaultChecked={servico?.destaque ?? false} className="h-5 w-5 accent-[var(--color-accent)]" />
        Destaque premium (selo dourado e aparece na home)
      </label>
      <label className="flex items-center gap-3 text-[14px]">
        <input type="checkbox" name="ativo" defaultChecked={servico?.ativo ?? true} className="h-5 w-5 accent-[var(--color-accent)]" />
        Ativo (aparece pra cliente)
      </label>

      <fieldset className="space-y-2">
        <legend className="mb-1 text-[13px] font-medium">Quem faz</legend>
        {equipe.map((p) => (
          <label key={p.id} className={`flex items-center gap-3 text-[14px] ${p.ativo ? "" : "opacity-60"}`}>
            <input
              type="checkbox"
              name="profissional"
              value={p.id}
              defaultChecked={servico ? quemFaz.includes(p.id) : true}
              className="h-5 w-5 accent-[var(--color-accent)]"
            />
            {p.nome}
            {!p.ativo && " (inativa)"}
          </label>
        ))}
        <p className="text-[12px] text-ink-muted">Preço/duração diferente por profissional: ajuste na ficha dela em Equipe.</p>
      </fieldset>

      {estado?.erro && <Caixa tipo="erro">{estado.erro}</Caixa>}
      {estado?.ok && <Caixa tipo="ok">Salvo.</Caixa>}
      <Botao type="submit" disabled={pendente}>
        {pendente ? "Salvando…" : servico ? "Salvar" : "Cadastrar serviço"}
      </Botao>
    </form>
  );
}
