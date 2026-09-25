"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Botao, Caixa, Campo } from "@/components/ui";
import { criarClienteNavegador } from "@/lib/supabase/client";
import { exibirTelefone, mascaraTelefone, paraE164 } from "@/lib/telefone";

const REENVIO_SEGUNDOS = 60;

// Seção 4: signInWithOtp({ phone }) -> Supabase Auth chama o hook send_sms
// (Edge Function enviar-otp-whatsapp) -> código chega no WhatsApp ->
// verifyOtp. Nenhuma senha. O mesmo login serve pra cliente e pra equipe;
// quem é quem decide depois (meu_papel).
export function FormLogin({ destino }: { destino: string | null }) {
  const router = useRouter();
  const [etapa, setEtapa] = useState<"telefone" | "codigo">("telefone");
  const [telefone, setTelefone] = useState("");
  const [codigo, setCodigo] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [espera, setEspera] = useState(0);

  const e164 = paraE164(telefone);

  useEffect(() => {
    if (espera <= 0) return;
    const t = setTimeout(() => setEspera(espera - 1), 1000);
    return () => clearTimeout(t);
  }, [espera]);

  async function pedirCodigo(e?: React.FormEvent) {
    e?.preventDefault();
    if (!e164) {
      setErro("Confira o DDD e o número do WhatsApp.");
      return;
    }
    setCarregando(true);
    setErro(null);
    const { error } = await criarClienteNavegador().auth.signInWithOtp({ phone: e164 });
    setCarregando(false);
    if (error) {
      setErro(
        error.status === 429
          ? "Muitos pedidos de código seguidos. Espere um pouco e tente de novo."
          : "Não conseguimos enviar o código agora. Tente de novo em instantes.",
      );
      return;
    }
    setEtapa("codigo");
    setEspera(REENVIO_SEGUNDOS);
  }

  async function verificar(e: React.FormEvent) {
    e.preventDefault();
    if (!e164 || codigo.length !== 6) return;
    setCarregando(true);
    setErro(null);
    const { error } = await criarClienteNavegador().auth.verifyOtp({ phone: e164, token: codigo, type: "sms" });
    if (error) {
      setCarregando(false);
      setErro("Código inválido ou expirado. Confira ou peça um novo.");
      return;
    }
    // A página /entrar decide o destino pelo papel (cliente x equipe).
    router.replace(destino ?? "/entrar");
    router.refresh();
  }

  if (etapa === "codigo") {
    return (
      <form onSubmit={verificar} className="mt-8 space-y-4">
        <p className="text-[14px] text-ink">
          Enviamos um código de 6 dígitos para o WhatsApp <strong>{exibirTelefone(e164)}</strong>.
        </p>
        <Campo
          rotulo="Código"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={6}
          autoFocus
          value={codigo}
          onChange={(e) => setCodigo(e.target.value.replace(/\D/g, "").slice(0, 6))}
          className="[&_input]:text-center [&_input]:text-[22px] [&_input]:tracking-[0.5em]"
        />
        {erro && <Caixa tipo="erro">{erro}</Caixa>}
        <Botao type="submit" largo disabled={codigo.length !== 6 || carregando}>
          {carregando ? "Entrando…" : "Entrar"}
        </Botao>
        <div className="flex items-center justify-between text-[14px]">
          <button type="button" className="text-ink-muted hover:text-accent" onClick={() => { setEtapa("telefone"); setCodigo(""); setErro(null); }}>
            Trocar número
          </button>
          <button type="button" className="text-accent disabled:text-ink-muted" disabled={espera > 0 || carregando} onClick={() => pedirCodigo()}>
            {espera > 0 ? `Reenviar em ${espera}s` : "Reenviar código"}
          </button>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={pedirCodigo} className="mt-8 space-y-4">
      <Campo
        rotulo="WhatsApp"
        type="tel"
        inputMode="numeric"
        autoComplete="tel"
        placeholder="(99) 99999-9999"
        dica="DDD + número. Não precisa colocar o 55."
        value={telefone}
        onChange={(e) => setTelefone(mascaraTelefone(e.target.value))}
        autoFocus
      />
      {erro && <Caixa tipo="erro">{erro}</Caixa>}
      <Botao type="submit" largo disabled={!e164 || carregando}>
        {carregando ? "Enviando…" : "Receber código de acesso"}
      </Botao>
      <p className="text-center text-[12px] text-ink-muted">Enviamos um código de 6 dígitos pelo WhatsApp.</p>
    </form>
  );
}
