-- =====================================================================
-- SEGUROS · empresas responsáveis, tipos de seguro e pagamentos realizados (com comprovante)
-- Rode UMA vez no SQL Editor do Supabase (é seguro rodar de novo).
-- Pré-requisitos: schema-consorcio-santadulce.sql e permissoes.sql (permissões por usuário). Este script roda DEPOIS do permissoes.sql.
--
-- O QUE É
--   • public.seguros_empresas   → cadastro: código, razão social completa, CNPJ e os TIPOS DE SEGURO sob responsabilidade de cada empresa.
--                                 A empresa é cadastrada UMA vez (código e CNPJ únicos); cada tipo de seguro dela aparece como uma LINHA própria na tela,
--                                 e novos tipos são acrescentados à empresa já cadastrada (até 20 tipos por empresa).
--                                 A OBSERVAÇÃO também é por tipo de seguro (coluna obs_tipos): cada linha tem a sua, sem repetir a das outras linhas da mesma empresa.
--   • public.seguros_pagamentos → pagamentos realizados: empresa (escolhida na lista do cadastro), tipo de seguro (opcional), data, valor pago,
--                                 número da parcela, observação e o COMPROVANTE de pagamento (PDF ou imagem, até 10 MB).
--   • Storage · bucket PRIVADO 'seguros-comprovantes' → os arquivos dos comprovantes. Só quem tem a permissão enxerga, visualiza e baixa.
--
-- QUEM PODE (permissões por usuário, marcadas pelo administrador na tela Usuários — o relatório nasce liberado só para administradores)
--   seg.ver      → ver empresas e pagamentos, visualizar e baixar os comprovantes, exportar Excel
--   seg.lancar   → cadastrar/editar empresas e tipos · registrar/editar pagamentos · anexar ou substituir comprovante
--   seg.excluir  → excluir empresas (sem pagamentos) e pagamentos (com os comprovantes)
--   Quem recebe uma ação recebe junto o "ver". Tudo é aplicado AQUI, no banco (RLS e regras do armazenamento): sem a permissão, os dados e os
--   arquivos nem chegam ao navegador, mesmo que alguém abra o endereço direto ou use a API.
--
-- GARANTIAS DO BANCO (ninguém pula pela tela)
--   • CNPJ válido (dígitos verificadores conferidos; aceita também o CNPJ alfanumérico), gravado só com os 14 caracteres e único.
--   • Código único. Tipos de seguro sem repetição (maiúsculas/minúsculas não contam) e sem texto vazio.
--   • Valor pago maior que zero · parcela de 1 a 999 · a data do pagamento não pode ser futura · só empresa ATIVA recebe pagamento novo.
--   • O tipo de seguro de um pagamento precisa ser um dos tipos da empresa.
--   • Um tipo de seguro que já tem pagamentos não pode ser retirado da empresa (altere ou exclua os pagamentos antes).
--   • A observação da empresa é guardada por tipo de seguro (até 300 caracteres em cada um); ao retirar o tipo, a observação dele sai junto.
--   • Autor e data são carimbados pelo banco. Cada inclusão, alteração e exclusão vai para a Auditoria (gatilho).
--   • Comprovante: o arquivo enviado NUNCA é sobrescrito nem apagado ao substituir — o anterior fica guardado em "comprovantes_anteriores".
--   • Uma empresa com pagamentos não pode ser excluída (marque como Inativa para tirá-la da lista de novos pagamentos).
--
-- DEPOIS DE RODAR: suba o site novo e, em Usuários, marque "Seguros" para quem deve usar o relatório.
-- =====================================================================

-- 0) Pré-requisitos ----------------------------------------------------------------------------
do $$
begin
  if to_regprocedure('public.tem_permissao(text)') is null then
    raise exception 'Rode antes o permissoes.sql (permissões por usuário): este script depende dele.' using errcode = '55000';
  end if;
  if to_regclass('public.auditoria') is null or to_regclass('public.perfis') is null then
    raise exception 'Rode antes o schema-consorcio-santadulce.sql: faltam as tabelas perfis/auditoria.' using errcode = '55000';
  end if;
  if to_regclass('storage.buckets') is null then
    raise exception 'O armazenamento (Storage) do Supabase não está disponível neste banco.' using errcode = '55000';
  end if;
end $$;

-- 1) Catálogo de permissões e regra de fechamento (iguais às do permissoes.sql) -----------------------------
create or replace function public.permissoes_validas()
returns text[] language sql immutable set search_path = public as $$
  select array['fundo.ver','fundo.publicar','fat.ver','fat.anexar','fat.excluir','receber.ver','receber.lancar','receber.excluir',
               'reidi.ver','reidi.parametros','lanc.lancar','fluxo.ver','fluxo.publicar','dash.ver','dash.fornecedores','dash.publicar',
               'seg.ver','seg.lancar','seg.excluir']::text[];
