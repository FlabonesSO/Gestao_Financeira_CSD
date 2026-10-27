/* Módulo "Contas a Receber" · controle do que JÁ RECEBEMOS do cliente × o que FATURAMOS, por Data_Base (competência do Fundo de Reserva).
   • O faturamento (Total Faturado, Saldo a Receber do Cliente, nº do título...) vem sozinho da base publicada do Fundo de Reserva — ninguém digita de novo.
   • Quem tem a permissão "Registrar e editar recebimentos" lança cada pagamento do cliente (data, valor, observação). Vários pagamentos por Data_Base = pagamento parcial.
   • A RECEBER = Saldo a Receber do Cliente (Faturamento Líquido − Desconto do Adiantamento: o que o cliente de fato paga). O Total Faturado aparece só como informação (não há mais escolha de base na tela).
     EM ABERTO = A receber − Recebido. Situação: Em aberto · Parcial · Recebido · Recebido a maior.
   • Mostra a NF da competência (Faturas Emitidas) com 👁 Visualizar / ⬇ Baixar para quem tem a permissão de ver NF, e avisa quando o Valor Bruto das NFs não bate com o Total Faturado.
   • Gráfico: colunas empilhadas por Data_Base (Recebido × Em aberto) em eixo único; a tabela logo abaixo é a versão em tabela do gráfico.
   • Excel com 2 abas (Contas a Receber e Recebimentos) no padrão visual do Consórcio.
   Dados em js/core/receber_dados.js (RCB → public.recebimentos + função contas_a_receber_base()). Regras reais no banco (RLS, supabase/permissoes.sql).
   MÓDULO ISOLADO: usa de js/core: $, N, PERM, mo/closeMd/dlg (usuarios.js), saveAs, RCB, FDB, NFV, XR/XP (Excel), Chart. */
