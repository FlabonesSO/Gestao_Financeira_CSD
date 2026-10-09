-- =====================================================================
-- REIDI · LANÇADOR SÓ EDITA/EXCLUI O QUE ELE MESMO LANÇOU + RESPONSÁVEL = NOME DO CADASTRO
-- Rode UMA vez no SQL Editor do Supabase. É seguro rodar de novo.
--
--   admin     → inclui, edita e exclui QUALQUER compra
--   lancador  → inclui; edita e exclui SOMENTE as compras que ele lançou (criado_por = ele)
--   viewer    → só lê
--
--   Responsável = nome do cadastro (public.perfis.nome) de quem lançou. É gravado pelo banco
--   (não dá para burlar pela tela) e não muda quando outra pessoa edita a compra.
-- =====================================================================

-- 1) Carimbo: responsável automático na inclusão; responsável e autor preservados na edição
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

-- 2) Permissões: o lançador só altera as próprias compras
drop policy if exists reidi_update on public.reidi_compras;
create policy reidi_update on public.reidi_compras
  for update to authenticated
  using      (public.is_admin() or (public.is_lancador() and criado_por = auth.uid()))
  with check (public.is_admin() or (public.is_lancador() and criado_por = auth.uid()));

drop policy if exists reidi_delete on public.reidi_compras;
create policy reidi_delete on public.reidi_compras
  for delete to authenticated
  using (public.is_admin() or (public.is_lancador() and criado_por = auth.uid()));

-- (a política de INSERT não muda: admin ou lançador)

-- 3) Compras antigas (carga inicial) NÃO têm autor (criado_por vazio): só o administrador mexe nelas.
--    Se quiser passar alguma para um lançador (ele passa a poder editar/excluir e vira o responsável), ajuste e rode:
--
--   update public.reidi_compras c
--      set criado_por = p.id, criado_por_nome = p.nome
--     from public.perfis p
--    where p.login = 'LOGIN_DO_LANCADOR' and c.criado_por is null and c.responsavel = 'Fernanda de Sá';
--   -- (o texto do responsável dessas compras antigas continua o que já estava gravado)

-- Conferência (rode separado):
--   select policyname, cmd from pg_policies where tablename = 'reidi_compras' order by cmd;
