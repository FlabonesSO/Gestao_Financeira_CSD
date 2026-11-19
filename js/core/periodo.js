/* Filtro de PERÍODO por meses (De / Até) — o mesmo desenho do filtro da "Programação Financeira Quadrimestral" (caixa "📅 Período" com as listas De e Até,
   o quadro com a quantidade de meses, os atalhos "Todos os meses" e "↺ Padrão" e a linha "Dados de … a …").
   Usado por Faturas Emitidas (as duas abas), Fundo de Reserva, Contas a Receber e pelo Dashboard Financeiro (Visão executiva). Só desenha e normaliza: quem usa guarda o estado { de, ate } ('AAAA-MM') e redesenha a tela.
   • Os meses vêm sempre ordenados e no formato 'AAAA-MM'.
   • Escolher um De depois do Até leva o Até junto; escolher um Até antes do De leva o De junto (igual ao Quadrimestral).
   • Nada é gravado no navegador: o período vale enquanto a tela está aberta. */
const PER = {
  MES: ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'],
  lb(ym) { return this.MES[+String(ym).slice(5, 7) - 1] + '/' + String(ym).slice(0, 4) },
  /* período válido dentro dos meses `ms`: De/Até que não existem mais caem no padrão `pad` (sem padrão: todos os meses) e Até nunca fica antes de De */
  fix(s, ms, pad) {
    if (!ms.length) return { de: '', ate: '' };
    const p = pad && ms.includes(pad.de) && ms.includes(pad.ate) && pad.de <= pad.ate ? pad : { de: ms[0], ate: ms[ms.length - 1] };
    let de = s && ms.includes(s.de) ? s.de : p.de, ate = s && ms.includes(s.ate) ? s.ate : p.ate;
    if (ate < de) ate = de;
    return { de, ate }
  },
  /* aplica a escolha de uma das listas (k = 'de' | 'ate'); devolve o novo período */
  set(s, k, v) { const o = { de: s.de, ate: s.ate }; o[k] = v; if (k == 'de' && o.ate < o.de) o.ate = o.de; if (k == 'ate' && o.ate < o.de) o.de = o.ate; return o },
  /* os meses de `ms` dentro do período */
  meses(s, ms) { return ms.filter(m => m >= s.de && m <= s.ate) },
  igual(a, b) { return !!a && !!b && a.de == b.de && a.ate == b.ate },
  /* HTML da caixa. o = { id, ms (todos os meses com dados), s ({de,ate} já normalizado), pad (período padrão, ou nada = todos os meses), fn (função da lista: fn('de'|'ate', valor)), pre (função dos atalhos: pre('all'|'pad')) } */
  bar(o) {
    const { id, ms, s, pad, fn, pre } = o, n = this.meses(s, ms).length, todo = ms.length ? { de: ms[0], ate: ms[ms.length - 1] } : null,
      sel = (k, v) => `<select id="${id}-${k}" class="inp !py-1 font-semibold" onchange="${fn}('${k}',this.value)">${ms.map(m => `<option value="${m}" ${m == v ? 'selected' : ''}>${this.lb(m)}</option>`).join('')}</select>`,
      btn = (l, t, a, bid) => `<button type="button"${bid ? ` id="${bid}"` : ''} class="px-2.5 py-1 rounded-md text-xs font-medium border border-indigo-500/30 hover:bg-indigo-500/20" title="${t}" onclick="${pre}('${a}')">${l}</button>`,
      difere = !!pad && !this.igual(s, pad) && !this.igual(pad, todo);
    if (!ms.length) return '';
    return `<div id="${id}" class="flex flex-wrap items-end gap-x-4 gap-y-2 rounded-xl border border-indigo-500/30 bg-indigo-500/10 text-indigo-700 dark:text-indigo-200 px-4 py-2.5" role="group" aria-label="Filtro de período">
      <div class="text-xs font-bold uppercase tracking-wide self-center">📅 Período</div>
      <label class="text-xs font-semibold uppercase tracking-wide">De<span class="block mt-0.5">${sel('de', s.de)}</span></label>
      <label class="text-xs font-semibold uppercase tracking-wide">Até<span class="block mt-0.5">${sel('ate', s.ate)}</span></label>
      <div class="rounded-lg bg-white/70 dark:bg-slate-900/60 px-3 py-1 text-center"><div class="text-[10px] font-semibold uppercase tracking-wide">Período</div><div id="${id}-n" class="text-2xl font-bold leading-tight">${n} <span class="text-sm font-semibold">${n == 1 ? 'mês' : 'meses'}</span></div></div>
      <div class="flex flex-wrap items-center gap-1.5 self-center">${btn('Todos os meses', 'Todos os meses com dados (' + ms.length + ')', 'all', id + '-todos')}${difere ? btn('↺ Padrão', 'Voltar ao período padrão (' + this.lb(pad.de) + ' a ' + this.lb(pad.ate) + ')', 'pad', id + '-padrao') : ''}</div>
      <div class="text-xs self-center">Dados de ${this.lb(ms[0])} a ${this.lb(ms[ms.length - 1])} · ${ms.length} ${ms.length == 1 ? 'mês' : 'meses'}</div></div>`
  }
};
