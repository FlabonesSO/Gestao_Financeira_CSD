-- =====================================================================
-- CONTAS A RECEBER · controle do que já foi recebido do cliente × o que foi faturado
-- Rode UMA vez no SQL Editor do Supabase (é seguro rodar de novo).
-- Pré-requisitos: schema-consorcio-santadulce.sql e bases-dados.sql. Depois rode permissoes.sql (último).
--
--  • public.recebimentos → uma linha por RECEBIMENTO lançado (data, valor, observação), ligado ao faturamento pela Data_Base
--    (e ao nº do título, guardado como referência). Um faturamento pode ter vários recebimentos (pagamento parcial).
--  • O FATURAMENTO (Data_Base, nº do título, total faturado, impostos, adiantamento e saldo a receber do cliente) NÃO é digitado de novo:
--    vem da base publicada do Fundo de Reserva (public.bases · fundo_reserva), pela função contas_a_receber_base(), que devolve só essas colunas.
--  • Quem pode: ver = permissão receber.ver · registrar/editar = receber.lancar · excluir = receber.excluir (permissoes.sql).
--    Antes de rodar permissoes.sql, só o administrador acessa (padrão seguro).
--  • Cada inclusão, alteração e exclusão vai para a Auditoria, gravada pelo banco (gatilho).
-- =====================================================================

-- 1) Utilitários ----------------------------------------------------------
-- número de dentro do JSON (aceita número e texto numérico; qualquer outra coisa vira nulo, sem erro)
create or replace function public.jsonb_numero(j jsonb)
returns numeric language sql immutable set search_path = public as $$
  select case
    when j is null then null
    when jsonb_typeof(j) = 'number' then (j #>> '{}')::numeric
    when jsonb_typeof(j) = 'string' and (j #>> '{}') ~ '^-?\d+(\.\d+)?([eE][-+]?\d+)?$' then (j #>> '{}')::numeric
    else null
  end;
$$;

-- valor em reais no padrão brasileiro (para a Auditoria), independente do idioma do servidor
create or replace function public.fmt_brl(v numeric)
returns text language sql immutable set search_path = public as $$
  select 'R$ ' || translate(to_char(coalesce(v, 0), 'FM999,999,999,999,990.00'), ',.', '.,');
$$;

-- 2) Tabela dos recebimentos -------------------------------------------------
create table if not exists public.recebimentos (
  id                  uuid          primary key default gen_random_uuid(),
  data_base           date          not null check (data_base >= date '2000-01-01'),          -- Data_Base (competência) do faturamento que foi pago
  titulo              text          not null default '',                                       -- nº do título no momento do lançamento (referência)
  data_recebimento    date          not null check (data_recebimento >= date '2000-01-01'),   -- dia em que o dinheiro entrou
  valor               numeric(16,2) not null check (valor > 0),
  obs                 text          not null default '' check (char_length(obs) <= 300),
  criado_por          uuid          default auth.uid(),
  criado_por_nome     text,
  criado_em           timestamptz   not null default now(),
  atualizado_por      uuid,
  atualizado_por_nome text,
  atualizado_em       timestamptz   not null default now()
);

create index if not exists recebimentos_data_base_idx on public.recebimentos (data_base);
create index if not exists recebimentos_data_receb_idx on public.recebimentos (data_recebimento);

-- carimbo: quem lançou / quem alterou e quando (grava o banco; não dá para falsificar pela tela)
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
  return new;
end;
$$;

drop trigger if exists trg_recebimentos_carimbo on public.recebimentos;
create trigger trg_recebimentos_carimbo
  before insert or update on public.recebimentos
  for each row execute function public.recebimentos_carimbo();

-- Auditoria gravada pelo banco
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
  insert into public.auditoria (usuario, evento) values (coalesce(v_login, 'sistema'), left(v_ev, 200));
  return null;
end;
$$;

drop trigger if exists trg_recebimentos_auditoria on public.recebimentos;
create trigger trg_recebimentos_auditoria
  after insert or update or delete on public.recebimentos
  for each row execute function public.recebimentos_auditoria();

-- 3) Regras de acesso (RLS) ---------------------------------------------------
alter table public.recebimentos enable row level security;
revoke all on table public.recebimentos from anon, authenticated;
grant select, insert, update, delete on table public.recebimentos to authenticated;

