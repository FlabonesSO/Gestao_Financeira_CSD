/* Módulo "Contas a Receber" · controle do que JÁ RECEBEMOS do cliente × o que FATURAMOS, por Data_Base (competência do Fundo de Reserva).
   • O faturamento (Valor Bruto da NF, retenção contratual, desconto do adiantamento, ISS, INSS, Valor Líquido, DOC FISCAL, data prevista de pagamento...) vem sozinho da base publicada do Fundo de Reserva
     (aba "BASE DE MEDICAO" da planilha MEDICAO_SERVICO, só NFs com DOC FISCAL) — ninguém digita de novo. A Data_Base é a DATA EMISSAO NF.
   • Quem tem a permissão "Registrar e editar recebimentos" lança cada pagamento do cliente (data, valor, observação). Vários pagamentos por Data_Base = pagamento parcial.
   • O recebimento é ligado à NF pelo DOC FISCAL (e, sem ele, pela Data_Base): se a DATA EMISSAO NF de uma NF mudar na planilha, os recebimentos dela ACOMPANHAM a NF (ver RCB.vincula em js/core/receber_dados.js).
   • TOTAL FATURADO LÍQUIDO = Valor Líquido da planilha (Valor Bruto − Retenção Contratual − Desconto do Adiantamento − ISS − INSS: o que o cliente de fato paga). O Valor Bruto (Total Faturado) e as retenções aparecem só como informação.
     A RECEBER = Total Faturado Líquido − Recebido. Situação: Em aberto · Parcial · Recebido · Recebido a maior. (Pedido O: o cartão que se chamava "A Receber" passou a "Total Faturado Líquido" e o que se chamava "Em Aberto" passou a "A Receber"; a tabela, o gráfico, o Excel e a janela de recebimento usam os mesmos nomes.)
   • Mostra a NF da competência (Faturas Emitidas) com 👁 Visualizar / ⬇ Baixar para quem tem a permissão de ver NF, e avisa quando o Valor Bruto das NFs não bate com o Total Faturado.
   • Pedido AE: o gráfico "Recebido × a receber por data prevista de recebimento" saiu da tela (e, com ele, o filtro por clique na coluna); os cartões e a tabela "Resumo Contas a Receber" continuam iguais.
   • UMA TABELA SÓ, "Resumo Contas a Receber" (pedido O: não há mais as abas "Por faturamento" e "Recebimentos lançados"; pedido P: novo nome e deixou de mostrar só os 3 próximos títulos): lista TODOS os faturamentos que passam nos filtros,
     o que já foi RECEBIDO e o que está EM ABERTO (ou parcial), na ordem da Prev. A Receber (empate: Data_Base); o Total soma as linhas mostradas e, sem filtro, é o mesmo valor dos cartões. As deduções (retenção contratual, adiantamento, ISS e INSS) ficam recolhidas atrás de uma seta.
     Os recebimentos lançados de cada faturamento (com ✎ Editar / Excluir) ficam atrás de "▸ Recebimentos (n)" na própria linha; os que não encontram mais a NF aparecem no fim da tabela, na faixa "Recebimentos sem NF".
   • Filtro de PERÍODO por meses (De/Até da Data_Base): o mesmo da Análise Fiscal de Faturas Emitidas (js/core/periodo.js). Vale para cartões, tabelas, recebimentos e Excel; abre em todos os meses (um mês novo entra sozinho); nada é gravado.
   • Excel com 2 abas (Contas a Receber e Recebimentos) no padrão visual do Consórcio.
   • Pedido AI · COMPROVANTE DO BANCO: cada recebimento pode ter um arquivo de comprovante (PDF, PNG, JPG ou WEBP, até 10 MB), anexado na janela "Registrar / Editar recebimento" (ou em "📎 Anexar", na lista de Recebimentos de cada Data_Base).
     Quem tem receber.ver abre na tela (👁 Visualizar, sem baixar) ou baixa (⬇); quem tem receber.lancar anexa, troca e remove. Trocar/remover não apaga o anterior: fica no histórico (🕘 anteriores) e continua disponível. A aba Recebimentos do Excel
     ganha a coluna COMPROVANTE DO BANCO (nome do arquivo). Precisa do SQL supabase/contas-receber-comprovante.sql; sem ele a tela avisa só ao tentar anexar (RCB.CPok).
   Dados em js/core/receber_dados.js (RCB → public.recebimentos + função contas_a_receber_base()). Regras reais no banco (RLS, supabase/permissoes.sql).
   MÓDULO ISOLADO: usa de js/core: $, N, PERM, mo/closeMd/dlg (usuarios.js), saveAs, RCB, FDB, NFV (NF e comprovante), XR/XP (Excel), Chart. */
