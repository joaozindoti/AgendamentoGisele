import type { Metadata } from "next";
import { FormPreCadastro } from "./form";

export const metadata: Metadata = {
  title: "Cadastro de Aniversário",
  description: "Cadastre-se e receba descontos especiais direto no seu WhatsApp no mês do seu aniversário.",
};

export default function PaginaPreCadastro() {
  return (
    <div className="mx-auto max-w-md px-4 pt-10">
      <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-gold-ink">Clube Lindeza Premium</p>
      <h1 className="mt-2 text-[26px] leading-tight font-semibold tracking-tight">
        Cadastre-se uma vez e receba descontos especiais direto no seu WhatsApp
      </h1>
      <p className="mt-3 text-[13px] text-ink-muted">Atendimento exclusivo para o público feminino.</p>
      <FormPreCadastro />
    </div>
  );
}
