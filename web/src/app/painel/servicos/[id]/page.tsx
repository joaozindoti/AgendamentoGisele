import Link from "next/link";
import { notFound } from "next/navigation";
import { Titulo } from "@/components/ui";
import { UploadFoto } from "@/components/upload-foto";
import { exigirOwner } from "@/lib/auth";
import type { Servico } from "@/lib/tipos";
import { FormServico } from "../form-servico";

export default async function DetalheServico({ params }: PageProps<"/painel/servicos/[id]">) {
  const { id } = await params;
  const { supabase } = await exigirOwner();

  const [{ data }, { data: equipe }, { data: vinculos }] = await Promise.all([
    supabase.from("servicos").select("id, nome, descricao, foto_url, preco, duracao_min, ativo, categoria, destaque").eq("id", id).maybeSingle(),
    supabase.from("profissionais").select("id, nome, ativo").order("nome"),
    supabase.from("profissional_servicos").select("profissional_id").eq("servico_id", id),
  ]);
  if (!data) notFound();
  const servico = data as Servico;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/painel/servicos" className="text-[14px] text-accent">
          ‹ Serviços
        </Link>
        <Titulo className="mt-3">{servico.nome}</Titulo>
      </div>
      <UploadFoto tabela="servicos" id={servico.id} pasta="servicos" fotoAtual={servico.foto_url} />
      <FormServico servico={servico} equipe={equipe ?? []} quemFaz={(vinculos ?? []).map((v) => v.profissional_id as string)} />
    </div>
  );
}
