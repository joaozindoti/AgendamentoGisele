import type { Metadata } from "next";
import { BotaoSair } from "@/components/botao-sair";
import { BotaoInstalar } from "@/components/pwa";
import { LinkBotao, Titulo } from "@/components/ui";
import { exigirCliente } from "@/lib/auth";
import { exibirTelefone } from "@/lib/telefone";
import type { Cliente } from "@/lib/tipos";
import { FormPerfil } from "./form";

export const metadata: Metadata = { title: "Perfil" };

export default async function Perfil() {
  const { supabase, clienteId, papel } = await exigirCliente();
  const { data } = await supabase
    .from("clientes")
    .select("id, nome, whatsapp, endereco, data_nascimento, consentimento")
    .eq("id", clienteId)
    .single();
  const cliente = data as Pick<Cliente, "id" | "nome" | "whatsapp" | "endereco" | "data_nascimento" | "consentimento">;

  return (
    <div className="space-y-6">
      <Titulo sub={`WhatsApp ${exibirTelefone(cliente.whatsapp)}`}>Seu perfil</Titulo>
      <FormPerfil cliente={cliente} />
      <p className="text-[12px] text-ink-muted">
        Pra trocar o número de WhatsApp, fale com o studio — é ele que liga seu login aos seus agendamentos.
      </p>
      {papel?.profissional_id && (
        <LinkBotao href="/painel" variante="secundario" largo>
          Ir para o painel do studio
        </LinkBotao>
      )}
      <BotaoInstalar nomeApp="o app do Studio" />
      <div className="border-t border-line pt-4">
        <BotaoSair />
      </div>
    </div>
  );
}
