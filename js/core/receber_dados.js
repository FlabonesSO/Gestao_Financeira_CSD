/* Dados do "Contas a Receber" no Supabase — usado pelo módulo js/modulos/contas_receber.js.
   • FATURAMENTO (o que foi faturado): NÃO é digitado de novo. Vem da base publicada do Fundo de Reserva (public.bases · fundo_reserva), que é lida da aba "BASE DE MEDICAO"
     da planilha MEDICAO_SERVICO (só as NFs com DOC FISCAL), pela função public.contas_a_receber_base() (supabase/contas-receber.sql · supabase/contas-receber-medicao.sql),
     que devolve só Data_Base (= DATA EMISSAO NF), DOC FISCAL, Valor Bruto (NF), retenção contratual, desconto do adiantamento, ISS, INSS, Valor Líquido e data prevista de pagamento
     — por isso quem tem a permissão "Contas a Receber · visualizar" NÃO precisa ver o Fundo de Reserva inteiro.
   • RECEBIMENTOS (o que o cliente já pagou): public.recebimentos — uma linha por pagamento (data, valor, observação), ligada ao faturamento pelo DOC FISCAL da NF
     (gravado em `titulo`) e, na falta dele, pela Data_Base. Se a Data_Base de uma NF mudar na planilha (a DATA EMISSAO NF foi corrigida, por exemplo), o recebimento ACOMPANHA a NF
     pelo DOC FISCAL: não fica órfão. Um faturamento pode ter vários recebimentos (pagamento parcial). Quem lançou/alterou e quando é carimbado pelo banco, e cada inclusão/alteração/exclusão vai
     para a Auditoria (gatilho no banco).
   • A COMPARAÇÃO: "A receber" = Valor Líquido da planilha (Valor Bruto − Retenção Contratual − Desconto do Adiantamento − ISS − INSS: é o que o cliente de fato paga).
     A tela usa sempre base = 'saldo' (o Total Faturado não é mais oferecido como base; 'total' segue aceito aqui só por compatibilidade). Em aberto = A receber − Recebido. Contas feitas em CENTAVOS inteiros (sem resíduo de ponto flutuante).
   • COMPROVANTE DO BANCO (pedido AI): cada recebimento pode ter UM arquivo de comprovante (PDF, PNG, JPG ou WEBP · até 10 MB) no bucket PRIVADO "recebimentos-comprovantes"
     (supabase/contas-receber-comprovante.sql). Opcional. Trocar ou remover NÃO apaga o anterior: o banco o guarda em "comprovantes_anteriores" (quem anexou, quando, quem substituiu) e ele segue disponível
     para visualizar e baixar; excluir o recebimento apaga também os arquivos dele. Autor e data do anexo são carimbados pelo banco. Sem o SQL, CPok = false e o site só avisa ao tentar anexar.
   Quem pode (permissões, aplicadas no banco por RLS): receber.ver vê (e visualiza/baixa o comprovante) · receber.lancar registra, edita e anexa/troca/remove o comprovante · receber.excluir exclui.
   Depende de supabase.js (sb_). */
