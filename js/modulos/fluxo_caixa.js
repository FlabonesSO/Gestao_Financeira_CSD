/* Módulo Fluxo de Caixa Projetado: planilha publicada pelo administrador (mesmo fluxo do Dashboard).
   O admin clica em "⬆ Atualizar base" e escolhe o Excel da pasta dele; a base fica no Supabase (tabela public.bases)
   e todos os usuários veem. A lógica fica em js/core/baseview.js; quando o relatório deste módulo for definido,
   troque esta chamada por um módulo próprio, mantendo BASE.ler / BASE.gravar com a chave 'fluxo_projetado'. */
baseModulo({id:'fluxo',chave:'fluxo_projetado',titulo:'Fluxo de Caixa Projetado',sub:'Projeção de entradas e saídas'});
