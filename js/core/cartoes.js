/* Cartões de valor padrão (o mesmo visual do Dashboard Financeiro): selo colorido com ícone + TÍTULO em negrito e maiúsculas + valor numa linha só que se ajusta à largura do cartão.
   Usado por Fundo de Reserva, REIDI e Programação Financeira Quadrimestral.
   CRT.kpi({t, v, s, c, ic, tom, cls, st, mx})  → cartão completo (t = título, v = valor, s = linha de apoio, c = classes de cor do valor, ic = ícone, tom = cor do selo, cls/st = classes/estilo extras do cartão)
   CRT.titulo(t, ic, tom, grande)               → só o cabeçalho (selo + título) para cartões com conteúdo próprio
   Todos os textos recebidos já devem vir escapados quando vierem de dados (t e s aceitam HTML). */
const CRT = (() => {
  'use strict';
  const SV = d => `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`,
    IP = {
      cofre: '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
      sobe: '<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>',
      desce: '<polyline points="22 17 13.5 8.5 8.5 13.5 2 7"/><polyline points="16 17 22 17 22 11"/>',
      cofrinho: '<path d="M19 5c-1.5 0-2.8 1.4-3 2-3.5-1.5-11-.3-11 5 0 1.8 0 3 2 4.5V20h4v-2h3v2h4v-4c1-.5 1.7-1 2-2h2v-4h-2c0-1-.5-1.5-1-2V5z"/><path d="M2 9v1c0 1.1.9 2 2 2h1"/><path d="M16 11h.01"/>',
      bandeira: '<path d="M4 22V4a1 1 0 0 1 .4-.8A6 6 0 0 1 8 2c3 0 5 2 7.3 2q2 0 3.1-.8A1 1 0 0 1 20 4v10a1 1 0 0 1-.4.8A6 6 0 0 1 16 16c-3 0-5-2-8-2a6 6 0 0 0-4 1.5"/>',
      recibo: '<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 17.5v-11"/>',
      balanca: '<path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="M7 21h10"/><path d="M12 3v18"/><path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2"/>',
      banco: '<path d="M3 21h18"/><path d="M5 21V10"/><path d="M19 21V10"/><path d="M9 21V10"/><path d="M15 21V10"/><path d="m2 10 10-7 10 7Z"/>',
      envia: '<path d="M7 7h10v10"/><path d="M7 17 17 7"/>',
      carrinho: '<circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/>',
      percentual: '<line x1="19" y1="5" x2="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>',
      lista: '<path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/>'
    },
    IC = Object.fromEntries(Object.entries(IP).map(([k, v]) => [k, SV(v)])),
    TOM = { azul: 'bg-sky-500/15 text-sky-600 dark:text-sky-300', ver: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400', verm: 'bg-rose-500/15 text-rose-600 dark:text-rose-400', amb: 'bg-amber-500/15 text-amber-600 dark:text-amber-400', ind: 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-300' },
    /* cabeçalho: selo com ícone + título (negrito, maiúsculas; cresce com a largura do cartão — o pai precisa ter container-type:inline-size) */
    titulo = (t, ic, tom, grande, tmx) => `<div class="flex items-center gap-2.5"><span class="shrink-0 ${grande ? 'w-11 h-11' : 'w-10 h-10'} rounded-xl grid place-items-center ${TOM[tom] || TOM.ind}">${IC[ic] || IC.lista}</span><div class="min-w-0 break-words font-extrabold uppercase tracking-wide leading-tight text-slate-700 dark:text-slate-200" style="font-size:clamp(.78rem,${grande ? '5.2' : '7.4'}cqw,${grande ? '1.15' : (tmx || '1.04')}rem)">${t}</div></div>`,
    kpi = ({ t, v, s, c, ic, tom, cls = '', st = '', mx = 1.6, sc = 'text-slate-500', tmx }) => `<div class="card py-4 min-w-0 flex flex-col justify-center ${cls}" style="${st}"><div class="w-full" style="container-type:inline-size">${titulo(t, ic, tom, false, tmx)}
      <div class="font-bold mt-3 whitespace-nowrap tabular-nums leading-tight text-xl ${c || ''}" style="font-size:clamp(.8rem,10.2cqw,${mx}rem)">${v}</div>${s ? `<div class="text-xs ${sc} mt-1">${s}</div>` : ''}</div></div>`;
  return { kpi, titulo, IC, TOM }
})();
