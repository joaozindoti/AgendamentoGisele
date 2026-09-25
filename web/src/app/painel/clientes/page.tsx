import type { Metadata } from "next";
import Link from "next/link";
import { LinkBotao, Selo, Titulo, Vazio } from "@/components/ui";
import { exigirProfissional } from "@/lib/auth";
import { chaveDia } from "@/lib/formato";
import { exibirTelefone } from "@/lib/telefone";

export const metadata: Metadata = { title: "Clientes" };

export default async function Clientes({ searchParams }: PageProps<"/painel/clientes">) {
  const { supabase, ehOwner } = await exigirProfissional();
  const { q } = await searchParams;
  const termo = typeof q === "string" ? q.trim() : "";

  let consulta = supabase
    .from("clientes")
    .select("id, nome, whatsapp, data_nascimento, consentimento, user_id")
    .order("nome")
    .limit(200);
  if (termo) {
    const digitos = termo.replace(/\D/g, "");
    consulta =
      digitos.length >= 4
        ? consulta.ilike("whatsapp", `%${digitos}%`)
        : consulta.ilike("nome", `%${termo.replace(/[%_]/g, "")}%`);
  }
  const { data } = await consulta;
  const mesAtual = chaveDia().slice(5, 7);

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <Titulo className="mb-0" sub={ehOwner ? "Todas as clientes do studio" : "Clientes que você já atendeu"}>
          Clientes
        </Titulo>
        {ehOwner && <LinkBotao href="/painel/clientes/nova">+ Nova</LinkBotao>}
      </div>
      <form>
        <input
          type="search"
          name="q"
          defaultValue={termo}
          placeholder="Buscar por nome ou WhatsApp…"
          className="min-h-11 w-full rounded-input border border-line bg-surface px-3 text-[16px] placeholder:text-ink-muted/60 focus:border-accent focus:outline-none"
        />
      </form>
      {!data?.length ? (
        <Vazio>{termo ? "Nenhuma cliente encontrada." : "Nenhuma cliente ainda."}</Vazio>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
          {data.map((c) => (
            <li key={c.id}>
              <Link href={`/painel/clientes/${c.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-base">
                <span className="min-w-0">
                  <span className="block truncate text-[15px] font-medium">{c.nome}</span>
                  <span className="block text-[13px] text-ink-muted">{exibirTelefone(c.whatsapp)}</span>
                </span>
                <span className="flex shrink-0 gap-1">
                  {c.data_nascimento?.slice(5, 7) === mesAtual && <Selo>Aniversário</Selo>}
                  {!c.user_id && <span className="text-[11px] text-ink-muted">sem app</span>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
