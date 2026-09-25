"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { salvarFoto } from "@/app/painel/actions";
import { criarClienteNavegador } from "@/lib/supabase/client";
import { Caixa } from "./ui";

// 5 MB fixo em código (seção 12, decisão fechada). É só a primeira barreira
// e a mais amigável: o bucket também recusa acima de 5 MB, e a Edge
// Function validar-foto apaga qualquer arquivo cujo conteúdo real não seja
// JPEG/PNG/WEBP, independente do que o navegador declarou aqui.
const LIMITE_BYTES = 5 * 1024 * 1024;
const TIPOS = ["image/jpeg", "image/png", "image/webp"];

export function UploadFoto({
  tabela,
  id,
  pasta,
  fotoAtual,
}: {
  tabela: "servicos" | "profissionais";
  id: string;
  pasta: "servicos" | "profissionais";
  fotoAtual: string | null;
}) {
  const router = useRouter();
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function aoEscolher(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    e.target.value = "";
    if (!arquivo) return;
    if (!TIPOS.includes(arquivo.type)) return setErro("Use uma foto JPG, PNG ou WEBP.");
    if (arquivo.size > LIMITE_BYTES) return setErro("A foto precisa ter no máximo 5 MB.");

    setEnviando(true);
    setErro(null);
    const supabase = criarClienteNavegador();
    const extensao = arquivo.type.split("/")[1].replace("jpeg", "jpg");
    // caminho exigido pelas policies de storage: {pasta}/{id}/arquivo
    const caminho = `${pasta}/${id}/${crypto.randomUUID()}.${extensao}`;

    const { error } = await supabase.storage.from("fotos").upload(caminho, arquivo, {
      contentType: arquivo.type,
      cacheControl: "31536000",
      upsert: false,
    });
    if (error) {
      setEnviando(false);
      return setErro("Não foi possível enviar a foto. Tente de novo.");
    }

    const url = supabase.storage.from("fotos").getPublicUrl(caminho).data.publicUrl;
    const r = await salvarFoto(tabela, id, url);
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
          <input type="file" accept={TIPOS.join(",")} className="sr-only" onChange={aoEscolher} disabled={enviando} />
        </label>
        <p className="text-[12px] text-ink-muted">JPG, PNG ou WEBP, até 5 MB.</p>
        {erro && <Caixa tipo="erro">{erro}</Caixa>}
      </div>
    </div>
  );
}
