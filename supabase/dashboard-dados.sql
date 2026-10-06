-- =====================================================================
-- DASHBOARD · base compartilhada (rode UMA vez no SQL Editor do Supabase)
-- Guarda a última planilha publicada pelo admin; todos os usuários
-- ativos leem; só o admin grava. Pré-requisito: schema-consorcio-santadulce.sql
-- (usa public.perfis e public.is_admin()).
-- =====================================================================

create table if not exists public.dashboard_dados (
  id             int primary key default 1 check (id = 1),   -- sempre 1 linha: a base vigente
  dados          jsonb       not null,
  arquivo        text,
  atualizado_em  timestamptz not null default now(),
  atualizado_por uuid        default auth.uid()
);

alter table public.dashboard_dados enable row level security;

revoke all on table public.dashboard_dados from anon, authenticated;
grant select, insert, update on table public.dashboard_dados to authenticated;

-- Leitura: qualquer usuário ativo cadastrado em public.perfis
drop policy if exists dashboard_select on public.dashboard_dados;
create policy dashboard_select on public.dashboard_dados
  for select to authenticated
  using (exists (select 1 from public.perfis p where p.id = auth.uid() and p.ativo = true));

-- Escrita: somente administrador ativo
drop policy if exists dashboard_insert on public.dashboard_dados;
create policy dashboard_insert on public.dashboard_dados
  for insert to authenticated
  with check (public.is_admin());

drop policy if exists dashboard_update on public.dashboard_dados;
create policy dashboard_update on public.dashboard_dados
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Carimbo automático (data/hora e quem publicou), não depende do navegador
create or replace function public.dashboard_carimbo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.atualizado_em  := now();
  new.atualizado_por := auth.uid();
  return new;
end;
$$;

drop trigger if exists trg_dashboard_carimbo on public.dashboard_dados;
create trigger trg_dashboard_carimbo
  before insert or update on public.dashboard_dados
  for each row execute function public.dashboard_carimbo();