const RCB = {
  T: 'recebimentos', BK: 'recebimentos-comprovantes', MAXB: 10 * 1024 * 1024,
  EXT: { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' },
  CPok: null,                                        /* null = ainda não sei (nenhum recebimento lido) · true = o banco já tem as colunas do comprovante · false = falta rodar supabase/contas-receber-comprovante.sql */
  R: [], ok: false, erro: '',                        /* recebimentos: [{ id, d (Data_Base que vale agora: a da NF pelo DOC FISCAL), d0 (Data_Base gravada no banco), mv (true = acompanhou a NF para outra Data_Base), titulo (DOC FISCAL gravado), dr (data do recebimento), v (valor), obs, cn, ce, an, ae }] */
  F: { L: [], ok: false, erro: '', em: '', novo: false },  /* faturamento por Data_Base: [{ d, titulo (DOC FISCAL), tf (Valor Bruto), ret (ISS+INSS), liq, adi, sal (= Valor Líquido = A receber), rc, iss, inss (null se o banco ainda não devolve), dp (data prevista de pagamento) }] · novo = o banco já devolve os campos da BASE DE MEDICAO */
  ouv: [], _ch: null, _busy: false, _again: false,
  cli() { return typeof sb_ != 'undefined' && sb_ ? sb_ : null },
  /* ---------- utilidades (centavos exatos) ---------- */
  c(n) { return Math.round((+n || 0) * 100) },
  r2(c) { return c / 100 },
  msg(e) {
    const m = String((e && (e.message || e.error_description || e.error)) || e || ''), cd = String((e && e.code) || '');
    if (/PGRST202|42883|could not find the function/i.test(m + ' ' + cd)) return 'O Contas a Receber ainda não foi instalado no banco: execute supabase/contas-receber.sql no Supabase.';
    if (/comprovante/i.test(m) && /column|schema cache|PGRST204|42703/i.test(m + ' ' + cd)) return 'Para anexar o comprovante do banco, rode o arquivo supabase/contas-receber-comprovante.sql no Supabase.';
    if (/PGRST205|42P01|schema cache|does not exist/i.test(m + ' ' + cd)) return 'A tabela de recebimentos ainda não existe. Execute supabase/contas-receber.sql no Supabase.';
    if (/Sem permiss|42501|row-level security|permission denied|not authorized/i.test(m + ' ' + cd)) return 'Sem permissão para esta operação.';
    if (/recebimentos_valor_check|valor_check/i.test(m)) return 'O valor recebido precisa ser maior que zero.';
    if (/obs_check/i.test(m)) return 'A observação passa de 300 caracteres.';
    if (/bucket not found/i.test(m)) return 'O armazenamento dos comprovantes ainda não foi criado. Execute supabase/contas-receber-comprovante.sql no Supabase.';
    if (/mime type|not supported|invalid_mime/i.test(m)) return 'Tipo de arquivo não aceito. Envie PDF, PNG, JPG ou WEBP.';
    if (/maximum allowed size|too large|payload/i.test(m)) return 'O arquivo passa do limite de 10 MB.';
    return m || 'Falha inesperada.'
  },
  /* ---------- arquivo do comprovante (mesmas regras do comprovante de Seguros) ---------- */
  ext(n) { const m = String(n || '').toLowerCase().match(/\.([a-z0-9]+)$/); return m ? m[1] : '' },
  uid() { const a = new Uint8Array(16); (self.crypto || window.crypto).getRandomValues(a); return Array.from(a, b => b.toString(16).padStart(2, '0')).join('') },
  nomeSeguro(n) { return String(n || 'comprovante').replace(/[\\/\u0000-\u001f]/g, '_').trim().slice(-150) || 'comprovante' },
  tam(b) { b = +b || 0; return b >= 1048576 ? (b / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB' },
  validarArq(file) {
    if (!file) return 'Selecione o arquivo do comprovante.';
    if (!this.EXT[this.ext(file.name)]) return 'Tipo de arquivo não aceito. Envie PDF, PNG, JPG ou WEBP.';
    if (!file.size) return 'O arquivo está vazio.';
    if (file.size > this.MAXB) return 'O arquivo tem ' + this.tam(file.size) + ' e passa do limite de 10 MB.';
    return ''
  },
  /* linha do banco → formato usado pelo módulo */
  de(r) {
    const d0 = String(r.data_base).slice(0, 10);
    return { id: r.id, d: d0, d0, mv: false, titulo: String(r.titulo == null ? '' : r.titulo).trim(), dr: String(r.data_recebimento).slice(0, 10), v: +r.valor || 0, obs: r.obs || '',
      cp: r.criado_por || '', cn: r.criado_por_nome || '', ce: r.criado_em || '', an: r.atualizado_por_nome || '', ae: r.atualizado_em || '',
      path: r.comprovante_path || '', nome: r.comprovante_nome || '', ctipo: r.comprovante_tipo || '', bytes: +r.comprovante_bytes || 0, cem: r.comprovante_em || '', cpor: r.comprovante_por_nome || '',
      ant: (Array.isArray(r.comprovantes_anteriores) ? r.comprovantes_anteriores : []).filter(x => x && x.path).map(x => ({ path: x.path, nome: x.nome || 'comprovante', tipo: x.tipo || '', bytes: +x.bytes || 0, em: x.anexado_em || '', por: x.anexado_por || '', sub: x.substituido_por || '', sem: x.substituido_em || '' })) }
  },
  /* ---------- ligação do recebimento com a NF (DOC FISCAL) ----------
     O DOC FISCAL é comparado sem espaços e sem zeros à esquerda ('00000004' = '4'). Vale, nesta ordem:
       1) o DOC FISCAL gravado no recebimento existe na base e aparece em UMA só Data_Base → o recebimento vai para essa Data_Base (mesmo que a gravada no banco seja outra);
       2) senão (sem DOC FISCAL, DOC FISCAL que não está mais na base, ou que aparece em mais de uma Data_Base) → vale a Data_Base gravada;
       3) nenhuma das duas existe na base → recebimento "órfão" (aviso na tela; nada se perde). */
  nt(s) { return String(s == null ? '' : s).trim().replace(/^0+(?=.)/, '') },
  vincula() {
    const nf = (this.F && this.F.nf) || {};
    this.R.forEach(r => {
      r.d = r.d0; r.mv = false;
      const ds = []; String(r.titulo || '').split(',').forEach(t => { const a = nf[this.nt(t)]; if (a && a.length == 1 && !ds.includes(a[0])) ds.push(a[0]) });
      if (ds.length && !ds.includes(r.d0)) { r.d = ds[0]; r.mv = true }
    })
  },
  /* ---------- carregar ---------- */
  async carregarFat() {
    const c = this.cli(); if (!c) throw new Error('Supabase não configurado');
    const q = await c.rpc('contas_a_receber_base');
    if (q.error) { this.F = { L: [], ok: false, erro: this.msg(q.error), em: '', novo: false }; this.vincula(); this.avisa(); throw new Error(this.F.erro) }
    const por = {}, ord = []; let em = '';
    const nn = v => v == null || v === '' ? null : this.c(v), so = (a, b) => a == null && b == null ? null : (a || 0) + (b || 0);   /* null = o banco ainda não devolve o campo (supabase/contas-receber-medicao.sql não executado) */
    const rows = q.data || [], novo = rows.length > 0 && 'retencao_contratual' in rows[0];
    rows.forEach(x => {   /* uma linha por Data_Base (se a base repetir a data, soma) */
      const d = String(x.data_base).slice(0, 10), k = por[d], dp = x.data_prevista ? String(x.data_prevista).slice(0, 10) : '';
      const o = { d, titulo: String(x.numero_titulo || '').trim(), tf: this.c(x.total_faturado), ret: this.c(x.impostos), liq: this.c(x.liquido), adi: this.c(x.adiantamento), sal: this.c(x.saldo_cliente), rc: nn(x.retencao_contratual), iss: nn(x.retencao_iss), inss: nn(x.retencao_inss), dp };
      if (!k) { por[d] = o; ord.push(d) } else { k.tf += o.tf; k.ret += o.ret; k.liq += o.liq; k.adi += o.adi; k.sal += o.sal; k.rc = so(k.rc, o.rc); k.iss = so(k.iss, o.iss); k.inss = so(k.inss, o.inss); if (o.dp && (!k.dp || o.dp < k.dp)) k.dp = o.dp; if (o.titulo && !k.titulo.split(', ').includes(o.titulo)) k.titulo = k.titulo ? k.titulo + ', ' + o.titulo : o.titulo }
      if (x.atualizado_em && String(x.atualizado_em) > em) em = String(x.atualizado_em)
    });
    const r2n = v => v == null ? null : this.r2(v), nf = {};   /* DOC FISCAL (sem zeros à esquerda) → Data_Base(s) em que a NF aparece na base */
    rows.forEach(x => { const t = this.nt(x.numero_titulo); if (!t) return; const d = String(x.data_base).slice(0, 10); (nf[t] = nf[t] || []); if (!nf[t].includes(d)) nf[t].push(d) });
    this.F = { L: ord.sort().map(d => { const o = por[d]; return { d, titulo: o.titulo, tf: this.r2(o.tf), ret: this.r2(o.ret), liq: this.r2(o.liq), adi: this.r2(o.adi), sal: this.r2(o.sal), rc: r2n(o.rc), iss: r2n(o.iss), inss: r2n(o.inss), dp: o.dp } }), ok: true, erro: '', em, novo, nf };
    this.vincula(); this.avisa()
  },
  async carregar() {
    const c = this.cli(); if (!c) throw new Error('Supabase não configurado');
    if (this._busy) { this._again = true; return false } this._busy = true;
    try {
      const q = await c.from(this.T).select('*').order('data_recebimento', { ascending: false }).order('criado_em', { ascending: false });
      if (q.error) { this.ok = false; this.erro = this.msg(q.error); this.avisa(); throw new Error(this.erro) }
      const rows = q.data || []; if (rows.length) this.CPok = 'comprovante_path' in rows[0];   /* o banco devolve as colunas do comprovante? (sem recebimento nenhum não dá para saber: fica como estava) */
      this.R = rows.map(r => this.de(r)); this.vincula(); this.ok = true; this.erro = ''; this.iniciar(); this.avisa()
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
  /* comprovante: sobe o arquivo (nunca sobrescreve: nome novo a cada envio) e devolve o caminho; campoArq() são as colunas que vão junto na linha do recebimento */
  async subir(file, d) {
    const e = this.ext(file.name), path = String(d).slice(0, 7) + '/' + this.uid() + '.' + e;
    const r = await this.cli().storage.from(this.BK).upload(path, file, { contentType: this.EXT[e], cacheControl: '3600', upsert: false });
    if (r.error) throw new Error(this.msg(r.error)); return path
  },
  async limpar(path) { if (path) { try { await this.cli().storage.from(this.BK).remove([path]) } catch (e) { } } },
  campoArq(file, path) { return { comprovante_path: path, comprovante_nome: this.nomeSeguro(file.name), comprovante_tipo: this.EXT[this.ext(file.name)], comprovante_bytes: file.size } },
  /* x.file (opcional) = comprovante do banco. Sem arquivo, a linha NÃO leva nenhuma coluna do comprovante (registrar continua funcionando mesmo sem o SQL novo). Se a gravação falha, o arquivo enviado é desfeito */
  async registrar(x) {
    const e = this.valida(x); if (e) throw new Error(e);
    let path = ''; if (x.file) { const v = this.validarArq(x.file); if (v) throw new Error(v); path = await this.subir(x.file, x.d) }
    const r = await this.cli().from(this.T).insert({ ...this.campos(x), ...(path ? this.campoArq(x.file, path) : {}) }).select().single();
    if (r.error) { await this.limpar(path); throw new Error(this.msg(r.error)) }
    await this.carregar(); return this.de(r.data)
  },
  /* x.file = comprovante novo (o atual vai para o histórico, feito pelo banco) · x.remover = tirar o comprovante atual (também vai para o histórico) · nenhum dos dois = não mexe no comprovante */
  async alterar(id, x) {
    const e = this.valida(x); if (e) throw new Error(e);
    const a = this.R.find(r => r.id == id); let path = '', campos = this.campos(x);
    if (x.file) { const v = this.validarArq(x.file); if (v) throw new Error(v); path = await this.subir(x.file, x.d); campos = { ...campos, ...this.campoArq(x.file, path) } }
    else if (x.remover && a && a.path) campos = { ...campos, comprovante_path: null };
    const r = await this.cli().from(this.T).update(campos).eq('id', id).select();
    if (r.error) { await this.limpar(path); throw new Error(this.msg(r.error)) }
    if (!r.data || !r.data.length) { await this.limpar(path); await this.carregar().catch(() => { }); throw new Error('Não alterei: o recebimento foi excluído por outra pessoa ou você não tem permissão. A tela foi atualizada.') }
    await this.carregar()
  },
  async excluir(id) {
    const a = this.R.find(r => r.id == id), arqs = a ? [a.path, ...(a.ant || []).map(h => h.path)].filter(Boolean) : [];
    const r = await this.cli().from(this.T).delete().eq('id', id).select(); if (r.error) throw new Error(this.msg(r.error));
    if (!r.data || !r.data.length) { await this.carregar().catch(() => { }); throw new Error('Não excluí: o recebimento já tinha sido excluído ou você não tem permissão para excluir.') }
    if (arqs.length) { try { await this.cli().storage.from(this.BK).remove(arqs) } catch (e) { } }   /* os arquivos saem junto com o recebimento (melhor esforço) */
    await this.carregar()
  },
  /* ---------- visualizar / baixar o comprovante (só quem tem receber.ver recebe o arquivo: regra do armazenamento) ---------- */
  async blob(path) {
    const r = await this.cli().storage.from(this.BK).download(path); if (r.error) throw new Error(this.msg(r.error)); return r.data
  },
  async baixar(path, nome) { await saveAs(nome || 'comprovante', await this.blob(path)) },
  /* o comprovante vigente (i ausente) ou o anterior de índice i, em formato único para o visualizador/baixar */
  arq(id, i) {
    const x = this.R.find(r => r.id == id); if (!x) throw new Error('Recebimento não encontrado. Atualize a tela.');
    const h = i == null ? null : x.ant[+i]; if (i != null && !h) throw new Error('Comprovante anterior não encontrado. Atualize a tela.');
    const a = h || x; if (!a.path) throw new Error('Este recebimento não tem comprovante.');
    return { x, nome: a.nome || 'comprovante', path: a.path, tipo: this.EXT[this.ext(a.nome)] || a.ctipo || a.tipo || '', bytes: a.bytes, vigente: !h, em: h ? h.em : x.cem, por: h ? h.por : x.cpor }
  },
  /* ---------- a conta: faturado × recebido por Data_Base ----------
     base = 'saldo' (A receber = Valor Líquido da planilha, que o banco entrega em saldo_cliente; o único usado pela tela) | 'total' (A receber = Total Faturado; sem uso na tela)
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
  /* recebimentos que não achamos na base do Fundo de Reserva: nem o DOC FISCAL nem a Data_Base gravados existem mais */
  orfaos() { const ds = new Set(this.F.L.map(f => f.d)); return this.R.filter(r => !ds.has(r.d)) }
};
