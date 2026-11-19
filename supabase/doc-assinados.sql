-- =====================================================================
-- DOC ASSINADOS (relatório novo no menu: documentos assinados do REIDI, do FUNDO DE RESERVA e do FLUXO DE CAIXA)
-- Rode UMA vez no SQL Editor do Supabase (é seguro rodar de novo).
-- Pré-requisito: schema-consorcio-santadulce.sql (tabelas perfis/auditoria e a função is_admin()). Não depende dos demais scripts.
--
-- O QUE É
--   • public.docs_assinados → um registro por arquivo anexado: categoria (REIDI, Fundo de Reserva ou Fluxo de Caixa), referência (texto livre, opcional),
--     nome, tipo, tamanho, quem anexou e quando.
--   • Storage · bucket PRIVADO 'docs-assinados' → os arquivos (PDF, PNG, JPG ou WEBP, até 10 MB cada).
--   Na tela "Doc Assinados" o administrador anexa o documento já assinado, escolhe a categoria e o abre ali mesmo, sem baixar, para conferir.
--   Os documentos que já foram anexados pelo botão "Doc. Assinados" do REIDI (reidi-docs-assinados.sql) continuam onde estão e aparecem na aba REIDI.
--
-- QUEM PODE
--   Somente o ADMINISTRADOR ativo (a mesma regra do botão "Doc. Assinados" do REIDI): ver a lista, abrir/baixar, anexar e excluir.
--   Tudo é aplicado AQUI, no banco (RLS e regras do armazenamento): quem não é administrador não recebe a lista nem os arquivos,
--   mesmo que abra o endereço direto ou use a API.
--
-- GARANTIAS DO BANCO (ninguém pula pela tela)
--   • Categoria só uma das três · só PDF, PNG, JPG ou WEBP · tamanho de 1 byte a 10 MB · nome de 1 a 200 caracteres e referência de 1 a 120
--     (sem quebra de linha nem outros caracteres de controle) · caminho do arquivo único e no formato do sistema.
--   • Quem anexou e quando são carimbados pelo banco (a tela não consegue informar outro autor).
--   • O documento anexado NUNCA é alterado: não existe regra de alteração nem no registro nem no arquivo. Para trocar, exclua e anexe de novo.
--   • Cada anexo e cada exclusão vai para a Auditoria (gatilho no banco), com a categoria.
--
-- DEPOIS DE RODAR: suba o site novo (o item "Doc Assinados" aparece no menu, só para administradores). Nenhuma permissão nova a marcar.
-- =====================================================================

-- 0) Pré-requisitos ----------------------------------------------------------------------------
do $$
begin
  if to_regprocedure('public.is_admin()') is null or to_regclass('public.auditoria') is null or to_regclass('public.perfis') is null then
    raise exception 'Rode antes o schema-consorcio-santadulce.sql: faltam as tabelas perfis/auditoria e a função is_admin().' using errcode = '55000';
  end if;
  if to_regclass('storage.buckets') is null then
    raise exception 'O armazenamento (Storage) do Supabase não está disponível neste banco.' using errcode = '55000';
  end if;
end $$;

-- 1) Tabela -----------------------------------------------------------------------------------
create table if not exists public.docs_assinados (
  id              uuid        primary key default gen_random_uuid(),
  categoria       text        not null,                       -- 'reidi' | 'fundo_reserva' | 'fluxo_caixa'
  referencia      text,                                       -- a que se refere (ex.: "Termo 001/2026 · NF 00000004"); opcional
  nome            text        not null,                       -- nome do arquivo como o usuário o conhece
  path            text        not null,                       -- caminho no bucket 'docs-assinados'
  tipo            text        not null,                       -- tipo do arquivo (mime)
  bytes           bigint      not null,
  criado_por      uuid        default auth.uid(),
  criado_por_nome text,
  criado_em       timestamptz not null default now(),
  constraint docs_assinados_categoria_check  check (categoria in ('reidi', 'fundo_reserva', 'fluxo_caixa')),
  constraint docs_assinados_referencia_check check (referencia is null or char_length(referencia) between 1 and 120),
  constraint docs_assinados_nome_check       check (char_length(btrim(nome)) between 1 and 200),
  constraint docs_assinados_path_check       check (path ~ '^[0-9a-f]{32}\.(pdf|png|jpg|jpeg|webp)$'),
  constraint docs_assinados_tipo_check       check (tipo in ('application/pdf', 'image/png', 'image/jpeg', 'image/webp')),
  constraint docs_assinados_bytes_check      check (bytes > 0 and bytes <= 10485760),
  constraint docs_assinados_path_uq          unique (path)
);
comment on table public.docs_assinados is 'Doc Assinados: documentos assinados (REIDI, Fundo de Reserva, Fluxo de Caixa) anexados pelo administrador (arquivos no bucket docs-assinados).';
create index if not exists docs_assinados_cat_idx on public.docs_assinados (categoria, criado_em desc);

