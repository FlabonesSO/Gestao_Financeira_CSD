-- =====================================================================
-- DASHBOARD · gráfico "Saldo total · real × Projetado Engenharia"  (rode UMA vez no SQL Editor do Supabase; é seguro rodar de novo)
-- Pré-requisitos: permissoes.sql (permissões por usuário) e bases-dados.sql já instalados.
--
-- PARA QUE SERVE
--   O Dashboard Financeiro (Visão executiva) passa a ter, logo abaixo do gráfico "Saldo total · real × sem a Distribuição Antecipada", um gráfico de linhas
--   com o saldo acumulado PROJETADO pela Engenharia até o fim do contrato (planilha FLUXO_CAIXA_TECON, aba FLUXO 01, linha "SALDO ACUMULADO DO CONTRATO")
--   ao lado do saldo total real. Quem tem a permissão de publicar o Dashboard (dash.publicar) clica em "⬆ Projetado Engenharia" e escolhe a planilha
--   (pasta Projetado_Engenharia); o site lê as colunas, mostra o gráfico na hora e publica o resultado para os demais usuários.
--
-- O QUE O SCRIPT FAZ
--   1) libera a chave 'projetado_engenharia' na tabela public.bases (a planilha em si NÃO é guardada: só as datas e os saldos lidos dela);
--   2) ensina public.pode_ler_base / public.pode_publicar_base a tratar essa chave:
--        ler    → quem tem dash.ver (o mesmo que vê o Dashboard; quem tem só "Somente a aba Saída · Fornecedores" não lê);
--        gravar → quem tem dash.publicar (o mesmo que atualiza a base do Dashboard);
--   3) reaplica as regras de acesso por permissão.
--   Não altera nenhum usuário nem nenhuma base existente. Os trechos 1 e 2 são os mesmos do permissoes.sql (que já os traz atualizados).
-- =====================================================================

-- 0) Pré-requisitos
do $$
begin
  if to_regprocedure('public.tem_permissao(text)') is null then
    raise exception 'Rode antes o permissoes.sql (permissões por usuário): este script depende dele.' using errcode = '55000';
  end if;
  if to_regclass('public.bases') is null then
    raise exception 'Rode antes o bases-dados.sql: a tabela public.bases não existe.' using errcode = '55000';
  end if;
end $$;

-- 1) Chave nova na tabela public.bases ------------------------------------------------------------------
do $$
declare r record;
begin
  for r in select conname from pg_constraint
            where conrelid = 'public.bases'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%chave%'
  loop
    execute format('alter table public.bases drop constraint %I', r.conname);
  end loop;
  alter table public.bases add constraint bases_chave_check
    check (chave in ('fundo_reserva', 'reidi', 'fluxo_projetado', 'reidi_config', 'dashboard_fornecedores', 'projetado_engenharia'));
end $$;

-- 2) Quem lê e quem publica cada base ---------------------------------------------------------------------
create or replace function public.pode_ler_base(p_chave text)
returns boolean language sql security definer stable set search_path = public as $$
  select case p_chave
    when 'fundo_reserva'   then public.tem_permissao('fundo.ver')
    when 'fluxo_projetado' then public.tem_permissao('fluxo.ver')
    when 'reidi_config'    then public.tem_permissao('reidi.ver') or public.tem_permissao('lanc.lancar')
    when 'reidi'           then public.tem_permissao('reidi.ver')
    when 'dashboard_fornecedores' then public.tem_permissao('dash.ver') or public.tem_permissao('dash.fornecedores')
    when 'projetado_engenharia' then public.tem_permissao('dash.ver')
    else false
  end;
$$;

create or replace function public.pode_publicar_base(p_chave text)
returns boolean language sql security definer stable set search_path = public as $$
  select case p_chave
    when 'fundo_reserva'   then public.tem_permissao('fundo.publicar')
    when 'fluxo_projetado' then public.tem_permissao('fluxo.publicar')
    when 'reidi_config'    then public.tem_permissao('reidi.parametros')
    when 'dashboard_fornecedores' then public.tem_permissao('dash.publicar')
    when 'projetado_engenharia' then public.tem_permissao('dash.publicar')
    else public.is_admin()
  end;
$$;

-- 3) Reaplica as regras de acesso por permissão ---------------------------------------------------------------
do $$ begin
  if to_regprocedure('public.aplicar_politicas_permissoes()') is not null then perform public.aplicar_politicas_permissoes(); end if;
end $$;

-- Conferência (rode separado, uma consulta por vez):
--   1) a chave foi liberada na tabela de bases (a definição deve citar 'projetado_engenharia'):
--        select pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.bases'::regclass and conname = 'bases_chave_check';
--   2) depois que o administrador publicar a planilha (botão "⬆ Projetado Engenharia"), a base existe (1 linha; "colunas" = períodos lidos da planilha):
--        select chave, arquivo, atualizado_em, jsonb_array_length(dados -> 'p') as colunas from public.bases where chave = 'projetado_engenharia';
