/* Gestão de unidades/usuários compartilhada entre /dashboard e /express.
   Fala direto com o Supabase (via SupabaseShared.client) pra tudo, exceto
   criar login, excluir login e trocar a senha de outra pessoa — essas três
   ações passam pela Edge Function "admin-usuarios" (só ela tem a chave
   secreta, e confere se quem pediu é realmente admin antes de agir).

   Uso: GestaoShared.abrirUnidades() / GestaoShared.abrirUsuarios()
   (ambos assíncronos — buscam o HTML na primeira vez que são chamados). */
(function(){
  const EDGE_FUNCTION_URL = 'https://szfpbnbzcbumzokftyub.supabase.co/functions/v1/admin-usuarios';
  const TEMPLATE_URL = '../shared/gestao.html';
  let templatePromise = null;
  let montado = false;
  let unidadesCache = [];
  let usuariosCache = [];

  async function chamarEdgeFunction_(acao, extra){
    const { data } = await SupabaseShared.client.auth.getSession();
    const token = data && data.session ? data.session.access_token : '';
    const res = await fetch(EDGE_FUNCTION_URL, {
      method: 'POST',
      headers: {'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token},
      body: JSON.stringify(Object.assign({acao}, extra || {}))
    });
    return res.json();
  }
  function fmtBRL(v){
    return 'R$ ' + (Number(v) || 0).toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2});
  }
  function parseCurrencyInput(str){
    const digits = String(str || '').replace(/\D/g, '');
    return digits ? parseInt(digits, 10) / 100 : 0;
  }
  function nivelLabel(n){
    if(n === 'admin') return 'Admin';
    if(n === 'consultor_l2') return 'Consultor L2';
    if(n === 'consultor') return 'Consultor L1';
    return n || '—';
  }
  function carregarTemplate(){
    if(!templatePromise){
      templatePromise = fetch(TEMPLATE_URL).then(res => res.text());
    }
    return templatePromise;
  }
  async function garantirMontado(){
    if(montado) return;
    const tpl = await carregarTemplate();
    const wrap = document.createElement('div');
    wrap.innerHTML = tpl;
    document.body.appendChild(wrap);
    montado = true;
    wireStatic();
  }
  function fechar(id){ document.getElementById(id).style.display = 'none'; }

  function wireStatic(){
    document.getElementById('gm-uf-cor').addEventListener('input', function(){
      document.getElementById('gm-uf-cor-hex').textContent = this.value.toUpperCase();
    });
    document.getElementById('gm-uf-meta-orc').addEventListener('input', function(){
      const digits = this.value.replace(/\D/g, '');
      this.value = digits ? (parseInt(digits, 10) / 100).toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2}) : '';
    });
    document.getElementById('gm-usf-senha-toggle').onclick = function(){
      const input = document.getElementById('gm-usf-senha');
      const showing = this.classList.toggle('showing');
      input.type = showing ? 'text' : 'password';
    };
    document.getElementById('gm-usf-nivel').addEventListener('change', toggleUnidadeField);
    document.getElementById('gm-form-unidade').addEventListener('submit', salvarUnidade);
    document.getElementById('gm-form-usuario').addEventListener('submit', salvarUsuario);
    document.getElementById('gm-btn-limpar-unidade').onclick = limparFormUnidade;
    document.getElementById('gm-btn-limpar-usuario').onclick = limparFormUsuario;
    document.getElementById('gm-btn-excluir-usuario').onclick = excluirUsuario;
    document.getElementById('gm-fechar-unidades').onclick = function(){ fechar('gm-modal-unidades'); };
    document.getElementById('gm-fechar-usuarios').onclick = function(){ fechar('gm-modal-usuarios'); };
    configurarFechamentoPorFora_(document.getElementById('gm-modal-unidades'), 'gm-modal-unidades');
    configurarFechamentoPorFora_(document.getElementById('gm-modal-usuarios'), 'gm-modal-usuarios');
  }
  function configurarFechamentoPorFora_(overlay, id){
    let comecouNoFundo = false;
    overlay.addEventListener('mousedown', e => { comecouNoFundo = (e.target === overlay); });
    overlay.addEventListener('click', e => {
      if(e.target === overlay && comecouNoFundo) fechar(id);
      comecouNoFundo = false;
    });
  }

  /* ---- Unidades ---- */
  async function carregarUnidadesAdmin(){
    const { data, error } = await SupabaseShared.client.from('unidades').select('*').order('nome');
    unidadesCache = error ? [] : (data || []).map(u => ({
      ID: u.id, Nome: u.nome, Cor: u.cor || '',
      MetaOrcamento: u.meta_orcamento || 0, MetaTas: u.meta_tas || 0, MetaTasConsultor: u.meta_tas_consultor || 0
    }));
    const tbody = document.getElementById('gm-unidades-tbody');
    tbody.innerHTML = unidadesCache.length ? unidadesCache.map(u => (
      '<tr data-id="' + u.ID + '">'
      + '<td>' + (u.Cor ? '<span class="gm-cor-dot" style="background:' + u.Cor + '"></span>' : '') + u.Nome + '</td>'
      + '<td>' + fmtBRL(u.MetaOrcamento) + '</td><td>' + (u.MetaTas || 0) + '</td><td>' + (u.MetaTasConsultor || 0) + '</td>'
      + '</tr>'
    )).join('') : '<tr><td colspan="4" class="gm-empty">Nenhuma unidade cadastrada.</td></tr>';
    Array.prototype.forEach.call(tbody.querySelectorAll('tr[data-id]'), tr => {
      tr.onclick = function(){
        const u = unidadesCache.filter(x => x.ID === tr.dataset.id)[0];
        if(u) preencherFormUnidade(u);
      };
    });
  }
  function preencherFormUnidade(u){
    document.getElementById('gm-uf-id').value = u.ID;
    document.getElementById('gm-uf-nome').value = u.Nome;
    const cor = u.Cor || '#2E4B95';
    document.getElementById('gm-uf-cor').value = cor;
    document.getElementById('gm-uf-cor-hex').textContent = cor.toUpperCase();
    document.getElementById('gm-uf-meta-orc').value = (Number(u.MetaOrcamento) || 0).toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2});
    document.getElementById('gm-uf-meta-tas').value = u.MetaTas || 0;
    document.getElementById('gm-uf-meta-consultor').value = u.MetaTasConsultor || 0;
  }
  function limparFormUnidade(){
    document.getElementById('gm-uf-id').value = '';
    document.getElementById('gm-uf-nome').value = '';
    document.getElementById('gm-uf-cor').value = '#2E4B95';
    document.getElementById('gm-uf-cor-hex').textContent = '#2E4B95';
    document.getElementById('gm-uf-meta-orc').value = '';
    document.getElementById('gm-uf-meta-tas').value = '';
    document.getElementById('gm-uf-meta-consultor').value = '';
  }
  async function salvarUnidade(ev){
    ev.preventDefault();
    const id = document.getElementById('gm-uf-id').value;
    const dados = {
      nome: document.getElementById('gm-uf-nome').value.trim(),
      cor: document.getElementById('gm-uf-cor').value,
      meta_orcamento: parseCurrencyInput(document.getElementById('gm-uf-meta-orc').value),
      meta_tas: parseInt(document.getElementById('gm-uf-meta-tas').value, 10) || 0,
      meta_tas_consultor: parseInt(document.getElementById('gm-uf-meta-consultor').value, 10) || 0
    };
    if(!dados.nome) return;
    const query = id
      ? SupabaseShared.client.from('unidades').update(dados).eq('id', id)
      : SupabaseShared.client.from('unidades').insert(dados);
    const { error } = await query;
    if(error){ alert('Não foi possível salvar essa unidade: ' + error.message); return; }
    await carregarUnidadesAdmin();
    limparFormUnidade();
  }

  /* ---- Usuários ---- */
  async function popularSelectUnidades(){
    const { data, error } = await SupabaseShared.client.from('unidades').select('id, nome').order('nome');
    const lista = error ? [] : (data || []);
    document.getElementById('gm-usf-unidade').innerHTML = lista.map(u => '<option value="' + u.id + '">' + u.nome + '</option>').join('');
  }
  function toggleUnidadeField(){
    const isAdmin = document.getElementById('gm-usf-nivel').value === 'admin';
    document.getElementById('gm-usf-unidade-wrap').style.display = isAdmin ? 'none' : '';
  }
  async function carregarUsuariosAdmin(){
    const { data, error } = await SupabaseShared.client
      .from('usuarios')
      .select('id, auth_id, nome, usuario, nivel, unidade_id, id_consultor, unidades(nome)')
      .order('nome');
    usuariosCache = error ? [] : (data || []);
    const tbody = document.getElementById('gm-usuarios-tbody');
    tbody.innerHTML = usuariosCache.length ? usuariosCache.map(u => (
      '<tr data-id="' + u.id + '">'
      + '<td>' + u.nome + '</td><td>' + u.usuario + '</td><td>' + nivelLabel(u.nivel) + '</td>'
      + '<td>' + (u.nivel === 'admin' ? '—' : ((u.unidades && u.unidades.nome) || '—')) + '</td>'
      + '<td class="gm-mono">' + (u.id_consultor || '—') + '</td></tr>'
    )).join('') : '<tr><td colspan="5" class="gm-empty">Nenhum usuário cadastrado.</td></tr>';
    Array.prototype.forEach.call(tbody.querySelectorAll('tr[data-id]'), tr => {
      tr.onclick = function(){
        const u = usuariosCache.filter(x => x.id === tr.dataset.id)[0];
        if(u) preencherFormUsuario(u);
      };
    });
  }
  function preencherFormUsuario(u){
    document.getElementById('gm-usf-id').value = u.id;
    document.getElementById('gm-usf-id').dataset.authId = u.auth_id;
    document.getElementById('gm-usf-id').dataset.usuarioOriginal = u.usuario;
    document.getElementById('gm-usf-nome').value = u.nome;
    document.getElementById('gm-usf-usuario').value = u.usuario;
    document.getElementById('gm-usf-senha').value = '';
    document.getElementById('gm-usf-senha').type = 'password';
    document.getElementById('gm-usf-senha-toggle').classList.remove('showing');
    document.getElementById('gm-usf-nivel').value = u.nivel;
    document.getElementById('gm-usf-id-consultor').value = u.id_consultor || '';
    toggleUnidadeField();
    popularSelectUnidades().then(function(){
      if(u.unidade_id) document.getElementById('gm-usf-unidade').value = u.unidade_id;
    });
    document.getElementById('gm-btn-excluir-usuario').style.display = '';
  }
  function limparFormUsuario(){
    document.getElementById('gm-usf-id').value = '';
    document.getElementById('gm-usf-id').dataset.authId = '';
    document.getElementById('gm-usf-id').dataset.usuarioOriginal = '';
    document.getElementById('gm-usf-nome').value = '';
    document.getElementById('gm-usf-usuario').value = '';
    document.getElementById('gm-usf-senha').value = '';
    document.getElementById('gm-usf-senha').type = 'password';
    document.getElementById('gm-usf-senha-toggle').classList.remove('showing');
    document.getElementById('gm-usf-nivel').value = 'consultor';
    document.getElementById('gm-usf-id-consultor').value = '';
    toggleUnidadeField();
    document.getElementById('gm-btn-excluir-usuario').style.display = 'none';
  }
  async function excluirUsuario(){
    const idField = document.getElementById('gm-usf-id');
    const id = idField.value;
    const authId = idField.dataset.authId;
    if(!id) return;
    const nome = document.getElementById('gm-usf-nome').value;
    if(!confirm('Excluir o usuário "' + nome + '"? Essa ação não pode ser desfeita.')) return;

    const respEdge = await chamarEdgeFunction_('excluir', {authId});
    if(!respEdge.ok){ alert(respEdge.error || 'Não foi possível excluir o login desse usuário.'); return; }

    const { error } = await SupabaseShared.client.from('usuarios').delete().eq('id', id);
    if(error){ alert('O login foi excluído, mas não consegui remover o cadastro: ' + error.message); }

    await carregarUsuariosAdmin();
    limparFormUsuario();
  }
  async function salvarUsuario(ev){
    ev.preventDefault();
    const idField = document.getElementById('gm-usf-id');
    const id = idField.value;
    const authId = idField.dataset.authId;
    const usuarioOriginal = idField.dataset.usuarioOriginal;
    const nivel = document.getElementById('gm-usf-nivel').value;
    const usuario = document.getElementById('gm-usf-usuario').value.trim();
    const nome = document.getElementById('gm-usf-nome').value.trim();
    const unidadeId = nivel === 'admin' ? null : document.getElementById('gm-usf-unidade').value;
    const idConsultor = document.getElementById('gm-usf-id-consultor').value.trim();
    const senha = document.getElementById('gm-usf-senha').value;
    if(!nome || !usuario) return;

    const email = usuario + '@jmacedo.sistema';

    if(!id){
      // Criando um usuário novo: precisa de senha, e o login nasce na Edge Function.
      if(!senha){ alert('Defina uma senha para o novo usuário.'); return; }
      const respEdge = await chamarEdgeFunction_('criar', {email, senha});
      if(!respEdge.ok){ alert(respEdge.error || 'Não foi possível criar o login desse usuário.'); return; }
      const { error } = await SupabaseShared.client.from('usuarios').insert({
        auth_id: respEdge.authId, nome, usuario, email, nivel, unidade_id: unidadeId, id_consultor: idConsultor
      });
      if(error){ alert('O login foi criado, mas não consegui salvar o cadastro: ' + error.message); return; }
    } else {
      // Editando: dados do perfil vão direto pro Supabase; senha/e-mail (se mudarem) passam pela Edge Function.
      if(senha || usuario !== usuarioOriginal){
        const respEdge = await chamarEdgeFunction_('atualizarSenha', {
          authId, senha: senha || undefined, email: usuario !== usuarioOriginal ? email : undefined
        });
        if(!respEdge.ok){ alert(respEdge.error || 'Não foi possível atualizar o login desse usuário.'); return; }
      }
      const { error } = await SupabaseShared.client.from('usuarios').update({
        nome, usuario, email, nivel, unidade_id: unidadeId, id_consultor: idConsultor
      }).eq('id', id);
      if(error){ alert('Não foi possível salvar esse usuário: ' + error.message); return; }
    }

    await carregarUsuariosAdmin();
    limparFormUsuario();
  }

  window.GestaoShared = {
    abrirUnidades: async function(){
      await garantirMontado();
      limparFormUnidade();
      document.getElementById('gm-modal-unidades').style.display = 'flex';
      carregarUnidadesAdmin();
    },
    abrirUsuarios: async function(){
      await garantirMontado();
      limparFormUsuario();
      popularSelectUnidades();
      document.getElementById('gm-modal-usuarios').style.display = 'flex';
      carregarUsuariosAdmin();
    }
  };
})();
