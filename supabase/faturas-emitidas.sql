-- =====================================================================
-- FATURAS EMITIDAS · notas fiscais (NF) anexadas por competência
-- Rode UMA vez no SQL Editor do Supabase, DEPOIS de schema-consorcio-santadulce.sql,
-- bases-dados.sql e reidi-lancamentos.sql. É seguro rodar de novo.
--
--  • novo perfil de acesso 'faturamento': enxerga SOMENTE o módulo "Faturas Emitidas"
--  • public.faturas_emitidas → uma linha por NF. A "Data da Emissão" (coluna competencia) é a data em que a NF foi
--    emitida (o mês dela define a competência). O "Valor Bruto" (coluna valor_bruto) é o valor bruto da NF em R$ (opcional no banco:
--    NFs anexadas antes deste campo ficam sem valor até alguém editar). Dois tipos de alteração, ambos controlados por gatilho (ninguém consegue pular):
--      AJUSTE (sem trocar o arquivo, ex.: data digitada errada) → NÃO precisa de justificativa e não cria versão;
--        só Data da Emissão, nº, Valor Bruto e observação mudam; fica gravado quem ajustou e quando (editado_por_nome / editado_em).
--      REFATURAMENTO (arquivo novo) → exige o motivo, sobe a versão e guarda a anterior na coluna "historico".
--  • Storage · bucket PRIVADO 'faturas-nf' → o arquivo da NF (PDF, XML, PNG ou JPG, até 10 MB)
--  • O Fundo de Reserva lê a NF da competência do mês selecionado para o usuário baixar
--
-- QUEM FAZ O QUÊ
--   faturamento → anexa NF, corrige / refatura (a anterior vai para o histórico) e baixa. Não lê mais nada do sistema.
--   admin       → tudo, inclusive excluir uma NF
--   viewer      → só consulta e baixa (Faturas Emitidas e Fundo de Reserva)
--   lancador    → não enxerga as NFs (continua só com REIDI / Projeção REIDI)
--
-- IMPORTANTE: depois deste script, publique de novo a Edge Function admin-usuarios
-- (supabase/functions/admin-usuarios/index.ts) para ela aceitar o perfil 'faturamento'.
-- (permissões por usuário) este script recria regras de acesso POR PERFIL; se o sistema de permissões (permissoes.sql) já estiver instalado,
-- ele termina reaplicando as regras POR PERMISSÃO automaticamente (bloco "permissões por usuário" no fim do arquivo).
-- =====================================================================

-- 1) Perfil 'faturamento' -------------------------------------------------
alter table public.perfis drop constraint if exists perfis_papel_check;
alter table public.perfis add  constraint perfis_papel_check
  check (papel in ('admin', 'viewer', 'lancador', 'faturamento'));

-- 2) Funções de apoio ----------------------------------------------------
create or replace function public.is_faturamento()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.perfis
                 where id = auth.uid() and papel = 'faturamento' and ativo = true);
$$;

-- quem pode consultar / baixar as NFs: admin, visualizador e faturamento (o Lançador REIDI não)
create or replace function public.pode_ver_faturas()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.perfis
                 where id = auth.uid() and papel in ('admin', 'viewer', 'faturamento') and ativo = true);
$$;

revoke execute on function public.is_faturamento()   from public, anon;
revoke execute on function public.pode_ver_faturas() from public, anon;
grant  execute on function public.is_faturamento()   to authenticated;
grant  execute on function public.pode_ver_faturas() to authenticated;

-- 3) O perfil Faturamento NÃO lê as demais bases (garante o acesso só a "Faturas Emitidas") -------------
drop policy if exists bases_select on public.bases;
create policy bases_select on public.bases
  for select to authenticated
  using (public.is_leitor() or (public.is_lancador() and chave = 'reidi_config'));

do $$
begin
  if to_regclass('public.dashboard_dados') is not null then
    execute 'drop policy if exists dashboard_select on public.dashboard_dados';
    execute 'create policy dashboard_select on public.dashboard_dados for select to authenticated using (public.is_leitor())';
  end if;
  if to_regclass('public.reidi_compras') is not null then
    execute 'drop policy if exists reidi_select on public.reidi_compras';
    execute 'create policy reidi_select on public.reidi_compras for select to authenticated using (public.is_leitor() or public.is_lancador())';
  end if;
end $$;

