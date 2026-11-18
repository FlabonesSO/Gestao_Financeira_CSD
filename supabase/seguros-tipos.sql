-- =====================================================================
-- SEGUROS · lista de TIPOS DE SEGURO compartilhada, com a opção de EXCLUIR da lista (🗑)
-- Rode UMA vez no SQL Editor do Supabase (é seguro rodar de novo).
-- Pré-requisito: seguros.sql já rodado (rode também o seguros-linhas.sql, se ainda não rodou).
--
-- O QUE MUDA
--   A lista de tipos que aparece nas janelas "＋ Tipo de seguro" e "Nova empresa / Editar empresa" passa a ficar guardada no banco
--   (public.seguros_tipos) e é a MESMA para todos os usuários. Cada tipo que NENHUMA empresa usa ganha o botão 🗑, que o exclui da lista
--   (com confirmação). Um tipo que alguma empresa usa não sai da lista: primeiro retire-o dessas empresas.
--   Quem cadastra uma empresa com um tipo novo (digitado em "Outro tipo") já deixa esse tipo na lista para as próximas.
--   Nada mais muda: empresas, tipos das empresas, pagamentos e comprovantes ficam exatamente como estão.
--
-- COMO A LISTA NASCE (só na primeira vez que este script roda)
--   • as 8 sugestões de sempre (Riscos de Engenharia, Responsabilidade Civil, Garantia (Performance Bond), Vida em Grupo, Patrimonial,
--     Frota / Automóvel, Equipamentos e Transporte de Cargas);
--   • mais os tipos que as empresas já usam.
--   Rodar este script de novo NÃO traz de volta o que você excluiu.
--
-- QUEM PODE (as permissões de Seguros que já existem — nenhuma permissão nova)
--   seg.ver → vê a lista · seg.lancar → acrescenta tipos (é o que acontece ao salvar uma empresa com um tipo novo) · seg.excluir → exclui da lista.
--   A lista só tem "incluir" e "excluir": o banco não deixa renomear um tipo (para corrigir um nome: inclua o certo e exclua o errado).
--   A exclusão fica na Auditoria.
--
-- Se você subir o site novo ANTES de rodar este script, tudo continua funcionando como antes (a lista mostra as 8 sugestões + os tipos em uso);
-- só não aparece o 🗑 — e a janela avisa que falta rodar este arquivo.
-- =====================================================================

-- 0) Pré-requisitos ----------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.seguros_empresas') is null or to_regclass('public.seguros_pagamentos') is null then
    raise exception 'Rode antes o seguros.sql: faltam as tabelas do relatório de Seguros.' using errcode = '55000';
  end if;
  if to_regprocedure('public.tem_permissao(text)') is null then
    raise exception 'Rode antes o permissoes.sql (permissões por usuário): este script depende dele.' using errcode = '55000';
  end if;
end $$;

-- 1) A tabela e a carga inicial (SÓ na primeira vez: depois disso o que você exclui não volta) ---------
do $$
begin
  if to_regclass('public.seguros_tipos') is null then
    create table public.seguros_tipos (
      id              uuid        primary key default gen_random_uuid(),
      nome            text        not null check (char_length(nome) between 1 and 60),   -- o tipo de seguro, como aparece na lista
      criado_por      uuid        default auth.uid(),
      criado_por_nome text,
      criado_em       timestamptz not null default now()
    );
    create unique index seguros_tipos_nome_uq on public.seguros_tipos (lower(nome));    -- sem repetir (maiúsculas/minúsculas não contam)

    -- as sugestões de sempre
    insert into public.seguros_tipos (nome, criado_por, criado_por_nome)
    select s.n, null, 'Carga inicial'
      from unnest(array['Riscos de Engenharia', 'Responsabilidade Civil', 'Garantia (Performance Bond)', 'Vida em Grupo',
                        'Patrimonial', 'Frota / Automóvel', 'Equipamentos', 'Transporte de Cargas']) as s(n)
    on conflict do nothing;

    -- os tipos que as empresas já usam
    insert into public.seguros_tipos (nome, criado_por, criado_por_nome)
    select x.t, null, 'Carga inicial'
      from (select distinct on (lower(u.t)) u.t
              from public.seguros_empresas e, unnest(e.tipos) as u(t)
             where char_length(u.t) between 1 and 60
             order by lower(u.t), u.t) x
    on conflict do nothing;
  end if;
