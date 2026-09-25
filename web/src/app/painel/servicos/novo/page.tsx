import { Titulo } from "@/components/ui";
import { exigirOwner } from "@/lib/auth";
import { FormServico } from "../form-servico";

export default async function NovoServico() {
  const { supabase } = await exigirOwner();
  const { data: equipe } = await supabase.from("profissionais").select("id, nome, ativo").order("nome");
  return (
    <>
      <Titulo eyebrow="Serviços" sub="A foto você envia depois de salvar.">
        Novo serviço
      </Titulo>
      <FormServico servico={null} equipe={equipe ?? []} quemFaz={[]} />
    </>
  );
}
