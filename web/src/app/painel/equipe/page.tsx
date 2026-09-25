import type { Metadata } from "next";
import Link from "next/link";
import { LinkBotao, Selo, Titulo } from "@/components/ui";
import { exigirOwner } from "@/lib/auth";
import { exibirTelefone } from "@/lib/telefone";
import type { ProfissionalAdmin } from "@/lib/tipos";

export const metadata: Metadata = { title: "Equipe" };

export default async function Equipe() {
  const { supabase } = await exigirOwner();
  const { data } = await supabase.rpc("profissionais_admin");
  const equipe = (data ?? []) as ProfissionalAdmin[];

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <Titulo className="mb-0" sub="Quem atende no studio e o que cada uma pode ver">
          Equipe
        </Titulo>
        <LinkBotao href="/painel/equipe/nova">+ Nova</LinkBotao>
      </div>
      <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
        {equipe.map((p) => (
          <li key={p.id}>
            <Link href={`/painel/equipe/${p.id}`} className={`flex items-center justify-between gap-3 px-4 py-3 hover:bg-base ${p.ativo ? "" : "opacity-60"}`}>
              <span className="min-w-0">
                <span className="block text-[15px] font-medium">{p.nome}</span>
                <span className="block text-[13px] text-ink-muted">
                  {p.telefone ? exibirTelefone(p.telefone) : "Sem celular — não consegue entrar"}
                  {p.telefone && !p.user_id && " · ainda não entrou"}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                {p.papel === "owner" && <Selo>Dona</Selo>}
                {!p.ativo && <span className="text-[12px] text-ink-muted">inativa</span>}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
