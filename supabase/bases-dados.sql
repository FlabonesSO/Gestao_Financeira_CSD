-- =====================================================================
-- BASES DOS MÓDULOS (Fundo de Reserva, Programação Financeira Quadrimestral e parâmetros do
-- REIDI) · rode UMA vez no SQL Editor do Supabase.
-- Guarda a última base publicada de cada módulo (e os parâmetros do REIDI);
-- só o admin grava. Depois rode também reidi-lancamentos.sql.
-- (O Dashboard continua usando a tabela dashboard_dados.)
-- Pré-requisito: schema-consorcio-santadulce.sql (perfis e is_admin()).
-- =====================================================================

-- Função auxiliar (idempotente): usuário logado existe em perfis e está ativo
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

create table if not exists public.bases (
  chave          text primary key
                 check (chave in ('fundo_reserva', 'reidi', 'fluxo_projetado', 'reidi_config')),
  dados          jsonb       not null check (jsonb_typeof(dados) = 'object'),
  arquivo        text,
  atualizado_em  timestamptz not null default now(),
  atualizado_por uuid        default auth.uid()
);

alter table public.bases enable row level security;

revoke all on table public.bases from anon, authenticated;
grant select, insert, update on table public.bases to authenticated;

drop policy if exists bases_select on public.bases;
create policy bases_select on public.bases
  for select to authenticated
  using (public.is_ativo());

drop policy if exists bases_insert on public.bases;
create policy bases_insert on public.bases
  for insert to authenticated
  with check (public.is_admin());

drop policy if exists bases_update on public.bases;
create policy bases_update on public.bases
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Carimbo automático (data/hora e quem publicou)
create or replace function public.bases_carimbo()
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

drop trigger if exists trg_bases_carimbo on public.bases;
create trigger trg_bases_carimbo
  before insert or update on public.bases
  for each row execute function public.bases_carimbo();

-- Conferência (rode separado depois):
--   select chave, arquivo, atualizado_em from public.bases order by chave;
