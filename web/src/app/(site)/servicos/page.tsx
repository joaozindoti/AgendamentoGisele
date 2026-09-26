import type { Metadata } from "next";
import { CatalogoServicos } from "@/components/catalogo";
import { Titulo } from "@/components/ui";
import { criarClienteServidor } from "@/lib/supabase/server";
import type { Servico } from "@/lib/tipos";

export const metadata: Metadata = { title: "Serviços" };

export default async function PaginaServicos() {
  const supabase = await criarClienteServidor();
  const { data } = await supabase
    .from("servicos")
    .select("id, nome, descricao, foto_url, preco, duracao_min, ativo, categoria, destaque")
    .eq("ativo", true)
    .order("categoria")
    .order("nome");

  return (
    <div className="mx-auto max-w-5xl px-4 pt-8">
      <Titulo eyebrow="Lindeza Premium" sub="Escolha o seu cuidado e agende no horário que preferir.">
        Serviços
      </Titulo>
      <CatalogoServicos servicos={(data ?? []) as Servico[]} hrefBase="/cliente/agendar?servico=" />
    </div>
  );
}
