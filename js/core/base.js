/* Base compartilhada dos módulos: lê/grava a última planilha publicada de cada módulo
   na tabela public.bases (chaves: fundo_reserva, reidi, fluxo_projetado, reidi_config, dashboard_fornecedores).
   Quem grava e quem lê é decidido pelo banco (RLS + permissões: pode_ler_base / pode_publicar_base). Carregado depois de supabase.js. */
const BASE={
 T:'bases',
 cli(){return typeof sb_!='undefined'&&sb_?sb_:null},
 fdh(s){const d=new Date(s);return isNaN(d)?'':d.toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'})},
 async ler(chave){const c=this.cli();if(!c)return null;
  const{data,error}=await c.from(this.T).select('dados,arquivo,atualizado_em').eq('chave',chave).maybeSingle();if(error)throw error;return data},
 async gravar(chave,dados,arquivo){const c=this.cli();if(!c)throw new Error('Supabase não configurado');
  const{data,error}=await c.from(this.T).upsert({chave,dados,arquivo}).select('atualizado_em').single();if(error)throw error;return data}
};