-- 4) Tabela das NFs ------------------------------------------------------
create table if not exists public.faturas_emitidas (
  id                  uuid primary key default gen_random_uuid(),
  competencia         date          not null check (competencia >= date '2000-01-01'),   -- Data da Emissão (data em que a NF foi emitida); o mês/ano dela é a competência
  numero              text          not null default '',                                  -- nº da NF (opcional)
  valor_bruto         numeric(16,2) check (valor_bruto is null or valor_bruto > 0),       -- valor bruto da NF em R$ (a tela exige para NF nova; NFs antigas ficam vazias)
  obs                 text          not null default '',
  arquivo_path        text          not null check (length(btrim(arquivo_path)) > 0),     -- caminho do arquivo no bucket 'faturas-nf'
  arquivo_nome        text          not null,
  arquivo_tipo        text          not null default '',
  arquivo_bytes       bigint        not null default 0 check (arquivo_bytes >= 0),
  versao              integer       not null default 1,                                   -- 1 = NF original · 2, 3... = refaturada
  motivo              text          not null default '',                                  -- motivo da última correção / refaturamento
  correcao_motivo     text,                                                               -- campo de ENTRADA: o site envia aqui o motivo de cada REFATURAMENTO; o gatilho copia para "motivo" e zera
  historico           jsonb         not null default '[]'::jsonb check (jsonb_typeof(historico) = 'array'),   -- versões substituídas (mais antiga primeiro)
  criado_por          uuid          default auth.uid(),
  criado_por_nome     text,
  criado_em           timestamptz   not null default now(),
  atualizado_por      uuid,
  atualizado_por_nome text,
  atualizado_em       timestamptz   not null default now(),                               -- quando o arquivo vigente foi anexado (não muda em ajustes)
  editado_por_nome    text,                                                               -- último AJUSTE de data / nº / observação (sem justificativa)
  editado_em          timestamptz
);

-- (caso a tabela tenha sido criada por uma versão anterior deste script)
alter table public.faturas_emitidas add column if not exists correcao_motivo text;
alter table public.faturas_emitidas add column if not exists editado_por_nome text;
alter table public.faturas_emitidas add column if not exists editado_em timestamptz;
alter table public.faturas_emitidas add column if not exists valor_bruto numeric(16,2);   -- Valor Bruto da NF
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.faturas_emitidas'::regclass and conname = 'faturas_emitidas_valor_bruto_check') then
    alter table public.faturas_emitidas add constraint faturas_emitidas_valor_bruto_check check (valor_bruto is null or valor_bruto > 0);
  end if;
end $$;

create index if not exists faturas_emitidas_competencia_idx on public.faturas_emitidas (competencia);

-- Carimbo + histórico.
--   INSERT = NF nova (versão 1).
--   UPDATE sem trocar o arquivo = AJUSTE (ex.: Data da Emissão digitada errada): não exige justificativa, não cria versão;
--     só competencia (Data da Emissão), numero, valor_bruto e obs mudam — o resto volta ao que era — e o gatilho grava quem ajustou e quando.
--   UPDATE com arquivo novo = REFATURAMENTO: exige o motivo (enviado em correcao_motivo A CADA refaturamento), sobe a versão
--     e guarda a versão substituída em "historico".
-- Quem criou e quando nunca muda; versão e histórico não podem ser definidos por quem chama.
create or replace function public.faturas_emitidas_carimbo()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_nome text;
begin
  select nome into v_nome from public.perfis where id = auth.uid();

  if tg_op = 'INSERT' then
    new.versao              := 1;
    new.motivo              := '';
    new.correcao_motivo     := null;
    new.historico           := '[]'::jsonb;
    new.editado_por_nome    := null;
    new.editado_em          := null;
    new.criado_por          := auth.uid();
    new.criado_por_nome     := coalesce(v_nome, new.criado_por_nome);
    new.criado_em           := now();
    new.atualizado_por      := auth.uid();
    new.atualizado_por_nome := coalesce(v_nome, new.atualizado_por_nome);
    new.atualizado_em       := now();
    return new;
  end if;

  -- nunca mudam
  new.id              := old.id;
  new.criado_por      := old.criado_por;
  new.criado_por_nome := old.criado_por_nome;
  new.criado_em       := old.criado_em;

  if new.arquivo_path is not distinct from old.arquivo_path then
    -- AJUSTE: o arquivo é o mesmo. Sem justificativa, sem nova versão.
    new.arquivo_nome        := old.arquivo_nome;
    new.arquivo_tipo        := old.arquivo_tipo;
    new.arquivo_bytes       := old.arquivo_bytes;
    new.versao              := old.versao;
    new.motivo              := old.motivo;
    new.historico           := old.historico;
    new.correcao_motivo     := null;
    new.atualizado_por      := old.atualizado_por;
    new.atualizado_por_nome := old.atualizado_por_nome;
    new.atualizado_em       := old.atualizado_em;
    if new.competencia is distinct from old.competencia
       or new.numero      is distinct from old.numero
       or new.valor_bruto is distinct from old.valor_bruto
       or new.obs         is distinct from old.obs then
      new.editado_por_nome := coalesce(v_nome, old.editado_por_nome);
      new.editado_em       := now();
    else
      new.editado_por_nome := old.editado_por_nome;
      new.editado_em       := old.editado_em;
    end if;
    return new;
  end if;

  -- REFATURAMENTO: arquivo novo
  if btrim(coalesce(new.correcao_motivo, '')) = '' then
    raise exception 'Informe o motivo da correção (refaturamento).' using errcode = '22023';
  end if;
  new.motivo          := btrim(new.correcao_motivo);
  new.correcao_motivo := null;
  new.versao          := old.versao + 1;
  new.historico       := coalesce(old.historico, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
    'versao',        old.versao,
    'competencia',   old.competencia,
    'numero',        old.numero,
    'valor_bruto',   old.valor_bruto,
    'arquivo_path',  old.arquivo_path,
    'arquivo_nome',  old.arquivo_nome,
    'arquivo_tipo',  old.arquivo_tipo,
    'arquivo_bytes', old.arquivo_bytes,
    'anexado_por',   coalesce(old.atualizado_por_nome, old.criado_por_nome),
    'anexado_em',    old.atualizado_em,
    'motivo',        new.motivo,
    'substituido_por', v_nome,
    'substituido_em',  now()));
  new.editado_por_nome    := null;      -- a versão nova começa sem ajustes
  new.editado_em          := null;
  new.atualizado_por      := auth.uid();
  new.atualizado_por_nome := coalesce(v_nome, new.atualizado_por_nome);
  new.atualizado_em       := now();
  return new;
