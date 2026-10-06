-- =====================================================================
-- DASHBOARD · revisão e endurecimento (rode DEPOIS do dashboard-dados.sql)
-- É seguro rodar mais de uma vez.
-- =====================================================================

-- 1) Função auxiliar: usuário logado existe em perfis e está ativo.
--    (security definer: a leitura não depende das regras de acesso da tabela perfis)
create or replace function public.is_ativo()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (select 1 from public.perfis where id = auth.uid() and ativo = true);
$$;
revoke execute on function public.is_ativo() from public, anon;
grant  execute on function public.is_ativo() to authenticated;

-- 2) Leitura: qualquer usuário ativo (usa a função acima)
drop policy if exists dashboard_select on public.dashboard_dados;
create policy dashboard_select on public.dashboard_dados
  for select to authenticated
  using (public.is_ativo());

-- 3) Garante que "dados" seja sempre um objeto JSON (evita gravar lixo)
alter table public.dashboard_dados drop constraint if exists dashboard_dados_obj;
alter table public.dashboard_dados add  constraint dashboard_dados_obj check (jsonb_typeof(dados) = 'object');

-- =====================================================================
-- CONFERÊNCIA (rode cada bloco separado e compare com o esperado)
-- =====================================================================

-- A) Tabela com RLS ligado.  Esperado: rowsecurity = true
select schemaname, tablename, rowsecurity
from pg_tables where schemaname = 'public' and tablename = 'dashboard_dados';

-- B) Políticas.  Esperado: dashboard_select (SELECT), dashboard_insert (INSERT), dashboard_update (UPDATE)
select policyname, cmd, roles
from pg_policies where schemaname = 'public' and tablename = 'dashboard_dados' order by cmd;

-- C) Quem é admin ativo.  Esperado: seu usuário com papel = admin e ativo = true
select p.login, p.papel, p.ativo, u.email
from public.perfis p join auth.users u on u.id = p.id order by p.criado_em;

-- D) O que está publicado hoje (sem trazer o JSON inteiro)
select id, arquivo, atualizado_em, atualizado_por,
       jsonb_array_length(dados->'r') as lancamentos,
       jsonb_array_length(dados->'i') as investimentos,
       jsonb_array_length(dados->'c') as contas
from public.dashboard_dados;

-- E) TESTE de gravação como se fosse o admin (nada fica salvo: termina em rollback).
--    Troque COLE_O_ID_DO_ADMIN pelo id do admin (resultado do bloco C: select id ... ou Authentication > Users).
--    Esperado: devolve 1 linha com arquivo = 'teste'. Se der "row-level security", o usuário não é admin ativo.
begin;
  set local role authenticated;
  select set_config('request.jwt.claims', '{"sub":"COLE_O_ID_DO_ADMIN","role":"authenticated"}', true);
  insert into public.dashboard_dados (id, dados, arquivo)
  values (1, '{"r":[]}'::jsonb, 'teste')
  on conflict (id) do update set dados = excluded.dados, arquivo = excluded.arquivo
  returning id, arquivo, atualizado_em, atualizado_por;
rollback;
