import type { Metadata } from "next";
import { PAINEL } from "@/components/home-cliente";
import { Titulo } from "@/components/ui";
import { FormPreCadastro } from "./form";

export const metadata: Metadata = {
  title: "Cadastro de Aniversário",
  description: "Cadastre-se e receba descontos especiais direto no seu WhatsApp no mês do seu aniversário.",
};

// O aviso de público feminino vem da faixa do layout (fase 20).
export default function PaginaPreCadastro() {
  return (
    <div className="mx-auto max-w-md px-4 pt-6">
      <Titulo eyebrow="Clube Lindeza Premium" sub="No mês do seu aniversário, o desconto chega direto no seu WhatsApp.">
        Cadastre-se uma vez e ganhe descontos especiais
      </Titulo>
      <div className={PAINEL}>
        <FormPreCadastro />
      </div>
    </div>
  );
}
