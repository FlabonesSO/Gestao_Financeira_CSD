/* Dados do "Contas a Receber" no Supabase — usado pelo módulo js/modulos/contas_receber.js.
   • FATURAMENTO (o que foi faturado): NÃO é digitado de novo. Vem da base publicada do Fundo de Reserva (public.bases · fundo_reserva) pela função
     public.contas_a_receber_base() (supabase/contas-receber.sql), que devolve só Data_Base, nº do título, total faturado, impostos, líquido, adiantamento e
     saldo a receber do cliente — por isso quem tem a permissão "Contas a Receber · visualizar" NÃO precisa ver o Fundo de Reserva inteiro.
   • RECEBIMENTOS (o que o cliente já pagou): public.recebimentos — uma linha por pagamento (data, valor, observação), ligada ao faturamento pela Data_Base.
     Um faturamento pode ter vários recebimentos (pagamento parcial). Quem lançou/alterou e quando é carimbado pelo banco, e cada inclusão/alteração/exclusão vai
     para a Auditoria (gatilho no banco).
   • A COMPARAÇÃO: "A receber" = Saldo a Receber do Cliente (Faturamento Líquido − Desconto do Adiantamento: é o que o cliente de fato paga) ou o Total Faturado,
     conforme a escolha na tela (base = 'saldo' | 'total'). Em aberto = A receber − Recebido. Contas feitas em CENTAVOS inteiros (sem resíduo de ponto flutuante).
   Quem pode (permissões, aplicadas no banco por RLS): receber.ver vê · receber.lancar registra e edita · receber.excluir exclui.
   Depende de supabase.js (sb_). */
