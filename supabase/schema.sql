-- Execute no Supabase: SQL Editor → New query → colar tudo → Run

create table public.perfis (
  id        uuid primary key references auth.users(id) on delete cascade,
  login     text unique not null check (login ~ '^[a-z0-9._-]{3,30}$'),
  nome      text not null,
  papel     text not null default 'viewer' check (papel in ('admin','viewer')),
  ativo     boolean not null default true,
  mc        boolean not null default false,   -- exige troca de senha no próximo acesso
  criado_em timestamptz not null default now()
);

create table public.auditoria (
  id      bigint generated always as identity primary key,
  t       timestamptz not null default now(),
  usuario text not null,
  evento  text not null
);

alter table public.perfis    enable row level security;
alter table public.auditoria enable row level security;

-- Função usada nas políticas (security definer evita recursão de RLS)
create or replace function public.is_admin() returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.perfis where id = auth.uid() and papel = 'admin' and ativo)
$$;

-- O navegador só LÊ. Toda escrita em perfis passa pela Edge Function (service_role) ou pelas funções abaixo.
revoke all on public.perfis, public.auditoria from anon, authenticated;
grant select on public.perfis, public.auditoria to authenticated;

create policy perfis_select    on public.perfis    for select to authenticated using (id = auth.uid() or public.is_admin());
create policy auditoria_select on public.auditoria for select to authenticated using (public.is_admin());

-- Registra evento em nome do usuário logado (o nome não pode ser forjado)
create or replace function public.log_evento(e text) returns void
language sql security definer set search_path = public as $$
  insert into public.auditoria (usuario, evento)
  select login, left(e, 200) from public.perfis where id = auth.uid()
$$;

-- Usuário logado conclui a troca obrigatória de senha
create or replace function public.limpar_mc() returns void
language sql security definer set search_path = public as $$
  update public.perfis set mc = false where id = auth.uid()
$$;

revoke execute on function public.is_admin(), public.log_evento(text), public.limpar_mc() from public, anon;
grant  execute on function public.is_admin(), public.log_evento(text), public.limpar_mc() to authenticated;

-- ============ PRIMEIRO ADMINISTRADOR ============
-- 1) Dashboard → Authentication → Users → Add user → Create new user
--    E-mail: admin@csd.example.com (login "admin" + EMAIL_DOMAIN) · defina uma senha NOVA · marque "Auto Confirm User"
-- 2) Rode o comando abaixo (ajuste login/nome/e-mail se mudou):
--
-- insert into public.perfis (id, login, nome, papel)
-- select id, 'admin', 'Administrador', 'admin' from auth.users where email = 'admin@csd.example.com';