$$;

-- quem recebe uma ação recebe junto o "ver" do mesmo relatório; remove repetidos e ordena.
-- "dash.fornecedores" (só a aba Saída · Fornecedores) é a versão restrita do "dash.ver": quem tem o completo (ou a ação que o exige) não guarda a restrita.
create or replace function public.perm_fechamento(p_perm text[])
returns text[] language sql immutable set search_path = public as $$
  select coalesce(array_agg(distinct k order by k), array[]::text[])
  from (
    select unnest(array_remove(p_perm, null)) as k
    union select 'fundo.ver'   where p_perm && array['fundo.publicar']
    union select 'fat.ver'     where p_perm && array['fat.anexar','fat.excluir']
    union select 'receber.ver' where p_perm && array['receber.lancar','receber.excluir']
    union select 'reidi.ver'   where p_perm && array['reidi.parametros']
    union select 'fluxo.ver'   where p_perm && array['fluxo.publicar']
    union select 'dash.ver'    where p_perm && array['dash.publicar']
    union select 'seg.ver'     where p_perm && array['seg.lancar','seg.excluir']
  ) s
  where not (k = 'dash.fornecedores' and p_perm && array['dash.ver','dash.publicar']);
$$;

-- 2) Utilitários -----------------------------------------------------------------------------------
-- valor em reais no padrão brasileiro (para a Auditoria), independente do idioma do servidor
create or replace function public.fmt_brl(v numeric)
returns text language sql immutable set search_path = public as $$
  select 'R$ ' || translate(to_char(coalesce(v, 0), 'FM999,999,999,999,990.00'), ',.', '.,');
$$;

-- CNPJ válido? Aceita com ou sem pontuação. Confere os 2 dígitos verificadores (módulo 11) e também o CNPJ ALFANUMÉRICO (12 primeiras posições com
-- letras e números; cada caractere vale o seu código ASCII − 48). Recusa os 14 caracteres iguais.
create or replace function public.cnpj_valido(p text)
returns boolean language plpgsql immutable set search_path = public as $$
declare
  c   text := upper(regexp_replace(coalesce(p, ''), '[^0-9A-Za-z]', '', 'g'));
  w1  int[] := array[5,4,3,2,9,8,7,6,5,4,3,2];
  w2  int[] := array[6,5,4,3,2,9,8,7,6,5,4,3,2];
  s   int; i int; r int; d1 int; d2 int;
begin
  if c !~ '^[0-9A-Z]{12}[0-9]{2}$' or c ~ '^(.)\1{13}$' then return false; end if;
  s := 0;
  for i in 1..12 loop s := s + (ascii(substr(c, i, 1)) - 48) * w1[i]; end loop;
  r := s % 11; d1 := case when r < 2 then 0 else 11 - r end;
  s := d1 * w2[13];
  for i in 1..12 loop s := s + (ascii(substr(c, i, 1)) - 48) * w2[i]; end loop;
  r := s % 11; d2 := case when r < 2 then 0 else 11 - r end;
  return d1 = (ascii(substr(c, 13, 1)) - 48) and d2 = (ascii(substr(c, 14, 1)) - 48);
end;
$$;

-- CNPJ com a pontuação de sempre (00.000.000/0000-00)
create or replace function public.fmt_cnpj(p text)
returns text language sql immutable set search_path = public as $$
  select case when p ~ '^[0-9A-Z]{14}$'
              then substr(p, 1, 2) || '.' || substr(p, 3, 3) || '.' || substr(p, 6, 3) || '/' || substr(p, 9, 4) || '-' || substr(p, 13, 2)
              else coalesce(p, '') end;
$$;

-- lista de tipos de seguro: tira espaços extras, descarta vazios e repetidos (sem diferenciar maiúsculas/minúsculas; fica a primeira grafia) e mantém a ordem
create or replace function public.seguros_tipos_norm(p text[])
returns text[] language sql immutable set search_path = public as $$
  select coalesce(array_agg(t order by ord), array[]::text[])
  from (
    select distinct on (lower(t)) t, ord
    from (select btrim(regexp_replace(x, '\s+', ' ', 'g')) as t, ord
          from unnest(coalesce(p, array[]::text[])) with ordinality as u(x, ord)) a
    where t <> ''
    order by lower(t), ord
  ) b;
$$;

