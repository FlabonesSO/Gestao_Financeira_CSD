-- =====================================================================
-- REIDI · PAGAMENTOS PARCIAIS  (rode UMA vez no SQL Editor do Supabase; é seguro rodar de novo)
-- Pré-requisitos: schema-consorcio-santadulce.sql, bases-dados.sql e reidi-lancamentos.sql.
-- Pode rodar antes ou depois de permissoes.sql: se ele já estiver instalado, as regras abaixo já nascem POR PERMISSÃO.
--
-- PARA QUE SERVE
--   Uma compra orçada por R$ 400.000 pode ser paga em partes (ex.: R$ 150.000 neste mês, o resto depois).
--   Cada pagamento vira uma linha em public.reidi_pagamentos (data + valor + observação), ligada à compra.
--   O STATUS da compra passa a ser CALCULADO pelo banco a partir dos pagamentos (ninguém digita o status):
--       nenhum pagamento                    → 'A pagar'
--       pago > 0 e menor que o negociado    → 'Parcial'
--       pago = valor negociado              → 'Pago'
--   Saldo = valor negociado − tudo que já foi pago.  Regra de integridade: o total pago NUNCA passa do valor negociado
--   (o banco recusa), e o valor negociado não pode ser reduzido abaixo do que já foi pago.
--
-- QUEM PODE (mesma regra de editar a compra)
--   ver                 → quem vê o REIDI (reidi.ver) ou lança compras (lanc.lancar) · pelo perfil: qualquer usuário ativo
--   registrar/alterar/excluir pagamento → administrador, ou quem tem "lançar compras" e lançou AQUELA compra
--
-- O QUE O SCRIPT FAZ (nesta ordem)
--   1) aceita o status 'Parcial' em public.reidi_compras
--   2) cria public.reidi_pagamentos (+ carimbo de autor/data, trava o limite, auditoria no banco)
--   3) MIGRAÇÃO: toda compra que já estava 'Pago' vira 1 pagamento integral (valor negociado) na data de pagamento do
--      calendário (dia 1–15 → dia 15 · 16–fim → último dia do mês): o REIDI Realizado continua mostrando exatamente o mesmo
--   4) passa a calcular o status da compra a partir dos pagamentos
--   5) regras de acesso (RLS) e atualização em tempo real (Realtime)
--
-- Depois de rodar: o site (js/core/reidi_dados.js e js/modulos/reidi_lanc.js) abre a janela de pagamento ao marcar "Pago".
-- Se o site novo for publicado ANTES deste SQL, ele continua funcionando como antes (marca Pago direto) e avisa que falta rodar este arquivo.
-- =====================================================================

-- 0) Utilitário: valor em reais no padrão brasileiro (mesma função de contas-receber.sql; aqui para este script não depender dele)
create or replace function public.fmt_brl(v numeric)
returns text language sql immutable set search_path = public as $$
  select 'R$ ' || translate(to_char(coalesce(v, 0), 'FM999,999,999,999,990.00'), ',.', '.,');
$$;

-- 1) Status 'Parcial' ----------------------------------------------------
do $$
declare r record;
begin
  for r in select conname from pg_constraint
            where conrelid = 'public.reidi_compras'::regclass and contype = 'c'
              and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format('alter table public.reidi_compras drop constraint %I', r.conname);
  end loop;
end $$;
alter table public.reidi_compras
  add constraint reidi_compras_status_check check (status in ('Pago', 'Parcial', 'A pagar'));

-- 2) Tabela dos pagamentos -------------------------------------------------
create table if not exists public.reidi_pagamentos (
  id                  uuid          primary key default gen_random_uuid(),
  compra_id           uuid          not null references public.reidi_compras (id) on delete cascade,
  data_pagamento      date          not null check (data_pagamento >= date '2000-01-01'),   -- dia em que o fornecedor foi pago
  valor               numeric(16,2) not null check (valor > 0),                              -- valor pago NESTE pagamento (com REIDI, ou seja, contra o valor negociado)
  obs                 text          not null default '' check (char_length(obs) <= 300),
  criado_por          uuid          default auth.uid(),
  criado_por_nome     text,
  criado_em           timestamptz   not null default now(),
  atualizado_por      uuid,
  atualizado_por_nome text,
  atualizado_em       timestamptz   not null default now()
);
comment on table public.reidi_pagamentos is 'Pagamentos (parciais ou integrais) das compras do REIDI. O status da compra é calculado a partir daqui.';

create index if not exists reidi_pagamentos_compra_idx on public.reidi_pagamentos (compra_id);
create index if not exists reidi_pagamentos_data_idx   on public.reidi_pagamentos (data_pagamento);

