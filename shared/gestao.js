/* Gestão de unidades/usuários compartilhada entre /dashboard e /express.
   Lê o token e a URL da API direto do localStorage (mesmas chaves da sessão
   unificada), então não depende de nenhuma variável interna de cada app.

   Uso: GestaoShared.abrirUnidades() / GestaoShared.abrirUsuarios()
   (ambos assíncronos — buscam o HTML na primeira vez que são chamados). */
(function(){
  var API_URL_PADRAO = 'https://script.google.com/macros/s/AKfycby9ZBcnSaIIL9FqU0qHLCnBlhvIKVR4yYs3B-3suuSrUCa3s_uzwQRM1r3xzqjoJbjX/exec';
  var TEMPLATE_URL = '../shared/gestao.html';
  var templatePromise = null;
  var montado = false;
  var unidadesCache = [];
  var usuariosCache = [];

  function apiUrl(){
    return (window.localStorage && localStorage.getItem('pedidos_api_url')) || API_URL_PADRAO;
  }
  function token(){
    return (window.localStorage && localStorage.getItem('pedidos_token')) || '';
  }
  async function chamar(action, extra){
    var body = Object.assign({action: action, token: token()}, extra || {});
    var res = await fetch(apiUrl(), {
      method: 'POST',
      headers: {'Content-Type': 'text/plain;charset=utf-8'},
      body: JSON.stringify(body)
    });
    return res.json();
  }
  function fmtBRL(v){
    return 'R$ ' + (Number(v) || 0).toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2});
  }
  function parseCurrencyInput(str){
    var digits = String(str || '').replace(/\D/g, '');
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
      templatePromise = fetch(TEMPLATE_URL).then(function(res){ return res.text(); });
    }
    return templatePromise;
  }

  async function garantirMontado(){
    if(montado) return;
    var tpl = await carregarTemplate();
    var wrap = document.createElement('div');
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
      var digits = this.value.replace(/\D/g, '');
      this.value = digits ? (parseInt(digits, 10) / 100).toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2}) : '';
    });
    document.getElementById('gm-usf-senha-toggle').onclick = function(){
      var input = document.getElementById('gm-usf-senha');
      var showing = this.classList.toggle('showing');
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
    document.getElementById('gm-modal-unidades').addEventListener('click', function(e){ if(e.target === this) fechar('gm-modal-unidades'); });
    document.getElementById('gm-modal-usuarios').addEventListener('click', function(e){ if(e.target === this) fechar('gm-modal-usuarios'); });
  }

  /* ---- Unidades ---- */
  async function carregarUnidadesAdmin(){
    var data = await chamar('listarUnidades');
    unidadesCache = data.ok ? (data.unidades || []) : [];
    var tbody = document.getElementById('gm-unidades-tbody');
    tbody.innerHTML = unidadesCache.length ? unidadesCache.map(function(u){
      return '<tr data-id="' + u.ID + '">'
        + '<td>' + (u.Cor ? '<span class="gm-cor-dot" style="background:' + u.Cor + '"></span>' : '') + u.Nome + '</td>'
        + '<td>' + fmtBRL(u.MetaOrcamento) + '</td><td>' + (u.MetaTas || 0) + '</td><td>' + (u.MetaTasConsultor || 0) + '</td>'
        + '</tr>';
    }).join('') : '<tr><td colspan="4" class="gm-empty">Nenhuma unidade cadastrada.</td></tr>';
    Array.prototype.forEach.call(tbody.querySelectorAll('tr[data-id]'), function(tr){
      tr.onclick = function(){
        var u = unidadesCache.filter(function(x){ return x.ID === tr.dataset.id; })[0];
        if(u) preencherFormUnidade(u);
      };
    });
  }
  function preencherFormUnidade(u){
    document.getElementById('gm-uf-id').value = u.ID;
    document.getElementById('gm-uf-nome').value = u.Nome;
    var cor = u.Cor || '#2E4B95';
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
    var id = document.getElementById('gm-uf-id').value;
    var dados = {
      Nome: document.getElementById('gm-uf-nome').value.trim(),
      Cor: document.getElementById('gm-uf-cor').value,
      MetaOrcamento: parseCurrencyInput(document.getElementById('gm-uf-meta-orc').value),
      MetaTas: parseInt(document.getElementById('gm-uf-meta-tas').value, 10) || 0,
      MetaTasConsultor: parseInt(document.getElementById('gm-uf-meta-consultor').value, 10) || 0
    };
    if(!dados.Nome) return;
    var data = await chamar(id ? 'atualizarUnidade' : 'criarUnidade', {id: id || undefined, dados: dados});
    if(!data.ok){ alert(data.error || 'Não foi possível salvar essa unidade.'); return; }
    await carregarUnidadesAdmin();
    limparFormUnidade();
  }

  /* ---- Usuários ---- */
  async function popularSelectUnidades(){
    var data = await chamar('listarUnidades');
    var lista = data.ok ? (data.unidades || []) : [];
    document.getElementById('gm-usf-unidade').innerHTML = lista.map(function(u){
      return '<option value="' + u.ID + '">' + u.Nome + '</option>';
    }).join('');
  }
  function toggleUnidadeField(){
    var isAdmin = document.getElementById('gm-usf-nivel').value === 'admin';
    document.getElementById('gm-usf-unidade-wrap').style.display = isAdmin ? 'none' : '';
  }
  async function carregarUsuariosAdmin(){
    var data = await chamar('listarUsuarios');
    usuariosCache = data.ok ? (data.usuarios || []) : [];
    var tbody = document.getElementById('gm-usuarios-tbody');
    tbody.innerHTML = usuariosCache.length ? usuariosCache.map(function(u){
      return '<tr data-id="' + u.ID + '">'
        + '<td>' + u.Nome + '</td><td>' + u.Usuario + '</td><td>' + nivelLabel(u.Nivel) + '</td>'
        + '<td>' + (u.Nivel === 'admin' ? '—' : (u.UnidadeNome || '—')) + '</td>'
        + '<td class="gm-mono">' + (u.IdConsultor || '—') + '</td></tr>';
    }).join('') : '<tr><td colspan="5" class="gm-empty">Nenhum usuário cadastrado.</td></tr>';
    Array.prototype.forEach.call(tbody.querySelectorAll('tr[data-id]'), function(tr){
      tr.onclick = function(){
        var u = usuariosCache.filter(function(x){ return x.ID === tr.dataset.id; })[0];
        if(u) preencherFormUsuario(u);
      };
    });
  }
  function preencherFormUsuario(u){
    document.getElementById('gm-usf-id').value = u.ID;
    document.getElementById('gm-usf-nome').value = u.Nome;
    document.getElementById('gm-usf-usuario').value = u.Usuario;
    document.getElementById('gm-usf-senha').value = '';
    document.getElementById('gm-usf-senha').type = 'password';
    document.getElementById('gm-usf-senha-toggle').classList.remove('showing');
    document.getElementById('gm-usf-nivel').value = u.Nivel;
    document.getElementById('gm-usf-id-consultor').value = u.IdConsultor || '';
    toggleUnidadeField();
    popularSelectUnidades().then(function(){
      if(u.UnidadeID) document.getElementById('gm-usf-unidade').value = u.UnidadeID;
    });
    document.getElementById('gm-btn-excluir-usuario').style.display = '';
  }
  function limparFormUsuario(){
    document.getElementById('gm-usf-id').value = '';
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
    var id = document.getElementById('gm-usf-id').value;
    if(!id) return;
    var nome = document.getElementById('gm-usf-nome').value;
    if(!confirm('Excluir o usuário "' + nome + '"? Essa ação não pode ser desfeita.')) return;
    var data = await chamar('excluirUsuario', {id: id});
    if(!data.ok){ alert(data.error || 'Não foi possível excluir esse usuário.'); return; }
    await carregarUsuariosAdmin();
    limparFormUsuario();
  }
  async function salvarUsuario(ev){
    ev.preventDefault();
    var id = document.getElementById('gm-usf-id').value;
    var nivel = document.getElementById('gm-usf-nivel').value;
    var dados = {
      Nome: document.getElementById('gm-usf-nome').value.trim(),
      Usuario: document.getElementById('gm-usf-usuario').value.trim(),
      Nivel: nivel,
      UnidadeID: nivel === 'admin' ? '' : document.getElementById('gm-usf-unidade').value,
      IdConsultor: document.getElementById('gm-usf-id-consultor').value.trim()
    };
    var senha = document.getElementById('gm-usf-senha').value;
    if(senha) dados.Senha = senha;
    if(!dados.Nome || !dados.Usuario) return;
    if(!senha && !id){ alert('Defina uma senha para o novo usuário.'); return; }
    var data = await chamar(id ? 'atualizarUsuario' : 'criarUsuario', {id: id || undefined, dados: dados});
    if(!data.ok){ alert(data.error || 'Não foi possível salvar esse usuário.'); return; }
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
