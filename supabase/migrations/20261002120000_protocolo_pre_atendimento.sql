-- Protocolo pré-atendimento (fase 23): mesmo mecanismo do protocolo
-- pós-atendimento (migration 20260929150000), com texto próprio por
-- profissional + serviço. Não tem cron: a Edge Function
-- notificar-agendamento manda o texto logo depois da mensagem
-- "Agendamento confirmado!", no mesmo disparo. Sem texto, não manda nada.
--
-- Idempotente: pode rodar de novo sem erro.

alter table profissional_servicos add column if not exists protocolo_pre text;

-- A coluna nova não entra no grant de colunas da leitura pública
-- (profissional_id, servico_id, preco_override, duracao_override_min): como
-- o protocolo, só a dona lê, pelas RPCs abaixo.

-- O retorno mudou (coluna nova), então create or replace não serve.
drop function if exists public.meus_protocolos();
create function public.meus_protocolos()
returns table (servico_id uuid, servico_nome text, protocolo text, protocolo_pre text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public.meu_profissional_id() is null then
    raise exception 'apenas_profissionais';
  end if;
  return query
    select s.id, s.nome, ps.protocolo, ps.protocolo_pre
    from profissional_servicos ps
    join servicos s on s.id = ps.servico_id
    where ps.profissional_id = public.meu_profissional_id()
    order by s.nome;
end;
$$;

-- p_protocolo_pre null = não mexe no pré (quem chama só com os dois
-- parâmetros antigos continua funcionando); texto vazio apaga, igual ao pós.
drop function if exists public.salvar_protocolo(uuid, text);
create or replace function public.salvar_protocolo(p_servico_id uuid, p_protocolo text, p_protocolo_pre text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.meu_profissional_id() is null then
    raise exception 'apenas_profissionais';
  end if;
  if length(coalesce(p_protocolo, '')) > 2000 or length(coalesce(p_protocolo_pre, '')) > 2000 then
    raise exception 'protocolo_longo';
  end if;

  update profissional_servicos
  set protocolo = nullif(trim(p_protocolo), ''),
      protocolo_pre = case when p_protocolo_pre is null then protocolo_pre else nullif(trim(p_protocolo_pre), '') end
  where profissional_id = public.meu_profissional_id() and servico_id = p_servico_id;

  if not found then
    raise exception 'servico_nao_atendido';
  end if;
end;
$$;

revoke all on function public.meus_protocolos() from public, anon, authenticated;
revoke all on function public.salvar_protocolo(uuid, text, text) from public, anon, authenticated;
grant execute on function public.meus_protocolos() to authenticated;
grant execute on function public.salvar_protocolo(uuid, text, text) to authenticated;
