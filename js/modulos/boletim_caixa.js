/* Módulo Boletim de Caixa: planilha publicada pelo administrador (mesmo fluxo do Dashboard).
   O admin clica em "⬆ Atualizar base" e escolhe o Excel da pasta dele; a base fica no Supabase (tabela public.bases)
   e todos os usuários veem. A lógica fica em js/core/baseview.js; quando o relatório deste módulo for definido,
   troque esta chamada por um módulo próprio, mantendo BASE.ler / BASE.gravar com a chave 'boletim_caixa'. */
baseModulo({id:'boletim',chave:'boletim_caixa',titulo:'Boletim de Caixa',sub:'Planilha publicada pelo administrador'});
