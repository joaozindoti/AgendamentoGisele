-- Fase 25: a cliente só remarca (ou cancela) pelo app com pelo menos 4h de
-- antecedência — antes eram 2h. A mesma configuração vale pras duas coisas
-- (policy cliente_remarca_proprio_agendamento, migration 20260925153806) e a
-- Gisele continua podendo mudar o número em Mais → Configurações.
--
-- O aviso de remarcação pra Gisele não passa pelo banco: está na Edge
-- Function notificar-agendamento.
--
-- Idempotente: pode rodar de novo sem erro. Só sobe valor menor que 4, pra
-- não desfazer um ajuste maior que a Gisele tenha feito no painel.

update configuracoes
set valor = '4'
where chave = 'horas_minimas_remarcacao'
  and (valor #>> '{}')::int < 4;

insert into configuracoes (chave, valor)
values ('horas_minimas_remarcacao', '4')
on conflict (chave) do nothing;

-- Mesmo corpo da migration 20260925153806, só com o padrão novo (vale se a
-- linha de configuração sumir).
create or replace function public.horas_minimas_remarcacao()
returns interval
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select (valor #>> '{}')::int from configuracoes where chave = 'horas_minimas_remarcacao'),
    4
  ) * interval '1 hour';
$$;
