-- =====================================================================
-- REIDI · PROJEÇÃO DE COMPRAS POR LANÇAMENTO (substitui o upload da planilha)
-- Rode UMA vez no SQL Editor do Supabase (depois de schema-consorcio-santadulce.sql
-- e bases-dados.sql). É seguro rodar de novo.
--
--  • public.reidi_compras  → uma linha por compra lançada no módulo "Projeção REIDI"
--  • bases · reidi_config  → parâmetros do relatório REIDI (documento, data de referência,
--                            horizonte, saldo na Belov Obras e responsáveis) — só o admin grava
--  • novo perfil de acesso 'lancador' (Lançador REIDI): só enxerga/usa "Projeção REIDI"
--
-- QUEM FAZ O QUÊ
--   admin     → inclui, edita e exclui QUALQUER compra; altera os parâmetros do REIDI
--   lancador  → inclui; edita e exclui SOMENTE as compras que ele lançou; vê o relatório REIDI (só leitura)
--   Responsável = nome do cadastro (perfis.nome) de quem lançou, gravado pelo banco
--   viewer    → só lê (relatório REIDI)
-- =====================================================================

-- 1) Perfil 'lancador' -------------------------------------------------
alter table public.perfis drop constraint if exists perfis_papel_check;
alter table public.perfis add  constraint perfis_papel_check
  check (papel in ('admin', 'viewer', 'lancador'));

-- 2) Funções de apoio ----------------------------------------------------
create or replace function public.is_lancador()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.perfis
                 where id = auth.uid() and papel = 'lancador' and ativo = true);
$$;

-- leitor = admin ou visualizador ativo (o lançador NÃO lê as demais bases)
create or replace function public.is_leitor()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.perfis
                 where id = auth.uid() and papel in ('admin', 'viewer') and ativo = true);
$$;

revoke execute on function public.is_lancador() from public, anon;
revoke execute on function public.is_leitor()   from public, anon;
grant  execute on function public.is_lancador() to authenticated;
grant  execute on function public.is_leitor()   to authenticated;

-- 3) Bases: remove o Boletim de Caixa, aceita 'reidi_config' e esconde dos lançadores
delete from public.bases where chave = 'boletim_caixa';
alter table public.bases drop constraint if exists bases_chave_check;
alter table public.bases add  constraint bases_chave_check
  check (chave in ('fundo_reserva', 'reidi', 'fluxo_projetado', 'reidi_config'));

-- o lançador lê apenas os parâmetros do REIDI (reidi_config), necessários para exibir o relatório
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
end $$;

-- 4) Tabela de compras ---------------------------------------------------
create table if not exists public.reidi_compras (
  id                 uuid primary key default gen_random_uuid(),
  fornecedor         text         not null check (length(btrim(fornecedor)) > 0),
  item               text         not null default '',
  categoria          text         not null default 'Previsão',
  pedido             text         not null default '',
  data_prevista      date         not null,
  pc                 numeric(7,5) not null check (pc >= 0 and pc <= 1),   -- alíquota de PIS/COFINS escolhida pelo lançador: 0.0365 (3,65%) ou 0.0925 (9,25%); economia TEÓRICA = valor_original × pc × 90%; 
  responsavel        text         not null default '',
  valor_original     numeric(16,2) not null check (valor_original >= 0),
  valor_negociado    numeric(16,2) not null check (valor_negociado >= 0),
  data_base          date         not null default current_date,
  status             text         not null default 'A pagar' check (status in ('Pago', 'A pagar')),   -- controle de pagamento
  criado_por         uuid         default auth.uid(),
  criado_por_nome    text,
  criado_em          timestamptz  not null default now(),
  atualizado_por     uuid,
  atualizado_por_nome text,
  atualizado_em      timestamptz  not null default now()
);

-- (bancos criados por versão anterior: acrescenta a coluna de status)
alter table public.reidi_compras add column if not exists status text not null default 'A pagar' check (status in ('Pago', 'A pagar'));

create index if not exists reidi_compras_data_idx on public.reidi_compras (data_prevista);

create or replace function public.reidi_compras_carimbo()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_nome text;
begin
  select nome into v_nome from public.perfis where id = auth.uid();
  if tg_op = 'INSERT' then
    new.criado_por      := auth.uid();
    new.criado_por_nome := coalesce(v_nome, new.criado_por_nome);
    new.criado_em       := now();
    new.responsavel     := coalesce(nullif(btrim(v_nome), ''), new.responsavel, '');
  else
    new.criado_por      := old.criado_por;
    new.criado_por_nome := old.criado_por_nome;
    new.criado_em       := old.criado_em;
    new.responsavel     := old.responsavel;
  end if;
  new.atualizado_por      := auth.uid();
  new.atualizado_por_nome := coalesce(v_nome, new.atualizado_por_nome);
  new.atualizado_em       := now();
  return new;
