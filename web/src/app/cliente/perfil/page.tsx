import type { Metadata } from "next";
import { BotaoSair } from "@/components/botao-sair";
import { BotaoInstalar } from "@/components/pwa";
import { LinkBotao, Titulo } from "@/components/ui";
import { UploadFoto } from "@/components/upload-foto";
import { obterAreaCliente } from "@/lib/auth";
import { exibirTelefone } from "@/lib/telefone";
import type { Cliente } from "@/lib/tipos";
import { salvarFotoCliente } from "./actions";
import { CadastroPerfil, FormPerfil } from "./form";

export const metadata: Metadata = { title: "Perfil" };

export default async function Perfil() {
  const { supabase, clienteId, papel, anonimo } = await obterAreaCliente();

  if (!clienteId) {
    return (
      <div className="space-y-6">
        <Titulo sub="Só na primeira vez. Não tem senha nem código.">Seu cadastro</Titulo>
        <CadastroPerfil />
      </div>
    );
  }

  const { data } = await supabase
    .from("clientes")
    .select("id, nome, whatsapp, endereco, data_nascimento, consentimento, foto_url")
    .eq("id", clienteId)
    .single();
  const cliente = data as Pick<Cliente, "id" | "nome" | "whatsapp" | "endereco" | "data_nascimento" | "consentimento" | "foto_url">;

  return (
    <div className="space-y-6">
      <Titulo sub={`WhatsApp ${exibirTelefone(cliente.whatsapp)}`}>Seu perfil</Titulo>
      <UploadFoto tabela="clientes" id={cliente.id} pasta="clientes" fotoAtual={cliente.foto_url} salvar={salvarFotoCliente} />
      <FormPerfil cliente={cliente} />
      <p className="text-[12px] text-ink-muted">
        Pra trocar o número de WhatsApp, fale com o studio: é pra ele que vão a confirmação e os lembretes.
      </p>
      {papel?.profissional_id && (
        <LinkBotao href="/painel" variante="secundario" largo>
          Ir para o painel do studio
        </LinkBotao>
      )}
      <BotaoInstalar nomeApp="o app do Studio" />
      {/* Sessão anônima não tem como "entrar de novo": sair apagaria o
          vínculo deste aparelho. Só quem entrou por telefone vê o botão. */}
      {!anonimo && (
        <div className="border-t border-line pt-4">
          <BotaoSair />
        </div>
      )}
    </div>
  );
}
