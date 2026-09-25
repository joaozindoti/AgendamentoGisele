import Link from "next/link";
import { notFound } from "next/navigation";
import { Titulo } from "@/components/ui";
import { UploadFoto } from "@/components/upload-foto";
import { exigirOwner } from "@/lib/auth";
import type { ProfissionalAdmin } from "@/lib/tipos";
import { EditorBloqueios, EditorDisponibilidade } from "../../editores";
import { FormProfissional } from "../form-profissional";
import { FormServicosDaProfissional } from "./servicos-form";

export default async function DetalheProfissional({ params }: PageProps<"/painel/equipe/[id]">) {
  const { id } = await params;
  const { supabase } = await exigirOwner();

  const [{ data: equipe }, { data: servicos }, { data: vinculos }] = await Promise.all([
    supabase.rpc("profissionais_admin"),
    supabase.from("servicos").select("id, nome, preco, duracao_min, ativo").order("nome"),
    supabase.from("profissional_servicos").select("servico_id, preco_override, duracao_override_min").eq("profissional_id", id),
  ]);
  const profissional = ((equipe ?? []) as ProfissionalAdmin[]).find((p) => p.id === id);
  if (!profissional) notFound();

  return (
    <div className="space-y-8">
      <div>
        <Link href="/painel/equipe" className="text-[14px] text-accent">
          ‹ Equipe
        </Link>
        <Titulo className="mt-3">{profissional.nome}</Titulo>
      </div>

      <UploadFoto tabela="profissionais" id={profissional.id} pasta="profissionais" fotoAtual={profissional.foto_url} />
      <FormProfissional profissional={profissional} />

      <FormServicosDaProfissional
        profissionalId={profissional.id}
        servicos={(servicos ?? []) as { id: string; nome: string; preco: number | null; duracao_min: number; ativo: boolean }[]}
        vinculos={(vinculos ?? []) as { servico_id: string; preco_override: number | null; duracao_override_min: number | null }[]}
      />

      <EditorDisponibilidade supabase={supabase} profissionalId={profissional.id} />
      <EditorBloqueios supabase={supabase} profissionalId={profissional.id} />
    </div>
  );
}