-- lista de tipos aceitável: até 20 tipos, cada um com 1 a 60 caracteres
create or replace function public.seguros_tipos_ok(p text[])
returns boolean language sql immutable set search_path = public as $$
  select p is not null and cardinality(p) <= 20
     and not exists (select 1 from unnest(p) t where t is null or char_length(btrim(t)) not between 1 and 60);
$$;

-- 3) Empresas ----------------------------------------------------------------------------------
create table if not exists public.seguros_empresas (
  id                  uuid        primary key default gen_random_uuid(),
  codigo              text        not null check (char_length(codigo) between 1 and 20),
  razao_social        text        not null check (char_length(razao_social) between 3 and 200),
  cnpj                text        not null check (public.cnpj_valido(cnpj) and cnpj ~ '^[0-9A-Z]{14}$'),     -- só os 14 caracteres, sem pontuação
  tipos               text[]      not null default array[]::text[] check (public.seguros_tipos_ok(tipos)),   -- tipos de seguro sob responsabilidade da empresa
  ativo               boolean     not null default true,                                                       -- inativa: não aparece na lista de novos pagamentos
  obs                 text        not null default '' check (char_length(obs) <= 300),
  criado_por          uuid        default auth.uid(),
  criado_por_nome     text,
  criado_em           timestamptz not null default now(),
  atualizado_por      uuid,
  atualizado_por_nome text,
  atualizado_em       timestamptz not null default now()
);
comment on table public.seguros_empresas is 'Seguros: empresas, CNPJ e tipos de seguro sob a responsabilidade de cada uma.';

create unique index if not exists seguros_empresas_codigo_uq on public.seguros_empresas (upper(codigo));
create unique index if not exists seguros_empresas_cnpj_uq   on public.seguros_empresas (cnpj);

-- ANTES de gravar: normaliza os textos, protege os tipos que já têm pagamentos e carimba autor/data (grava o banco; não dá para falsificar pela tela)
create or replace function public.seguros_empresas_antes()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_nome text; v_rem text;
begin
  select nome into v_nome from public.perfis where id = auth.uid();
  new.codigo       := btrim(coalesce(new.codigo, ''));
  new.razao_social := btrim(regexp_replace(coalesce(new.razao_social, ''), '\s+', ' ', 'g'));
  new.cnpj         := upper(regexp_replace(coalesce(new.cnpj, ''), '[^0-9A-Za-z]', '', 'g'));
  new.tipos        := public.seguros_tipos_norm(new.tipos);
  new.obs          := btrim(coalesce(new.obs, ''));
  -- um tipo de seguro que JÁ TEM PAGAMENTOS não pode ser retirado da empresa (a linha dele sumiria da tela e os pagamentos ficariam sem tipo)
  if tg_op = 'UPDATE' and new.tipos is distinct from old.tipos then
    select u.t into v_rem
      from unnest(old.tipos) with ordinality as u(t, ord)
     where not exists (select 1 from unnest(new.tipos) n where lower(n) = lower(u.t))
       and exists (select 1 from public.seguros_pagamentos p where p.empresa_id = old.id and lower(p.tipo) = lower(u.t))
     order by u.ord
     limit 1;
    if v_rem is not null then
      raise exception 'O tipo de seguro "%" tem pagamentos registrados e não pode ser retirado da empresa %. Altere ou exclua esses pagamentos antes.', v_rem, old.codigo using errcode = '23514';
    end if;
  end if;
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
  new.atualizado_por      := auth.uid();
  new.atualizado_por_nome := coalesce(v_nome, new.atualizado_por_nome);
  new.atualizado_em       := now();
  return new;
end;
$$;

drop trigger if exists trg_seguros_empresas_antes on public.seguros_empresas;
create trigger trg_seguros_empresas_antes
  before insert or update on public.seguros_empresas
  for each row execute function public.seguros_empresas_antes();

-- Observação POR TIPO DE SEGURO (o mesmo conteúdo do seguros-obs-tipo.sql, para a instalação nova): a coluna e as funções de apoio -----------------------
alter table public.seguros_empresas add column if not exists obs_tipos jsonb not null default '{}'::jsonb;