const RCB = {
  T: 'recebimentos',
  R: [], ok: false, erro: '',                        /* recebimentos: [{ id, d (Data_Base), titulo, dr (data do recebimento), v (valor), obs, cn, ce, an, ae }] */
  F: { L: [], ok: false, erro: '', em: '' },         /* faturamento por Data_Base: [{ d, titulo, tf, ret, liq, adi, sal }] */
  ouv: [], _ch: null, _busy: false, _again: false,
  cli() { return typeof sb_ != 'undefined' && sb_ ? sb_ : null },
  /* ---------- utilidades (centavos exatos) ---------- */
  c(n) { return Math.round((+n || 0) * 100) },
  r2(c) { return c / 100 },
  msg(e) {
    const m = String((e && (e.message || e.error_description || e.error)) || e || ''), cd = String((e && e.code) || '');
    if (/PGRST202|42883|could not find the function/i.test(m + ' ' + cd)) return 'O Contas a Receber ainda não foi instalado no banco: execute supabase/contas-receber.sql no Supabase.';
    if (/PGRST205|42P01|schema cache|does not exist/i.test(m + ' ' + cd)) return 'A tabela de recebimentos ainda não existe. Execute supabase/contas-receber.sql no Supabase.';
    if (/Sem permiss|42501|row-level security|permission denied|not authorized/i.test(m + ' ' + cd)) return 'Sem permissão para esta operação.';
    if (/recebimentos_valor_check|valor_check/i.test(m)) return 'O valor recebido precisa ser maior que zero.';
    if (/obs_check/i.test(m)) return 'A observação passa de 300 caracteres.';
    return m || 'Falha inesperada.'
  },
  /* linha do banco → formato usado pelo módulo */
  de(r) {
    return { id: r.id, d: String(r.data_base).slice(0, 10), titulo: String(r.titulo == null ? '' : r.titulo).trim(), dr: String(r.data_recebimento).slice(0, 10), v: +r.valor || 0, obs: r.obs || '',
      cp: r.criado_por || '', cn: r.criado_por_nome || '', ce: r.criado_em || '', an: r.atualizado_por_nome || '', ae: r.atualizado_em || '' }
  },
  /* ---------- carregar ---------- */
  async carregarFat() {
    const c = this.cli(); if (!c) throw new Error('Supabase não configurado');
    const q = await c.rpc('contas_a_receber_base');
    if (q.error) { this.F = { L: [], ok: false, erro: this.msg(q.error), em: '' }; this.avisa(); throw new Error(this.F.erro) }
    const por = {}, ord = []; let em = '';
    (q.data || []).forEach(x => {   /* uma linha por Data_Base (se a base repetir a data, soma) */
      const d = String(x.data_base).slice(0, 10), k = por[d];
      const o = { d, titulo: String(x.numero_titulo || '').trim(), tf: this.c(x.total_faturado), ret: this.c(x.impostos), liq: this.c(x.liquido), adi: this.c(x.adiantamento), sal: this.c(x.saldo_cliente) };
      if (!k) { por[d] = o; ord.push(d) } else { k.tf += o.tf; k.ret += o.ret; k.liq += o.liq; k.adi += o.adi; k.sal += o.sal; if (o.titulo && !k.titulo.split(', ').includes(o.titulo)) k.titulo = k.titulo ? k.titulo + ', ' + o.titulo : o.titulo }
      if (x.atualizado_em && String(x.atualizado_em) > em) em = String(x.atualizado_em)
    });
    this.F = { L: ord.sort().map(d => { const o = por[d]; return { d, titulo: o.titulo, tf: this.r2(o.tf), ret: this.r2(o.ret), liq: this.r2(o.liq), adi: this.r2(o.adi), sal: this.r2(o.sal) } }), ok: true, erro: '', em };
    this.avisa()
  },
  async carregar() {
    const c = this.cli(); if (!c) throw new Error('Supabase não configurado');
    if (this._busy) { this._again = true; return false } this._busy = true;
    try {
      const q = await c.from(this.T).select('*').order('data_recebimento', { ascending: false }).order('criado_em', { ascending: false });
      if (q.error) { this.ok = false; this.erro = this.msg(q.error); this.avisa(); throw new Error(this.erro) }
      this.R = (q.data || []).map(r => this.de(r)); this.ok = true; this.erro = ''; this.iniciar(); this.avisa()
    } finally { this._busy = false; if (this._again) { this._again = false; this.carregar().catch(() => { }) } }
  },
  async tudo() { const a = this.carregarFat().catch(() => { }), b = this.carregar().catch(() => { }); await Promise.all([a, b]) },
  avisa() { this.ouv.forEach(o => { try { o.fn() } catch (e) { console.error(e) } }) },
  on(fn) { this.ouv.push({ fn }) },
  /* atualização em tempo real: outro usuário registrou/alterou/excluiu um recebimento → recarrega (só a lista; o RLS decide o que chega) */
  iniciar() {
    if (this._ch) return; const c = this.cli(); if (!c) return;
    try { this._ch = c.channel('recebimentos').on('postgres_changes', { event: '*', schema: 'public', table: this.T }, () => this.carregar().catch(() => { })).subscribe() } catch (e) { }
  },
  /* ---------- gravar (o banco confere a permissão e carimba autor/data) ---------- */
  valida(x) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(x.d || '') || !this.F.L.some(f => f.d == x.d)) return 'Escolha o faturamento (Data_Base).';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(x.dr || '') || isNaN(new Date(x.dr + 'T12:00:00Z')) || x.dr < '2000-01-01') return 'Informe a data do recebimento.';
    if (x.dr > this.hoje()) return 'A data do recebimento não pode ser futura.';
    if (typeof x.v != 'number' || !isFinite(x.v) || x.v <= 0 || x.v >= 1e13) return 'Informe o valor recebido (maior que zero).';
    if (String(x.obs || '').length > 300) return 'A observação passa de 300 caracteres.';
    return ''
  },
  hoje() { const d = new Date(), p = n => String(n).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) },
  campos(x) { const f = this.F.L.find(r => r.d == x.d); return { data_base: x.d, titulo: (f && f.titulo) || x.titulo || '', data_recebimento: x.dr, valor: Math.round(x.v * 100) / 100, obs: String(x.obs || '').trim() } },
  async registrar(x) {
    const e = this.valida(x); if (e) throw new Error(e);
    const r = await this.cli().from(this.T).insert(this.campos(x)).select().single(); if (r.error) throw new Error(this.msg(r.error));
    await this.carregar(); return this.de(r.data)
  },
  async alterar(id, x) {
    const e = this.valida(x); if (e) throw new Error(e);
    const r = await this.cli().from(this.T).update(this.campos(x)).eq('id', id).select();
    if (r.error) throw new Error(this.msg(r.error));
    if (!r.data || !r.data.length) { await this.carregar().catch(() => { }); throw new Error('Não alterei: o recebimento foi excluído por outra pessoa ou você não tem permissão. A tela foi atualizada.') }
    await this.carregar()
  },
  async excluir(id) {
    const r = await this.cli().from(this.T).delete().eq('id', id).select(); if (r.error) throw new Error(this.msg(r.error));
    if (!r.data || !r.data.length) { await this.carregar().catch(() => { }); throw new Error('Não excluí: o recebimento já tinha sido excluído ou você não tem permissão para excluir.') }
    await this.carregar()
  },
  /* ---------- a conta: faturado × recebido por Data_Base ----------
     base = 'saldo' (A receber = Saldo a Receber do Cliente) | 'total' (A receber = Total Faturado)
     situação: aberto (nada recebido) · parcial · quitado (recebido = a receber, em centavos exatos) · maior (recebido acima do a receber) · zero (nada a receber e nada recebido) */
  linhas(base) {
    const por = {}; this.R.forEach(r => { (por[r.d] = por[r.d] || []).push(r) });
    return this.F.L.map(f => {
      const rs = (por[f.d] || []).slice().sort((a, b) => a.dr < b.dr ? -1 : a.dr > b.dr ? 1 : a.ce < b.ce ? -1 : a.ce > b.ce ? 1 : 0),
        dev = this.c(base == 'total' ? f.tf : f.sal), rec = rs.reduce((t, r) => t + this.c(r.v), 0), ab = dev - rec,
        st = rec == 0 ? (dev <= 0 ? 'zero' : 'aberto') : ab == 0 ? 'quitado' : ab < 0 ? 'maior' : 'parcial';
      return { ...f, dev: this.r2(dev), rec: this.r2(rec), ab: this.r2(ab), pct: dev > 0 ? rec / dev : (rec > 0 ? 1 : 0), st, rs, ult: rs.length ? rs[rs.length - 1].dr : '' }
    })
  },
  /* recebimentos ligados a uma Data_Base que não está (mais) na base do Fundo de Reserva */
  orfaos() { const ds = new Set(this.F.L.map(f => f.d)); return this.R.filter(r => !ds.has(r.d)) }
};