end;
$$;

drop trigger if exists trg_faturas_emitidas_carimbo on public.faturas_emitidas;
create trigger trg_faturas_emitidas_carimbo
  before insert or update on public.faturas_emitidas
  for each row execute function public.faturas_emitidas_carimbo();

alter table public.faturas_emitidas enable row level security;
revoke all on table public.faturas_emitidas from anon, authenticated;
grant select, insert, update, delete on table public.faturas_emitidas to authenticated;

drop policy if exists faturas_select on public.faturas_emitidas;
create policy faturas_select on public.faturas_emitidas
  for select to authenticated using (public.pode_ver_faturas());

drop policy if exists faturas_insert on public.faturas_emitidas;
create policy faturas_insert on public.faturas_emitidas
  for insert to authenticated
  with check (public.is_admin() or public.is_faturamento());

drop policy if exists faturas_update on public.faturas_emitidas;
create policy faturas_update on public.faturas_emitidas
  for update to authenticated
  using      (public.is_admin() or public.is_faturamento())
  with check (public.is_admin() or public.is_faturamento());

drop policy if exists faturas_delete on public.faturas_emitidas;
create policy faturas_delete on public.faturas_emitidas
  for delete to authenticated using (public.is_admin());

-- 5) Atualização em tempo real (Realtime) ----------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'faturas_emitidas') then
    alter publication supabase_realtime add table public.faturas_emitidas;
  end if;
end $$;

-- 6) Storage: bucket privado com os arquivos das NFs ---------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('faturas-nf', 'faturas-nf', false, 10485760,
        array['application/pdf', 'application/xml', 'text/xml', 'image/png', 'image/jpeg'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- baixar: admin, visualizador e faturamento · enviar: admin e faturamento · apagar arquivo: só admin
-- (não há política de UPDATE: o arquivo enviado nunca é sobrescrito, a correção grava um arquivo novo)
drop policy if exists faturas_nf_select on storage.objects;
create policy faturas_nf_select on storage.objects
  for select to authenticated
  using (bucket_id = 'faturas-nf' and public.pode_ver_faturas());

drop policy if exists faturas_nf_insert on storage.objects;
create policy faturas_nf_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'faturas-nf' and (public.is_admin() or public.is_faturamento()));

drop policy if exists faturas_nf_delete on storage.objects;
create policy faturas_nf_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'faturas-nf' and public.is_admin());

-- (permissões por usuário) se o permissoes.sql já foi instalado, reaplica as regras por permissão por cima das regras por perfil criadas acima
do $$ begin
  if to_regprocedure('public.aplicar_politicas_permissoes()') is not null then perform public.aplicar_politicas_permissoes(); end if;
end $$;

-- Conferência (rode separado depois):
--   select competencia, numero, arquivo_nome, versao, jsonb_array_length(historico) as versoes_anteriores, criado_por_nome, editado_por_nome, editado_em from public.faturas_emitidas order by competencia;
--   select id, public, file_size_limit from storage.buckets where id = 'faturas-nf';
--   select login, papel, ativo from public.perfis order by criado_em;
