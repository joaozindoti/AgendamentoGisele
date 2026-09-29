"use client";

import { useState } from "react";
import { chaveDia } from "@/lib/formato";
import { mensagemDeErro } from "@/lib/erros";
import { TIPOS_FOTO } from "@/lib/imagem";
import { criarClienteNavegador } from "@/lib/supabase/client";
import { exibirTelefone, mascaraTelefone, paraE164 } from "@/lib/telefone";
import { Botao, Caixa, Campo } from "./ui";
import { enviarFoto } from "./upload-foto";

// Cadastro da cliente, sem código de WhatsApp. Não existe tela de login: a
// sessão anônima do Supabase é criada aqui, no primeiro cadastro, e fica
// salva no navegador/app instalado. O número não é verificado — por isso a
// cliente confere o número formatado antes de salvar (a planilha antiga
// tinha vários números errados por digitação).
export function CadastroCliente({
  aoConcluir,
  textoBotao = "Continuar",
}: {
  aoConcluir: (clienteId: string) => void | Promise<void>;
  textoBotao?: string;
}) {
  const [etapa, setEtapa] = useState<"dados" | "conferir">("dados");
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [nascimento, setNascimento] = useState("");
  const [foto, setFoto] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const e164 = paraE164(telefone);

  function conferir(e: React.FormEvent) {
    e.preventDefault();
    if (nome.trim().length < 2) return setErro("Informe seu nome.");
    if (!e164) return setErro("Confira o DDD e o número do WhatsApp.");
    setErro(null);
    setEtapa("conferir");
  }

  async function salvar() {
    if (!e164) return;
    setEnviando(true);
    setErro(null);
    const supabase = criarClienteNavegador();

    const { data: sessao } = await supabase.auth.getSession();
    if (!sessao.session) {
      const { error } = await supabase.auth.signInAnonymously();
      if (error) {
        setEnviando(false);
        return setErro(
          error.status === 429
            ? "Muitos cadastros seguidos desta rede. Espere alguns minutos e tente de novo."
            : "Não conseguimos iniciar seu cadastro agora. Tente de novo em instantes.",
        );
      }
    }

    const { data: clienteId, error } = await supabase.rpc("cadastrar_cliente", {
      p_nome: nome.trim(),
      p_whatsapp: e164,
      p_data_nascimento: nascimento || null,
    });
    if (error || !clienteId) {
      setEnviando(false);
      setEtapa("dados");
      return setErro(mensagemDeErro(error));
    }

    // Foto é opcional: se falhar, o cadastro segue e ela pode mandar depois no Perfil.
    if (foto) {
      const { url } = await enviarFoto("clientes", clienteId as string, foto);
      const { error: erroFoto } = url
        ? await supabase.from("clientes").update({ foto_url: url }).eq("id", clienteId)
        : { error: true };
      if (erroFoto) setAviso("Seu cadastro foi feito, mas a foto não subiu. Você pode enviar de novo no Perfil.");
    }

    await aoConcluir(clienteId as string);
    setEnviando(false);
  }

  if (etapa === "conferir" && e164) {
    return (
      <div className="space-y-4">
        <p className="text-[15px] text-ink">Confirma que esse é o seu WhatsApp?</p>
        <p className="rounded-card border border-accent bg-surface px-4 py-4 text-center text-[24px] font-semibold tracking-tight tabular-nums">
          +55 {exibirTelefone(e164)}
        </p>
        <p className="text-[13px] text-ink-muted">
          É por ele que chegam a confirmação, os lembretes e os cuidados depois do atendimento.
        </p>
        {erro && <Caixa tipo="erro">{erro}</Caixa>}
        {aviso && <Caixa>{aviso}</Caixa>}
        <Botao largo onClick={salvar} disabled={enviando}>
          {enviando ? "Salvando…" : `Sim, está certo — ${textoBotao.toLowerCase()}`}
        </Botao>
        <Botao largo variante="fantasma" onClick={() => setEtapa("dados")} disabled={enviando}>
          Corrigir o número
        </Botao>
      </div>
    );
  }

  return (
    <form onSubmit={conferir} className="space-y-4">
      <Campo rotulo="Seu nome" autoComplete="name" value={nome} onChange={(e) => setNome(e.target.value)} required minLength={2} maxLength={100} />
      <Campo
        rotulo="WhatsApp"
        type="tel"
        inputMode="numeric"
        autoComplete="tel"
        placeholder="(99) 99999-9999"
        dica="DDD + número. Não precisa colocar o 55."
        value={telefone}
        onChange={(e) => setTelefone(mascaraTelefone(e.target.value))}
        required
      />
      <Campo
        rotulo="Data de nascimento"
        type="date"
        min="1900-01-01"
        max={chaveDia()}
        value={nascimento}
        onChange={(e) => setNascimento(e.target.value)}
        dica="No mês do seu aniversário tem presente."
      />
      <label className="block space-y-1.5">
        <span className="text-[14px] font-medium">Foto (opcional)</span>
        <input
          type="file"
          accept={TIPOS_FOTO.join(",")}
          onChange={(e) => setFoto(e.target.files?.[0] ?? null)}
          className="block w-full text-[14px] text-ink-muted file:mr-3 file:rounded-pill file:border-0 file:bg-base file:px-4 file:py-2 file:text-accent"
        />
        <span className="block text-[12px] text-ink-muted">Ajuda a equipe a te reconhecer na agenda.</span>
      </label>
      {erro && <Caixa tipo="erro">{erro}</Caixa>}
      <Botao type="submit" largo disabled={!e164 || nome.trim().length < 2}>
        {textoBotao}
      </Botao>
    </form>
  );
}
