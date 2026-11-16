/* Cliente Supabase único do sistema + chamada à Edge Function administrativa */
const CFG=window.CSD||{},
 SB_OK=!!(CFG.URL&&CFG.KEY&&!/COLE_AQUI/.test(CFG.KEY)&&window.supabase),
 sb_=SB_OK?window.supabase.createClient(CFG.URL,CFG.KEY,{auth:{persistSession:true,autoRefreshToken:true}}):null,
 emailDe=l=>l.includes('@')?l:l+'@'+CFG.DOMAIN;
async function adminUsuarios(payload){
 const{data,error}=await sb_.auth.getSession();if(error||!data.session)throw new Error('Sessão expirada. Faça login novamente.');
 const r=await fetch(CFG.URL+'/functions/v1/admin-usuarios',{method:'POST',headers:{'Content-Type':'application/json',apikey:CFG.KEY,Authorization:'Bearer '+data.session.access_token},body:JSON.stringify(payload)}),
  j=await r.json().catch(()=>({}));
 if(!r.ok)throw new Error(j.error||'Não foi possível concluir a operação.');return j}