-- a compra pertence a quem está logado? (usada nas regras de acesso; security definer para não depender das regras da tabela de compras)
create or replace function public.reidi_compra_e_minha(p_compra uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.reidi_compras c where c.id = p_compra and c.criado_por = auth.uid());
$$;
revoke execute on function public.reidi_compra_e_minha(uuid) from public, anon;
grant  execute on function public.reidi_compra_e_minha(uuid) to authenticated;

-- ANTES de gravar: carimbo (quem/quando, gravado pelo banco) + limite (o total pago nunca passa do valor negociado)
create or replace function public.reidi_pagamentos_antes()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_nome text; v_vn numeric; v_outros numeric;
begin
  select nome into v_nome from public.perfis where id = auth.uid();
  if tg_op = 'INSERT' then
    new.criado_por      := auth.uid();
    new.criado_por_nome := coalesce(v_nome, new.criado_por_nome);
    new.criado_em       := now();
  else
    new.compra_id       := old.compra_id;          -- um pagamento nunca muda de compra
    new.criado_por      := old.criado_por;
    new.criado_por_nome := old.criado_por_nome;
    new.criado_em       := old.criado_em;
  end if;
  new.obs                 := btrim(coalesce(new.obs, ''));
  new.atualizado_por      := auth.uid();
  new.atualizado_por_nome := coalesce(v_nome, new.atualizado_por_nome);
  new.atualizado_em       := now();

  -- trava a linha da compra: dois pagamentos simultâneos da mesma compra esperam um pelo outro e o limite é conferido com o valor atualizado
  select c.valor_negociado into v_vn from public.reidi_compras c where c.id = new.compra_id for update;
  if v_vn is null then
    raise exception 'Compra não encontrada.' using errcode = '23503';
  end if;
  select coalesce(sum(p.valor), 0) into v_outros from public.reidi_pagamentos p
   where p.compra_id = new.compra_id and p.id is distinct from new.id;
  if v_outros + new.valor > v_vn then
    raise exception 'O valor pago (%) passa do saldo da compra (%). Total negociado %, já pago %.',
      public.fmt_brl(new.valor), public.fmt_brl(v_vn - v_outros), public.fmt_brl(v_vn), public.fmt_brl(v_outros)
      using errcode = '23514', hint = 'reidi_pagamento_acima_do_saldo';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_reidi_pagamentos_antes on public.reidi_pagamentos;
create trigger trg_reidi_pagamentos_antes
  before insert or update on public.reidi_pagamentos
  for each row execute function public.reidi_pagamentos_antes();

-- DEPOIS de gravar: a compra recalcula o status (gatilho da compra, passo 4) e o banco registra na Auditoria
create or replace function public.reidi_pagamentos_depois()
returns trigger language plpgsql security definer set search_path = public as $$
declare r public.reidi_pagamentos; v_login text; v_forn text; v_item text; v_vn numeric; v_pago numeric; v_ev text;
begin
  if tg_op = 'DELETE' then r := old; else r := new; end if;

  -- força o recálculo do status (e atualiza "última alteração" da compra). Se a compra acabou de ser excluída (cascata), não há o que atualizar.
  update public.reidi_compras set status = status where id = r.compra_id;

  select c.fornecedor, c.item, c.valor_negociado into v_forn, v_item, v_vn from public.reidi_compras c where c.id = r.compra_id;
  if not found then return null; end if;                       -- exclusão em cascata: a exclusão da compra tem a própria linha na Auditoria
  select login into v_login from public.perfis where id = auth.uid();
  select coalesce(sum(p.valor), 0) into v_pago from public.reidi_pagamentos p where p.compra_id = r.compra_id;

  v_ev := case tg_op when 'INSERT' then 'REIDI: registrou pagamento ' when 'UPDATE' then 'REIDI: alterou pagamento ' else 'REIDI: excluiu pagamento ' end
       || public.fmt_brl(r.valor) || ' em ' || to_char(r.data_pagamento, 'DD/MM/YYYY');
  if tg_op = 'UPDATE' and (old.valor is distinct from new.valor or old.data_pagamento is distinct from new.data_pagamento) then
    v_ev := v_ev || ' (antes: ' || public.fmt_brl(old.valor) || ' em ' || to_char(old.data_pagamento, 'DD/MM/YYYY') || ')';
  end if;
  v_ev := v_ev || ' · saldo ' || public.fmt_brl(v_vn - v_pago) || ' · ' || v_forn || coalesce(' · ' || nullif(btrim(v_item), ''), '');
  insert into public.auditoria (usuario, evento) values (coalesce(v_login, 'sistema'), left(v_ev, 200));
  return null;
