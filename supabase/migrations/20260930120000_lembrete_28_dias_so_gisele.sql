-- Lembrete de 28 dias volta a valer só pros atendimentos da Gisele
-- (profissional com papel owner). Não há aviso de troca de aparelho por
-- WhatsApp (decisão de 30/09/2026): a troca só fica registrada em
-- clientes_trocas_aparelho.
--
-- Idempotente: pode rodar de novo sem erro.

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
