/* Dados das Faturas Emitidas no Supabase — usado pelo módulo "Faturas Emitidas" (anexar / editar / corrigir) e pelo "Fundo de Reserva" (baixar a NF da competência).
   • public.faturas_emitidas → uma linha por NF. "Data da Emissão" (coluna competencia) = data em que a NF foi emitida (o mês dela é a competência do Fundo de Reserva).
     EDITAR (acertar a data da emissão, o nº ou a observação) NÃO pede justificativa, não troca o arquivo e não cria versão: o banco só carimba "editado por / em".
     CORRIGIR / REFATURAR troca o arquivo e exige o motivo; o BANCO guarda a versão anterior em "historico" (gatilho).
   • Storage · bucket privado "faturas-nf" → o arquivo da NF (PDF, XML, PNG ou JPG · até 10 MB). Arquivo enviado nunca é sobrescrito.
   • VALOR BRUTO (coluna valor_bruto) = valor bruto da NF, informado ao anexar/corrigir (obrigatório na tela; NFs antigas podem estar sem, até alguém completar em "Editar").
   Quem pode: fat.anexar anexa/corrige · fat.excluir exclui · fat.ver vê, visualiza e baixa (permissões por usuário — regras reais no banco, RLS: supabase/permissoes.sql).
   • TOTAL FATURADO (card da tela): vem das colunas "Total Faturado" e "Numero do Titulo" da planilha do Fundo de Reserva, na base publicada (public.bases · fundo_reserva).
     Quem tem a permissão fundo.ver lê a base direto; quem NÃO a tem usa a função public.faturado_por_competencia() (supabase/faturas-total-faturado.sql),
     que devolve só Data_Base, nº do título e total faturado.
   Depende de supabase.js (sb_), base.js (BASE) e app.js (saveAs). */
