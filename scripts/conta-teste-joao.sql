-- ============================================================
-- CONTA DE TESTE — NÃO É DADO REAL. REMOVER ANTES DO LANÇAMENTO
-- (supabase/colar/91-remover-conta-teste.sql, ver PENDENCIAS.md).
-- ============================================================
-- Dona de teste pro João revisar o painel: entra em /entrar com o celular
-- dele (+55 99 98499-4873) e o código que chega no WhatsApp.
--
-- Tudo que for criado pra teste deve ter o nome começando com "TESTE"
-- (a profissional fictícia, clientes fictícias): é assim que o script de
-- remoção acha o que apagar sem tocar nos dados da Gisele e da equipe real.
--
-- Não tem serviço vinculado, então não aparece pra cliente (nem no
-- agendamento, nem na equipe da home). Pode rodar de novo sem duplicar.
insert into profissionais (nome, telefone, papel, bio, ativo)
values ('TESTE João (dona de teste)', '+5599984994873', 'owner', 'Conta de teste para revisão do painel. Remover antes do lançamento.', true)
on conflict (telefone) do update set nome = excluded.nome, papel = 'owner', ativo = true, bio = excluded.bio;

select nome, papel, ativo, user_id is not null as ja_entrou from profissionais where telefone = '+5599984994873';
