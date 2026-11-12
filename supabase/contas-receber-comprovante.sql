-- =====================================================================
-- CONTAS A RECEBER · COMPROVANTE DE RECEBIMENTO DO BANCO (pedido AI)
-- Rode UMA vez no SQL Editor do Supabase (é seguro rodar de novo).
-- Pré-requisitos: contas-receber.sql e permissoes.sql já instalados (é o caso de quem usa o Contas a Receber com permissões por usuário).
--
--  • Cada RECEBIMENTO lançado (public.recebimentos) pode ter UM comprovante do banco: o arquivo (PDF, PNG, JPG ou WEBP, até 10 MB) guardado no
--    bucket PRIVADO 'recebimentos-comprovantes'. É opcional: os recebimentos que já existem ficam sem comprovante até alguém anexar.
--  • Trocar ou remover o comprovante NÃO apaga o anterior: o banco guarda o arquivo que saiu em "comprovantes_anteriores" (quem anexou, quando,
--    quem substituiu) e ele continua disponível para visualizar e baixar. Excluir o RECEBIMENTO exclui também os arquivos dele.
--  • Quem pode (as mesmas permissões do Contas a Receber — nada novo para marcar na tela Usuários):
--        receber.ver     → ver, visualizar e baixar os comprovantes
--        receber.lancar  → anexar, trocar e remover o comprovante (junto com registrar/editar o recebimento)
--        receber.excluir → excluir o recebimento (e, com ele, os arquivos)
--  • Quem anexou/trocou e quando é carimbado pelo banco (não dá para falsificar pela tela) e cada anexo/troca/remoção vai para a Auditoria.
--  • Rodar este arquivo ANTES de publicar o site novo (ou depois) não quebra nada: sem as colunas, o site só avisa que falta rodar o arquivo
--    ao tentar anexar um comprovante; registrar, editar e excluir recebimentos continuam como sempre.
-- =====================================================================

do $$
begin
  if to_regprocedure('public.tem_permissao(text)') is null then
    raise exception 'Rode antes o permissoes.sql (permissões por usuário): este script depende dele.' using errcode = '55000';
  end if;
  if to_regclass('public.recebimentos') is null then
    raise exception 'Rode antes o contas-receber.sql: falta a tabela de recebimentos.' using errcode = '55000';
  end if;
  if to_regclass('public.auditoria') is null or to_regclass('public.perfis') is null then
    raise exception 'Rode antes o schema-consorcio-santadulce.sql: faltam as tabelas perfis/auditoria.' using errcode = '55000';
  end if;
  if to_regclass('storage.buckets') is null then
    raise exception 'O armazenamento (Storage) do Supabase não está disponível neste banco.' using errcode = '55000';
  end if;
end $$;