-- padrão seguro: só o administrador. permissoes.sql troca estas regras pelas permissões receber.ver / receber.lancar / receber.excluir.
drop policy if exists recebimentos_select on public.recebimentos;
create policy recebimentos_select on public.recebimentos for select to authenticated using (public.is_admin());
drop policy if exists recebimentos_insert on public.recebimentos;
create policy recebimentos_insert on public.recebimentos for insert to authenticated with check (public.is_admin());
drop policy if exists recebimentos_update on public.recebimentos;
create policy recebimentos_update on public.recebimentos for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists recebimentos_delete on public.recebimentos;
create policy recebimentos_delete on public.recebimentos for delete to authenticated using (public.is_admin());

-- 4) O faturamento (vem da base publicada do Fundo de Reserva) -------------------------------------
-- Devolve, por Data_Base, só o que o relatório precisa. Quem tem receber.ver NÃO precisa ver o Fundo de Reserva inteiro (impostos por tributo, etc.).
-- Regras iguais às do Fundo de Reserva: Total Faturado = coluna tf (ou o Valor Bruto, em bases antigas);
-- Saldo a receber do cliente = coluna sal (ou Valor Líquido − Desconto do Adiantamento).
create or replace function public.contas_a_receber_base()
returns table (data_base date, numero_titulo text, total_faturado numeric, impostos numeric, liquido numeric,
               adiantamento numeric, saldo_cliente numeric, atualizado_em timestamptz)
language plpgsql security definer stable set search_path = public as $$
begin
  if to_regprocedure('public.tem_permissao(text)') is not null then
    if not public.tem_permissao('receber.ver') then
      raise exception 'Sem permissão.' using errcode = '42501';
    end if;
  elsif not public.is_admin() then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  return query
  select x.d,
         x.titulo,
         round(coalesce(nullif(x.tf, 0), x.bruto, x.tf, 0), 2),
         round(coalesce(x.ret, 0), 2),
         round(x.liq, 2),
         round(coalesce(x.adi, 0), 2),
         round(coalesce(nullif(x.sal, 0), x.liq - coalesce(x.adi, 0)), 2),
         x.atualizado_em
  from (
    select case when (e.item ->> 'd') ~ '^\d{4}-\d{2}-\d{2}$' then (e.item ->> 'd')::date end as d,
           btrim(coalesce(e.item ->> 'titulo', '')) as titulo,
           public.jsonb_numero(e.item -> 'tf')    as tf,
           public.jsonb_numero(e.item -> 'bruto') as bruto,
           public.jsonb_numero(e.item -> 'ret')   as ret,
           coalesce(nullif(public.jsonb_numero(e.item -> 'liq'), 0),
                    coalesce(public.jsonb_numero(e.item -> 'bruto'), 0) - coalesce(public.jsonb_numero(e.item -> 'ret'), 0)) as liq,
           public.jsonb_numero(e.item -> 'adi')   as adi,
           public.jsonb_numero(e.item -> 'sal')   as sal,
           b.atualizado_em
    from public.bases b
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(b.dados -> 'd') = 'array' then b.dados -> 'd' else '[]'::jsonb end
    ) as e(item)
    where b.chave = 'fundo_reserva'
      and jsonb_typeof(e.item) = 'object'
      and (e.item ->> 'd') ~ '^\d{4}-\d{2}-\d{2}$'
  ) x
  order by x.d;
end;
$$;
revoke execute on function public.contas_a_receber_base() from public, anon;
grant  execute on function public.contas_a_receber_base() to authenticated;

-- 5) Atualização em tempo real (Realtime) -----------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'recebimentos') then
    alter publication supabase_realtime add table public.recebimentos;
  end if;
end $$;

-- (permissões por usuário) se o permissoes.sql já foi instalado, reaplica as regras por permissão por cima das regras acima
do $$ begin
  if to_regprocedure('public.aplicar_politicas_permissoes()') is not null then perform public.aplicar_politicas_permissoes(); end if;
end $$;

-- Conferência (rode separado depois):
--   select data_base, titulo, valor, data_recebimento, criado_por_nome from public.recebimentos order by data_base, data_recebimento;
--
-- contas_a_receber_base() só responde a usuário LOGADO NO SITE com a permissão receber.ver (ou administrador) — é a função que a tela
-- "Contas a Receber" chama. No SQL Editor não existe usuário logado e ela devolve "42501 Sem permissão": é o esperado, não é falha da instalação.
-- Para conferir o faturamento, abra a tela Contas a Receber logado no site.