end;
$$;

drop trigger if exists trg_reidi_pagamentos_depois on public.reidi_pagamentos;
create trigger trg_reidi_pagamentos_depois
  after insert or update or delete on public.reidi_pagamentos
  for each row execute function public.reidi_pagamentos_depois();

-- 3) MIGRAÇÃO: compra que já estava 'Pago' = 1 pagamento integral na data do calendário ------------------
--    (o gatilho "depois" fica desligado só durante a carga: o status já é 'Pago' e o carimbo "última alteração" das compras não deve mudar)
do $$
declare n integer;
begin
  alter table public.reidi_pagamentos disable trigger trg_reidi_pagamentos_depois;

  insert into public.reidi_pagamentos (compra_id, data_pagamento, valor, obs, criado_por_nome)
  select c.id,
         case when extract(day from c.data_prevista) <= 15
              then (date_trunc('month', c.data_prevista)::date + 14)
              else (date_trunc('month', c.data_prevista) + interval '1 month' - interval '1 day')::date end,
         c.valor_negociado,
         'Migrado: compra que já estava com status Pago (pagamento integral na data do calendário)',
         'Migração'
    from public.reidi_compras c
   where c.status = 'Pago' and c.valor_negociado > 0
     and not exists (select 1 from public.reidi_pagamentos p where p.compra_id = c.id);
  get diagnostics n = row_count;

  alter table public.reidi_pagamentos enable trigger trg_reidi_pagamentos_depois;

  if n > 0 then
    insert into public.auditoria (usuario, evento)
    values ('sistema', 'REIDI: ' || n || ' compra(s) que já estavam com status Pago passaram para o controle de pagamentos (1 pagamento integral cada, na data do calendário)');
  end if;
end $$;

-- 4) O status da compra é CALCULADO a partir dos pagamentos --------------------------------
create or replace function public.reidi_compras_status()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_pago numeric := 0;
begin
  if tg_op = 'UPDATE' then
    select coalesce(sum(p.valor), 0) into v_pago from public.reidi_pagamentos p where p.compra_id = new.id;
    if new.valor_negociado < v_pago then
      raise exception 'O valor negociado (%) não pode ficar menor que o já pago (%).',
        public.fmt_brl(new.valor_negociado), public.fmt_brl(v_pago)
        using errcode = '23514', hint = 'reidi_negociado_abaixo_do_pago';
    end if;
  end if;
  new.status := case
    when new.valor_negociado <= 0 then case when new.status = 'Pago' then 'Pago' else 'A pagar' end   -- compra sem valor: não há o que pagar em parcelas
    when v_pago >= new.valor_negociado then 'Pago'
    when v_pago > 0 then 'Parcial'
    else 'A pagar' end;
  return new;
end;
$$;

drop trigger if exists trg_reidi_compras_status on public.reidi_compras;
create trigger trg_reidi_compras_status
  before insert or update on public.reidi_compras
  for each row execute function public.reidi_compras_status();

-- excluir uma compra que já tem pagamentos apaga os pagamentos junto (cascata): fica registrado na Auditoria
create or replace function public.reidi_compras_antes_excluir()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_n integer; v_total numeric; v_login text;
begin
  select count(*), coalesce(sum(p.valor), 0) into v_n, v_total from public.reidi_pagamentos p where p.compra_id = old.id;
  if v_n > 0 then
    select login into v_login from public.perfis where id = auth.uid();
    insert into public.auditoria (usuario, evento)
    values (coalesce(v_login, 'sistema'), left('REIDI: excluiu a compra ' || old.fornecedor || coalesce(' · ' || nullif(btrim(old.item), ''), '')
            || ' junto com ' || v_n || ' pagamento(s) registrado(s), somando ' || public.fmt_brl(v_total), 200));
  end if;
  return old;
end;
$$;

drop trigger if exists trg_reidi_compras_excluir on public.reidi_compras;
create trigger trg_reidi_compras_excluir
  before delete on public.reidi_compras
  for each row execute function public.reidi_compras_antes_excluir();

-- 5) Regras de acesso (RLS) ---------------------------------------------------
alter table public.reidi_pagamentos enable row level security;
revoke all on table public.reidi_pagamentos from anon, authenticated;
grant select, insert, update, delete on table public.reidi_pagamentos to authenticated;

