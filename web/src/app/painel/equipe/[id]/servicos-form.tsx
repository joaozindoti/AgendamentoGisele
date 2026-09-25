"use client";

import { useActionState } from "react";
import { Botao, Caixa } from "@/components/ui";
import { duracao, preco } from "@/lib/formato";
import { salvarServicosDaProfissional } from "../../actions";

export function FormServicosDaProfissional({
  profissionalId,
  servicos,
  vinculos,
}: {
  profissionalId: string;
  servicos: { id: string; nome: string; preco: number | null; duracao_min: number; ativo: boolean }[];
  vinculos: { servico_id: string; preco_override: number | null; duracao_override_min: number | null }[];
}) {
  const [estado, acao, pendente] = useActionState(salvarServicosDaProfissional.bind(null, profissionalId), null);
  const porServico = new Map(vinculos.map((v) => [v.servico_id, v]));

  return (
    <form action={acao} className="space-y-3">
      <div>
        <h2 className="text-[16px] font-semibold">Serviços que ela faz</h2>
        <p className="text-[13px] text-ink-muted">
          Preço e duração em branco = os do serviço. Preencha só se, com ela, for diferente.
        </p>
      </div>
      <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
        {servicos.map((s) => {
          const v = porServico.get(s.id);
          return (
            <li key={s.id} className={`px-4 py-3 ${s.ativo ? "" : "opacity-60"}`}>
              <label className="flex items-center gap-3 text-[15px]">
                <input type="checkbox" name="servico" value={s.id} defaultChecked={Boolean(v)} className="h-5 w-5 accent-[var(--color-accent)]" />
                <span className="flex-1">
                  {s.nome}
                  {!s.ativo && <span className="text-[12px] text-ink-muted"> (inativo)</span>}
                </span>
              </label>
              <div className="mt-2 grid grid-cols-2 gap-2 pl-8">
                <input
                  name={`preco_${s.id}`}
                  inputMode="decimal"
                  placeholder={`Preço: ${preco(s.preco)}`}
                  defaultValue={v?.preco_override ?? ""}
                  className="min-h-10 rounded-input border border-line px-2 text-[14px]"
                  aria-label={`Preço de ${s.nome} com ela`}
                />
                <input
                  name={`duracao_${s.id}`}
                  inputMode="numeric"
                  placeholder={`Duração: ${duracao(s.duracao_min)}`}
                  defaultValue={v?.duracao_override_min ?? ""}
                  className="min-h-10 rounded-input border border-line px-2 text-[14px]"
                  aria-label={`Duração em minutos de ${s.nome} com ela`}
                />
              </div>
            </li>
          );
        })}
      </ul>
      {estado?.erro && <Caixa tipo="erro">{estado.erro}</Caixa>}
      {estado?.ok && <Caixa tipo="ok">Serviços atualizados.</Caixa>}
      <Botao type="submit" variante="secundario" disabled={pendente}>
        {pendente ? "Salvando…" : "Salvar serviços"}
      </Botao>
    </form>
  );
}
