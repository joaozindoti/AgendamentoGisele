import { Titulo } from "@/components/ui";
import { exigirOwner } from "@/lib/auth";
import { FormCliente } from "../form-cliente";

export default async function NovaCliente() {
  await exigirOwner();
  return (
    <>
      <Titulo eyebrow="Clientes">Nova cliente</Titulo>
      <FormCliente cliente={null} />
    </>
  );
}