end;
$$;

drop trigger if exists trg_reidi_compras_carimbo on public.reidi_compras;
create trigger trg_reidi_compras_carimbo
  before insert or update on public.reidi_compras
  for each row execute function public.reidi_compras_carimbo();

alter table public.reidi_compras enable row level security;
revoke all on table public.reidi_compras from anon, authenticated;
grant select, insert, update, delete on table public.reidi_compras to authenticated;

drop policy if exists reidi_select on public.reidi_compras;
create policy reidi_select on public.reidi_compras
  for select to authenticated using (public.is_ativo());

drop policy if exists reidi_insert on public.reidi_compras;
create policy reidi_insert on public.reidi_compras
  for insert to authenticated
  with check (public.is_admin() or public.is_lancador());

drop policy if exists reidi_update on public.reidi_compras;
create policy reidi_update on public.reidi_compras
  for update to authenticated
  using      (public.is_admin() or (public.is_lancador() and criado_por = auth.uid()))
  with check (public.is_admin() or (public.is_lancador() and criado_por = auth.uid()));

drop policy if exists reidi_delete on public.reidi_compras;
create policy reidi_delete on public.reidi_compras
  for delete to authenticated
  using (public.is_admin() or (public.is_lancador() and criado_por = auth.uid()));

-- 5) Atualização em tempo real (Realtime) ------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'reidi_compras') then
    alter publication supabase_realtime add table public.reidi_compras;
  end if;
end $$;

-- 6) Carga inicial (só se a tabela estiver vazia): as 8 compras da planilha de outubro/2026
insert into public.reidi_compras
  (fornecedor, item, categoria, pedido, data_prevista, pc, responsavel, valor_original, valor_negociado, data_base, criado_por_nome, atualizado_por_nome)
select v.*, 'Carga inicial (planilha)', 'Carga inicial (planilha)' from (values
  ('PEDREIRAS BAHIA LTDA', 'Brita e pedra', 'Pedido de Compra', '113668', date '2026-10-12', 0.0365, 'Jadson Basilio', 191937, 184934, date '2026-10-01'),
  ('PEDREIRAS BAHIA LTDA', 'Matacão e brita', 'Pedido de Compra', '113840', date '2026-10-19', 0.0365, 'Jadson Basilio', 55239, 53223, date '2026-10-01'),
  ('SONDOSOLO', 'MOBILIZAÇÃO - ESTACA RAIZ', 'Previsão', '', date '2026-10-30', 0.0365, 'Fernanda de Sá', 298867.95, 289050, date '2026-10-01'),
  ('SARAIVA', 'MOBILIZAÇÃO E MONTAGEM - GUINDASTES', 'Previsão', '', date '2026-10-30', 0.0925, 'Fernanda de Sá', 191071, 175164.3, date '2026-10-01'),
  ('TRACTOR', 'MOBILIZAÇÃO - TERRAPLANAGEM', 'Previsão', '', date '2026-10-30', 0.0365, 'Fernanda de Sá', 133623.3, 129233.68, date '2026-10-01'),
  ('SOLUAÇO', 'TUBOS METÁLICOS - ESTACA RAIZ', 'Previsão', '', date '2026-10-15', 0.0365, 'Humberto/Thiago', 426572.99, 412560, date '2026-10-01'),
  ('SOLUAÇO', 'TUBOS METÁLICOS - ESTACA RAIZ', 'Previsão', '', date '2026-10-30', 0.0365, 'Humberto/Thiago', 426572.99, 412560, date '2026-10-01'),
  ('DIFASA', 'SAPATAS METÁLICAS', 'Previsão', '', date '2026-10-30', 0.0365, 'Humberto/Thiago', 148891.38, 144000, date '2026-10-01')
) v(fornecedor, item, categoria, pedido, data_prevista, pc, responsavel, valor_original, valor_negociado, data_base)
where not exists (select 1 from public.reidi_compras);

-- Parâmetros do relatório (só cria se ainda não existir)
insert into public.bases (chave, dados, arquivo)
values ('reidi_config',
        '{"doc": "001/2026", "ref": "2026-10-01", "hor": 30, "saldo": 0, "resp": {"el": "Financeiro do Consórcio", "cf": "Gerente Administrativo Financeiro (GAF)", "d": ["Diretor Belov", "Diretor Carioca", "Diretor CTC"]}}'::jsonb,
        'carga inicial')
on conflict (chave) do nothing;

-- Conferência (rode separado depois):
--   select count(*), sum(valor_negociado) from public.reidi_compras;
--   select chave, atualizado_em from public.bases order by chave;