-- 1) Colunas do comprovante -------------------------------------------------------------------------------
alter table public.recebimentos
  add column if not exists comprovante_path        text,                                          -- caminho no bucket 'recebimentos-comprovantes' (arquivo vigente)
  add column if not exists comprovante_nome        text,
  add column if not exists comprovante_tipo        text,
  add column if not exists comprovante_bytes       bigint,
  add column if not exists comprovante_em          timestamptz,                                   -- quando o arquivo vigente foi anexado
  add column if not exists comprovante_por_nome    text,
  add column if not exists comprovantes_anteriores jsonb not null default '[]'::jsonb;            -- arquivos substituídos/removidos (nada é apagado)

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.recebimentos'::regclass and conname = 'recebimentos_comprovante_path_check') then
    alter table public.recebimentos add constraint recebimentos_comprovante_path_check
      check (comprovante_path is null or char_length(btrim(comprovante_path)) > 0);
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.recebimentos'::regclass and conname = 'recebimentos_comprovante_bytes_check') then
    alter table public.recebimentos add constraint recebimentos_comprovante_bytes_check
      check (comprovante_bytes is null or comprovante_bytes >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.recebimentos'::regclass and conname = 'recebimentos_comprovantes_ant_check') then
    alter table public.recebimentos add constraint recebimentos_comprovantes_ant_check
      check (jsonb_typeof(comprovantes_anteriores) = 'array');
  end if;
end $$;

comment on column public.recebimentos.comprovante_path is 'Contas a Receber: arquivo do comprovante do banco (bucket recebimentos-comprovantes). Nulo = sem comprovante.';

-- 2) Carimbo e histórico do comprovante (mesmo gatilho de antes, agora também cuida do arquivo) ---------------
-- quem chama não define a autoria nem o histórico: o arquivo vigente que sai vai para "comprovantes_anteriores"
create or replace function public.recebimentos_carimbo()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_nome text;
begin
  select nome into v_nome from public.perfis where id = auth.uid();
  if tg_op = 'INSERT' then
    new.criado_por      := auth.uid();
    new.criado_por_nome := coalesce(v_nome, new.criado_por_nome);
    new.criado_em       := now();
  else
    new.criado_por      := old.criado_por;
    new.criado_por_nome := old.criado_por_nome;
    new.criado_em       := old.criado_em;
  end if;
  new.titulo              := btrim(coalesce(new.titulo, ''));
  new.obs                 := btrim(coalesce(new.obs, ''));
  new.atualizado_por      := auth.uid();
  new.atualizado_por_nome := coalesce(v_nome, new.atualizado_por_nome);
  new.atualizado_em       := now();

  -- comprovante do banco
  new.comprovante_path := nullif(btrim(coalesce(new.comprovante_path, '')), '');
  if tg_op = 'INSERT' then
    new.comprovantes_anteriores := '[]'::jsonb;
    if new.comprovante_path is not null then
      new.comprovante_nome  := coalesce(nullif(btrim(new.comprovante_nome), ''), 'comprovante');
      new.comprovante_tipo  := coalesce(new.comprovante_tipo, '');
      new.comprovante_bytes := coalesce(new.comprovante_bytes, 0);
      new.comprovante_em    := now();
      new.comprovante_por_nome := v_nome;
    else
      new.comprovante_nome := null; new.comprovante_tipo := null; new.comprovante_bytes := null;
      new.comprovante_em := null;   new.comprovante_por_nome := null;
    end if;
  elsif new.comprovante_path is not distinct from old.comprovante_path then
    -- o arquivo não mudou: nada do comprovante pode ser alterado por quem chama
    new.comprovante_nome     := old.comprovante_nome;
    new.comprovante_tipo     := old.comprovante_tipo;
    new.comprovante_bytes    := old.comprovante_bytes;
    new.comprovante_em       := old.comprovante_em;
    new.comprovante_por_nome := old.comprovante_por_nome;
    new.comprovantes_anteriores := old.comprovantes_anteriores;
  else
    new.comprovantes_anteriores := coalesce(old.comprovantes_anteriores, '[]'::jsonb)
      || case when old.comprovante_path is null then '[]'::jsonb
              else jsonb_build_array(jsonb_build_object(
                     'path', old.comprovante_path, 'nome', old.comprovante_nome, 'tipo', old.comprovante_tipo, 'bytes', old.comprovante_bytes,
                     'anexado_em', old.comprovante_em, 'anexado_por', old.comprovante_por_nome,
                     'substituido_em', now(), 'substituido_por', v_nome)) end;
    if new.comprovante_path is null then
      new.comprovante_nome := null; new.comprovante_tipo := null; new.comprovante_bytes := null;
      new.comprovante_em := null;   new.comprovante_por_nome := null;
    else
      new.comprovante_nome  := coalesce(nullif(btrim(new.comprovante_nome), ''), 'comprovante');
      new.comprovante_tipo  := coalesce(new.comprovante_tipo, '');
      new.comprovante_bytes := coalesce(new.comprovante_bytes, 0);
      new.comprovante_em    := now();
      new.comprovante_por_nome := v_nome;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_recebimentos_carimbo on public.recebimentos;
create trigger trg_recebimentos_carimbo
  before insert or update on public.recebimentos
  for each row execute function public.recebimentos_carimbo();

