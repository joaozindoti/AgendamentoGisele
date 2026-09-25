import type { Metadata } from "next";
import { Titulo } from "@/components/ui";
import { exigirProfissional } from "@/lib/auth";
import { EditorBloqueios, EditorDisponibilidade } from "../editores";

export const metadata: Metadata = { title: "Meus horários" };

export default async function MeusHorarios() {
  const { supabase, profissionalId } = await exigirProfissional();
  return (
    <div className="space-y-8">
      <Titulo sub="Quando você atende e quando está fora">Meus horários</Titulo>
      <EditorDisponibilidade supabase={supabase} profissionalId={profissionalId} />
      <EditorBloqueios supabase={supabase} profissionalId={profissionalId} />
    </div>
  );
}
