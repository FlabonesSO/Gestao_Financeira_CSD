/* Base do sistema: logo, registro de plugins e utilitários usados por todos os módulos
   ($ seletor · f moeda · p percentual · br data dd/mm/aaaa · N texto sem acento) */
document.querySelectorAll('.logo').forEach(i=>i.src=LOGO);
Chart.register(ChartDataLabels);
const $=s=>document.querySelector(s),
 f=n=>(+n||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}),
 p=n=>((+n||0)*100).toFixed(2).replace('.',',')+'%',
 br=i=>String(i).split('-').reverse().join('/'),
 N=s=>String(s==null?'':s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
let ROLE='viewer'; // perfil do usuário logado ('admin' ou 'viewer'), definido em start()
/* Salva arquivos gerados: na página publicada usa a capacidade "downloads" (pede confirmação); fora dela, baixa direto */
async function saveAs(n,data){try{const dl=await claude.use("downloads");if(dl){await dl.save({filename:n,data});return}}catch(e){if(e&&e.code=="declined")return}
 const b=data instanceof Blob?data:new Blob([data]),x=document.createElement("a");x.href=URL.createObjectURL(b);x.download=n;x.click();setTimeout(()=>URL.revokeObjectURL(x.href),1500)}