(() => {
  'use strict';
  const VIEW = document.querySelector('[data-view="receber"]'); if (!VIEW) return;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    dmy = iso => iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4) : '',
    dh = iso => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) },
    brl = n => ((+n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
    fnum = n => n == null || isNaN(n) ? '' : n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
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
      nota: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/>'
    },
    TOM = { ver: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400', azul: 'bg-sky-500/15 text-sky-600 dark:text-sky-300', amb: 'bg-amber-500/15 text-amber-600 dark:text-amber-400', ind: 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-300' },
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
  let TAB = 'fat', FQ = '', FD1 = '', FD2 = '', FS = '', MSG = '', ERR = false, ABRE = {}, LIM = 100, EDIT = null, AUTO = '', PEND = false, CH = null;
  try { const s = JSON.parse(localStorage.getItem('csd_receber_v1') || '{}'); if (s.tab == 'rec' || s.tab == 'fat') TAB = s.tab } catch (e) { }
  const salva = () => { try { localStorage.setItem('csd_receber_v1', JSON.stringify({ tab: TAB })) } catch (e) { } },
    lanca = () => PERM.tem('receber.lancar'), exclui = () => PERM.tem('receber.excluir'), vNF = () => PERM.tem('fat.ver');

  /* NFs da competência (mês da Data_Base) e conferência com o Total Faturado */
  const nfs = d => vNF() && typeof FDB != 'undefined' && FDB.ok ? FDB.mes(d.slice(0, 7)) : [],
    nfBruto = (L, tf) => { /* soma dos Valores Brutos das NFs do mês; só compara quando todas têm o valor informado */
      if (!L.length || L.some(x => x.vb == null)) return null; const s = L.reduce((t, x) => t + Math.round(x.vb * 100), 0); return { s: s / 100, dif: Math.abs(s - Math.round(tf * 100)) >= 1 }
    };

  /* ---------- filtros (valem para os cartões, o gráfico e as tabelas) ---------- */
  function visiveis() {
    const q = N(FQ), L = RCB.linhas('saldo').filter(r => (!FD1 || r.d >= FD1) && (!FD2 || r.d <= FD2) && (!FS || r.st == FS));
    return L.filter(r => !q || N([dmy(r.d), r.titulo, ST[r.st].t, ...nfs(r.d).map(x => x.num + ' ' + x.nome), ...r.rs.map(x => dmy(x.dr) + ' ' + fnum(x.v) + ' ' + x.obs + ' ' + x.cn)].join(' ')).includes(q))
  }
  function orfaos() {
    const q = N(FQ); if (FS) return [];
    return RCB.orfaos().filter(x => (!FD1 || x.d >= FD1) && (!FD2 || x.d <= FD2) && (!q || N([dmy(x.d), x.titulo, x.obs, x.cn, dmy(x.dr), fnum(x.v)].join(' ')).includes(q)))
  }
  const soma = (L, k) => L.reduce((t, r) => t + Math.round(r[k] * 100), 0) / 100;

  /* ---------- tela ---------- */
  function head() {
    const F = RCB.F;
    return `<div class="flex flex-wrap items-center gap-2"><div class="mr-auto min-w-0"><h1 class="text-2xl font-bold leading-tight">Contas a Receber</h1>
      <p class="text-sm text-slate-500">O que já recebemos do cliente × o que faturamos, por Data_Base${F.L.length ? ' · ' + F.L.length + ' faturamento(s)' : ''}</p>
      <p id="rc-sub" class="text-xs text-slate-500 mt-0.5"></p></div>
      <div class="flex flex-wrap items-center gap-2 ml-auto">
        ${lanca() ? '<button class="btn" data-act="novo" onclick="receber.f()">＋ Registrar recebimento</button>' : ''}
        <button class="btn2" onclick="receber.xl()">Excel</button></div></div>
    <div id="rc-msg"></div>`
  }
  function filtros() {
    return `<div class="card"><div class="grid grid-cols-2 md:grid-cols-6 gap-2">
      <input id="rc-q" class="inp col-span-2" placeholder="🔍 Buscar por título, NF, observação ou responsável" value="${esc(FQ)}" oninput="receber.q(this.value)">
      <input id="rc-d1" type="date" class="inp" title="Data_Base: de" value="${esc(FD1)}" onchange="receber.fl('d1',this.value)">
      <input id="rc-d2" type="date" class="inp" title="Data_Base: até" value="${esc(FD2)}" onchange="receber.fl('d2',this.value)">
      <select id="rc-st" class="inp ${FS ? 'ring-2 ring-amber-500' : ''}" title="Situação" onchange="receber.fl('st',this.value)"><option value="">Todas as situações</option>${['aberto', 'parcial', 'quitado', 'maior'].map(k => `<option value="${k}" ${k == FS ? 'selected' : ''}>${ST[k].t}</option>`).join('')}</select>
      <button class="btn2" onclick="receber.lm()">Limpar</button></div></div>`
  }
  function render() {
    if (CH) { CH.destroy(); CH = null }
    VIEW.innerHTML = head() + filtros() + `<div id="rc-k" class="grid grid-cols-2 lg:grid-cols-4 gap-3"></div>
      <div class="card"><div class="flex flex-wrap items-baseline gap-x-3"><h2 class="font-semibold">Recebido × em aberto por Data_Base</h2><span class="text-xs text-slate-500">cada coluna é o que o cliente deve pagar naquela Data_Base</span></div>
        <div class="relative mt-3" style="height:300px"><canvas id="rc-ch" role="img" aria-label="Gráfico de colunas empilhadas por Data_Base com o valor recebido e o valor em aberto; os mesmos valores estão na tabela abaixo"></canvas></div></div>
      <div class="card"><div class="flex flex-wrap items-center gap-2 mb-3" role="tablist">
        <button role="tab" class="${TAB == 'fat' ? 'btn' : 'btn2'}" onclick="receber.tab('fat')">Por faturamento</button><button role="tab" class="${TAB == 'rec' ? 'btn' : 'btn2'}" onclick="receber.tab('rec')">Recebimentos lançados</button></div>
        <div id="rc-t" class="overflow-x-auto"></div></div>`;
    atualiza()
  }
  /* repinta cartões, gráfico e tabela com os filtros atuais (não recria os campos de filtro: não perde o foco de quem está digitando) */
  function atualiza() {
    const k = document.getElementById('rc-k'); if (!k) return;
    const msg = document.getElementById('rc-msg'), sub = document.getElementById('rc-sub');
    const ate = RCB.F.em ? 'Base do Fundo de Reserva de ' + dh(RCB.F.em) : '';
    if (sub) sub.textContent = ate + (RCB.F.ok && ate ? ' · ' : '') + 'A receber = Saldo a Receber do Cliente';
    const erro = RCB.F.erro || RCB.erro, orf = RCB.orfaos();
    if (msg) msg.innerHTML = (MSG ? `<div class="text-sm rounded-lg px-3 py-2 ${ERR ? 'bg-rose-500/10 text-rose-500' : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'}" data-msg>${esc(MSG)}</div>` : '')
      + (erro ? `<div class="text-sm rounded-lg px-3 py-2 mt-2 bg-amber-500/10 text-amber-700 dark:text-amber-300" data-erro>⚠ ${esc(erro)}</div>` : '')
      + (orf.length ? `<div class="text-sm rounded-lg px-3 py-2 mt-2 bg-amber-500/10 text-amber-700 dark:text-amber-300" data-orfaos>⚠ ${orf.length} recebimento(s) (${brl(orf.reduce((t, x) => t + Math.round(x.v * 100), 0) / 100)}) estão ligados a uma Data_Base que não existe mais na base do Fundo de Reserva. Veja na aba “Recebimentos lançados”.</div>` : '');
    if (!RCB.F.ok && !RCB.F.erro) { k.innerHTML = ['Total Faturado', 'A Receber', 'Recebido', 'Em Aberto'].map((t, i) => kp('k' + i, t, '…', ['recibo', 'relogio', 'ok', 'nota'][i], ['ver', 'azul', 'ind', 'amb'][i], 'carregando…')).join(''); tabela([], []); return }
    const L = visiveis(), tf = soma(L, 'tf'), dev = soma(L, 'dev'), rec = soma(L, 'rec'), ab = Math.round((dev - rec) * 100) / 100, p = dev > 0 ? rec / dev : 0, n = L.length;
    k.className = 'grid grid-cols-2 lg:grid-cols-4 gap-3';
    k.innerHTML = kp('tf', 'Total Faturado', brl(tf), 'recibo', 'ver', n + (n == 1 ? ' faturamento' : ' faturamentos') + (L.length != RCB.F.L.length ? ' · de ' + RCB.F.L.length : ''), 'Soma do Total Faturado (NF) das Data_Base mostradas')
      + kp('dev', 'A Receber', brl(dev), 'relogio', 'azul', 'Saldo a Receber do Cliente', 'Faturamento Líquido − Desconto do Adiantamento')
      + kp('rec', 'Recebido', brl(rec), 'ok', 'ind', dev > 0 || rec > 0 ? pc(p) + ' do a receber' : 'nada a receber no filtro', 'Soma dos recebimentos lançados nas Data_Base mostradas')
      + kp('ab', 'Em Aberto', brl(ab), 'nota', 'amb', ab < 0 ? '<span class="text-amber-600 dark:text-amber-400">recebido a maior</span>' : L.filter(r => r.st == 'aberto' || r.st == 'parcial').length + ' Data_Base com saldo', 'A receber − Recebido');
    grafico(L); tabela(L, orfaos())
  }

  /* ---------- gráfico: colunas empilhadas (Recebido em azul · Em aberto em cinza neutro), eixo único ---------- */
  function grafico(L) {
    if (CH) { CH.destroy(); CH = null } const cv = document.getElementById('rc-ch'); if (!cv || typeof Chart == 'undefined') return;
    const A = L.slice().sort((a, b) => a.d < b.d ? -1 : 1), dk = document.documentElement.classList.contains('dark');
    const T = dk ? { surf: getComputedStyle(cv.closest('.card')).backgroundColor || '#0f172a', ink: '#f0efec', ink2: '#c3c2b7', mut: '#898781', grid: '#2c2c2a', base: '#383835', azul: '#3987e5', cinza: '#898781', tip: '#1a1a19' }
      : { surf: getComputedStyle(cv.closest('.card')).backgroundColor || '#ffffff', ink: '#0b0b0b', ink2: '#52514e', mut: '#898781', grid: '#e1e0d9', base: '#c3c2b7', azul: '#2a78d6', cinza: '#898781', tip: '#ffffff' };
    if (!A.length) { const x = cv.getContext('2d'); x.clearRect(0, 0, cv.width, cv.height); return }
    const rec = A.map(r => r.rec), aberto = A.map(r => Math.max(r.ab, 0)),
      raio = (i, ds) => (ds == 1 ? aberto[i] > 0 : aberto[i] <= 0 && rec[i] > 0) ? { topLeft: 4, topRight: 4, bottomLeft: 0, bottomRight: 0 } : 0;
    try { CH = new Chart(cv, {
      type: 'bar',
      data: { labels: A.map(r => dmy(r.d)), datasets: [
        { label: 'Recebido', data: rec, backgroundColor: T.azul, borderColor: T.surf, borderWidth: 2, borderRadius: c => raio(c.dataIndex, 0), maxBarThickness: 24, stack: 's', datalabels: { display: false } },
        { label: 'Em aberto', data: aberto, backgroundColor: T.cinza, borderColor: T.surf, borderWidth: 2, borderRadius: c => raio(c.dataIndex, 1), maxBarThickness: 24, stack: 's', datalabels: { display: false } }] },
      options: {
        responsive: true, maintainAspectRatio: false, animation: { duration: 250 }, interaction: { mode: 'index', intersect: false },
        scales: {
          x: { stacked: true, grid: { display: false }, border: { color: T.base }, ticks: { color: T.mut, maxRotation: 45, autoSkip: true, font: { size: 11 } } },
          y: { stacked: true, beginAtZero: true, grid: { color: T.grid, lineWidth: 1 }, border: { display: false }, ticks: { color: T.mut, callback: v => K(v), font: { size: 11 } } }
        },
        plugins: {
          datalabels: { display: false },
          legend: { position: 'bottom', labels: { color: T.ink2, usePointStyle: true, pointStyle: 'rectRounded', boxWidth: 10, boxHeight: 10, padding: 16, font: { size: 12 } } },
          tooltip: {
            backgroundColor: T.tip, titleColor: T.ink, bodyColor: T.ink2, footerColor: T.ink2, borderColor: dk ? 'rgba(255,255,255,.10)' : 'rgba(11,11,11,.10)', borderWidth: 1, padding: 10, boxPadding: 4, usePointStyle: true,
            callbacks: {
              title: it => { const r = A[it[0].dataIndex]; return 'Data_Base ' + dmy(r.d) + (r.titulo ? ' · Título ' + r.titulo : '') },
              label: c => ' ' + c.dataset.label + ': ' + brl(c.dataset.label == 'Em aberto' ? A[c.dataIndex].ab > 0 ? A[c.dataIndex].ab : 0 : c.parsed.y),
              footer: it => { const r = A[it[0].dataIndex]; return 'A receber ' + brl(r.dev) + ' · ' + pc(r.pct) + ' recebido · ' + ST[r.st].t }
            }
          }
        }
      }
    }) } catch (e) { CH = null; console.error('Contas a Receber · gráfico:', e) }
  }

  /* ---------- tabelas ---------- */
  const meter = r => `<div class="min-w-[112px]"><span class="px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${ST[r.st].c}" data-st="${r.st}">${ST[r.st].i}${ST[r.st].t}${r.st == 'parcial' ? ' · ' + pc(r.pct) : ''}</span>
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
  function recLinhas(r) { /* recebimentos de uma Data_Base (linha expandida) */
    const ac = x => `${lanca() ? `<button class="btn2 !py-0.5 !text-xs" onclick="receber.ed('${x.id}')">✎ Editar</button>` : ''}${exclui() ? ` <button class="btn2 !py-0.5 !text-xs !text-rose-500" onclick="receber.del('${x.id}')">Excluir</button>` : ''}`;
    return `<tr class="bg-slate-500/5" data-det="${esc(r.d)}"><td colspan="7" class="px-3 py-3"><div class="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Recebimentos da Data_Base ${dmy(r.d)}</div>
      ${r.rs.length ? `<table class="w-full text-xs whitespace-nowrap"><thead class="text-slate-500 text-left"><tr><th class="py-1 pr-4">Data do recebimento</th><th class="pr-4 text-right">Valor</th><th class="pr-4">Observação</th><th class="pr-4">Lançado por</th><th></th></tr></thead><tbody>${r.rs.map(x => `<tr class="border-t border-slate-200 dark:border-slate-700"><td class="py-1.5 pr-4 font-medium">${dmy(x.dr)}</td><td class="pr-4 text-right tabular-nums">${brl(x.v)}</td><td class="pr-4 whitespace-normal min-w-[160px]">${esc(x.obs) || '—'}</td><td class="pr-4">${esc(x.an && x.ae != x.ce ? x.an : x.cn) || '—'}<div class="text-[11px] text-slate-500">${dh(x.ae && x.ae != x.ce ? x.ae : x.ce)}${x.ae && x.ae != x.ce ? ' · alterado' : ''}</div></td><td class="text-right">${ac(x)}</td></tr>`).join('')}</tbody></table>` : '<p class="text-sm text-slate-500">Nenhum recebimento lançado para esta Data_Base.</p>'}</td></tr>`
  }
  function tabela(L, O) {
    const el = document.getElementById('rc-t'); if (!el) return;
    if (!RCB.F.ok) { el.innerHTML = `<div class="py-10 text-center text-slate-500">${RCB.F.erro ? esc(RCB.F.erro) : 'Carregando…'}</div>`; return }
    if (!RCB.F.L.length) { el.innerHTML = `<div class="py-10 text-center text-slate-500"><div class="text-4xl mb-2">💵</div><p class="font-semibold">Nenhum faturamento na base do Fundo de Reserva</p><p class="text-sm mt-1">O Contas a Receber usa as Data_Base publicadas no Fundo de Reserva.${PERM.tem('fundo.publicar') ? ' <button class="underline text-indigo-500" onclick="go(\'fundo\')">Abrir o Fundo de Reserva</button>' : ' Peça para publicarem a planilha.'}</p></div>`; return }
    if (TAB == 'rec') return tabRec(el, L, O);
    const D = L.slice().sort((a, b) => a.d < b.d ? 1 : -1), tot = { tf: soma(L, 'tf'), dev: soma(L, 'dev'), rec: soma(L, 'rec') }, P = 'px-2 py-2';
    el.innerHTML = `<table class="w-full text-sm" data-tab="fat"><thead class="text-xs uppercase text-slate-500 text-left"><tr><th class="${P}">Data_Base</th><th class="${P} text-right">Total Faturado</th><th class="${P} text-right" title="Saldo a Receber do Cliente (Faturamento Líquido − Desconto do Adiantamento)">A Receber</th><th class="${P} text-right">Recebido</th><th class="${P} text-right">Em Aberto</th><th class="${P}">Situação</th><th class="${P} text-right">Ações</th></tr></thead>
      <tbody>${D.map(r => `<tr class="border-t border-slate-200 dark:border-slate-800 align-top" data-d="${esc(r.d)}">
        <td class="${P}"><div class="font-semibold whitespace-nowrap">${dmy(r.d)}</div><div class="text-[11px] text-slate-500 whitespace-nowrap">${r.titulo ? 'Título ' + esc(r.titulo) : 'sem nº de título'}</div>${nfBloco(r)}</td>
        <td class="${P} text-right whitespace-nowrap tabular-nums" data-c="tf">${brl(r.tf)}</td>
        <td class="${P} text-right whitespace-nowrap tabular-nums" data-c="dev">${brl(r.dev)}</td>
        <td class="${P} text-right whitespace-nowrap tabular-nums" data-c="rec">${brl(r.rec)}</td>
        <td class="${P} text-right whitespace-nowrap tabular-nums font-semibold ${r.ab < 0 ? 'text-amber-600 dark:text-amber-400' : ''}" data-c="ab">${brl(r.ab)}</td>
        <td class="${P}">${meter(r)}</td>
        <td class="${P} text-right"><div class="flex flex-col items-end gap-1 ml-auto">${lanca() && (r.st == 'aberto' || r.st == 'parcial') ? `<button class="btn !py-1 !text-xs" title="Registrar um recebimento desta Data_Base" onclick="receber.f(null,'${esc(r.d)}')">＋ Receber</button>` : ''}<button class="btn2 !py-1 !text-xs" onclick="receber.ab('${esc(r.d)}')">${ABRE[r.d] ? '▾' : '▸'} Recebimentos (${r.rs.length})</button></div></td></tr>${ABRE[r.d] ? recLinhas(r) : ''}`).join('') || `<tr><td colspan="7" class="px-3 py-6 text-center text-slate-500">Nenhum faturamento encontrado com esse filtro.</td></tr>`}</tbody>
      ${D.length > 1 ? `<tfoot><tr class="border-t-2 border-slate-300 dark:border-slate-700 font-semibold"><td class="${P}">Total</td><td class="${P} text-right tabular-nums" data-t="tf">${brl(tot.tf)}</td><td class="${P} text-right tabular-nums" data-t="dev">${brl(tot.dev)}</td><td class="${P} text-right tabular-nums" data-t="rec">${brl(tot.rec)}</td><td class="${P} text-right tabular-nums" data-t="ab">${brl(Math.round((tot.dev - tot.rec) * 100) / 100)}</td><td colspan="2"></td></tr></tfoot>` : ''}</table>`
  }
  function tabRec(el, L, O) {
    const ds = new Set(L.map(r => r.d)), tit = Object.fromEntries(RCB.F.L.map(f => [f.d, f.titulo]));
    const R = RCB.R.filter(x => ds.has(x.d)).concat(O).sort((a, b) => a.dr < b.dr ? 1 : a.dr > b.dr ? -1 : a.ce < b.ce ? 1 : -1), lista = R.slice(0, LIM), total = R.reduce((t, x) => t + Math.round(x.v * 100), 0) / 100;
    if (!RCB.ok) { el.innerHTML = `<div class="py-10 text-center text-slate-500">${RCB.erro ? esc(RCB.erro) : 'Carregando…'}</div>`; return }
    if (!RCB.R.length) { el.innerHTML = `<div class="py-10 text-center text-slate-500"><div class="text-4xl mb-2">💵</div><p class="font-semibold">Nenhum recebimento lançado ainda</p><p class="text-sm mt-1">${lanca() ? 'Clique em “Registrar recebimento” sempre que o cliente pagar uma Data_Base (inteira ou em parte).' : 'Quando os recebimentos forem lançados, eles aparecem aqui.'}</p></div>`; return }
    el.innerHTML = `<table class="w-full text-sm" data-tab="rec"><thead class="text-xs uppercase text-slate-500 text-left"><tr><th class="px-3 py-2">Data do recebimento</th><th class="px-3 py-2">Data_Base</th><th class="px-3 py-2 text-right">Valor recebido</th><th class="px-3 py-2">Observação</th><th class="px-3 py-2">Lançado por</th><th class="px-3 py-2 text-right">Ações</th></tr></thead>
      <tbody>${lista.map(x => `<tr class="border-t border-slate-200 dark:border-slate-800 align-top" data-id="${x.id}"><td class="px-3 py-2 whitespace-nowrap font-semibold">${dmy(x.dr)}</td>
        <td class="px-3 py-2 whitespace-nowrap">${dmy(x.d)}<div class="text-[11px] ${tit[x.d] == null ? 'text-amber-600 dark:text-amber-400' : 'text-slate-500'}">${tit[x.d] == null ? '⚠ sem faturamento correspondente' : tit[x.d] ? 'Título ' + esc(tit[x.d]) : ''}</div></td>
        <td class="px-3 py-2 text-right whitespace-nowrap tabular-nums" data-c="v">${brl(x.v)}</td><td class="px-3 py-2 min-w-[160px]">${esc(x.obs) || '<span class="text-slate-400">—</span>'}</td>
        <td class="px-3 py-2 whitespace-nowrap"><div>${esc(x.an && x.ae != x.ce ? x.an : x.cn) || '—'}</div><div class="text-[11px] text-slate-500">${dh(x.ae && x.ae != x.ce ? x.ae : x.ce)}${x.ae && x.ae != x.ce ? ' · alterado' : ''}</div></td>
        <td class="px-3 py-2 text-right whitespace-nowrap">${lanca() ? `<button class="btn2 !py-1 !text-xs" onclick="receber.ed('${x.id}')">✎ Editar</button>` : ''}${exclui() ? ` <button class="btn2 !py-1 !text-xs !text-rose-500" onclick="receber.del('${x.id}')">Excluir</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="6" class="px-3 py-6 text-center text-slate-500">Nenhum recebimento encontrado com esse filtro.</td></tr>'}</tbody>
      ${R.length > 1 ? `<tfoot><tr class="border-t-2 border-slate-300 dark:border-slate-700 font-semibold"><td class="px-3 py-2" colspan="2">Total (${R.length})</td><td class="px-3 py-2 text-right tabular-nums" data-t="v">${brl(total)}</td><td colspan="3"></td></tr></tfoot>` : ''}</table>
      ${R.length > LIM ? `<div class="text-center mt-3"><button class="btn2" onclick="receber.mais()">Mostrar mais (${R.length - LIM})</button></div>` : ''}`
  }

  /* ---------- registrar / editar recebimento ---------- */
  function form(id, d0) {
    const x = id ? RCB.R.find(r => r.id == id) : null; if (!lanca() || (id && !x)) return;
    EDIT = id || null; const hoje = RCB.hoje(), L = RCB.linhas('saldo').slice().sort((a, b) => a.d < b.d ? 1 : -1), d = x ? x.d : (d0 && L.some(r => r.d == d0) ? d0 : (L.find(r => r.st == 'aberto' || r.st == 'parcial') || L[0] || {}).d);
    if (!L.length) { dlg('Registrar recebimento', 'Não há faturamento na base do Fundo de Reserva para receber.'); return }
    const lb = (t, h) => `<label class="block text-xs text-slate-500 mb-1">${t}${h ? ' <span class="text-slate-400">' + h + '</span>' : ''}</label>`;
    mo(`<h2 class="text-lg font-bold mb-3">${x ? 'Editar recebimento' : 'Registrar recebimento'}</h2>
      ${lb('Faturamento (Data_Base) *')}<select id="rr-d" class="inp w-full mb-1" onchange="receber.inf(1)">${L.map(r => `<option value="${esc(r.d)}" ${r.d == d ? 'selected' : ''}>${dmy(r.d)}${r.titulo ? ' · Título ' + esc(r.titulo) : ''} · ${ST[r.st].t.toLowerCase()}</option>`).join('')}${x && !L.some(r => r.d == x.d) ? `<option value="${esc(x.d)}" selected>${dmy(x.d)} (sem faturamento correspondente)</option>` : ''}</select>
      <p id="rr-i" class="text-xs text-slate-500 mb-3 min-h-[1rem]"></p>
      <div class="grid grid-cols-2 gap-3 mb-3"><div>${lb('Data do recebimento *')}<input id="rr-dr" type="date" class="inp w-full" max="${hoje}" value="${esc(x ? x.dr : hoje)}" oninput="receber.inf()"></div>
        <div>${lb('Valor recebido *', '(R$)')}<input id="rr-v" class="inp w-full text-right tabular-nums" inputmode="decimal" autocomplete="off" placeholder="0,00" value="${x ? esc(fnum(x.v)) : ''}" oninput="receber.inf()" onblur="receber.vf(this)"></div></div>
      ${lb('Observação', '(opcional · ex.: nº do comprovante, parcial 1/2)')}<input id="rr-o" class="inp w-full mb-3" maxlength="300" value="${esc(x ? x.obs : '')}">
      <p id="rr-e" class="hidden text-sm text-rose-500 mb-3"></p>
      <div class="flex justify-end gap-2"><button class="btn2" onclick="closeMd()">Cancelar</button><button id="rr-ok" class="btn" onclick="receber.sv()">${x ? 'Salvar alterações' : 'Registrar'}</button></div>`);
    AUTO = ''; info(true)
  }
  /* mostra o a receber / já recebido / em aberto da Data_Base escolhida (sem contar o recebimento que está sendo editado) e avisa se o valor passa do saldo */
  function info(troca) {
    const el = document.getElementById('rr-i'); if (!el) return; const d = g('rr-d'), f = RCB.F.L.find(r => r.d == d);
    if (!f) { el.textContent = 'Esta Data_Base não está mais na base do Fundo de Reserva.'; el.className = 'text-xs text-amber-600 mb-3'; return }
    const dev = RCB.c(f.sal), jaRec = RCB.R.filter(r => r.d == d && r.id != EDIT).reduce((t, r) => t + RCB.c(r.v), 0), aberto = dev - jaRec, v = num(g('rr-v'));
    if (troca && !EDIT) { const vi = document.getElementById('rr-v'); if (vi && (!vi.value || vi.value == AUTO)) { AUTO = aberto > 0 ? fnum(aberto / 100) : ''; vi.value = AUTO } }
    let t = `A receber ${brl(dev / 100)} · já recebido ${brl(jaRec / 100)} · em aberto ${brl(aberto / 100)}`, c = 'text-xs mb-3 text-slate-500';
    if (isFinite(v) && v > 0) {
      const apos = aberto - RCB.c(v);
      if (apos < 0) { t += ` — ⚠ com este valor o recebido passa do a receber em ${brl(-apos / 100)} (fica “recebido a maior”).`; c = 'text-xs mb-3 text-amber-600 dark:text-amber-400' } else t += ` — depois deste recebimento: ${brl(apos / 100)} em aberto.`;
      if (RCB.R.some(r => r.d == d && r.id != EDIT && r.dr == g('rr-dr') && RCB.c(r.v) == RCB.c(v))) { t += ' ⚠ Já existe um recebimento igual (mesma data e valor) nesta Data_Base: confira para não lançar em duplicidade.'; c = 'text-xs mb-3 text-amber-600 dark:text-amber-400' }
    }
    el.className = c; el.textContent = t
  }
  async function sv() {
    const er = m => { const e = document.getElementById('rr-e'); e.textContent = m; e.classList.remove('hidden') }, id = EDIT, v = num(g('rr-v')), x = { d: g('rr-d'), dr: g('rr-dr'), v, obs: g('rr-o').trim() };
    if (!isFinite(v)) return er(g('rr-v').trim() ? 'Valor recebido inválido: informe um valor em reais (ex.: 1.250.000,00).' : 'Informe o valor recebido.');
    const msg = RCB.valida(x); if (msg) return er(msg);
    const b = document.getElementById('rr-ok'); b.disabled = true; b.textContent = 'Salvando…';
    try {
      if (id) await RCB.alterar(id, x); else await RCB.registrar(x);
      closeMd(); ERR = false; MSG = id ? '✔ Recebimento atualizado.' : '✔ Recebimento de ' + brl(v) + ' registrado na Data_Base ' + dmy(x.d) + '.'; ABRE[x.d] = true; atualiza()
    } catch (e) { b.disabled = false; b.textContent = id ? 'Salvar alterações' : 'Registrar'; er('Não foi possível salvar: ' + (e.message || e)) }
  }
  function del(id) {
    const x = RCB.R.find(r => r.id == id); if (!exclui() || !x) return;
    dlg('Excluir recebimento', `Excluir o recebimento de <b>${brl(x.v)}</b> de ${dmy(x.dr)} (Data_Base ${dmy(x.d)})? Esta ação não pode ser desfeita e fica registrada na Auditoria.`, async () => {
      try { await RCB.excluir(id); MSG = '✔ Recebimento excluído.'; ERR = false } catch (e) { MSG = '⚠ ' + (e.message || e); ERR = true } atualiza()
    })
  }

  /* ---------- Excel (padrão visual do Consórcio, js/core/xlsx_rel.js): 2 abas, valores em R$ Contábil, Em Aberto e % como fórmula ---------- */
  async function xl() {
    try {
      const L = visiveis().sort((a, b) => a.d < b.d ? -1 : 1);
      if (!L.length) { MSG = 'Não há faturamento para exportar com os filtros atuais.'; ERR = true; atualiza(); return }
      const E = XR, c = E.C, ds = new Set(L.map(r => r.d)), tit = Object.fromEntries(RCB.F.L.map(f => [f.d, f.titulo])), R = RCB.R.filter(x => ds.has(x.d)).sort((a, b) => a.dr < b.dr ? -1 : a.dr > b.dr ? 1 : a.ce < b.ce ? -1 : 1), com = vNF() && FDB.ok,
        sub = ['A receber = Saldo a Receber do Cliente', L.length + ' faturamento(s)', FD1 || FD2 ? 'Data_Base ' + (FD1 ? dmy(FD1) : '…') + ' a ' + (FD2 ? dmy(FD2) : '…') : '', FS ? 'Situação: ' + ST[FS].t : '', FQ.trim() ? 'Busca: “' + FQ.trim() + '”' : '', RCB.F.em ? 'Base do Fundo de Reserva publicada em ' + dh(RCB.F.em) : '', 'Gerado em ' + E.hoje()].filter(Boolean).join(' · '),
        wb = XP.book({ titulo: 'Contas a Receber' }), P = (h, k, o) => Object.assign({ h, g: x => x[k], nf: 'contabil', tot: 'sum' }, o), tot = soma(L, 'dev'), totRec = soma(L, 'rec');
      const cols = [
        { h: 'DATA_BASE', g: x => XP.serial(x.d), nf: 'data', tot: 'TOTAL' },
        { h: 'Nº DO TÍTULO', g: x => x.titulo || null, nf: 'texto', al: 'center' },
        ...(com ? [{ h: 'NF', g: x => { const n = FDB.mes(x.d.slice(0, 7)); return n.length ? n.map(y => y.num || 's/nº').join(', ') : null }, nf: 'texto', al: 'center' }] : []),
        P('TOTAL FATURADO', 'tf'),
        P('A RECEBER', 'dev', { k: 'dev' }),
        P('RECEBIDO', 'rec', { k: 'rec' }),
        { h: 'EM ABERTO', g: x => Math.round((x.dev - x.rec) * 100) / 100, f: (r, i, Lt) => `${Lt.dev}${r}-${Lt.rec}${r}`, nf: 'contabil', tot: 'sum', b: 1, c: c.navy },
        { h: '% RECEBIDO', g: x => x.dev > 0 ? x.rec / x.dev : 0, f: (r, i, Lt) => `IF(${Lt.dev}${r}=0,0,${Lt.rec}${r}/${Lt.dev}${r})`, nf: 'pct', al: 'center', tot: { f: (rt, Lt, r1, r2) => `IF(SUBTOTAL(109,${Lt.dev}${r1}:${Lt.dev}${r2})=0,0,SUBTOTAL(109,${Lt.rec}${r1}:${Lt.rec}${r2})/SUBTOTAL(109,${Lt.dev}${r1}:${Lt.dev}${r2}))`, v: tot > 0 ? totRec / tot : 0 } },
        { h: 'SITUAÇÃO', g: x => ST[x.st].t, al: 'center' },
        { h: 'ÚLTIMO RECEBIMENTO', g: x => x.ult ? XP.serial(x.ult) : null, nf: 'data' }];
      const a1 = E.dados(wb, 'Contas a Receber', { titulo: 'Contas a Receber · Faturado × Recebido', sub, rod: 'Consórcio Santa Dulce · Contas a Receber', rows: L, hr: 8, fz: 1, cent: 1, total: L.length > 1, eq: cols.map((x, j) => x.nf == 'contabil' ? j : -1).filter(j => j >= 0), cols });
      if (com) a1.ws.noErr(a1.t.r1, 3, a1.t.r2, 3);
      a1.ws.o.zoom = 90;
      const cr = [
        { h: 'DATA DO RECEBIMENTO', g: x => XP.serial(x.dr), nf: 'data', tot: 'TOTAL' },
        { h: 'DATA_BASE', g: x => XP.serial(x.d), nf: 'data' },
        { h: 'Nº DO TÍTULO', g: x => tit[x.d] || x.titulo || null, nf: 'texto', al: 'center' },
        P('VALOR RECEBIDO', 'v'),
        { h: 'OBSERVAÇÃO', g: x => x.obs || null, w: 1, maxW: 50 },
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
    new MutationObserver(() => { if (!VIEW.classList.contains('hidden') && CH) grafico(visiveis()) }).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] }) /* trocou o tema: repinta o gráfico */
  } catch (e) { }

  window.receber = {
    show() { MSG = ''; ERR = false; render(); RCB.tudo().then(atualiza); if (vNF() && typeof FDB != 'undefined') FDB.carregar().catch(() => { }).then(atual) },
    f: (id, d) => form(id, d), ed: id => form(id), sv, del, inf: t => info(t),
    vf(i) { const n = num(i.value); if (isFinite(n) && n > 0) i.value = fnum(n) },
    tab(t) { TAB = t; salva(); render() },
    q(v) { FQ = v; LIM = 100; atualiza() },
    fl(k, v) { if (k == 'd1') FD1 = v; else if (k == 'd2') FD2 = v; else FS = v; LIM = 100; render() },
    lm() { FQ = FD1 = FD2 = FS = ''; LIM = 100; render() },
    ab(d) { ABRE[d] = !ABRE[d]; atualiza() },
    mais() { LIM += 100; atualiza() },
    async nfd(id) { try { await FDB.baixarNF(id) } catch (e) { MSG = '⚠ Não consegui baixar a NF: ' + (e.message || e); ERR = true; atualiza() } },
    xl, _r: render
  };
})();