-- observações por tipo aceitáveis: um objeto { tipo: texto } com até 20 tipos (1 a 60 caracteres cada) e textos de até 300 caracteres
create or replace function public.seguros_obs_tipos_ok(p jsonb)
returns boolean language sql immutable set search_path = public as $$
  select case when p is not null and jsonb_typeof(p) = 'object' then
           (select count(*) from jsonb_object_keys(p)) <= 20
           and not exists (select 1 from jsonb_each(p) e
                            where char_length(e.key) not between 1 and 60
                               or jsonb_typeof(e.value) <> 'string'
                               or char_length(e.value #>> '{}') > 300)
         else false end;
$$;

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.seguros_empresas'::regclass and conname = 'seguros_empresas_obs_tipos_check') then
    alter table public.seguros_empresas
      add constraint seguros_empresas_obs_tipos_check check (public.seguros_obs_tipos_ok(obs_tipos));
  end if;
end $$;

-- limpa as observações por tipo de acordo com os tipos da empresa: fica UMA observação (sem espaços nas pontas e não vazia) para cada tipo que a empresa tem, gravada com a
-- grafia do tipo; o que sobra (tipo que a empresa não tem mais, texto vazio, valor que não é texto) é descartado. Maiúsculas/minúsculas não contam ao achar o tipo.
create or replace function public.seguros_obs_tipos_norm(p jsonb, p_tipos text[])
returns jsonb language sql immutable set search_path = public as $$
  select coalesce(jsonb_object_agg(t.t, to_jsonb(v.v)), '{}'::jsonb)
    from unnest(coalesce(p_tipos, array[]::text[])) as t(t)
    cross join lateral (
      select nullif(btrim(e.value #>> '{}'), '') as v
        from jsonb_each(case when jsonb_typeof(p) = 'object' then p else '{}'::jsonb end) e
       where jsonb_typeof(e.value) = 'string' and (e.key = t.t or lower(e.key) = lower(t.t))
       order by (e.key = t.t) desc, e.key
       limit 1
    ) v
   where v.v is not null;
$$;

comment on column public.seguros_empresas.obs_tipos is 'Seguros: observação de cada tipo de seguro da empresa ({"Tipo": "texto"}); cada tipo é uma linha na aba Empresas.';
comment on column public.seguros_empresas.obs        is 'Seguros: observação da empresa SEM tipo de seguro (empresa com tipo guarda a observação em obs_tipos).';

-- Gatilho: ANTES de gravar, depois do seguros_empresas_antes (que normaliza os tipos): o nome vem depois na ordem alfabética --------------
create or replace function public.seguros_empresas_obs_tipos()
returns trigger language plpgsql set search_path = public as $$
declare v_t1 text; v_atual text;
begin
  new.obs       := btrim(coalesce(new.obs, ''));
  new.obs_tipos := public.seguros_obs_tipos_norm(new.obs_tipos, new.tipos);
  -- empresa COM tipo não tem observação "solta": a que chegar passa para o primeiro tipo. Se ele já tem observação, o texto novo vai depois dela — e não se repete o que já estiver lá
  -- (uma tela antiga, ainda aberta, reenvia a observação que acabou de ser migrada)
  if new.obs <> '' and cardinality(new.tipos) > 0 then
    v_t1    := new.tipos[1];
    v_atual := coalesce(new.obs_tipos ->> v_t1, '');
    new.obs_tipos := new.obs_tipos || jsonb_build_object(v_t1, case when v_atual = '' then new.obs
                                                                     when position(new.obs in v_atual) > 0 then v_atual
                                                                     else v_atual || ' · ' || new.obs end);
    new.obs := '';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_seguros_empresas_obs_tipos on public.seguros_empresas;
create trigger trg_seguros_empresas_obs_tipos
  before insert or update on public.seguros_empresas
  for each row execute function public.seguros_empresas_obs_tipos();

-- quem já tinha observação na empresa: ela passa para o primeiro tipo (instalação nova: não há nada a mover; quem já tinha dados deve rodar o seguros-obs-tipo.sql)
update public.seguros_empresas set obs = obs where obs <> '' and cardinality(tipos) > 0;

-- Auditoria gravada pelo banco (diz também em quais tipos a observação foi alterada) -----------------------------------------------------------------
create or replace function public.seguros_empresas_auditoria()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_login text; v_ev text; v_obs text; r public.seguros_empresas;
begin
  if tg_op = 'UPDATE' and (to_jsonb(old) - array['atualizado_em', 'atualizado_por', 'atualizado_por_nome'])
                        = (to_jsonb(new) - array['atualizado_em', 'atualizado_por', 'atualizado_por_nome']) then
    return null;   -- nada mudou
  end if;
  select login into v_login from public.perfis where id = auth.uid();
  if tg_op = 'DELETE' then r := old; else r := new; end if;
  v_ev := case tg_op when 'INSERT' then 'Seguros: cadastrou empresa ' when 'UPDATE' then 'Seguros: alterou empresa ' else 'Seguros: excluiu empresa ' end
       || r.codigo || ' · ' || left(r.razao_social, 60) || ' · CNPJ ' || public.fmt_cnpj(r.cnpj)
       || ' · tipos: ' || coalesce(nullif(array_to_string(r.tipos, ', '), ''), '—');
  if tg_op = 'UPDATE' then
    if old.ativo  is distinct from new.ativo  then v_ev := v_ev || case when new.ativo then ' · reativada' else ' · inativada' end; end if;
    if old.codigo is distinct from new.codigo then v_ev := v_ev || ' (código antes: ' || old.codigo || ')'; end if;
    if old.cnpj   is distinct from new.cnpj   then v_ev := v_ev || ' (CNPJ antes: ' || public.fmt_cnpj(old.cnpj) || ')'; end if;
    if old.tipos  is distinct from new.tipos  then v_ev := v_ev || ' (tipos antes: ' || coalesce(nullif(array_to_string(old.tipos, ', '), ''), '—') || ')'; end if;
    -- observações: os tipos em que o texto foi incluído, alterado ou apagado (e, à parte, a observação da empresa sem tipo)
    if old.obs_tipos is distinct from new.obs_tipos then
      select string_agg(x.k, ', ' order by x.k) into v_obs
        from (select coalesce(n.key, o.key) as k
                from jsonb_each_text(old.obs_tipos) o
                full join jsonb_each_text(new.obs_tipos) n on n.key = o.key
               where o.value is distinct from n.value) x;
      v_ev := v_ev || ' · obs. alterada: ' || coalesce(v_obs, '—');
    end if;
    if old.obs is distinct from new.obs then v_ev := v_ev || ' · obs. da empresa alterada'; end if;
  end if;
  -- até 400 caracteres (a lista de tipos e as observações alteradas podem ser longas; nos pagamentos o limite continua 200)
  insert into public.auditoria (usuario, evento) values (coalesce(v_login, 'sistema'), left(v_ev, 400));
  return null;
end;
$$;

drop trigger if exists trg_seguros_empresas_auditoria on public.seguros_empresas;
create trigger trg_seguros_empresas_auditoria
  after insert or update or delete on public.seguros_empresas
  for each row execute function public.seguros_empresas_auditoria();

-- 4) Pagamentos realizados ---------------------------------------------------------------------
create table if not exists public.seguros_pagamentos (
  id                      uuid          primary key default gen_random_uuid(),
  empresa_id              uuid          not null references public.seguros_empresas (id) on delete restrict,
  tipo                    text          check (tipo is null or char_length(tipo) between 1 and 60),             -- tipo de seguro pago (um dos tipos da empresa) · opcional
  data_pagamento          date          not null check (data_pagamento >= date '2000-01-01'),                   -- dia em que o pagamento foi feito (não pode ser futuro)
  valor                   numeric(16,2) not null check (valor > 0),                                              -- valor pago, em R$
  parcela                 integer       not null check (parcela between 1 and 999),                              -- número da parcela
  obs                     text          not null default '' check (char_length(obs) <= 300),
  comprovante_path        text          check (comprovante_path is null or char_length(btrim(comprovante_path)) > 0),   -- caminho no bucket 'seguros-comprovantes' (arquivo vigente)
  comprovante_nome        text,
  comprovante_tipo        text,
  comprovante_bytes       bigint        check (comprovante_bytes is null or comprovante_bytes >= 0),
  comprovante_em          timestamptz,                                                                             -- quando o arquivo vigente foi anexado
  comprovante_por_nome    text,
  comprovantes_anteriores jsonb         not null default '[]'::jsonb check (jsonb_typeof(comprovantes_anteriores) = 'array'),   -- arquivos substituídos (nada é apagado)
  criado_por              uuid          default auth.uid(),
  criado_por_nome         text,
  criado_em               timestamptz   not null default now(),
  atualizado_por          uuid,
  atualizado_por_nome     text,
  atualizado_em           timestamptz   not null default now()
);
comment on table public.seguros_pagamentos is 'Seguros: pagamentos realizados (valor, parcela, data) com o comprovante no bucket seguros-comprovantes.';

create index if not exists seguros_pagamentos_empresa_idx on public.seguros_pagamentos (empresa_id);
create index if not exists seguros_pagamentos_data_idx    on public.seguros_pagamentos (data_pagamento);

-- ANTES de gravar: normaliza, confere a empresa e o tipo, trava a data futura, cuida do comprovante e carimba autor/data
create or replace function public.seguros_pagamentos_antes()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_nome text;
  v_emp  public.seguros_empresas%rowtype;
  v_tipo text;
begin
  select nome into v_nome from public.perfis where id = auth.uid();
  new.obs              := btrim(coalesce(new.obs, ''));
  new.tipo             := nullif(btrim(regexp_replace(coalesce(new.tipo, ''), '\s+', ' ', 'g')), '');
  new.comprovante_path := nullif(btrim(coalesce(new.comprovante_path, '')), '');

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
  new.atualizado_por      := auth.uid();
  new.atualizado_por_nome := coalesce(v_nome, new.atualizado_por_nome);
  new.atualizado_em       := now();

  -- empresa: tem que existir; pagamento novo (ou troca de empresa) exige empresa ATIVA; o tipo é um dos tipos dela
  if tg_op = 'INSERT' or new.empresa_id is distinct from old.empresa_id or new.tipo is distinct from old.tipo then
    select * into v_emp from public.seguros_empresas where id = new.empresa_id;
    if not found then
      raise exception 'Empresa não encontrada.' using errcode = '23503';
    end if;
    if (tg_op = 'INSERT' or new.empresa_id is distinct from old.empresa_id) and not v_emp.ativo then
      raise exception 'A empresa % está inativa: reative-a no cadastro antes de registrar pagamentos.', v_emp.codigo using errcode = '23514';
    end if;
    if new.tipo is not null then
      select t into v_tipo from unnest(v_emp.tipos) t where lower(t) = lower(new.tipo) limit 1;
      if v_tipo is null then
        raise exception 'O tipo de seguro "%" não está entre os tipos da empresa %.', new.tipo, v_emp.codigo using errcode = '23514';
      end if;
      new.tipo := v_tipo;
    end if;
  end if;

  -- a data do pagamento não pode ser futura (dia de hoje no horário de Brasília)
  if (tg_op = 'INSERT' or new.data_pagamento is distinct from old.data_pagamento)
     and new.data_pagamento > (now() at time zone 'America/Sao_Paulo')::date then
    raise exception 'A data do pagamento não pode ser futura.' using errcode = '23514';
  end if;

  -- comprovante: quem chama não define a autoria nem o histórico; o arquivo vigente que sai vai para "comprovantes_anteriores" (nada é apagado)
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

drop trigger if exists trg_seguros_pagamentos_antes on public.seguros_pagamentos;
create trigger trg_seguros_pagamentos_antes
  before insert or update on public.seguros_pagamentos
  for each row execute function public.seguros_pagamentos_antes();

-- Auditoria gravada pelo banco
create or replace function public.seguros_pagamentos_auditoria()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_login text; v_ev text; v_emp text; r public.seguros_pagamentos;
begin
  if tg_op = 'UPDATE' and (to_jsonb(old) - array['atualizado_em', 'atualizado_por', 'atualizado_por_nome'])
                        = (to_jsonb(new) - array['atualizado_em', 'atualizado_por', 'atualizado_por_nome']) then
    return null;   -- nada mudou
  end if;
  select login into v_login from public.perfis where id = auth.uid();
  if tg_op = 'DELETE' then r := old; else r := new; end if;
  select e.codigo || ' ' || left(e.razao_social, 40) into v_emp from public.seguros_empresas e where e.id = r.empresa_id;
  v_ev := case tg_op when 'INSERT' then 'Seguros: registrou pagamento ' when 'UPDATE' then 'Seguros: alterou pagamento ' else 'Seguros: excluiu pagamento ' end
       || public.fmt_brl(r.valor) || ' · parcela ' || r.parcela || ' · ' || coalesce(v_emp, '—')
       || case when r.tipo is not null then ' · ' || r.tipo else '' end
       || ' · pago em ' || to_char(r.data_pagamento, 'DD/MM/YYYY');
  if tg_op = 'UPDATE' and (old.valor is distinct from new.valor or old.parcela is distinct from new.parcela or old.data_pagamento is distinct from new.data_pagamento) then
    v_ev := v_ev || ' (antes: ' || public.fmt_brl(old.valor) || ', parcela ' || old.parcela || ', ' || to_char(old.data_pagamento, 'DD/MM/YYYY') || ')';
  end if;
  if tg_op = 'INSERT' and r.comprovante_nome is not null then
    v_ev := v_ev || ' · comprovante ' || r.comprovante_nome;
  elsif tg_op = 'UPDATE' and new.comprovante_path is distinct from old.comprovante_path then
    v_ev := v_ev || case when new.comprovante_path is null then ' · comprovante removido'
                         when old.comprovante_path is null then ' · comprovante anexado: ' || coalesce(new.comprovante_nome, '—')
                         else ' · comprovante substituído por ' || coalesce(new.comprovante_nome, '—') end;
  end if;
  insert into public.auditoria (usuario, evento) values (coalesce(v_login, 'sistema'), left(v_ev, 200));
  return null;
end;
$$;

drop trigger if exists trg_seguros_pagamentos_auditoria on public.seguros_pagamentos;
create trigger trg_seguros_pagamentos_auditoria
  after insert or update or delete on public.seguros_pagamentos
  for each row execute function public.seguros_pagamentos_auditoria();

-- 5) Armazenamento dos comprovantes: bucket PRIVADO ------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('seguros-comprovantes', 'seguros-comprovantes', false, 10485760,
        array['application/pdf', 'image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 6) Regras de acesso (RLS) e do armazenamento — POR PERMISSÃO ---------------------------------------------
-- Fica numa função para poder ser reaplicada (permissoes.sql chama esta função dentro de aplicar_politicas_permissoes()).
-- Não há regra de UPDATE no armazenamento: o comprovante enviado nunca é sobrescrito (trocar o comprovante grava um arquivo novo).
alter table public.seguros_empresas   enable row level security;
alter table public.seguros_pagamentos enable row level security;
revoke all on table public.seguros_empresas   from anon, authenticated;
revoke all on table public.seguros_pagamentos from anon, authenticated;
grant select, insert, update, delete on table public.seguros_empresas   to authenticated;
grant select, insert, update, delete on table public.seguros_pagamentos to authenticated;

create or replace function public.seguros_politicas()
returns void language plpgsql set search_path = public as $$
begin
  drop policy if exists seguros_emp_select on public.seguros_empresas;
  create policy seguros_emp_select on public.seguros_empresas for select to authenticated using (public.tem_permissao('seg.ver'));
  drop policy if exists seguros_emp_insert on public.seguros_empresas;
  create policy seguros_emp_insert on public.seguros_empresas for insert to authenticated with check (public.tem_permissao('seg.lancar'));
  drop policy if exists seguros_emp_update on public.seguros_empresas;
  create policy seguros_emp_update on public.seguros_empresas for update to authenticated
    using (public.tem_permissao('seg.lancar')) with check (public.tem_permissao('seg.lancar'));
  drop policy if exists seguros_emp_delete on public.seguros_empresas;
  create policy seguros_emp_delete on public.seguros_empresas for delete to authenticated using (public.tem_permissao('seg.excluir'));

  drop policy if exists seguros_pag_select on public.seguros_pagamentos;
  create policy seguros_pag_select on public.seguros_pagamentos for select to authenticated using (public.tem_permissao('seg.ver'));
  drop policy if exists seguros_pag_insert on public.seguros_pagamentos;
  create policy seguros_pag_insert on public.seguros_pagamentos for insert to authenticated with check (public.tem_permissao('seg.lancar'));
  drop policy if exists seguros_pag_update on public.seguros_pagamentos;
  create policy seguros_pag_update on public.seguros_pagamentos for update to authenticated
    using (public.tem_permissao('seg.lancar')) with check (public.tem_permissao('seg.lancar'));
  drop policy if exists seguros_pag_delete on public.seguros_pagamentos;
  create policy seguros_pag_delete on public.seguros_pagamentos for delete to authenticated using (public.tem_permissao('seg.excluir'));

  -- comprovantes (arquivos): ver/baixar = seg.ver · enviar = seg.lancar · apagar = seg.excluir
  drop policy if exists seguros_comp_select on storage.objects;
  create policy seguros_comp_select on storage.objects for select to authenticated
    using (bucket_id = 'seguros-comprovantes' and public.tem_permissao('seg.ver'));
  drop policy if exists seguros_comp_insert on storage.objects;
  create policy seguros_comp_insert on storage.objects for insert to authenticated
    with check (bucket_id = 'seguros-comprovantes' and public.tem_permissao('seg.lancar'));
  drop policy if exists seguros_comp_delete on storage.objects;
  create policy seguros_comp_delete on storage.objects for delete to authenticated
    using (bucket_id = 'seguros-comprovantes' and public.tem_permissao('seg.excluir'));
end;
$$;
revoke execute on function public.seguros_politicas() from public, anon, authenticated;   -- só o administrador do banco (SQL Editor) reaplica as regras
select public.seguros_politicas();

-- 7) Atualização em tempo real (Realtime) ----------------------------------------------------------------
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['seguros_empresas', 'seguros_pagamentos'] loop
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;

-- 8) Conferência para a tela "Usuários": as regras do banco estão mesmo por permissão? (igual à do permissoes.sql, com as regras do Seguros) --------
create or replace function public.permissoes_status()
returns jsonb language plpgsql security definer stable set search_path = public as $$
declare
  v_div text[] := array[]::text[];
  r record;
begin
  if not public.is_admin() then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  for r in
    select t.sch, t.tab, t.pol from (values
      ('public','bases','bases_select'), ('public','bases','bases_insert'), ('public','bases','bases_update'),
      ('public','dashboard_dados','dashboard_select'), ('public','dashboard_dados','dashboard_insert'), ('public','dashboard_dados','dashboard_update'),
      ('public','reidi_compras','reidi_select'), ('public','reidi_compras','reidi_insert'), ('public','reidi_compras','reidi_update'), ('public','reidi_compras','reidi_delete'),
      ('public','reidi_pagamentos','reidi_pag_select'), ('public','reidi_pagamentos','reidi_pag_insert'), ('public','reidi_pagamentos','reidi_pag_update'), ('public','reidi_pagamentos','reidi_pag_delete'),
      ('public','faturas_emitidas','faturas_select'), ('public','faturas_emitidas','faturas_insert'), ('public','faturas_emitidas','faturas_update'), ('public','faturas_emitidas','faturas_delete'),
      ('storage','objects','faturas_nf_select'), ('storage','objects','faturas_nf_insert'), ('storage','objects','faturas_nf_delete'),
      ('public','recebimentos','recebimentos_select'), ('public','recebimentos','recebimentos_insert'), ('public','recebimentos','recebimentos_update'), ('public','recebimentos','recebimentos_delete'),
      ('public','seguros_empresas','seguros_emp_select'), ('public','seguros_empresas','seguros_emp_insert'), ('public','seguros_empresas','seguros_emp_update'), ('public','seguros_empresas','seguros_emp_delete'),
      ('public','seguros_pagamentos','seguros_pag_select'), ('public','seguros_pagamentos','seguros_pag_insert'), ('public','seguros_pagamentos','seguros_pag_update'), ('public','seguros_pagamentos','seguros_pag_delete'),
      ('storage','objects','seguros_comp_select'), ('storage','objects','seguros_comp_insert'), ('storage','objects','seguros_comp_delete')
    ) as t(sch, tab, pol)
    where to_regclass(t.sch || '.' || t.tab) is not null
      and (t.pol not like 'seguros\_comp\_%' or to_regclass('public.seguros_empresas') is not null)
  loop
    if not exists (
      select 1 from pg_policies p
      where p.schemaname = r.sch and p.tablename = r.tab and p.policyname = r.pol
        and (coalesce(p.qual, '') || ' ' || coalesce(p.with_check, '')) ~ '(tem_permissao|pode_ler_base|pode_publicar_base)'
    ) then
      v_div := v_div || (r.tab || '.' || r.pol);
    end if;
  end loop;
  return jsonb_build_object('ok', cardinality(v_div) = 0, 'divergentes', to_jsonb(v_div));
end;
$$;
revoke execute on function public.permissoes_status() from public, anon;
grant  execute on function public.permissoes_status() to authenticated;

-- 9) Reaplica as regras de acesso por permissão (as das demais tabelas ficam como estão) -------------------------------
do $$ begin
  if to_regprocedure('public.aplicar_politicas_permissoes()') is not null then perform public.aplicar_politicas_permissoes(); end if;
end $$;

-- Conferência (rode separado, uma consulta por vez — o editor mostra só o resultado da última):
--   1) a permissão está no catálogo (deve devolver true):
--        select array['seg.ver','seg.lancar','seg.excluir'] <@ public.permissoes_validas() as no_catalogo;
--   2) as tabelas e o armazenamento dos comprovantes existem (3 linhas: 2 tabelas e o bucket privado):
--        select 'tabela' as tipo, relname as nome, relrowsecurity as rls from pg_class where relname in ('seguros_empresas', 'seguros_pagamentos') and relnamespace = 'public'::regnamespace
--        union all select 'bucket', id, not public from storage.buckets where id = 'seguros-comprovantes';
--   3) regras de acesso (11 linhas; todas com por_permissao = true):
--        select tablename as tabela, policyname as regra, cmd as comando,
--               (coalesce(qual, '') || ' ' || coalesce(with_check, '')) ~ 'tem_permissao' as por_permissao
--          from pg_policies
--         where (schemaname = 'public' and tablename in ('seguros_empresas', 'seguros_pagamentos'))
--            or (schemaname = 'storage' and tablename = 'objects' and policyname like 'seguros_comp_%')
--         order by 1, 3, 2;
--   4) depois de cadastrar empresas e pagamentos pela tela:
--        select e.codigo, e.razao_social, e.cnpj, e.tipos, count(p.id) as pagamentos, coalesce(sum(p.valor), 0) as total_pago
--          from public.seguros_empresas e left join public.seguros_pagamentos p on p.empresa_id = e.id group by e.id order by e.codigo;
