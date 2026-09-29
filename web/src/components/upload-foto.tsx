"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { salvarFoto } from "@/app/painel/actions";
import { LIMITE_FOTO_BYTES, TIPOS_FOTO, comprimirParaWebp } from "@/lib/imagem";
import { criarClienteNavegador } from "@/lib/supabase/client";
import { Caixa } from "./ui";

type Pasta = "servicos" | "profissionais" | "clientes";

// 5 MB fixo em código (seção 12, decisão fechada). É só a primeira barreira
// e a mais amigável: o bucket também recusa acima de 5 MB, e a Edge
// Function validar-foto apaga qualquer arquivo cujo conteúdo real não seja
// JPEG/PNG/WEBP, independente do que o navegador declarou aqui.
export async function enviarFoto(pasta: Pasta, id: string, original: File): Promise<{ url?: string; caminho?: string; erro?: string }> {
  if (!TIPOS_FOTO.includes(original.type)) return { erro: "Use uma foto JPG, PNG ou WEBP." };
  const arquivo = await comprimirParaWebp(original);
  if (arquivo.size > LIMITE_FOTO_BYTES) return { erro: "A foto precisa ter no máximo 5 MB." };

  const supabase = criarClienteNavegador();
  const extensao = arquivo.type.split("/")[1].replace("jpeg", "jpg");
  // caminho exigido pelas policies de storage: {pasta}/{id}/arquivo
  const caminho = `${pasta}/${id}/${crypto.randomUUID()}.${extensao}`;
  const { error } = await supabase.storage.from("fotos").upload(caminho, arquivo, {
    contentType: arquivo.type,
    cacheControl: "31536000",
    upsert: false,
  });
  if (error) return { erro: "Não foi possível enviar a foto. Tente de novo." };
  return { url: supabase.storage.from("fotos").getPublicUrl(caminho).data.publicUrl, caminho };
}

/** Caminho no bucket a partir da URL pública (pra apagar a foto anterior). */
export function caminhoDaFoto(url: string | null) {
  return url?.split("/storage/v1/object/public/fotos/")[1] ?? null;
}

export function UploadFoto({
  tabela,
  id,
  pasta,
  fotoAtual,
  salvar = (url) => salvarFoto(tabela as "servicos" | "profissionais", id, url),
}: {
  tabela: "servicos" | "profissionais" | "clientes";
  id: string;
  pasta: Pasta;
  fotoAtual: string | null;
  salvar?: (url: string) => Promise<{ erro?: string } | undefined>;
}) {
  const router = useRouter();
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function aoEscolher(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    e.target.value = "";
    if (!arquivo) return;

    setEnviando(true);
    setErro(null);
    // A pasta da cliente aceita até 3 arquivos (policy de storage): tira a
    // foto anterior antes de subir a nova.
    const anterior = pasta === "clientes" ? caminhoDaFoto(fotoAtual) : null;
    if (anterior) await criarClienteNavegador().storage.from("fotos").remove([anterior]);

    const { url, erro: erroEnvio } = await enviarFoto(pasta, id, arquivo);
    if (!url) {
      setEnviando(false);
      return setErro(erroEnvio ?? "Não foi possível enviar a foto.");
    }
    const r = await salvar(url);
    setEnviando(false);
    if (r?.erro) return setErro(r.erro);
    router.refresh();
  }

  return (
    <div className="flex items-center gap-4">
      <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-card border border-line bg-base">
        {fotoAtual ? (
          <Image src={fotoAtual} alt="" fill sizes="96px" className="object-cover" />
        ) : (
          <span className="flex h-full items-center justify-center text-[12px] text-ink-muted">Sem foto</span>
        )}
      </div>
      <div className="space-y-2">
        <label className="inline-flex min-h-11 cursor-pointer items-center rounded-pill bg-base px-5 text-[15px] font-medium text-accent hover:bg-line">
          {enviando ? "Enviando…" : fotoAtual ? "Trocar foto" : "Enviar foto"}
          <input type="file" accept={TIPOS_FOTO.join(",")} className="sr-only" onChange={aoEscolher} disabled={enviando} />
        </label>
        <p className="text-[12px] text-ink-muted">JPG, PNG ou WEBP. A foto é reduzida antes de enviar.</p>
        {erro && <Caixa tipo="erro">{erro}</Caixa>}
      </div>
    </div>
  );
}
