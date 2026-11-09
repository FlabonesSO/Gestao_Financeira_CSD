-- =====================================================================
-- REIDI · PERMISSÕES DO LANÇADOR  (rode UMA vez; seguro rodar de novo)
--   • Lançador edita e exclui SOMENTE as compras que ele mesmo lançou (administrador: todas)
--   • Lançador lê os parâmetros do REIDI (bases · reidi_config) para ver o relatório
--     (as demais bases continuam bloqueadas para ele)
--   Para o Responsável automático (nome do cadastro), rode também reidi-lancador-proprio.sql.
-- (permissões por usuário) este script recria regras de acesso POR PERFIL; se o sistema de permissões (permissoes.sql) já estiver instalado,
-- ele termina reaplicando as regras POR PERMISSÃO automaticamente (bloco "permissões por usuário" no fim do arquivo).
-- =====================================================================
drop policy if exists bases_select on public.bases;
create policy bases_select on public.bases
  for select to authenticated
  using (public.is_leitor() or (public.is_lancador() and chave = 'reidi_config'));

drop policy if exists reidi_update on public.reidi_compras;
create policy reidi_update on public.reidi_compras
  for update to authenticated
  using      (public.is_admin() or (public.is_lancador() and criado_por = auth.uid()))
  with check (public.is_admin() or (public.is_lancador() and criado_por = auth.uid()));

drop policy if exists reidi_delete on public.reidi_compras;
create policy reidi_delete on public.reidi_compras
  for delete to authenticated
  using (public.is_admin() or (public.is_lancador() and criado_por = auth.uid()));

-- (permissões por usuário) se o permissoes.sql já foi instalado, reaplica as regras por permissão por cima das regras por perfil criadas acima
do $$ begin
  if to_regprocedure('public.aplicar_politicas_permissoes()') is not null then perform public.aplicar_politicas_permissoes(); end if;
end $$;
