-- =====================================================================
-- SEGUROS · vários tipos de seguro para o mesmo fornecedor (uma linha por tipo)
-- Rode UMA vez no SQL Editor do Supabase (é seguro rodar de novo).
-- Pré-requisito: seguros.sql já rodado.
--
-- O QUE MUDA
--   O fornecedor continua cadastrado UMA vez só (código e CNPJ únicos) e passa a ter quantos tipos de seguro precisar (até 20).
--   Na aba Empresas, cada tipo vira uma LINHA: o mesmo fornecedor aparece em 2, 3... linhas, uma por tipo de seguro.
--   Os tipos novos são acrescentados à empresa que já existe (botão "＋ Tipo de seguro" na tela) — não precisa recadastrar nada.
--
-- A ÚNICA MUDANÇA NO BANCO (trava de segurança)
--   Um tipo de seguro que JÁ TEM PAGAMENTOS não pode ser retirado da empresa: a linha dele sumiria da tela e os pagamentos ficariam sem tipo.
--   Para retirar um tipo, altere ou exclua antes os pagamentos dele. Tudo o mais continua igual (dados, pagamentos, comprovantes, permissões).
--   Este script só troca a função do gatilho de empresas; nenhuma tabela, linha ou arquivo é alterado.
-- =====================================================================

do $$
begin
  if to_regclass('public.seguros_empresas') is null or to_regclass('public.seguros_pagamentos') is null then
    raise exception 'Rode antes o seguros.sql: faltam as tabelas do relatório de Seguros.' using errcode = '55000';
  end if;
end $$;

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

-- (o gatilho trg_seguros_empresas_antes, criado pelo seguros.sql, já aponta para esta função: ao trocar o corpo dela a trava passa a valer na hora)

-- Conferência (rode separado): deve devolver 1 linha, com "true"
--   select prosrc like '%tem pagamentos registrados%' as trava_ativa
--     from pg_proc where proname = 'seguros_empresas_antes';
