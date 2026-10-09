-- =========================================================
-- SCHEMA COMPLETO DO PROJETO
-- Supabase: louhwynztrwglahiaoim
-- Execute no Supabase > SQL Editor > New query
-- =========================================================

-- 1. TABELA DE PERFIS
create table if not exists public.perfis (
  id        uuid primary key references auth.users(id) on delete cascade,
  login     text unique not null check (login ~ '^[a-z0-9._-]{3,30}$'),
  nome      text not null,
  papel     text not null default 'viewer' check (papel in ('admin', 'viewer', 'lancador')),
  ativo     boolean not null default true,
  mc        boolean not null default false,
  criado_em timestamptz not null default now()
);

-- 2. TABELA DE AUDITORIA
create table if not exists public.auditoria (
  id      bigint generated always as identity primary key,
  t       timestamptz not null default now(),
  usuario text not null,
  evento  text not null
);

-- 3. ROW LEVEL SECURITY
alter table public.perfis enable row level security;
alter table public.auditoria enable row level security;

-- 4. FUNÇÃO PARA IDENTIFICAR ADMINISTRADOR ATIVO
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.perfis
    where id = auth.uid()
      and papel = 'admin'
      and ativo = true
  );
$$;

-- 5. PERMISSÕES DAS TABELAS
revoke all on table public.perfis from anon, authenticated;
revoke all on table public.auditoria from anon, authenticated;

grant select on table public.perfis to authenticated;
grant select on table public.auditoria to authenticated;

-- 6. POLÍTICAS RLS
-- Permite que o usuário veja o próprio perfil e que admins vejam os perfis.
drop policy if exists perfis_select on public.perfis;
create policy perfis_select
on public.perfis
for select
to authenticated
using (
  id = auth.uid()
  or public.is_admin()
);

-- Somente admins podem ler a auditoria.
drop policy if exists auditoria_select on public.auditoria;
create policy auditoria_select
on public.auditoria
for select
to authenticated
using (public.is_admin());

-- 7. REGISTRAR EVENTOS DO USUÁRIO AUTENTICADO
create or replace function public.log_evento(e text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.auditoria (usuario, evento)
  select login, left(e, 200)
  from public.perfis
  where id = auth.uid();
$$;

-- 8. FINALIZAR TROCA OBRIGATÓRIA DE SENHA
create or replace function public.limpar_mc()
returns void
language sql
security definer
set search_path = public
as $$
  update public.perfis
  set mc = false
  where id = auth.uid();
$$;

-- 9. PERMISSÕES DAS FUNÇÕES
revoke execute on function public.is_admin() from public, anon;
revoke execute on function public.log_evento(text) from public, anon;
revoke execute on function public.limpar_mc() from public, anon;

grant execute on function public.is_admin() to authenticated;
grant execute on function public.log_evento(text) to authenticated;
grant execute on function public.limpar_mc() to authenticated;

-- =========================================================
-- 10. CADASTRO DO ADMINISTRADOR ATUAL
-- =========================================================
-- O usuário admin@consorciosantadulce.com.br precisa existir antes no menu:
-- Authentication > Users > Add user > Create new user.
-- Altere somente o e-mail abaixo se estiver usando outro.
-- =========================================================

insert into public.perfis (
  id,
  login,
  nome,
  papel,
  ativo,
  mc
)
select
  u.id,
  'admin',
  'Administrador',
  'admin',
  true,
  false
from auth.users u
where lower(u.email) = lower('admin@consorciosantadulce.com.br')
on conflict (id) do update
set
  login = excluded.login,
  nome = excluded.nome,
  papel = excluded.papel,
  ativo = excluded.ativo,
  mc = excluded.mc;

-- =========================================================
-- 11. CONFERÊNCIA FINAL
-- =========================================================

select
  p.id,
  p.login,
  p.nome,
  p.papel,
  p.ativo,
  p.mc,
  u.email
from public.perfis p
join auth.users u on u.id = p.id
order by p.criado_em;
