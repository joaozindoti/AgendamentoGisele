import type { Metadata } from "next";
import Link from "next/link";
import { LinkBotao, Selo, Titulo } from "@/components/ui";
import { exigirOwner } from "@/lib/auth";
import { duracao, preco } from "@/lib/formato";
import { CATEGORIAS, type Servico } from "@/lib/tipos";

export const metadata: Metadata = { title: "Serviços" };

export default async function ServicosPainel() {
  const { supabase } = await exigirOwner();
  const { data } = await supabase
    .from("servicos")
    .select("id, nome, descricao, foto_url, preco, duracao_min, ativo, categoria, destaque")
    .order("ativo", { ascending: false })
    .order("nome");
  const servicos = (data ?? []) as Servico[];

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <Titulo className="mb-0" sub="Catálogo que a cliente vê no app e no site">
          Serviços
        </Titulo>
        <LinkBotao href="/painel/servicos/novo">+ Novo</LinkBotao>
      </div>
      <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
        {servicos.map((s) => (
          <li key={s.id}>
            <Link href={`/painel/servicos/${s.id}`} className={`flex items-center justify-between gap-3 px-4 py-3 hover:bg-base ${s.ativo ? "" : "opacity-60"}`}>
              <span className="min-w-0">
                <span className="block truncate text-[15px] font-medium">{s.nome}</span>
                <span className="block text-[13px] text-ink-muted">
                  {CATEGORIAS.find((c) => c.chave === s.categoria)?.rotulo ?? "Sem categoria"} · {duracao(s.duracao_min)}
                  {!s.ativo && " · inativo"}
                </span>
              </span>
              <span className="flex shrink-0 flex-col items-end gap-1">
                <span className="text-[14px] font-semibold text-gold-ink">{preco(s.preco)}</span>
                {s.destaque && <Selo>Premium</Selo>}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