end $$;
comment on table public.seguros_tipos is 'Seguros: lista de tipos de seguro oferecida nas janelas de cadastro (a empresa guarda os seus tipos em seguros_empresas.tipos).';
create unique index if not exists seguros_tipos_nome_uq on public.seguros_tipos (lower(nome));

-- 2) ANTES de gravar: tira espaços extras e carimba autor/data (grava o banco; não dá para falsificar pela tela) -------
create or replace function public.seguros_tipos_antes()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_nome text;
begin
  select nome into v_nome from public.perfis where id = auth.uid();
  new.nome := btrim(regexp_replace(coalesce(new.nome, ''), '\s+', ' ', 'g'));
  if tg_op = 'INSERT' then
    new.criado_por      := auth.uid();
    new.criado_por_nome := coalesce(v_nome, new.criado_por_nome);
    new.criado_em       := now();
  else
    new.id              := old.id;
    new.criado_por      := old.criado_por;
    new.criado_por_nome := old.criado_por_nome;
    new.criado_em       := old.criado_em;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_seguros_tipos_antes on public.seguros_tipos;
create trigger trg_seguros_tipos_antes
  before insert or update on public.seguros_tipos
  for each row execute function public.seguros_tipos_antes();

-- 3) Auditoria da exclusão (gravada pelo banco) --------------------------------------------------------------------
create or replace function public.seguros_tipos_auditoria()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_login text;
begin
  select login into v_login from public.perfis where id = auth.uid();
  insert into public.auditoria (usuario, evento)
  values (coalesce(v_login, 'sistema'), left('Seguros: excluiu da lista o tipo de seguro "' || old.nome || '"', 200));
  return null;
end;
$$;

drop trigger if exists trg_seguros_tipos_auditoria on public.seguros_tipos;
create trigger trg_seguros_tipos_auditoria
  after delete on public.seguros_tipos
  for each row execute function public.seguros_tipos_auditoria();

-- 4) Regras de acesso (RLS) — POR PERMISSÃO ------------------------------------------------------------------------
-- ver = seg.ver · acrescentar = seg.lancar · excluir = seg.excluir. Não há regra (nem permissão de tabela) de UPDATE: o tipo não é renomeado.
alter table public.seguros_tipos enable row level security;
revoke all on table public.seguros_tipos from anon, authenticated;
grant select, insert, delete on table public.seguros_tipos to authenticated;

create or replace function public.seguros_tipos_politicas()
returns void language plpgsql set search_path = public as $$
begin
  drop policy if exists seguros_tipos_select on public.seguros_tipos;
  create policy seguros_tipos_select on public.seguros_tipos for select to authenticated using (public.tem_permissao('seg.ver'));
  drop policy if exists seguros_tipos_insert on public.seguros_tipos;
  create policy seguros_tipos_insert on public.seguros_tipos for insert to authenticated with check (public.tem_permissao('seg.lancar'));
  drop policy if exists seguros_tipos_delete on public.seguros_tipos;
  create policy seguros_tipos_delete on public.seguros_tipos for delete to authenticated using (public.tem_permissao('seg.excluir'));
end;
$$;
revoke execute on function public.seguros_tipos_politicas() from public, anon, authenticated;   -- só o administrador do banco (SQL Editor) reaplica as regras
select public.seguros_tipos_politicas();

-- 5) Atualização em tempo real (Realtime): quem está com a tela aberta vê a lista mudar ------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'seguros_tipos') then
    alter publication supabase_realtime add table public.seguros_tipos;
  end if;
end $$;

notify pgrst, 'reload schema';   -- a API enxerga a tabela nova na hora

-- Conferência (rode separado, uma consulta por vez — o editor mostra só o resultado da última):
--   1) a lista (na primeira vez: as 8 sugestões + os tipos que as empresas já usam):
--        select nome from public.seguros_tipos order by lower(nome);
--   2) regras de acesso (3 linhas; todas com por_permissao = true):
--        select policyname as regra, cmd as comando, (coalesce(qual, '') || ' ' || coalesce(with_check, '')) ~ 'tem_permissao' as por_permissao
--          from pg_policies where schemaname = 'public' and tablename = 'seguros_tipos' order by 2, 1;