-- Fica numa função para poder ser reaplicada (permissoes.sql chama esta função dentro de aplicar_politicas_permissoes()).
--   com permissoes.sql instalado → POR PERMISSÃO · sem ele → POR PERFIL (padrão seguro, igual ao reidi-lancamentos.sql)
create or replace function public.reidi_pagamentos_politicas()
returns void language plpgsql set search_path = public as $$
begin
  drop policy if exists reidi_pag_select on public.reidi_pagamentos;
  drop policy if exists reidi_pag_insert on public.reidi_pagamentos;
  drop policy if exists reidi_pag_update on public.reidi_pagamentos;
  drop policy if exists reidi_pag_delete on public.reidi_pagamentos;

  if to_regprocedure('public.tem_permissao(text)') is not null then
    create policy reidi_pag_select on public.reidi_pagamentos for select to authenticated
      using (public.tem_permissao('reidi.ver') or public.tem_permissao('lanc.lancar'));
    create policy reidi_pag_insert on public.reidi_pagamentos for insert to authenticated
      with check (public.is_admin() or (public.tem_permissao('lanc.lancar') and public.reidi_compra_e_minha(compra_id)));
    create policy reidi_pag_update on public.reidi_pagamentos for update to authenticated
      using      (public.is_admin() or (public.tem_permissao('lanc.lancar') and public.reidi_compra_e_minha(compra_id)))
      with check (public.is_admin() or (public.tem_permissao('lanc.lancar') and public.reidi_compra_e_minha(compra_id)));
    create policy reidi_pag_delete on public.reidi_pagamentos for delete to authenticated
      using (public.is_admin() or (public.tem_permissao('lanc.lancar') and public.reidi_compra_e_minha(compra_id)));
  else
    create policy reidi_pag_select on public.reidi_pagamentos for select to authenticated
      using (public.is_ativo());
    create policy reidi_pag_insert on public.reidi_pagamentos for insert to authenticated
      with check (public.is_admin() or (public.is_lancador() and public.reidi_compra_e_minha(compra_id)));
    create policy reidi_pag_update on public.reidi_pagamentos for update to authenticated
      using      (public.is_admin() or (public.is_lancador() and public.reidi_compra_e_minha(compra_id)))
      with check (public.is_admin() or (public.is_lancador() and public.reidi_compra_e_minha(compra_id)));
    create policy reidi_pag_delete on public.reidi_pagamentos for delete to authenticated
      using (public.is_admin() or (public.is_lancador() and public.reidi_compra_e_minha(compra_id)));
  end if;
end;
$$;
revoke execute on function public.reidi_pagamentos_politicas() from public, anon, authenticated;   -- só o administrador do banco (SQL Editor) reaplica as regras
select public.reidi_pagamentos_politicas();

-- 6) Atualização em tempo real (Realtime) --------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'reidi_pagamentos') then
    alter publication supabase_realtime add table public.reidi_pagamentos;
  end if;
end $$;

-- (permissões por usuário) se o permissoes.sql já foi instalado, reaplica todas as regras por permissão (inclui as dos pagamentos)
do $$ begin
  if to_regprocedure('public.aplicar_politicas_permissoes()') is not null then perform public.aplicar_politicas_permissoes(); end if;
end $$;

-- Conferência (rode separado, uma consulta por vez):
--   1) status calculado × pagamentos de cada compra (a coluna "confere" deve ser true em todas as linhas):
--        select c.fornecedor, c.valor_negociado, coalesce(sum(p.valor), 0) as pago, c.valor_negociado - coalesce(sum(p.valor), 0) as saldo, c.status,
--               c.status = case when c.valor_negociado <= 0 then c.status when coalesce(sum(p.valor), 0) >= c.valor_negociado then 'Pago'
--                               when coalesce(sum(p.valor), 0) > 0 then 'Parcial' else 'A pagar' end as confere
--          from public.reidi_compras c left join public.reidi_pagamentos p on p.compra_id = c.id
--         group by c.id order by c.data_prevista, c.fornecedor;
--   2) pagamentos lançados:
--        select c.fornecedor, p.data_pagamento, p.valor, p.obs, p.criado_por_nome, p.criado_em
--          from public.reidi_pagamentos p join public.reidi_compras c on c.id = p.compra_id order by p.data_pagamento, p.criado_em;
--   3) regras de acesso (4 linhas; com permissoes.sql instalado, "por_permissao" = true):
--        select policyname, cmd, (coalesce(qual, '') || ' ' || coalesce(with_check, '')) ~ 'tem_permissao' as por_permissao
--          from pg_policies where tablename = 'reidi_pagamentos' order by cmd;
