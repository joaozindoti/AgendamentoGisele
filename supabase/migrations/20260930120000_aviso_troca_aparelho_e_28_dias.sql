-- 1. Aviso por WhatsApp quando o cadastro de um número vai pra outro
--    aparelho (linha nova em clientes_trocas_aparelho, migration
--    20260929150000). Mesmo mecanismo dos avisos de agendamento: pg_net
--    chama a Edge Function notificar-agendamento, que reconhece a tabela e
--    manda a mensagem pro número da cliente. Mesmo secret, nada novo pra
--    configurar.
-- 2. Lembrete de 28 dias volta a valer só pros atendimentos da Gisele
--    (profissional com papel owner).
--
-- Idempotente: pode rodar de novo sem erro.

-- ANTES DE RODAR ESTA MIGRATION: troque '<COLE_O_WEBHOOK_NOTIFICAR_SECRET_AQUI>'
-- abaixo pelo mesmo valor de WEBHOOK_NOTIFICAR_AGENDAMENTO_SECRET (o gerador
-- de supabase/colar/ já preenche).
drop trigger if exists on_troca_aparelho_notificar on clientes_trocas_aparelho;
create trigger on_troca_aparelho_notificar
  after insert on clientes_trocas_aparelho
  for each row
  execute function public.dispara_webhook(
    'https://pjbcgyzykvidbwdjlnvp.supabase.co/functions/v1/notificar-agendamento',
    '<COLE_O_WEBHOOK_NOTIFICAR_SECRET_AQUI>'
  );

-- Mesma função da migration 20260925160000, com o filtro de owner.
create or replace function public.concluidos_para_lembrete_pos_procedimento()
returns table (
  agendamento_id uuid,
  cliente_id uuid,
  cliente_nome text,
  cliente_whatsapp text,
  servico_nome text
)
language sql
security definer
set search_path = public
as $$
  select a.id, c.id, c.nome, c.whatsapp, s.nome
  from agendamentos a
  join clientes c on c.id = a.cliente_id
  join servicos s on s.id = a.servico_id
  join profissionais p on p.id = a.profissional_id and p.papel = 'owner'
  where a.status = 'concluido'
    and (upper(a.periodo) at time zone 'America/Fortaleza')::date =
        (now() at time zone 'America/Fortaleza')::date - (
          select (valor #>> '{}')::int from configuracoes where chave = 'dias_lembrete_pos_procedimento'
        )
    and not exists (
      select 1 from lembretes_enviados le
      where le.agendamento_id = a.id and le.tipo = '28dias'
    );
$$;

revoke all on function public.concluidos_para_lembrete_pos_procedimento() from public, anon, authenticated;
grant execute on function public.concluidos_para_lembrete_pos_procedimento() to service_role;
