import type { Metadata } from "next";
import Link from "next/link";
import { BotaoSair } from "@/components/botao-sair";
import { BotaoInstalar } from "@/components/pwa";
import { Titulo } from "@/components/ui";
import { UploadFoto } from "@/components/upload-foto";
import { exigirProfissional } from "@/lib/auth";
import { FormMeuPerfil } from "./form";

export const metadata: Metadata = { title: "Mais" };

export default async function Mais() {
  const { supabase, ehOwner, profissionalId, papel } = await exigirProfissional();
  const { data: eu } = await supabase.from("profissionais").select("id, nome, bio, foto_url").eq("id", profissionalId).single();

  const links = [
    { href: "/painel/novo", rotulo: "Novo agendamento" },
    ...(ehOwner
      ? [
          { href: "/painel/metricas", rotulo: "Métricas e relatórios" },
          { href: "/painel/configuracoes", rotulo: "Configurações" },
        ]
      : []),
    { href: "/painel/disponibilidade", rotulo: "Meus horários e folgas" },
    ...(papel?.cliente_id ? [{ href: "/cliente", rotulo: "Minha área de cliente" }] : []),
    { href: "/", rotulo: "Ver site do studio" },
  ];

  return (
    <div className="space-y-8">
      <Titulo>Mais</Titulo>
      <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
        {links.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className="flex justify-between px-4 py-3.5 text-[15px] hover:bg-base">
              {l.rotulo}
              <span className="text-ink-muted">›</span>
            </Link>
          </li>
        ))}
      </ul>

      {eu && (
        <section className="space-y-4">
          <h2 className="text-[16px] font-semibold">Meu perfil</h2>
          <UploadFoto tabela="profissionais" id={eu.id} pasta="profissionais" fotoAtual={eu.foto_url} />
          <FormMeuPerfil nome={eu.nome} bio={eu.bio} />
        </section>
      )}

      <BotaoInstalar nomeApp="o painel" />
      <div className="border-t border-line pt-4">
        <BotaoSair />
      </div>
    </div>
  );
}
