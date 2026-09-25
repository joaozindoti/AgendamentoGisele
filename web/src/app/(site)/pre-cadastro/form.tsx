"use client";

import { useState } from "react";
import { Botao, Caixa, Campo, LinkBotao } from "@/components/ui";
import { criarClienteNavegador } from "@/lib/supabase/client";
import { mascaraTelefone, paraE164 } from "@/lib/telefone";
import { TEXTO_CONSENTIMENTO } from "@/lib/tipos";
import { chaveDia } from "@/lib/formato";

// Chama a Edge Function pre-cadastro direto do navegador, não por Server
// Action: o rate limit por IP da função usa o IP de quem chama, e pelo
// servidor da Vercel todo mundo sairia com o mesmo IP.
export function FormPreCadastro() {
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [endereco, setEndereco] = useState("");
  const [nascimento, setNascimento] = useState("");
  const [consentimento, setConsentimento] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const e164 = paraE164(telefone);
  const valido = nome.trim().length >= 2 && e164 && endereco.trim() && nascimento && nascimento <= chaveDia() && consentimento;

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!valido) {
      setErro("Preencha todos os campos corretamente e aceite o consentimento para continuar.");
      return;
    }
    setEnviando(true);
    setErro(null);
    const supabase = criarClienteNavegador();
    const { error } = await supabase.functions.invoke("pre-cadastro", {
      body: { nome: nome.trim(), whatsapp: e164, endereco: endereco.trim(), data_nascimento: nascimento, consentimento: true },
    });
    setEnviando(false);
    // Commit 688d23a: sucesso só quando o envio confirma de verdade.
    if (error) {
      const status = (error as { context?: Response }).context?.status;
      setErro(
        status === 429
          ? "Muitas tentativas seguidas. Espere um pouco e tente de novo."
          : "Não foi possível enviar agora. Tente de novo em instantes.",
      );
      return;
    }
    setOk(true);
  }

  if (ok) {
    return (
      <div className="mt-8 rounded-card border border-line bg-surface p-6 text-center">
        <p className="text-[20px] font-semibold">Cadastro recebido!</p>
        <p className="mt-2 text-[14px] text-ink-muted">Fique de olho no seu WhatsApp — descontos especiais chegam direto por lá.</p>
        <LinkBotao href="/cliente/agendar" className="mt-5">
          Agendar meu horário
        </LinkBotao>
      </div>
    );
  }

  return (
    <form onSubmit={enviar} noValidate className="mt-6 space-y-4">
      <Campo rotulo="Nome completo" autoComplete="name" value={nome} onChange={(e) => setNome(e.target.value)} required />
      <Campo
        rotulo="WhatsApp"
        type="tel"
        inputMode="numeric"
        autoComplete="tel"
        placeholder="(99) 99999-9999"
        dica="Digite o DDD e o número. Não precisa colocar o 55."
        value={telefone}
        onChange={(e) => setTelefone(mascaraTelefone(e.target.value))}
        required
      />
      <Campo rotulo="Endereço" autoComplete="street-address" value={endereco} onChange={(e) => setEndereco(e.target.value)} required />
      <Campo
        rotulo="Data de nascimento"
        type="date"
        min="1900-01-01"
        max={chaveDia()}
        value={nascimento}
        onChange={(e) => setNascimento(e.target.value)}
        required
      />
      <label className="flex items-start gap-3 text-[14px] text-ink">
        <input
          type="checkbox"
          className="mt-0.5 h-5 w-5 accent-[var(--color-accent)]"
          checked={consentimento}
          onChange={(e) => setConsentimento(e.target.checked)}
        />
        <span>{TEXTO_CONSENTIMENTO}</span>
      </label>
      {erro && <Caixa tipo="erro">{erro}</Caixa>}
      <Botao type="submit" largo disabled={!valido || enviando}>
        {enviando ? "Enviando…" : "Quero meu desconto de aniversário"}
      </Botao>
    </form>
  );
}