(() => {
  'use strict';
  const VIEW = document.querySelector('[data-view="receber"]'); if (!VIEW) return;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    dmy = iso => iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4) : '',
    dh = iso => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) },
    brl = n => ((+n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
    fnum = n => n == null || isNaN(n) ? '' : n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    valBusca = n => { const t = fnum(n); return t + ' ' + t.replace(/\./g, '') }, /* 1.234.567,89 e 1234567,89 */
    pc = x => (Math.round(x * 1000) / 10).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 1 }) + '%',
    K = v => { const a = Math.abs(v), s = v < 0 ? '−' : ''; return a >= 1e9 ? s + 'R$ ' + (a / 1e9).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' bi' : a >= 1e6 ? s + 'R$ ' + (a / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mi' : a >= 1e3 ? s + 'R$ ' + (a / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mil' : s + 'R$ ' + a.toLocaleString('pt-BR') },
    /* valor digitado em reais ("12.160.667,52", "12160667,52", "12160667.52", "R$ 1.234,56") → número com 2 casas; NaN se não for um valor */
    num = t => { let x = String(t == null ? '' : t).replace(/R\$|\s/g, ''); if (!x) return NaN; if (x.includes(',')) x = x.replace(/\./g, '').replace(',', '.'); else if (/^\d{1,3}(\.\d{3})+$/.test(x)) x = x.replace(/\./g, ''); return /^\d+(\.\d+)?$/.test(x) ? Math.round(parseFloat(x) * 100) / 100 : NaN },
    g = id => (document.getElementById(id) || {}).value || '';
  /* ---------- cartões de indicador (mesmo padrão visual de Faturas Emitidas e do Dashboard) ---------- */
  const SV = d => `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`,
    IP = {
      recibo: '<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 17.5v-11"/>',
      relogio: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
      ok: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/>',
      nota: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/>',
      cadeado: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>'
    },
    TOM = { cinza: 'bg-slate-500/15 text-slate-600 dark:text-slate-300', ver: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400', azul: 'bg-sky-500/15 text-sky-600 dark:text-sky-300', amb: 'bg-amber-500/15 text-amber-600 dark:text-amber-400', ind: 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-300' },
    kp = (id, t, v, ic, tom, s, tt) => `<div class="card py-4 min-w-0 flex flex-col justify-center" data-kpi="${id}"${tt ? ` title="${esc(tt)}"` : ''}><div class="w-full" style="container-type:inline-size"><div class="flex items-center gap-2.5"><span class="shrink-0 w-10 h-10 rounded-xl grid place-items-center ${TOM[tom]}">${SV(IP[ic])}</span><div class="min-w-0 break-words font-extrabold uppercase tracking-wide leading-tight text-[13px] text-slate-700 dark:text-slate-200" style="font-size:clamp(.78rem,7.4cqw,1.04rem)">${t}</div></div><div class="font-bold mt-3 whitespace-nowrap tabular-nums leading-tight text-xl" data-v style="font-size:clamp(.8rem,10.2cqw,1.6rem)">${v}</div>${s ? `<div class="text-xs text-slate-500 mt-1">${s}</div>` : ''}</div></div>`;
  /* situação de cada Data_Base: ícone + rótulo (a cor nunca é o único sinal). Ícones em SVG: aparecem iguais em qualquer sistema (não dependem de fonte nem de emoji) */
  const SI = d => `<svg viewBox="0 0 16 16" width="12" height="12" class="inline-block align-[-1px] mr-0.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`,
    ST = {
      aberto: { t: 'Em aberto', i: SI('<circle cx="8" cy="8" r="5.5"/>'), c: 'bg-slate-500/15 text-slate-600 dark:text-slate-300' },
      parcial: { t: 'Parcial', i: SI('<circle cx="8" cy="8" r="5.5"/><path d="M8 2.5a5.5 5.5 0 0 1 0 11z" fill="currentColor" stroke="none"/>'), c: 'bg-sky-500/15 text-sky-700 dark:text-sky-300' },
      quitado: { t: 'Recebido', i: SI('<path d="m3 8.6 3.2 3.2L13 4.8"/>'), c: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' },
      maior: { t: 'Recebido a maior', i: SI('<path d="M8 2.2 14.6 13.6H1.4Z"/><path d="M8 6.6v3.2M8 11.7v.1"/>'), c: 'bg-amber-500/15 text-amber-700 dark:text-amber-400' },
      zero: { t: 'Sem valor a receber', i: SI('<path d="M4 8h8"/>'), c: 'bg-slate-500/15 text-slate-500' }
    };
  let FQ = '', FPR = null, FS = '', MSG = '', ERR = false, ABRE = {}, EDIT = null, AUTO = '', PEND = false, DED = {}, HIST = {};
  const lanca = () => PERM.tem('receber.lancar'), exclui = () => PERM.tem('receber.excluir'), vNF = () => PERM.tem('fat.ver');

  /* NFs da competência (mês da Data_Base) e conferência com o Total Faturado */
  const nfs = d => vNF() && typeof FDB != 'undefined' && FDB.ok ? FDB.mes(d.slice(0, 7)) : [],
    nfBruto = (L, tf) => { /* soma dos Valores Brutos das NFs do mês; só compara quando todas têm o valor informado */
      if (!L.length || L.some(x => x.vb == null)) return null; const s = L.reduce((t, x) => t + Math.round(x.vb * 100), 0); return { s: s / 100, dif: Math.abs(s - Math.round(tf * 100)) >= 1 }
    };

  /* ---------- data prevista de recebimento (Prev. A Receber) ----------
     É a DATA PREVISTA DE PAGAMENTO da planilha (emissão da NF + prazo). Base antiga, sem essa coluna: estimativa = Data_Base + 30 dias (marcada com "~"). */
  const mais30 = iso => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + 30); return d.toISOString().slice(0, 10) },
    prev = r => r.dp ? { d: r.dp, est: false } : { d: mais30(r.d), est: true },
    pv = r => { const x = prev(r); return (x.est ? '~ ' : '') + dmy(x.d) };

  /* ---------- período (igual ao da Análise Fiscal de Faturas Emitidas: js/core/periodo.js) ----------
     Meses (AAAA-MM) da Data_Base com faturamento na base. FPR = null → todos os meses (um mês novo na base entra sozinho). Nada é gravado: o período vale enquanto a tela está aberta. */
  const rcMeses = () => RCB.F.ok ? [...new Set(RCB.F.L.map(r => r.d.slice(0, 7)))].sort() : [], rcPer = () => PER.fix(FPR, rcMeses()),
    perOk = d => { if (!FPR) return true; const p = rcPer(), m = String(d).slice(0, 7); return m >= p.de && m <= p.ate };
  function pintaPer() {   /* a caixa só é refeita quando muda (os meses da base ou a escolha): digitar na busca não mexe nela */
    const el = document.getElementById('rc-per'); if (!el) return;
    const h = PER.bar({ id: 'rc-pb', ms: rcMeses(), s: rcPer(), fn: 'receber.per', pre: 'receber.pre' });
    if (el._h !== h) { el.innerHTML = h; el._h = h }
  }

  /* ---------- filtros (valem para os cartões e as tabelas) ----------
     filtradas() = filtros da tela (busca, período, situação); visiveis() = o mesmo (a antiga coluna escolhida no gráfico saiu no pedido AE). */
  function filtradas() {
    const q = N(FQ), L = RCB.linhas('saldo').filter(r => perOk(r.d) && (!FS || r.st == FS));
    /* pedido AG: o campo diz “Buscar por nº NF ou Valor”: além do DOC FISCAL (nº da NF), a busca acha os valores da linha (Valor Bruto, Total Faturado Líquido, Recebido e A Receber), com ou sem os pontos de milhar; o que já era pesquisável (data, situação, NF anexada, recebimentos, observação, responsável) continua */
    return L.filter(r => !q || N([dmy(r.d), r.titulo, ST[r.st].t, ...[r.tf, r.dev, r.rec, r.ab].map(valBusca), ...nfs(r.d).map(x => x.num + ' ' + x.nome), ...r.rs.map(x => dmy(x.dr) + ' ' + valBusca(x.v) + ' ' + x.obs + ' ' + x.cn)].join(' ')).includes(q))
  }
  const visiveis = () => filtradas();
  function orfaos() {
    const q = N(FQ); if (FS) return [];
    return RCB.orfaos().filter(x => perOk(x.d) && (!q || N([dmy(x.d), x.titulo, x.obs, x.cn, dmy(x.dr), fnum(x.v)].join(' ')).includes(q)))
  }
  /* as linhas da tabela "Resumo Contas a Receber" (pedido P): TODOS os faturamentos que passam nos filtros (busca, período, situação), recebidos e em aberto, do que vence primeiro para o que vence depois (Prev. A Receber; empate: Data_Base) */
  function ordena(L) {
    return L.slice().sort((a, b) => { const x = prev(a).d, y = prev(b).d; return x < y ? -1 : x > y ? 1 : a.d < b.d ? -1 : a.d > b.d ? 1 : 0 })
  }
  const soma = (L, k) => L.reduce((t, r) => t + Math.round(r[k] * 100), 0) / 100;

  /* ---------- tela ---------- */
  function head() {
    return `<div class="flex flex-wrap items-center gap-2"><div class="mr-auto min-w-0"><h1 class="text-2xl font-bold leading-tight">Contas a Receber</h1>
      </div>
      <div class="flex flex-wrap items-center gap-2 ml-auto">
        ${lanca() ? '<button class="btn" data-act="novo" onclick="receber.f()">＋ Registrar recebimento</button>' : ''}
        <button class="btn2" onclick="receber.xl()">Excel</button></div></div>
    <div id="rc-msg"></div>`
  }
  function filtros() {
    return `<div class="card" id="rc-f"><div class="grid grid-cols-2 md:grid-cols-4 gap-2">
      <input id="rc-q" class="inp col-span-2" placeholder="🔍 Buscar por nº NF ou Valor" value="${esc(FQ)}" oninput="receber.q(this.value)">
      <select id="rc-st" class="inp ${FS ? 'ring-2 ring-amber-500' : ''}" title="Situação" onchange="receber.fl('st',this.value)"><option value="">Todas as situações</option>${['aberto', 'parcial', 'quitado', 'maior'].map(k => `<option value="${k}" ${k == FS ? 'selected' : ''}>${ST[k].t}</option>`).join('')}</select>
      <button class="btn2" onclick="receber.lm()">Limpar</button></div></div>`
  }
  function render() {
    VIEW.innerHTML = head() + '<div id="rc-per" class="empty:hidden"></div>' + filtros() + `<div id="rc-k" class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3"></div>
      <div class="card"><h2 class="font-semibold mb-3">Resumo Contas a Receber</h2>
        <div id="rc-t" class="overflow-x-auto"></div></div>`;
    atualiza()
  }
  /* repinta cartões e tabela com os filtros atuais (não recria os campos de filtro: não perde o foco de quem está digitando) */
  function atualiza() {
    const k = document.getElementById('rc-k'); if (!k) return;
    pintaPer();
    const msg = document.getElementById('rc-msg');
    const erro = RCB.F.erro || RCB.erro, orf = RCB.orfaos();
    if (msg) msg.innerHTML = (MSG ? `<div class="text-sm rounded-lg px-3 py-2 ${ERR ? 'bg-rose-500/10 text-rose-500' : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'}" data-msg>${esc(MSG)}</div>` : '')
      + (erro ? `<div class="text-sm rounded-lg px-3 py-2 mt-2 bg-amber-500/10 text-amber-700 dark:text-amber-300" data-erro>⚠ ${esc(erro)}</div>` : '')
      + (RCB.F.ok && RCB.F.L.length && !RCB.F.novo ? '<div class="text-sm rounded-lg px-3 py-2 mt-2 bg-amber-500/10 text-amber-700 dark:text-amber-300" data-semsql>⚠ O banco ainda não devolve Retenção Contratual, ISS, INSS e Data prevista de pagamento: execute supabase/contas-receber-medicao.sql no Supabase. O “Total Faturado Líquido” já usa o Valor Líquido da base publicada.</div>' : '')
      + (orf.length ? `<div class="text-sm rounded-lg px-3 py-2 mt-2 bg-amber-500/10 text-amber-700 dark:text-amber-300" data-orfaos>⚠ ${orf.length} recebimento(s) (${brl(orf.reduce((t, x) => t + Math.round(x.v * 100), 0) / 100)}) não encontram a NF: nem o DOC FISCAL nem a Data_Base gravados nele existem mais na base do Fundo de Reserva. Veja a faixa “Recebimentos sem NF” no fim da tabela e use o ✎ Editar para escolher a NF certa (a partir daí ele acompanha a NF pelo DOC FISCAL).</div>` : '');
    if (!RCB.F.ok && !RCB.F.erro) { k.innerHTML = ['Total Faturado', 'Retenção Contratual', 'Total Faturado Líquido', 'Recebido', 'A Receber'].map((t, i) => kp('k' + i, t, '…', ['recibo', 'cadeado', 'relogio', 'ok', 'nota'][i], ['ver', 'cinza', 'azul', 'ind', 'amb'][i], 'carregando…')).join(''); tabela([], []); return }
    const L = visiveis(), tf = soma(L, 'tf'), dev = soma(L, 'dev'), rec = soma(L, 'rec'), ab = Math.round((dev - rec) * 100) / 100, p = dev > 0 ? rec / dev : 0, n = L.length;
    k.className = 'grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3';
    k.innerHTML = kp('tf', 'Total Faturado', brl(tf), 'recibo', 'ver', n + (n == 1 ? ' faturamento' : ' faturamentos') + (L.length != RCB.F.L.length ? ' · de ' + RCB.F.L.length : ''), 'Soma do Valor Bruto (NF) das Data_Base mostradas')
      + kp('rc', 'Retenção Contratual', RCB.F.novo ? brl(soma(L, 'rc')) : '—', 'cadeado', 'cinza', RCB.F.novo ? 'retida nas NFs · já descontada do Total Faturado Líquido' : 'execute o SQL contas-receber-medicao.sql', 'Soma da Retenção Contratual (coluna I da planilha) das Data_Base mostradas. O Valor Líquido (Total Faturado Líquido) já vem com ela descontada.')
      + kp('dev', 'Total Faturado Líquido', brl(dev), 'relogio', 'azul', 'Valor Líquido da planilha', 'Valor Bruto − Retenção Contratual − Desconto do Adiantamento − ISS − INSS')
      + kp('rec', 'Recebido', brl(rec), 'ok', 'ind', dev > 0 || rec > 0 ? pc(p) + ' do Total Faturado Líquido' : 'nada a receber no filtro', 'Soma dos recebimentos lançados nas Data_Base mostradas')
      + kp('ab', 'A Receber', brl(ab), 'nota', 'amb', ab < 0 ? '<span class="text-amber-600 dark:text-amber-400">recebido a maior</span>' : L.filter(r => r.st == 'aberto' || r.st == 'parcial').length + ' Data_Base com saldo', 'Total Faturado Líquido − Recebido');
    tabela(L, orfaos())
  }
  /* ---------- tabelas ---------- */
  const meter = r => `<div class="min-w-[100px]"><span class="px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${ST[r.st].c}" data-st="${r.st}">${ST[r.st].i}${ST[r.st].t}${r.st == 'parcial' ? ' · ' + pc(r.pct) : ''}</span>
      <div class="h-1.5 w-full max-w-[112px] mt-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden" aria-hidden="true"><div class="h-1.5 rounded-full ${r.st == 'maior' ? 'bg-amber-500' : 'bg-[#2a78d6] dark:bg-[#3987e5]'}" style="width:${Math.max(0, Math.min(1, r.pct)) * 100}%"></div></div>
      ${r.ult ? `<div class="mt-1 text-[11px] text-slate-500 whitespace-nowrap" data-ult="${esc(r.ult)}" title="Data do último recebimento lançado">último: ${dmy(r.ult)}</div>` : ''}</div>`;
  /* NF da competência, dentro da célula da Data_Base (sem coluna própria: a tabela cabe na tela) */
  function nfBloco(r) {
    if (!vNF()) return '';
    if (!FDB.ok) return `<div class="text-[11px] text-slate-400 mt-1">${FDB.erro ? 'NF indisponível' : 'NF…'}</div>`;
    const L = nfs(r.d);
    if (!L.length) return '<div class="text-[11px] text-slate-400 mt-1" data-nf="0">sem NF anexada</div>';
    const b = nfBruto(L, r.tf);
    return `<div class="mt-1 space-y-0.5" data-nf="${L.length}">${L.slice(0, 2).map(x => `<div class="flex items-center gap-1 whitespace-nowrap text-[11px]"><span class="font-medium" title="${esc(x.nome)}">${x.num ? 'NF ' + esc(x.num) : 'NF'}</span><button class="btn2 !py-0.5 !px-1.5 !text-[11px]" title="Abrir a NF na tela, sem baixar" onclick="NFV.abrir('${esc(x.id)}')">👁</button><button class="btn2 !py-0.5 !px-1.5 !text-[11px]" title="Baixar a NF" onclick="receber.nfd('${esc(x.id)}')">⬇</button></div>`).join('')}${L.length > 2 ? `<div class="text-[11px] text-slate-500">+${L.length - 2} NF(s)</div>` : ''}${b && b.dif ? `<div class="text-amber-600 dark:text-amber-400 text-[11px] leading-tight max-w-[150px]" data-nfdif title="Valor Bruto das NFs ${brl(b.s)} ≠ Total Faturado ${brl(r.tf)}">⚠ Valor Bruto da NF ≠ Total Faturado</div>` : ''}</div>`
  }
  /* ---------- comprovante do banco (pedido AI) ---------- */
  const bt = 'btn2 !py-0.5 !px-1.5 !text-[11px]', pl = (n, a, b) => n + ' ' + (n == 1 ? a : b),
    TXT_COMP = { carregando: 'Carregando o comprovante…', falhaAbrir: 'Não foi possível abrir o comprovante', falhaBaixar: 'Não consegui baixar o comprovante', falhaCarregar: 'Não consegui carregar o comprovante' };
  function comp(x) {   /* célula do comprovante: arquivo + 👁 Visualizar + ⬇ Baixar, ou "sem comprovante" (+ 📎 Anexar para quem lança). Sem o SQL no banco (CPok = false) não mostra nada */
    if (RCB.CPok === false) return '';
    const id = esc(x.id), h = x.ant.length ? `<div><button class="mt-1 text-[11px] underline text-slate-500" data-act="hist" onclick="receber.ch('${id}')">🕘 ${HIST[x.id] ? '▾' : '▸'} ${pl(x.ant.length, 'anterior', 'anteriores')}</button></div>` : '';
    if (!x.path) return `<span class="text-slate-400" data-sem>— sem comprovante</span>${lanca() ? `<div class="mt-1"><button class="${bt}" data-act="anexar" title="Anexar o comprovante do banco deste recebimento" onclick="receber.ed('${id}',1)">📎 Anexar</button></div>` : ''}${h}`;
    return `<div class="max-w-[200px] truncate text-xs font-medium" title="${esc(x.nome)}"><span aria-hidden="true">📎 </span><span data-nome>${esc(x.nome)}</span></div><div class="text-[11px] text-slate-500" data-bytes>${RCB.tam(x.bytes)}</div>
      <div class="flex flex-wrap gap-1 mt-1"><button class="${bt}" data-act="ver" title="Abrir o comprovante na tela, sem baixar" onclick="receber.cv('${id}')">👁 Visualizar</button><button class="${bt}" data-act="dl" title="Baixar o comprovante" onclick="receber.cd('${id}')">⬇ Baixar</button></div>${h}`
  }
  function histTr(x, span) {   /* comprovantes anteriores do recebimento (mais recente primeiro), numa linha logo abaixo dele */
    if (RCB.CPok === false || !HIST[x.id] || !x.ant.length) return '';
    const id = esc(x.id);
    return `<tr class="bg-slate-500/5" data-hist="${id}"><td colspan="${span}" class="px-3 py-3"><div class="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Comprovantes anteriores deste recebimento (o vigente está na linha acima)</div><div class="overflow-x-auto"><table class="w-full text-xs whitespace-nowrap">
      <thead class="text-slate-500 text-left"><tr><th class="py-1 pr-4">Arquivo</th><th class="pr-4">Tamanho</th><th class="pr-4">Anexado por</th><th class="pr-4">Substituído por</th><th></th></tr></thead>
      <tbody>${x.ant.map((h, i) => ({ h, i })).reverse().map(({ h, i }) => `<tr class="border-t border-slate-200 dark:border-slate-700" data-h="${i}"><td class="py-1.5 pr-4 max-w-[260px] truncate" title="${esc(h.nome)}">📎 ${esc(h.nome)}</td><td class="pr-4">${RCB.tam(h.bytes)}</td>
        <td class="pr-4">${esc(h.por) || '—'}<div class="text-[11px] text-slate-500">${dh(h.em)}</div></td><td class="pr-4">${esc(h.sub) || '—'}<div class="text-[11px] text-slate-500">${dh(h.sem)}</div></td>
        <td class="text-right"><button class="${bt}" data-act="ver-ant" onclick="receber.cv('${id}',${i})">👁 Visualizar</button> <button class="${bt}" data-act="dl-ant" onclick="receber.cd('${id}',${i})">⬇ Baixar</button></td></tr>`).join('')}</tbody></table></div></td></tr>`
  }
  function recLinhas(r) { /* recebimentos de uma Data_Base (linha expandida) */
    const ac = x => `${lanca() ? `<button class="btn2 !py-0.5 !text-xs" onclick="receber.ed('${x.id}')">✎ Editar</button>` : ''}${exclui() ? ` <button class="btn2 !py-0.5 !text-xs !text-rose-500" onclick="receber.del('${x.id}')">Excluir</button>` : ''}`;
    return `<tr class="bg-slate-500/5" data-det="${esc(r.d)}"><td colspan="8" class="px-3 py-3"><div class="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Recebimentos da Data_Base ${dmy(r.d)}</div>
      ${r.rs.length ? `<table class="w-full text-xs whitespace-nowrap"><thead class="text-slate-500 text-left"><tr><th class="py-1 pr-4">Data do recebimento</th><th class="pr-4 text-right">Valor</th><th class="pr-4">Observação</th>${RCB.CPok === false ? '' : '<th class="pr-4">Comprovante do banco</th>'}<th class="pr-4">Lançado por</th><th></th></tr></thead><tbody>${r.rs.map(x => `<tr class="border-t border-slate-200 dark:border-slate-700 align-top" data-rec="${esc(x.id)}"><td class="py-1.5 pr-4 font-medium">${dmy(x.dr)}${x.mv ? `<div class="text-[11px] font-normal text-slate-500" data-mv title="A NF mudou de Data_Base na planilha; o recebimento acompanhou a NF pelo DOC FISCAL">↪ lançado na Data_Base ${dmy(x.d0)}</div>` : ''}</td><td class="pr-4 text-right tabular-nums">${brl(x.v)}</td><td class="pr-4 whitespace-normal min-w-[160px]">${esc(x.obs) || '—'}</td>${RCB.CPok === false ? '' : `<td class="pr-4 min-w-[150px]" data-c="comp">${comp(x)}</td>`}<td class="pr-4">${esc(x.an && x.ae != x.ce ? x.an : x.cn) || '—'}<div class="text-[11px] text-slate-500">${dh(x.ae && x.ae != x.ce ? x.ae : x.ce)}${x.ae && x.ae != x.ce ? ' · alterado' : ''}</div></td><td class="text-right">${ac(x)}</td></tr>${histTr(x, RCB.CPok === false ? 5 : 6)}`).join('')}</tbody></table>` : '<p class="text-sm text-slate-500">Nenhum recebimento lançado para esta Data_Base.</p>'}</td></tr>`
  }
  /* recebimentos que não encontram mais a NF (a NF saiu da base do Fundo de Reserva): linhas no fim da própria tabela, na mesma grade de 8 colunas, com ✎ Editar para escolher a NF certa. Não entram nos cartões nem no Total */
  function orfLinhas(O) {
    if (!O || !O.length) return '';
    const P = 'px-1 py-2', R = O.slice().sort((a, b) => a.dr < b.dr ? 1 : a.dr > b.dr ? -1 : a.ce < b.ce ? 1 : -1);
    return `<tr class="border-t-2 border-amber-500/40" data-orfaos-grupo><td colspan="8" class="${P} pt-3 text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">⚠ Recebimentos sem NF (${R.length}) · não entram nos cartões nem no Total · use ✎ Editar para escolher a NF certa</td></tr>`
      + R.map(x => `<tr class="border-t border-slate-200 dark:border-slate-800 align-top" data-orf="${esc(x.id)}">
        <td class="${P}"><div class="font-semibold whitespace-nowrap">Recebido em ${dmy(x.dr)}</div><div class="text-[11px] leading-tight text-amber-600 dark:text-amber-400">⚠ sem NF · Data_Base gravada ${dmy(x.d)}${x.titulo ? ' · DOC FISCAL ' + esc(x.titulo) : ''}</div></td>
        <td colspan="3" class="${P}"><div class="min-w-[160px]">${esc(x.obs) || '<span class="text-slate-400">—</span>'}</div><div class="text-[11px] text-slate-500">${esc(x.an && x.ae != x.ce ? x.an : x.cn) || '—'} · ${dh(x.ae && x.ae != x.ce ? x.ae : x.ce)}${x.ae && x.ae != x.ce ? ' · alterado' : ''}</div>${comp(x) ? `<div class="mt-1.5" data-c="comp">${comp(x)}</div>` : ''}</td>
        <td class="${P} text-right whitespace-nowrap tabular-nums" data-c="v">${brl(x.v)}</td><td class="${P}"></td>
        <td class="${P}"><span class="px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap bg-amber-500/15 text-amber-700 dark:text-amber-400" data-st="semnf">Sem NF</span></td>
        <td class="${P} text-right whitespace-nowrap">${lanca() ? `<button class="btn2 !py-0.5 !text-xs" onclick="receber.ed('${esc(x.id)}')">✎ Editar</button>` : ''}${exclui() ? ` <button class="btn2 !py-0.5 !text-xs !text-rose-500" onclick="receber.del('${esc(x.id)}')">Excluir</button>` : ''}</td></tr>${histTr(x, 8)}`).join('')
  }
  function tabela(L, O) {
    const el = document.getElementById('rc-t'); if (!el) return;
    if (!RCB.F.ok) { el.innerHTML = `<div class="py-10 text-center text-slate-500">${RCB.F.erro ? esc(RCB.F.erro) : 'Carregando…'}</div>`; return }
    if (!RCB.F.L.length) { el.innerHTML = `<div class="py-10 text-center text-slate-500"><div class="text-4xl mb-2">💵</div><p class="font-semibold">Nenhum faturamento na base do Fundo de Reserva</p><p class="text-sm mt-1">O Contas a Receber usa as Data_Base publicadas no Fundo de Reserva.${PERM.tem('fundo.publicar') ? ' <button class="underline text-indigo-500" onclick="go(\'fundo\')">Abrir o Fundo de Reserva</button>' : ' Peça para publicarem a planilha.'}</p></div>${O.length ? `<table class="w-full text-[12.5px]" data-tab="fat"><tbody>${orfLinhas(O)}</tbody></table>` : ''}`; return }
    const D = ordena(L), nv_ = RCB.F.novo, tot = { tf: soma(D, 'tf'), rc: nv_ ? soma(D, 'rc') : null, adi: soma(D, 'adi'), iss: nv_ ? soma(D, 'iss') : null, inss: nv_ ? soma(D, 'inss') : null, dev: soma(D, 'dev'), rec: soma(D, 'rec') }, P = 'px-1 py-2',
      dd = v => v == null ? '<span class="text-slate-400">—</span>' : brl(v),
      nRec = D.filter(r => r.st == 'quitado' || r.st == 'maior').length, nAb = D.filter(r => r.st == 'aberto' || r.st == 'parcial').length,
      cap = D.length ? `${D.length} ${D.length == 1 ? 'faturamento' : 'faturamentos'} · ${nRec} ${nRec == 1 ? 'recebido' : 'recebidos'} · ${nAb} em aberto ou parcial` : 'Nenhum faturamento';
    /* Valor Bruto (NF) e, atrás da seta "Deduções", o que foi retido/descontado até chegar ao A Receber (retenção contratual, desconto do adiantamento, ISS e INSS): recolhido por padrão */
    const ded = (v, a, k) => DED[k] ? `<div class="mt-1 space-y-px text-[11px] leading-tight text-slate-500 dark:text-slate-400" data-ded>${[['rc', '(-) Ret. contr.', 'Retenção Contratual'], ['adi', '(-) Adiant.', 'Valor Desconto Adiantamento'], ['iss', '(-) ISS', 'Retenção ISS'], ['inss', '(-) INSS', 'Retenção INSS']].map(x => `<div class="flex justify-between gap-1 whitespace-nowrap" title="${x[2]}"><span>${x[1]}</span><span class="tabular-nums" data-${a}="${x[0]}">${dd(v[x[0]])}</span></div>`).join('')}</div>` : '',
      seta = k => `<button type="button" class="mt-0.5 text-[11px] font-normal text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 whitespace-nowrap" data-ded-btn="${esc(k)}" aria-expanded="${DED[k] ? 'true' : 'false'}" title="${DED[k] ? 'Recolher' : 'Mostrar'} a retenção contratual, o desconto do adiantamento, o ISS e o INSS" onclick="receber.ded('${esc(k)}')">${DED[k] ? '▾' : '▸'} Deduções</button>`;
    el.innerHTML = `<p class="text-xs text-slate-500 mb-2" data-janela>${cap}</p><table class="w-full text-[12.5px]" data-tab="fat"><thead class="text-xs uppercase text-slate-500 text-left"><tr><th class="${P}" title="Data_Base = DATA EMISSAO NF">Data_Base</th><th class="${P} text-right" title="Valor Bruto (NF); a seta Deduções mostra a Retenção Contratual, o Desconto do Adiantamento, o ISS e o INSS (valores positivos que saem do Valor Bruto)">Valor Bruto (NF)</th><th class="${P} text-right" title="Valor Líquido da planilha (Valor Bruto − Retenção Contratual − Desconto do Adiantamento − ISS − INSS): o que o cliente deve pagar">Total Faturado Líquido</th><th class="${P} text-right" title="Data prevista de recebimento (DATA PREVISTA DE PAGAMENTO da planilha). Com ~ = estimada: Data_Base + 30 dias">Prev. A Receber</th><th class="${P} text-right">Recebido</th><th class="${P} text-right" title="Total Faturado Líquido − Recebido">A Receber</th><th class="${P}">Situação</th><th class="${P} text-right">Ações</th></tr></thead>
      <tbody>${D.map(r => { const x = prev(r); return `<tr class="border-t border-slate-200 dark:border-slate-800 align-top" data-d="${esc(r.d)}">
        <td class="${P}"><div class="font-semibold whitespace-nowrap">${dmy(r.d)}</div><div class="text-[11px] text-slate-500 leading-tight">${r.titulo ? 'DOC FISCAL <span class="whitespace-nowrap">' + esc(r.titulo) + '</span>' : 'sem DOC FISCAL'}</div>${nfBloco(r)}</td>
        <td class="${P} text-right"><div class="whitespace-nowrap tabular-nums" data-c="tf">${brl(r.tf)}</div>${seta(r.d)}${ded(r, 'c', r.d)}</td>
        <td class="${P} text-right whitespace-nowrap tabular-nums font-semibold" data-c="dev">${brl(r.dev)}</td>
        <td class="${P} text-right whitespace-nowrap tabular-nums" data-prev="${esc(x.d)}" data-est="${x.est ? 1 : 0}" title="${x.est ? 'Estimada: a planilha não trouxe a data prevista; Data_Base + 30 dias' : 'DATA PREVISTA DE PAGAMENTO da planilha'}">${pv(r)}</td>
        <td class="${P} text-right whitespace-nowrap tabular-nums" data-c="rec">${brl(r.rec)}</td>
        <td class="${P} text-right whitespace-nowrap tabular-nums font-semibold ${r.ab < 0 ? 'text-amber-600 dark:text-amber-400' : ''}" data-c="ab">${brl(r.ab)}</td>
        <td class="${P}">${meter(r)}</td>
        <td class="${P} text-right"><div class="flex flex-col items-end gap-1 ml-auto">${lanca() && (r.st == 'aberto' || r.st == 'parcial') ? `<button class="btn !py-1 !px-1.5 !text-xs" title="Registrar um recebimento desta Data_Base" onclick="receber.f(null,'${esc(r.d)}')">＋ Receber</button>` : ''}<button class="btn2 !py-1 !px-1.5 !text-xs" onclick="receber.ab('${esc(r.d)}')">${ABRE[r.d] ? '▾' : '▸'} Recebimentos (${r.rs.length})</button></div></td></tr>${ABRE[r.d] ? recLinhas(r) : ''}` }).join('') || `<tr><td colspan="8" class="px-3 py-6 text-center text-slate-500">Nenhum faturamento encontrado com esse filtro.</td></tr>`}${orfLinhas(O)}</tbody>
      ${D.length > 1 ? `<tfoot><tr class="border-t-2 border-slate-300 dark:border-slate-700 font-semibold align-top"><td class="${P}">Total (${D.length})</td><td class="${P} text-right"><div class="tabular-nums" data-t="tf">${brl(tot.tf)}</div>${seta('tot')}${ded(tot, 't', 'tot')}</td><td class="${P} text-right tabular-nums" data-t="dev">${brl(tot.dev)}</td><td class="${P}"></td><td class="${P} text-right tabular-nums" data-t="rec">${brl(tot.rec)}</td><td class="${P} text-right tabular-nums" data-t="ab">${brl(Math.round((tot.dev - tot.rec) * 100) / 100)}</td><td colspan="2"></td></tr></tfoot>` : ''}</table>`
  }
  /* ---------- registrar / editar recebimento ---------- */
  function form(id, d0, foco) {
    const x = id ? RCB.R.find(r => r.id == id) : null; if (!lanca() || (id && !x)) return;
    EDIT = id || null; const hoje = RCB.hoje(), L = RCB.linhas('saldo').slice().sort((a, b) => a.d < b.d ? 1 : -1), d = x ? x.d : (d0 && L.some(r => r.d == d0) ? d0 : (L.find(r => r.st == 'aberto' || r.st == 'parcial') || L[0] || {}).d);
    if (!L.length) { dlg('Registrar recebimento', 'Não há faturamento na base do Fundo de Reserva para receber.'); return }
    const lb = (t, h) => `<label class="block text-xs text-slate-500 mb-1">${t}${h ? ' <span class="text-slate-400">' + h + '</span>' : ''}</label>`;
    mo(`<h2 class="text-lg font-bold mb-3">${x ? 'Editar recebimento' : 'Registrar recebimento'}</h2>
      ${lb('Faturamento (Data_Base) *')}<select id="rr-d" class="inp w-full mb-1" onchange="receber.inf(1)">${L.map(r => `<option value="${esc(r.d)}" ${r.d == d ? 'selected' : ''}>${dmy(r.d)}${r.titulo ? ' · DOC FISCAL ' + esc(r.titulo) : ''} · ${ST[r.st].t.toLowerCase()}</option>`).join('')}${x && !L.some(r => r.d == x.d) ? `<option value="${esc(x.d)}" selected>${dmy(x.d)} (sem faturamento correspondente)</option>` : ''}</select>
      <p id="rr-i" class="text-xs text-slate-500 mb-3 min-h-[1rem]"></p>
      <div class="grid grid-cols-2 gap-3 mb-3"><div>${lb('Data do recebimento *')}<input id="rr-dr" type="date" class="inp w-full" max="${hoje}" value="${esc(x ? x.dr : hoje)}" oninput="receber.inf()"></div>
        <div>${lb('Valor recebido *', '(R$)')}<input id="rr-v" class="inp w-full text-right tabular-nums" inputmode="decimal" autocomplete="off" placeholder="0,00" value="${x ? esc(fnum(x.v)) : ''}" oninput="receber.inf()" onblur="receber.vf(this)"></div></div>
      ${lb('Observação', '(opcional · ex.: nº do comprovante, parcial 1/2)')}<input id="rr-o" class="inp w-full mb-3" maxlength="300" value="${esc(x ? x.obs : '')}">
      ${cpForm(x, lb)}
      <p id="rr-e" class="hidden text-sm text-rose-500 mb-3"></p>
      <div class="flex justify-end gap-2"><button class="btn2" onclick="closeMd()">Cancelar</button><button id="rr-ok" class="btn" onclick="receber.sv()">${x ? 'Salvar alterações' : 'Registrar'}</button></div>`);
    AUTO = ''; info(true);
    if (foco) { const i = document.getElementById('rr-arq'); if (i) i.focus() }
  }
  /* campo do comprovante do banco na janela (pedido AI): opcional; ao editar mostra o arquivo atual (👁/⬇) e permite trocar ou remover (o atual vai para o histórico) */
  const ARQ_OK = '.pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp', DICA_ARQ = x => x && x.path ? 'Escolha um arquivo só se for trocar: o comprovante atual vai para o histórico.' : '';
  function cpForm(x, lb) {
    if (RCB.CPok === false) return '<p class="text-xs mb-3 text-amber-600 dark:text-amber-400" data-cp-aviso>⚠ Para anexar o comprovante do banco, rode o arquivo supabase/contas-receber-comprovante.sql no Supabase.</p>';
    return `<div class="mb-3" data-cp>${lb('Comprovante do banco', '(opcional · PDF, PNG, JPG ou WEBP · até 10 MB)')}
      ${x && x.path ? `<div class="flex flex-wrap items-center gap-2 text-xs mb-2" data-cp-atual><span class="font-medium max-w-[230px] truncate" title="${esc(x.nome)}">📎 ${esc(x.nome)}</span><span class="text-slate-500">${RCB.tam(x.bytes)}</span><button type="button" class="${bt}" onclick="receber.cv('${esc(x.id)}')">👁 Visualizar</button><button type="button" class="${bt}" onclick="receber.cd('${esc(x.id)}')">⬇ Baixar</button></div>
        <label class="flex items-center gap-2 text-xs mb-2 cursor-pointer"><input id="rr-rem" type="checkbox" onchange="receber.pa(document.getElementById('rr-arq'))"> Remover este comprovante (ele continua guardado no histórico)</label>` : ''}
      <input id="rr-arq" type="file" accept="${ARQ_OK}" class="inp w-full" aria-label="Arquivo do comprovante do banco" onchange="receber.pa(this)">
      <p id="rr-arq-i" class="text-xs text-slate-500 mt-1 min-h-[1rem]">${DICA_ARQ(x)}</p></div>`
  }
  function arqSel(inp) {   /* arquivo escolhido: mostra nome e tamanho (ou o problema, antes de enviar); "remover" e "trocar" não valem juntos */
    const a = document.getElementById('rr-arq-i'), rem = document.getElementById('rr-rem'), x = EDIT ? RCB.R.find(r => r.id == EDIT) : null, f0 = inp && inp.files && inp.files[0];
    if (!a || !inp) return;
    if (rem && rem.checked) { inp.value = ''; inp.disabled = true; a.className = 'text-xs mt-1 text-slate-500'; a.textContent = 'O comprovante atual será removido ao salvar (continua guardado no histórico).'; return }
    inp.disabled = false;
    if (!f0) { a.className = 'text-xs mt-1 text-slate-500 min-h-[1rem]'; a.textContent = DICA_ARQ(x); if (rem) rem.disabled = false; return }
    const v = RCB.validarArq(f0); a.className = 'text-xs mt-1 min-h-[1rem] ' + (v ? 'text-rose-500' : 'text-slate-500');
    a.textContent = v || '📎 ' + f0.name + ' · ' + RCB.tam(f0.size) + (x && x.path ? ' — substitui o comprovante atual (que fica no histórico)' : '');
    if (rem) { rem.disabled = true; rem.checked = false }
  }
  /* mostra o total faturado líquido / já recebido / a receber da Data_Base escolhida (sem contar o recebimento que está sendo editado) e avisa se o valor passa do saldo */
  function info(troca) {
    const el = document.getElementById('rr-i'); if (!el) return; const d = g('rr-d'), f = RCB.F.L.find(r => r.d == d);
    if (!f) { el.textContent = 'Esta Data_Base não está mais na base do Fundo de Reserva.'; el.className = 'text-xs text-amber-600 mb-3'; return }
    const dev = RCB.c(f.sal), jaRec = RCB.R.filter(r => r.d == d && r.id != EDIT).reduce((t, r) => t + RCB.c(r.v), 0), aberto = dev - jaRec, v = num(g('rr-v'));
    if (troca && !EDIT) { const vi = document.getElementById('rr-v'); if (vi && (!vi.value || vi.value == AUTO)) { AUTO = aberto > 0 ? fnum(aberto / 100) : ''; vi.value = AUTO } }
    let t = `Total Faturado Líquido ${brl(dev / 100)} · já recebido ${brl(jaRec / 100)} · a receber ${brl(aberto / 100)}`, c = 'text-xs mb-3 text-slate-500';
    if (isFinite(v) && v > 0) {
      const apos = aberto - RCB.c(v);
      if (apos < 0) { t += ` — ⚠ com este valor o recebido passa do Total Faturado Líquido em ${brl(-apos / 100)} (fica “recebido a maior”).`; c = 'text-xs mb-3 text-amber-600 dark:text-amber-400' } else t += ` — depois deste recebimento: ${brl(apos / 100)} a receber.`;
      if (RCB.R.some(r => r.d == d && r.id != EDIT && r.dr == g('rr-dr') && RCB.c(r.v) == RCB.c(v))) { t += ' ⚠ Já existe um recebimento igual (mesma data e valor) nesta Data_Base: confira para não lançar em duplicidade.'; c = 'text-xs mb-3 text-amber-600 dark:text-amber-400' }
    }
    el.className = c; el.textContent = t
  }
  async function sv() {
    const er = m => { const e = document.getElementById('rr-e'); e.textContent = m; e.classList.remove('hidden') }, id = EDIT, v = num(g('rr-v')), x = { d: g('rr-d'), dr: g('rr-dr'), v, obs: g('rr-o').trim() },
      fi = document.getElementById('rr-arq'), rm = document.getElementById('rr-rem'); x.file = fi && !fi.disabled && fi.files && fi.files[0] || null; x.remover = !!(rm && rm.checked && !x.file);
    if (!isFinite(v)) return er(g('rr-v').trim() ? 'Valor recebido inválido: informe um valor em reais (ex.: 1.250.000,00).' : 'Informe o valor recebido.');
    const msg = RCB.valida(x) || (x.file ? RCB.validarArq(x.file) : ''); if (msg) return er(msg);
    const b = document.getElementById('rr-ok'); b.disabled = true; b.textContent = x.file ? 'Enviando…' : 'Salvando…';
    try {
      if (id) await RCB.alterar(id, x); else await RCB.registrar(x);
      const cm = x.file ? ' Comprovante anexado.' : x.remover ? ' Comprovante removido (continua no histórico).' : '';
      closeMd(); ERR = false; MSG = (id ? '✔ Recebimento atualizado.' : '✔ Recebimento de ' + brl(v) + ' registrado na Data_Base ' + dmy(x.d) + '.') + cm; ABRE[x.d] = true; atualiza()
    } catch (e) { b.disabled = false; b.textContent = id ? 'Salvar alterações' : 'Registrar'; er('Não foi possível salvar: ' + (e.message || e)) }
  }
  function del(id) {
    const x = RCB.R.find(r => r.id == id); if (!exclui() || !x) return;
    const n = (x.path ? 1 : 0) + (x.ant || []).length;
    dlg('Excluir recebimento', `Excluir o recebimento de <b>${brl(x.v)}</b> de ${dmy(x.dr)} (Data_Base ${dmy(x.d)})? ${n ? (n == 1 ? 'O comprovante do banco também será apagado. ' : 'Os ' + n + ' comprovantes do banco (o atual e os anteriores) também serão apagados. ') : ''}Esta ação não pode ser desfeita e fica registrada na Auditoria.`, async () => {
      try { await RCB.excluir(id); MSG = '✔ Recebimento excluído.'; ERR = false } catch (e) { MSG = '⚠ ' + (e.message || e); ERR = true } atualiza()
    })
  }

  /* ---------- visualizar / baixar o comprovante (o arquivo só chega para quem tem receber.ver: regra do armazenamento) ---------- */
  function cver(id, i) {
    let a; try { a = RCB.arq(id, i) } catch (e) { return NFV.abrirArquivo({ titulo: 'Comprovante', erro: e, rotulo: 'Visualizar comprovante', t: TXT_COMP }) }
    const x = a.x;
    NFV.abrirArquivo({
      titulo: 'Comprovante · ' + a.nome,
      sub: ['Recebimento ' + brl(x.v), 'recebido em ' + dmy(x.dr), 'Data_Base ' + dmy(x.d), x.titulo ? 'DOC FISCAL ' + x.titulo : '', RCB.tam(a.bytes), a.vigente ? '' : 'comprovante anterior (substituído)'].filter(Boolean).join(' · '),
      nome: a.nome, tipo: a.tipo, rotulo: 'Visualizar comprovante', t: TXT_COMP,
      bloqueio: PERM.tem('receber.ver') ? '' : 'Você não tem permissão para ver os comprovantes. Peça ao administrador.',
      obter: () => RCB.blob(a.path), baixar: () => RCB.baixar(a.path, a.nome)
    })
  }
  async function cbaixa(id, i) {
    try { const a = RCB.arq(id, i); await RCB.baixar(a.path, a.nome) }
    catch (e) { MSG = '⚠ Não consegui baixar o comprovante: ' + (e.message || e); ERR = true; atualiza() }
  }

  /* ---------- Excel (padrão visual do Consórcio, js/core/xlsx_rel.js): 2 abas, valores em R$ Contábil, A Receber e % como fórmula ---------- */
  async function xl() {
    try {
      const L = visiveis().sort((a, b) => a.d < b.d ? -1 : 1);
      if (!L.length) { MSG = 'Não há faturamento para exportar com os filtros atuais.'; ERR = true; atualiza(); return }
      const E = XR, c = E.C, ds = new Set(L.map(r => r.d)), tit = Object.fromEntries(RCB.F.L.map(f => [f.d, f.titulo])), R = RCB.R.filter(x => ds.has(x.d)).sort((a, b) => a.dr < b.dr ? -1 : a.dr > b.dr ? 1 : a.ce < b.ce ? -1 : 1), com = vNF() && FDB.ok,
        sub = ['Total Faturado Líquido = Valor Líquido (Valor Bruto − retenção contratual − desconto do adiantamento − ISS − INSS) · A Receber = Total Faturado Líquido − Recebido', L.length + ' faturamento(s)', FPR ? 'Período (Data_Base): ' + PER.lb(rcPer().de) + ' a ' + PER.lb(rcPer().ate) : '', FS ? 'Situação: ' + ST[FS].t : '', FQ.trim() ? 'Busca: “' + FQ.trim() + '”' : '', RCB.F.em ? 'Base do Fundo de Reserva publicada em ' + dh(RCB.F.em) : '', 'Gerado em ' + E.hoje()].filter(Boolean).join(' · '),
        wb = XP.book({ titulo: 'Contas a Receber' }), P = (h, k, o) => Object.assign({ h, g: x => x[k], nf: 'contabil', tot: 'sum' }, o), tot = soma(L, 'dev'), totRec = soma(L, 'rec');
      const cols = [
        { h: 'DATA_BASE (EMISSÃO NF)', g: x => XP.serial(x.d), nf: 'data', tot: 'TOTAL' },
        { h: 'DOC FISCAL', g: x => x.titulo || null, nf: 'texto', al: 'center' },
        ...(com ? [{ h: 'NF', g: x => { const n = FDB.mes(x.d.slice(0, 7)); return n.length ? n.map(y => y.num || 's/nº').join(', ') : null }, nf: 'texto', al: 'center' }] : []),
        P('VALOR BRUTO (NF)', 'tf'),
        P('RETENÇÃO CONTRATUAL', 'rc'), P('DESC. ADIANTAMENTO', 'adi'), P('ISS', 'iss'), P('INSS', 'inss'),
        P('TOTAL FATURADO LÍQUIDO', 'dev', { k: 'dev' }),
        { h: 'PREV. A RECEBER', g: x => XP.serial(prev(x).d), nf: 'data', al: 'center' },
        P('RECEBIDO', 'rec', { k: 'rec' }),
        { h: 'A RECEBER', g: x => Math.round((x.dev - x.rec) * 100) / 100, f: (r, i, Lt) => `${Lt.dev}${r}-${Lt.rec}${r}`, nf: 'contabil', tot: 'sum', b: 1, c: c.navy },
        { h: '% RECEBIDO', g: x => x.dev > 0 ? x.rec / x.dev : 0, f: (r, i, Lt) => `IF(${Lt.dev}${r}=0,0,${Lt.rec}${r}/${Lt.dev}${r})`, nf: 'pct', al: 'center', tot: { f: (rt, Lt, r1, r2) => `IF(SUBTOTAL(109,${Lt.dev}${r1}:${Lt.dev}${r2})=0,0,SUBTOTAL(109,${Lt.rec}${r1}:${Lt.rec}${r2})/SUBTOTAL(109,${Lt.dev}${r1}:${Lt.dev}${r2}))`, v: tot > 0 ? totRec / tot : 0 } },
        { h: 'SITUAÇÃO', g: x => ST[x.st].t, al: 'center' },
        { h: 'ÚLTIMO RECEBIMENTO', g: x => x.ult ? XP.serial(x.ult) : null, nf: 'data' }];
      const a1 = E.dados(wb, 'Contas a Receber', { titulo: 'Contas a Receber · Faturado × Recebido', sub, rod: 'Consórcio Santa Dulce · Contas a Receber', rows: L, hr: 8, fz: 1, cent: 1, total: L.length > 1, eq: cols.map((x, j) => x.nf == 'contabil' ? j : -1).filter(j => j >= 0), cols });
      if (com) a1.ws.noErr(a1.t.r1, 3, a1.t.r2, 3);
      a1.ws.o.zoom = 90;
      const cr = [
        { h: 'DATA DO RECEBIMENTO', g: x => XP.serial(x.dr), nf: 'data', tot: 'TOTAL' },
        { h: 'DATA_BASE', g: x => XP.serial(x.d), nf: 'data' },
        { h: 'DOC FISCAL', g: x => tit[x.d] || x.titulo || null, nf: 'texto', al: 'center' },
        P('VALOR RECEBIDO', 'v'),
        { h: 'OBSERVAÇÃO', g: x => x.obs || null, w: 1, maxW: 50 },
        ...(RCB.CPok === false ? [] : [{ h: 'COMPROVANTE DO BANCO', g: x => x.path ? x.nome : null, w: 1, maxW: 40 }]),
        { h: 'LANÇADO POR', g: x => x.cn || null },
        { h: 'LANÇADO EM', g: x => x.ce ? dh(x.ce) : null, al: 'center' }];
      const a2 = E.dados(wb, 'Recebimentos', { titulo: 'Contas a Receber · Recebimentos lançados', sub, rod: 'Consórcio Santa Dulce · Contas a Receber', rows: R, hr: 8, fz: 1, cent: 1, total: R.length > 1, cols: cr });
      a2.ws.o.zoom = 90;
      await saveAs('contas_a_receber.xlsx', await wb.save())
    } catch (e) { MSG = '⚠ Não consegui gerar o Excel: ' + (e.message || e); ERR = true; atualiza() }
  }

  /* ---------- atualização automática (outro usuário lançou, publicou, anexou NF...) ---------- */
  function atual() {
    if (VIEW.classList.contains('hidden')) return; const a = document.activeElement;
    if (a && VIEW.contains(a) && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName)) { PEND = true; return } atualiza()
  }
  try {
    RCB.on(atual); if (typeof FDB != 'undefined') FDB.on(atual);
    VIEW.addEventListener('focusout', () => { if (PEND) setTimeout(() => { const a = document.activeElement; if (PEND && !(a && VIEW.contains(a) && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName))) { PEND = false; atualiza() } }, 80) });
  } catch (e) { }

  window.receber = {
    show() { MSG = ''; ERR = false; render(); RCB.tudo().then(atualiza); if (vNF() && typeof FDB != 'undefined') FDB.carregar().catch(() => { }).then(atual) },
    f: (id, d) => form(id, d), ed: (id, foco) => form(id, null, foco), sv, del, inf: t => info(t),
    cv: cver, cd: cbaixa, pa: arqSel, ch(id) { HIST[id] = !HIST[id]; atualiza() },
    vf(i) { const n = num(i.value); if (isFinite(n) && n > 0) i.value = fnum(n) },
    q(v) { FQ = v; atualiza() },
    fl(k, v) { FS = v; render() },
    /* filtro de período (igual ao da Análise Fiscal): k = 'de' | 'ate'. Todo o período = null (meses novos entram sozinhos) */
    per(k, v) { const ms = rcMeses(), t = PER.set(rcPer(), k, v); FPR = ms.length && PER.igual(t, { de: ms[0], ate: ms[ms.length - 1] }) ? null : t; pintaPer(); atualiza() },
    pre(a) { FPR = null; pintaPer(); atualiza() },
    lm() { FQ = FS = ''; FPR = null; render() },
    ded(k) { DED[k] = !DED[k]; atualiza() },
    ab(d) { ABRE[d] = !ABRE[d]; atualiza() },
    async nfd(id) { try { await FDB.baixarNF(id) } catch (e) { MSG = '⚠ Não consegui baixar a NF: ' + (e.message || e); ERR = true; atualiza() } },
    xl, _r: render
  };
})();