-- 3) Auditoria (a mesma de antes + o que aconteceu com o comprovante) -----------------------------------------
create or replace function public.recebimentos_auditoria()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_login text; v_ev text; r public.recebimentos;
begin
  select login into v_login from public.perfis where id = auth.uid();
  if tg_op = 'DELETE' then r := old; else r := new; end if;
  v_ev := case tg_op when 'INSERT' then 'Contas a Receber: registrou recebimento ' when 'UPDATE' then 'Contas a Receber: alterou recebimento ' else 'Contas a Receber: excluiu recebimento ' end
       || public.fmt_brl(r.valor) || ' · título ' || coalesce(nullif(r.titulo, ''), '—') || ' · Data_Base ' || to_char(r.data_base, 'DD/MM/YYYY')
       || ' · recebido em ' || to_char(r.data_recebimento, 'DD/MM/YYYY');
  if tg_op = 'UPDATE' and (old.valor is distinct from new.valor or old.data_recebimento is distinct from new.data_recebimento) then
    v_ev := v_ev || ' (antes: ' || public.fmt_brl(old.valor) || ' em ' || to_char(old.data_recebimento, 'DD/MM/YYYY') || ')';
  end if;
  if tg_op = 'INSERT' and r.comprovante_path is not null then
    v_ev := v_ev || ' · comprovante ' || left(coalesce(r.comprovante_nome, '—'), 40);
  elsif tg_op = 'UPDATE' and new.comprovante_path is distinct from old.comprovante_path then
    v_ev := v_ev || case when new.comprovante_path is null then ' · comprovante removido'
                         when old.comprovante_path is null then ' · comprovante anexado: ' || left(coalesce(new.comprovante_nome, '—'), 40)
                         else ' · comprovante substituído por ' || left(coalesce(new.comprovante_nome, '—'), 40) end;
  end if;
  insert into public.auditoria (usuario, evento) values (coalesce(v_login, 'sistema'), left(v_ev, 200));
  return null;
end;
$$;

drop trigger if exists trg_recebimentos_auditoria on public.recebimentos;
create trigger trg_recebimentos_auditoria
  after insert or update or delete on public.recebimentos
  for each row execute function public.recebimentos_auditoria();

-- 4) Armazenamento dos comprovantes: bucket PRIVADO ----------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('recebimentos-comprovantes', 'recebimentos-comprovantes', false, 10485760,
        array['application/pdf', 'image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 5) Regras do armazenamento — POR PERMISSÃO (a tabela recebimentos já tem as regras do permissoes.sql) ------------
-- Fica numa função para poder ser reaplicada (permissoes.sql chama esta função dentro de aplicar_politicas_permissoes()).
-- Não há regra de UPDATE no armazenamento: o comprovante enviado nunca é sobrescrito (trocar o comprovante grava um arquivo novo).
-- Quem só tem receber.lancar não apaga arquivo: remover/trocar o comprovante só o move para o histórico.
create or replace function public.receber_comprovantes_politicas()
returns void language plpgsql set search_path = public as $$
begin
  drop policy if exists receber_comp_select on storage.objects;
  create policy receber_comp_select on storage.objects for select to authenticated
    using (bucket_id = 'recebimentos-comprovantes' and public.tem_permissao('receber.ver'));
  drop policy if exists receber_comp_insert on storage.objects;
  create policy receber_comp_insert on storage.objects for insert to authenticated
    with check (bucket_id = 'recebimentos-comprovantes' and public.tem_permissao('receber.lancar'));
  drop policy if exists receber_comp_delete on storage.objects;
  create policy receber_comp_delete on storage.objects for delete to authenticated
    using (bucket_id = 'recebimentos-comprovantes' and public.tem_permissao('receber.excluir'));
end;
$$;
revoke execute on function public.receber_comprovantes_politicas() from public, anon, authenticated;   -- só o administrador do banco (SQL Editor) reaplica as regras
select public.receber_comprovantes_politicas();

-- (permissões por usuário) reaplica as regras por permissão de tudo, já incluindo esta
do $$ begin
  if to_regprocedure('public.aplicar_politicas_permissoes()') is not null then perform public.aplicar_politicas_permissoes(); end if;
end $$;

-- Conferência (rode UMA consulta por vez, depois deste script):
--   1) colunas criadas (deve listar 7 linhas):
--        select column_name from information_schema.columns where table_schema = 'public' and table_name = 'recebimentos' and column_name like 'comprovante%' order by 1;
--   2) bucket privado (public = false, limite 10485760):
--        select id, public, file_size_limit, allowed_mime_types from storage.buckets where id = 'recebimentos-comprovantes';
--   3) regras do armazenamento (3 linhas, todas com por_permissao = true):
--        select policyname, cmd, (coalesce(qual, '') || ' ' || coalesce(with_check, '')) ~ 'tem_permissao' as por_permissao
--        from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'receber_comp_%' order by 1;
--   4) quantos recebimentos já têm comprovante:
--        select count(*) filter (where comprovante_path is not null) as com_comprovante, count(*) as total from public.recebimentos;