-- 2) ANTES de gravar: limpa nome e referência (sem caracteres de controle nem espaços nas pontas; referência vazia vira nulo) e carimba autor e data ----
create or replace function public.docs_assinados_antes()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_nome text;
begin
  select nome into v_nome from public.perfis where id = auth.uid();
  new.nome            := btrim(regexp_replace(coalesce(new.nome, ''), '[[:cntrl:]]+', ' ', 'g'));
  new.referencia      := nullif(btrim(regexp_replace(coalesce(new.referencia, ''), '[[:cntrl:]]+', ' ', 'g')), '');
  new.criado_por      := auth.uid();
  new.criado_por_nome := coalesce(v_nome, new.criado_por_nome);
  new.criado_em       := now();
  return new;
end;
$$;

drop trigger if exists trg_docs_assinados_antes on public.docs_assinados;
create trigger trg_docs_assinados_antes
  before insert on public.docs_assinados
  for each row execute function public.docs_assinados_antes();

-- 3) Auditoria gravada pelo banco (anexou / excluiu) ------------------------------------------------------
create or replace function public.docs_assinados_auditoria()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_login text; r public.docs_assinados; v_cat text;
begin
  select login into v_login from public.perfis where id = auth.uid();
  if tg_op = 'DELETE' then r := old; else r := new; end if;
  v_cat := case r.categoria when 'reidi' then 'REIDI' when 'fundo_reserva' then 'Fundo de Reserva' when 'fluxo_caixa' then 'Fluxo de Caixa' else r.categoria end;
  insert into public.auditoria (usuario, evento)
  values (coalesce(v_login, 'sistema'),
          left(case tg_op when 'INSERT' then 'Doc Assinados: anexou documento (' else 'Doc Assinados: excluiu documento (' end || v_cat || ') ' || left(r.nome, 120), 200));
  return null;
end;
$$;

drop trigger if exists trg_docs_assinados_auditoria on public.docs_assinados;
create trigger trg_docs_assinados_auditoria
  after insert or delete on public.docs_assinados
  for each row execute function public.docs_assinados_auditoria();

-- 4) Armazenamento dos arquivos: bucket PRIVADO ---------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('docs-assinados', 'docs-assinados', false, 10485760,
        array['application/pdf', 'image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 5) Regras de acesso (RLS) e do armazenamento — SÓ ADMINISTRADOR ---------------------------------------
-- Não há regra de alteração (UPDATE): o documento anexado nunca é sobrescrito.
alter table public.docs_assinados enable row level security;
revoke all on table public.docs_assinados from anon, authenticated;
grant select, insert, delete on table public.docs_assinados to authenticated;

drop policy if exists docs_ass_select on public.docs_assinados;
create policy docs_ass_select on public.docs_assinados for select to authenticated using (public.is_admin());
drop policy if exists docs_ass_insert on public.docs_assinados;
create policy docs_ass_insert on public.docs_assinados for insert to authenticated with check (public.is_admin());
drop policy if exists docs_ass_delete on public.docs_assinados;
create policy docs_ass_delete on public.docs_assinados for delete to authenticated using (public.is_admin());

-- arquivos: ver/baixar, enviar e apagar (sem UPDATE)
drop policy if exists docs_ass_arq_select on storage.objects;
create policy docs_ass_arq_select on storage.objects for select to authenticated
  using (bucket_id = 'docs-assinados' and public.is_admin());
drop policy if exists docs_ass_arq_insert on storage.objects;
create policy docs_ass_arq_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'docs-assinados' and public.is_admin());
drop policy if exists docs_ass_arq_delete on storage.objects;
create policy docs_ass_arq_delete on storage.objects for delete to authenticated
  using (bucket_id = 'docs-assinados' and public.is_admin());

-- Conferência (rode separado, uma consulta por vez — o editor mostra só o resultado da última):
--   1) a tabela e o armazenamento existem (2 linhas: a tabela com rls = true e o bucket com privado = true):
--        select 'tabela' as tipo, relname as nome, relrowsecurity as ok from pg_class where relname = 'docs_assinados' and relnamespace = 'public'::regnamespace
--        union all select 'bucket', id, not public from storage.buckets where id = 'docs-assinados';
--   2) regras de acesso (6 linhas; todas com so_admin = true):
--        select tablename as tabela, policyname as regra, cmd as comando,
--               (coalesce(qual, '') || ' ' || coalesce(with_check, '')) ~ 'is_admin' as so_admin
--          from pg_policies
--         where (schemaname = 'public' and tablename = 'docs_assinados')
--            or (schemaname = 'storage' and tablename = 'objects' and policyname like 'docs_ass_arq_%')
--         order by 1, 3, 2;
--   3) depois de anexar pela tela:
--        select categoria, referencia, nome, tipo, bytes, criado_por_nome, criado_em from public.docs_assinados order by criado_em desc;
