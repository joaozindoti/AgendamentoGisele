-- Desfaz o aviso por WhatsApp de troca de aparelho (trigger criado na
-- migration 20260930120000). Decisão de 30/09/2026: sem mensagem nessa
-- situação. O registro em clientes_trocas_aparelho continua (a Gisele vê
-- as trocas), e o filtro do lembrete de 28 dias da mesma migration fica.
--
-- Idempotente: pode rodar de novo, e rodar mesmo se a 20260930120000 nunca
-- tiver sido aplicada.
drop trigger if exists on_troca_aparelho_notificar on clientes_trocas_aparelho;