const FDB = {
  T: 'faturas_emitidas', BK: 'faturas-nf', MAXB: 10 * 1024 * 1024,
  EXT: { pdf: 'application/pdf', xml: 'application/xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg' },
  L: [], ok: false, erro: '', ouv: [], _ch: null, _sig: '', _busy: false, _again: false,
  /* Total Faturado por Data_Base (base do Fundo de Reserva): L = [{ d:'AAAA-MM-DD', titulo:'00000004', tf:12160667.52 }] */
  TF: { L: [], ok: false, erro: '', em: '' },
  cli() { return typeof sb_ != 'undefined' && sb_ ? sb_ : null },
  ext(n) { const m = String(n || '').toLowerCase().match(/\.([a-z0-9]+)$/); return m ? m[1] : '' },
  uid() { const a = new Uint8Array(16); (self.crypto || window.crypto).getRandomValues(a); return Array.from(a, b => b.toString(16).padStart(2, '0')).join('') },
  nomeSeguro(n) { return String(n || 'NF').replace(/[\\/\u0000-\u001f]/g, '_').trim().slice(-150) || 'NF' },
  tam(b) { b = +b || 0; return b >= 1048576 ? (b / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB' },
  /* mensagens do banco / armazenamento em português */
  msg(e) {
    const m = String((e && (e.message || e.error_description || e.error)) || e || ''), c = String((e && e.code) || '');
    if (/valor_bruto_check/i.test(m)) return 'Informe um Valor Bruto maior que zero.';
    if (/valor_bruto/i.test(m) && /column|schema cache|PGRST204|42703/i.test(m + ' ' + c)) return 'Falta atualizar o banco: rode de novo o arquivo supabase/faturas-emitidas.sql no Supabase (ele cria a coluna do Valor Bruto).';
    if (/row-level security|not authorized|permission denied|unauthorized/i.test(m)) return 'Sem permissão para esta operação.';
    if (/bucket not found/i.test(m)) return 'O armazenamento das NFs ainda não foi criado. Execute supabase/faturas-emitidas.sql no Supabase.';
    if (/PGRST205|42P01|schema cache|does not exist/i.test(m + ' ' + c)) return 'A tabela de Faturas Emitidas ainda não existe. Execute supabase/faturas-emitidas.sql no Supabase.';
    if (/mime type|not supported|invalid_mime/i.test(m)) return 'Tipo de arquivo não aceito. Envie PDF, XML, PNG ou JPG.';
    if (/maximum allowed size|too large|payload/i.test(m)) return 'O arquivo passa do limite de 10 MB.';
    return m || 'Falha inesperada.'
  },
  /* Valor Bruto: número maior que zero, em reais, com até 2 casas (o banco guarda numeric(16,2)) */
  vbOk(n) { return typeof n == 'number' && isFinite(n) && n > 0 && n < 1e13 },
  validar(file) {
    if (!file) return 'Selecione o arquivo da NF.';
    if (!this.EXT[this.ext(file.name)]) return 'Tipo de arquivo não aceito. Envie PDF, XML, PNG ou JPG.';
    if (!file.size) return 'O arquivo está vazio.';
    if (file.size > this.MAXB) return 'O arquivo tem ' + this.tam(file.size) + ' e passa do limite de 10 MB.';
    return ''
  },
  /* linha do banco → formato usado pelos módulos */
  de(r) {
    const h = Array.isArray(r.historico) ? r.historico : [];
    return {
      id: r.id, comp: String(r.competencia).slice(0, 10), num: r.numero || '', vb: r.valor_bruto == null || r.valor_bruto === '' ? null : +r.valor_bruto, obs: r.obs || '', path: r.arquivo_path, nome: r.arquivo_nome || 'NF', tipo: r.arquivo_tipo || '', bytes: +r.arquivo_bytes || 0,
      v: +r.versao || 1, mot: r.motivo || '', cp: r.criado_por || '', cn: r.criado_por_nome || '', ce: r.criado_em || '', an: r.atualizado_por_nome || '', ae: r.atualizado_em || '',
      edn: r.editado_por_nome || '', ede: r.editado_em || '',
      h: h.map(x => ({ v: +x.versao || 1, comp: String(x.competencia || '').slice(0, 10), num: x.numero || '', vb: x.valor_bruto == null || x.valor_bruto === '' ? null : +x.valor_bruto, path: x.arquivo_path, nome: x.arquivo_nome || 'NF', tipo: x.arquivo_tipo || '', bytes: +x.arquivo_bytes || 0, por: x.anexado_por || '', em: x.anexado_em || '', mot: x.motivo || '', sub: x.substituido_por || '', sem: x.substituido_em || '' })).sort((a, b) => b.v - a.v)
    }
  },
  async carregar() {
    const c = this.cli(); if (!c) throw new Error('Supabase não configurado');
    if (this._busy) { this._again = true; return false } this._busy = true;
    try {
      const q = await c.from(this.T).select('*').order('competencia', { ascending: false }).order('criado_em', { ascending: false });
      if (q.error) { this.ok = false; this.erro = this.msg(q.error); this._sig = ''; this.avisa(); throw new Error(this.erro) }
      const L = (q.data || []).map(r => this.de(r)), sig = JSON.stringify(L.map(x => [x.id, x.ae, x.v, x.ede, x.comp, x.num, x.vb, x.obs])), mudou = sig != this._sig || !this.ok;
      this.L = L; this.ok = true; this.erro = ''; this._sig = sig; this.iniciar(); if (mudou) this.avisa(); return mudou
    } finally { this._busy = false; if (this._again) { this._again = false; this.carregar().catch(() => { }) } }
  },
  avisa() { this.ouv.forEach(o => { try { o.fn() } catch (e) { console.error(e) } }) },
  on(fn) { this.ouv.push({ fn }) },
  iniciar() {
    if (this._ch) return; const c = this.cli(); if (!c) return;
    try { this._ch = c.channel('faturas-emitidas').on('postgres_changes', { event: '*', schema: 'public', table: this.T }, () => this.carregar().catch(() => { })).subscribe() } catch (e) { }
  },
  /* ---------- Total Faturado (colunas "Total Faturado" e "Numero do Titulo" da base do Fundo de Reserva) ---------- */
  n(v) { const x = +v; return isFinite(x) ? x : 0 },
  tfLinhas(dados) { /* base publicada → linhas; bases antigas (sem a coluna Total Faturado) valem pelo Valor Bruto */
    const a = dados && Array.isArray(dados.d) ? dados.d : [];
    return a.filter(r => r && /^\d{4}-\d{2}-\d{2}$/.test(String(r.d))).map(r => ({ d: String(r.d), titulo: String(r.titulo == null ? '' : r.titulo).trim(), tf: this.n(r.tf != null && r.tf !== '' ? r.tf : r.bruto) })).sort((x, y) => x.d < y.d ? -1 : x.d > y.d ? 1 : 0)
  },
  msgTF(e) {
    const m = String((e && (e.message || e.error_description)) || e || ''), c = String((e && e.code) || '');
    if (/PGRST202|42883|could not find the function/i.test(m + ' ' + c)) return !PERM.tem('fundo.ver') ? 'Falta liberar o Total Faturado para este usuário: peça ao administrador para executar supabase/faturas-total-faturado.sql no Supabase.' : 'Função do Total Faturado ainda não criada: execute supabase/faturas-total-faturado.sql no Supabase.';
    if (/42501|permission|row-level|Sem permiss/i.test(m + ' ' + c)) return 'Sem permissão para ver o Total Faturado.';
    return this.msg(e)
  },
  async carregarTF() {
    const c = this.cli(); if (!c) return;
    try {
      let L, em = '';
      if (!PERM.tem('fundo.ver')) { /* sem acesso ao Fundo de Reserva: não lê public.bases, a função devolve só Data_Base, nº do título e total faturado */
        const r = await c.rpc('faturado_por_competencia'); if (r.error) throw r.error;
        const d = r.data || []; L = d.map(x => ({ d: String(x.data_base).slice(0, 10), titulo: String(x.numero_titulo || '').trim(), tf: this.n(x.total_faturado) })); em = (d[0] && d[0].atualizado_em) || ''
      } else { const b = await BASE.ler('fundo_reserva'); L = this.tfLinhas(b && b.dados); em = (b && b.atualizado_em) || '' }
      this.TF = { L, ok: true, erro: '', em }
    } catch (e) { this.TF = { L: [], ok: false, erro: this.msgTF(e), em: '' } }
    this.avisa()
  },
  /* NFs da competência (mês YYYY-MM), a mais recente primeiro */
  mes(ym) { return this.L.filter(x => x.comp.slice(0, 7) == ym).sort((a, b) => a.comp < b.comp ? 1 : a.comp > b.comp ? -1 : 0) },
  /* ---------- gravar ---------- */
  async subir(file, comp) {
    const c = this.cli(), e = this.ext(file.name), path = comp.slice(0, 7) + '/' + this.uid() + '.' + e;
    const r = await c.storage.from(this.BK).upload(path, file, { contentType: this.EXT[e], cacheControl: '3600', upsert: false });
    if (r.error) throw new Error(this.msg(r.error)); return path
  },
  async limpar(path) { try { await this.cli().storage.from(this.BK).remove([path]) } catch (e) { } },
  campos(x, path) { return { competencia: x.comp, numero: x.num || '', valor_bruto: x.vb, obs: x.obs || '', arquivo_path: path, arquivo_nome: this.nomeSeguro(x.file.name), arquivo_tipo: this.EXT[this.ext(x.file.name)], arquivo_bytes: x.file.size } },
  /* anexa uma NF nova: sobe o arquivo e grava a linha (se a linha falhar, tenta desfazer o upload) */
  async anexar(x) {
    const v = this.validar(x.file); if (v) throw new Error(v);
    if (!this.vbOk(x.vb)) throw new Error('Informe o Valor Bruto da NF (maior que zero).');
    const c = this.cli(), path = await this.subir(x.file, x.comp), r = await c.from(this.T).insert(this.campos(x, path)).select().single();
    if (r.error) { await this.limpar(path); throw new Error(this.msg(r.error)) }
    await this.carregar(); return this.de(r.data)
  },
  /* correção / refaturamento: arquivo novo + motivo; o banco guarda a versão anterior no histórico.
     .eq('versao', ...) evita sobrescrever uma correção feita por outra pessoa ao mesmo tempo
     (x.v = versão que a pessoa estava vendo ao abrir a janela; sem ela vale a versão carregada agora) */
  async corrigir(id, x) {
    const a = this.L.find(r => r.id == id); if (!a) throw new Error('NF não encontrada. Atualize a tela.');
    const mot = String(x.motivo || '').trim(); if (!mot) throw new Error('Informe o motivo da correção.');
    const v = this.validar(x.file); if (v) throw new Error(v);
    if (!this.vbOk(x.vb)) throw new Error('Informe o Valor Bruto da NF (maior que zero).');
    const c = this.cli(), path = await this.subir(x.file, x.comp), r = await c.from(this.T).update({ ...this.campos(x, path), correcao_motivo: mot }).eq('id', id).eq('versao', x.v || a.v).select();
    if (r.error) { await this.limpar(path); throw new Error(this.msg(r.error)) }
    if (!r.data || !r.data.length) { await this.limpar(path); await this.carregar().catch(() => { }); throw new Error('A NF foi alterada por outra pessoa ou você não tem permissão. A tela foi atualizada; confira e tente de novo.') }
    await this.carregar()
  },
  /* ajuste simples: só Data da Emissão, nº, Valor Bruto e observação. SEM justificativa, SEM trocar o arquivo, SEM versão nova nem histórico —
     o gatilho do banco guarda tudo o mais como estava e só carimba "editado por / em". Por isso este update NÃO envia nenhum campo do arquivo.
     .eq('versao', ...) recusa o ajuste se a NF foi refaturada por outra pessoa enquanto a janela estava aberta */
  async editar(id, x) {
    const a = this.L.find(r => r.id == id); if (!a) throw new Error('NF não encontrada. Atualize a tela.');
    if (x.vb != null && !this.vbOk(x.vb)) throw new Error('Informe um Valor Bruto maior que zero.');
    if (a.vb != null && x.vb == null) throw new Error('O Valor Bruto não pode ficar em branco.');
    const c = this.cli(), r = await c.from(this.T).update({ competencia: x.comp, numero: x.num || '', valor_bruto: x.vb == null ? null : x.vb, obs: x.obs || '' }).eq('id', id).eq('versao', x.v || a.v).select();
    if (r.error) {
      if (/motivo da corre/i.test(String(r.error.message || ''))) throw new Error('Falta atualizar o banco: rode de novo o arquivo supabase/faturas-emitidas.sql no Supabase (ele libera o ajuste sem justificativa).');
      throw new Error(this.msg(r.error))
    }
    if (!r.data || !r.data.length) { await this.carregar().catch(() => { }); throw new Error('A NF foi alterada por outra pessoa (ou foi refaturada) ou você não tem permissão. A tela foi atualizada; confira e tente de novo.') }
    await this.carregar()
  },
  async excluir(id) {
    const a = this.L.find(r => r.id == id), c = this.cli(), r = await c.from(this.T).delete().eq('id', id).select();
    if (r.error) throw new Error(this.msg(r.error)); if (!r.data || !r.data.length) throw new Error('Sem permissão para excluir esta NF (permissão “Excluir NF”).');
    if (a) { try { await c.storage.from(this.BK).remove([a.path, ...a.h.map(h => h.path)]) } catch (e) { } } /* arquivos: melhor esforço */
    await this.carregar()
  },
  /* ---------- baixar / visualizar ---------- */
  async blob(path) { /* arquivo do armazenamento privado (só quem tem fat.ver recebe) */
    const c = this.cli(); if (!c) throw new Error('Supabase não configurado');
    const r = await c.storage.from(this.BK).download(path); if (r.error) throw new Error(this.msg(r.error)); return r.data
  },
  async baixar(path, nome) { await saveAs(nome || 'NF', await this.blob(path)) },
  /* a NF (ou a versão v do histórico) em formato único: { x: NF, nome, path, tipo, comp, num, vb, v, bytes } */
  arq(id, v) {
    const x = this.L.find(r => r.id == id); if (!x) throw new Error('NF não encontrada. Atualize a tela.');
    const h = v ? x.h.find(k => k.v == v) : null; if (v && !h) throw new Error('Versão não encontrada.');
    const a = h || x; return { x, nome: a.nome, path: a.path, tipo: this.EXT[this.ext(a.nome)] || a.tipo || '', comp: a.comp, num: a.num, vb: a.vb, v: h ? h.v : x.v, bytes: a.bytes }
  },
  baixarNF(id, v) { try { const a = this.arq(id, v); return this.baixar(a.path, a.nome) } catch (e) { return Promise.reject(e) } }
};
