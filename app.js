/* =====================================================================
   app.js — interface do RUJUMENTO
   ---------------------------------------------------------------------
   Liga a tela ao motor de áudio, ao Jumestre, à avaliação e às
   recompensas. Nenhuma chamada de rede: o app é inteiramente local.
   ===================================================================== */

(function () {
  const est = Motor.estado;
  const P = Progresso.carregar();

  /* ---------- atalhos ---------- */
  function $(id) { return document.getElementById(id); }
  function cada(role, fn) { document.querySelectorAll('[data-role="' + role + '"]').forEach(fn); }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* ---------- monta os dois painéis de controle ---------- */
  const tpl = $('tpl-controles');
  ['controles-metronomo', 'controles-rudimento', 'controles-ritmo'].forEach(function (id) {
    $(id).appendChild(tpl.content.cloneNode(true));
  });

  /* =====================================================================
     MESTRE ATIVO, PALETA E TIMBRE
     ===================================================================== */
  function mestreAtivo() {
    const m = Mestres.porId(P.mestre);
    return Progresso.mestreDesbloqueado(m.id) ? m : Mestres.jumestre;
  }

  function paletaEfetiva() {
    if (P.paleta && Progresso.desbloqueado('paleta-' + P.paleta)) return P.paleta;
    const m = mestreAtivo();
    return m.id === 'jumestre' ? null : m.paleta;
  }

  function timbreEfetivo() {
    if (P.timbre && P.timbre !== 'auto' && Progresso.desbloqueado('timbre-' + P.timbre)) return P.timbre;
    const m = mestreAtivo();
    return m.timbre || 'padrao';
  }

  function zurroEfetivo() {
    if (P.zurro && P.zurro !== 'padrao' && Progresso.desbloqueado('zurro-' + P.zurro)) return P.zurro;
    return 'padrao';
  }

  function aplicarVisual() {
    const pal = paletaEfetiva();
    if (pal) document.documentElement.dataset.paleta = pal;
    else document.documentElement.removeAttribute('data-paleta');
    est.timbre = timbreEfetivo();
  }

  function falarMestre(grupo, sub, extras) {
    const m = mestreAtivo();
    const dados = Object.assign({ nome: P.nome || 'jumento' }, extras || {});
    return Mestres.preencher(Mestres.fala(m, grupo, sub), dados);
  }

  /* =====================================================================
     EASTER EGG 1 — a cabecinha do jumento zurra
     ===================================================================== */
  $('cabecinha').addEventListener('click', function () {
    P.zurrosDados = (P.zurrosDados || 0) + 1;
    Progresso.salvar();
    // em média 1 a cada 15: zurro raro, longo e dramático
    const raro = Math.random() < 1 / 15;
    Motor.zurro(raro ? 'raro' : zurroEfetivo());
    if (raro) avisar('🫏 Zurro raro! Isso acontece 1 vez em 15. Não melhora seu paradiddle, mas alegra o dia.');
  });

  /* =====================================================================
     EASTER EGG 2 — 7 toques no nome ligam o Modo Jumento Supremo
     ===================================================================== */
  let toquesLogo = 0, ultimoToqueLogo = 0, timerSupremo = null;
  $('logo').addEventListener('click', function () {
    const agora = Date.now();
    if (agora - ultimoToqueLogo > 2500) toquesLogo = 0;
    ultimoToqueLogo = agora;
    toquesLogo++;
    if (toquesLogo >= 7) {
      toquesLogo = 0;
      ligarSupremo();
    }
  });

  function ligarSupremo() {
    document.documentElement.dataset.supremo = '1';
    Motor.zurro('operistico');
    mostrarFalaMestre(Mestres.preencher(
      Mestres.fala(Mestres.jumestre, 'supremo'), { nome: P.nome || 'jumento' }));
    clearTimeout(timerSupremo);
    timerSupremo = setTimeout(function () {
      document.documentElement.removeAttribute('data-supremo');
      mostrarFalaMestre(falarMestre('saudacao'));
    }, 30000);
  }

  /* =====================================================================
     RODAPÉ — frase sorteada, coração e frase secreta
     ===================================================================== */
  let fraseAtual = Frases.sortear();
  let mostrandoSecreta = false;
  let timerSecreta = null;

  function desenharFrase() {
    const el = $('frase-texto');
    const cor = $('frase-coracao');
    if (mostrandoSecreta) {
      el.classList.add('secreta');
      cor.classList.add('oculto');
      return;
    }
    el.classList.remove('secreta');
    cor.classList.remove('oculto');
    el.innerHTML = esc(fraseAtual.texto) +
      (fraseAtual.ref ? ' <span class="ref">(' + esc(fraseAtual.ref) + ')</span>' : '');
    const curtida = Progresso.curtiu(fraseAtual.n);
    cor.textContent = curtida ? '♥' : '♡';
    cor.classList.toggle('curtida', curtida);
  }

  $('frase-coracao').addEventListener('click', function (ev) {
    ev.stopPropagation();
    if (mostrandoSecreta) return;
    const antes = Progresso.totalCurtidas();
    Progresso.alternarCurtida(fraseAtual.n);
    desenharFrase();
    const depois = Progresso.totalCurtidas();
    if (depois > antes) conferirDesbloqueios(antes, depois);
    atualizarJumestre();
    desenharPremios();
  });

  $('frase-texto').addEventListener('click', function () {
    if (mostrandoSecreta) return;
    if (Math.random() < 1 / 10) {
      const s = Frases.sortearSecreta();
      mostrandoSecreta = true;
      $('frase-texto').textContent = s.texto;
      desenharFrase();
      clearTimeout(timerSecreta);
      timerSecreta = setTimeout(function () {
        mostrandoSecreta = false;
        desenharFrase();
      }, 9000);
    }
  });

  function conferirDesbloqueios(antes, depois) {
    const novos = Recompensas.lista.filter(function (r) {
      return r.curtidas > antes && r.curtidas <= depois;
    });
    if (!novos.length) return;
    const nomes = novos.map(function (r) { return r.nome; }).join(', ');
    avisar('🏅 Desbloqueado: ' + nomes + '\n\n' + falarMestre('desbloqueio'));
    aplicarVisual();
    montarSeletorMestre();
  }

  /* =====================================================================
     JANELAS (avisos e formulários) — sem alert(), tudo em HTML
     ===================================================================== */
  function abrirJanela(html) {
    $('janela').innerHTML = html;
    $('tapa').classList.remove('oculto');
  }
  function fecharJanela() { $('tapa').classList.add('oculto'); $('janela').innerHTML = ''; }

  function avisar(texto) {
    abrirJanela(
      '<p class="destaque" style="white-space:pre-line">' + esc(texto) + '</p>' +
      '<div class="janela-botoes"><button class="btn-play" data-acao="fechar-janela">Entendi</button></div>'
    );
  }

  /* =====================================================================
     PERFIL — pergunta o apelido na primeira abertura
     ===================================================================== */
  function pedirNome() {
    abrirJanela(
      '<h3>🫏 Antes de começar</h3>' +
      '<p>Como devo chamar este jumento?</p>' +
      '<input class="campo-nome" id="campo-nome" maxlength="24" placeholder="Seu nome ou apelido" autocomplete="off">' +
      '<p class="dica" style="margin-top:10px">Fica gravado só neste aparelho. Sem cadastro, sem login, ' +
      'sem enviar nada para lugar nenhum.</p>' +
      '<div class="janela-botoes"><button class="btn-play" data-acao="salvar-nome">Pode chamar assim</button></div>'
    );
    setTimeout(function () { const c = $('campo-nome'); if (c) c.focus(); }, 80);
  }

  /* =====================================================================
     ABA JUMESTRE
     ===================================================================== */
  function mostrarFalaMestre(txt) { $('mestre-fala').textContent = txt; }

  /* Cada professor é o mesmo jumento com um acessório próprio.
     Desenhado em SVG (sem arquivo de imagem). */
  const CORES_JUMENTO = {
    jumestre: '#6b7488', zurrildo: '#666c7c', jegue: '#7d7a63',
    burrico: '#6d6b86', mula: '#8a8496'
  };

  function jumentoSVG(id, tam) {
    const t = tam || 40;
    const cor = CORES_JUMENTO[id] || '#6b7488';
    let extra = '';
    if (id === 'zurrildo') {
      // moicano e sobrancelhas bravas (metal)
      extra =
        '<path d="M26 18 L28 6 L30 18 Z M31 18 L33 4 L35 18 Z M36 18 L38 7 L40 18 Z" fill="#e5484d"/>' +
        '<line x1="21" y1="29" x2="30" y2="32" stroke="#2a2e38" stroke-width="2.4" stroke-linecap="round"/>' +
        '<line x1="43" y1="29" x2="34" y2="32" stroke="#2a2e38" stroke-width="2.4" stroke-linecap="round"/>';
    } else if (id === 'jegue') {
      // chapéu de palha (samba)
      extra =
        '<ellipse cx="32" cy="19" rx="25" ry="5.5" fill="#d9b25e"/>' +
        '<path d="M20 19 Q22 7 32 7 Q42 7 44 19 Z" fill="#c99a3f"/>' +
        '<rect x="20" y="16" width="24" height="3.4" rx="1.7" fill="#8a6b2c"/>';
    } else if (id === 'burrico') {
      // óculos escuros (funk)
      extra =
        '<rect x="20" y="28" width="12" height="9" rx="2.4" fill="#15171d"/>' +
        '<rect x="33" y="28" width="12" height="9" rx="2.4" fill="#15171d"/>' +
        '<line x1="32" y1="31" x2="33" y2="31" stroke="#15171d" stroke-width="2.6"/>' +
        '<rect x="21.5" y="29.5" width="4" height="2" rx="1" fill="#3a3f4c"/>';
    } else if (id === 'mula') {
      // cílios e florzinha (jazz refinado)
      extra =
        '<g stroke="#2a2e38" stroke-width="1.5" stroke-linecap="round">' +
        '<line x1="23" y1="30" x2="21" y2="28"/><line x1="26" y1="29.5" x2="25" y2="27"/>' +
        '<line x1="41" y1="30" x2="43" y2="28"/><line x1="38" y1="29.5" x2="39" y2="27"/></g>' +
        '<g fill="#ff6bc4"><circle cx="45" cy="13" r="2.4"/><circle cx="48" cy="15" r="2.4"/>' +
        '<circle cx="45" cy="17" r="2.4"/><circle cx="42" cy="15" r="2.4"/></g>' +
        '<circle cx="45" cy="15" r="1.6" fill="#ffe08a"/>';
    }
    const olhos = (id === 'burrico') ? '' :
      '<circle cx="26" cy="33" r="2.6" fill="#12141a"/><circle cx="38" cy="33" r="2.6" fill="#12141a"/>';
    return '<svg viewBox="0 0 64 64" width="' + t + '" height="' + t + '" aria-hidden="true">' +
      '<g fill="' + cor + '">' +
      '<ellipse cx="19" cy="15" rx="6" ry="14" transform="rotate(-20 19 15)"/>' +
      '<ellipse cx="45" cy="15" rx="6" ry="14" transform="rotate(20 45 15)"/>' +
      '<path d="M20 25 C19 17 45 17 44 25 L46 36 C48 47 41 54 32 54 C23 54 16 47 18 36 Z"/></g>' +
      '<ellipse cx="32" cy="45" rx="11" ry="8" fill="#575e70"/>' +
      '<ellipse cx="28" cy="45" rx="1.6" ry="2.4" fill="#12141a"/>' +
      '<ellipse cx="36" cy="45" rx="1.6" ry="2.4" fill="#12141a"/>' +
      olhos + extra + '</svg>';
  }

  function montarSeletorMestre() {
    const sel = $('escolher-mestre');
    const c = Progresso.totalCurtidas();
    sel.innerHTML = Mestres.todos.map(function (m) {
      if (Progresso.mestreDesbloqueado(m.id)) {
        return '<option value="' + m.id + '">' + esc(m.nome) + ' — ' + esc(m.estilo) + '</option>';
      }
      const r = Recompensas.porId('mestre-' + m.id);
      const faltam = r ? Math.max(0, r.curtidas - c) : 0;
      return '<option value="' + m.id + '" disabled>🔒 ' + esc(m.nome) +
             ' — a desbloquear (faltam ' + faltam + ' curtidas)</option>';
    }).join('');
    sel.value = mestreAtivo().id;
  }

  function atualizarJumestre() {
    const m = mestreAtivo();
    $('mestre-avatar').innerHTML = jumentoSVG(m.id, 40);
    $('mestre-nome').textContent = m.nome;
    $('mestre-titulo').textContent = m.titulo;

    const aprovados = Trilha.totalAprovados(P.registros);
    $('num-sequencia').textContent = Progresso.sequenciaAtual();
    $('num-aprovados').textContent = aprovados;
    $('num-curtidas').textContent = Progresso.totalCurtidas();

    const grad = Trilha.graduacaoPor(aprovados);
    const prox = Trilha.proximaGraduacao(aprovados);
    $('grad-nome').textContent = grad.nome;
    $('grad-desc').textContent = grad.descricao;
    if (prox) {
      $('grad-prox').textContent = 'faltam ' + (prox.min - aprovados) + ' para ' + prox.nome;
      const base = grad.min, alvo = prox.min;
      const pct = Math.max(0, Math.min(100, ((aprovados - base) / (alvo - base)) * 100));
      $('grad-barra').style.width = pct + '%';
    } else {
      $('grad-prox').textContent = 'graduação máxima';
      $('grad-barra').style.width = '100%';
    }

    // lição do dia
    const licao = Trilha.proximaLicao(P.registros);
    if (licao && licao.rudimentoId) {
      $('licao-nome').textContent = Trilha.nome(licao.rudimentoId);
      $('licao-meta').textContent = 'Módulo ' + licao.moduloN + ' — ' + licao.meta.nome +
        ' · meta: nota ' + licao.meta.metaNota + ' a ' + licao.meta.metaBpm + ' BPM';
      $('btn-licao').textContent = 'Ir para a lição';
      $('btn-licao').dataset.rud = licao.rudimentoId;
      $('btn-licao').disabled = false;
    } else if (licao) {
      $('licao-nome').textContent = 'Módulo ' + licao.moduloN + ' aguardando conteúdo';
      $('licao-meta').textContent = 'Os rudimentos deste módulo chegam na Fase 2.';
      $('btn-licao').textContent = 'Revisar o que já sei';
      $('btn-licao').dataset.rud = '';
      $('btn-licao').disabled = false;
    } else {
      $('licao-nome').textContent = 'Trilha completa!';
      $('licao-meta').textContent = 'Agora é repertório e manutenção.';
      $('btn-licao').dataset.rud = '';
    }

    desenharTrilha();
  }

  function desenharTrilha() {
    const lista = Trilha.estado(P.registros);
    $('lista-trilha').innerHTML = lista.map(function (info) {
      const mod = info.modulo;
      const classes = ['modulo'];
      if (!info.liberado) classes.push('bloqueado');
      if (info.concluido) classes.push('concluido');
      const selo = info.concluido ? '✅' : (info.liberado ? '' : '🔒');

      const itens = mod.rudimentos.map(function (id) {
        const nome = Trilha.nome(id);
        if (!Trilha.implementado(id)) {
          return '<button class="item-trilha futuro" disabled>· ' + esc(nome) +
                 '<span class="nota-mini">Fase 2</span></button>';
        }
        const reg = P.registros[id];
        const ok = reg && reg.melhorNota >= mod.metaNota && reg.bpmDaMelhor >= mod.metaBpm;
        const marca = ok ? '<span class="marca-ok">✓</span>' : '<span>·</span>';
        const nota = reg ? ('nota ' + reg.melhorNota + ' @ ' + reg.bpmDaMelhor) : 'sem nota';
        return '<button class="item-trilha" data-acao="abrir-rud" data-rud="' + id + '"' +
               (info.liberado ? '' : ' disabled') + '>' + marca + esc(nome) +
               '<span class="nota-mini">' + esc(nota) + '</span></button>';
      }).join('');

      return '<div class="' + classes.join(' ') + '">' +
        '<div class="modulo-topo"><span class="modulo-n">' + mod.n + '</span>' +
        '<span class="modulo-nome">' + esc(mod.nome) + '</span>' +
        '<span class="modulo-selo">' + selo + '</span></div>' +
        '<p class="modulo-resumo">' + esc(mod.resumo) + ' <em>Meta: nota ' + mod.metaNota +
        ' a ' + mod.metaBpm + ' BPM.</em></p>' +
        '<div class="modulo-itens">' + itens + '</div></div>';
    }).join('');
  }

  /* =====================================================================
     ABA PRÊMIOS
     ===================================================================== */
  const ICONES = { mestre: '🎓', paleta: '🎨', timbre: '🥁', zurro: '📢' };

  function desenharPremios() {
    const c = Progresso.totalCurtidas();
    $('premios-curtidas').textContent = c;
    const prox = Recompensas.proxima(c);
    if (prox) {
      $('premios-proxima').textContent = 'Faltam ' + (prox.curtidas - c) +
        ' curtidas para o próximo prêmio.';
      $('premios-barra').style.width = Math.min(100, (c / prox.curtidas) * 100) + '%';
    } else {
      $('premios-proxima').textContent = 'Você desbloqueou tudo. Sério.';
      $('premios-barra').style.width = '100%';
    }

    $('lista-premios').innerHTML = Recompensas.lista.map(function (r) {
      const liberado = c >= r.curtidas;
      let botao = '';
      if (liberado && r.tipo === 'paleta') {
        const ativo = P.paleta === r.id.replace('paleta-', '');
        botao = '<button class="premio-usar' + (ativo ? ' ativo' : '') +
          '" data-acao="usar-paleta" data-v="' + r.id.replace('paleta-', '') + '">' +
          (ativo ? 'Em uso' : 'Usar tema') + '</button>';
      } else if (liberado && r.tipo === 'timbre') {
        const v = r.id.replace('timbre-', '');
        const ativo = P.timbre === v;
        botao = '<button class="premio-usar' + (ativo ? ' ativo' : '') +
          '" data-acao="usar-timbre" data-v="' + v + '">' +
          (ativo ? 'Em uso' : 'Usar timbre') + '</button>';
      } else if (liberado && r.tipo === 'zurro') {
        const v = r.id.replace('zurro-', '');
        const ativo = P.zurro === v;
        botao = '<button class="premio-usar' + (ativo ? ' ativo' : '') +
          '" data-acao="usar-zurro" data-v="' + v + '">' +
          (ativo ? 'Em uso' : 'Usar zurro') + '</button>';
      } else if (liberado && r.tipo === 'mestre') {
        const v = r.id.replace('mestre-', '');
        const ativo = mestreAtivo().id === v;
        botao = '<button class="premio-usar' + (ativo ? ' ativo' : '') +
          '" data-acao="usar-mestre" data-v="' + v + '">' +
          (ativo ? 'Ensinando' : 'Escolher mestre') + '</button>';
      }

      let icone;
      if (!liberado) icone = '❔';
      else if (r.tipo === 'mestre') icone = jumentoSVG(r.id.replace('mestre-', ''), 30);
      else icone = ICONES[r.tipo] || '🎁';

      return '<div class="premio' + (liberado ? '' : ' bloqueado') + '">' +
        '<span class="premio-icone">' + icone + '</span>' +
        '<div><div class="premio-nome">' + (liberado ? esc(r.nome) : '???') + '</div>' +
        '<div class="premio-desc">' + esc(liberado ? r.descricao : r.silhueta) + '</div>' +
        (liberado ? '' : '<div class="premio-falta">faltam ' + (r.curtidas - c) + ' curtidas</div>') +
        botao + '</div></div>';
    }).join('');
  }

  /* =====================================================================
     LISTA DE RUDIMENTOS — filtros + favoritos
     ===================================================================== */
  const filtroEstado = { categoria: 'Todos', nivel: 'Todos' };
  const CATEGORIAS = ['Todos', 'Roll', 'Diddle', 'Flam', 'Drag'];
  const NIVEIS = ['Todos', 'Básico', 'Intermediário', 'Avançado'];

  function montarFiltros() {
    $('filtro-categoria').innerHTML = CATEGORIAS.map(function (c) {
      return '<button class="chip" data-filtro="categoria" data-v="' + esc(c) + '">' + esc(c) + '</button>';
    }).join('');
    $('filtro-nivel').innerHTML = NIVEIS.map(function (n) {
      return '<button class="chip" data-filtro="nivel" data-v="' + esc(n) + '">' + esc(n) + '</button>';
    }).join('');
    atualizarChips();
  }
  function atualizarChips() {
    document.querySelectorAll('.chip').forEach(function (ch) {
      ch.classList.toggle('ativo', filtroEstado[ch.dataset.filtro] === ch.dataset.v);
    });
  }

  function itemHTML(r, favorito) {
    return '<button class="item" data-acao="abrir-rud" data-rud="' + r.id + '">' +
      '<span class="item-num">' + r.numeroPas + '</span>' +
      '<span class="item-txt">' +
        '<span class="item-nome">' + esc(r.nome) +
          (favorito ? ' <span class="item-estrela">★</span>' : '') + '</span>' +
        '<span class="item-sub">' + esc(r.categoria + ' · ' + r.nivel + ' · ' + r.compasso) + '</span>' +
      '</span><span class="item-seta">›</span></button>';
  }

  function desenharListaRudimentos() {
    const favs = Progresso.listaFavoritos()
      .map(function (id) { return Dados.porId(id); }).filter(Boolean);
    const secFav = $('secao-favoritos');
    secFav.innerHTML = favs.length
      ? '<div class="rotulo-secao">★ Favoritos</div><div class="grade-lista">' +
        favs.map(function (r) { return itemHTML(r, true); }).join('') + '</div>'
      : '';

    const lista = Dados.lista.filter(function (r) {
      return (filtroEstado.categoria === 'Todos' || r.categoria === filtroEstado.categoria) &&
             (filtroEstado.nivel === 'Todos' || r.nivel === filtroEstado.nivel);
    });
    $('grade-rudimentos').innerHTML = lista.map(function (r) {
      return itemHTML(r, Progresso.ehFavorito(r.id));
    }).join('');
    $('lista-vazia').classList.toggle('oculto', lista.length > 0);
  }

  // cliques nos chips de filtro (não usam data-acao)
  document.addEventListener('click', function (ev) {
    const chip = ev.target.closest('.chip');
    if (!chip) return;
    filtroEstado[chip.dataset.filtro] = chip.dataset.v;
    atualizarChips();
    desenharListaRudimentos();
  });

  /* =====================================================================
     TELA DO RUDIMENTO
     ===================================================================== */
  let editandoAcentos = false;
  let variacaoAtiva = false;

  /* Reconstrói as notas do rudimento aberto a partir de uma fonte
     (padrão ou variação), reaplicando os acentos personalizados por índice. */
  function aplicarNotas(fonte) {
    est.rudimento.notas = fonte.map(function (n) {
      return { mao: n.mao, acento: n.acento, buzz: n.buzz, graces: (n.graces || []).slice() };
    });
    const salvos = Progresso.acentosDe(est.rudimento.id);
    if (salvos) est.rudimento.notas.forEach(function (n, i) {
      if (n.mao) n.acento = salvos.indexOf(i) >= 0;
    });
    Partitura.renderizar(est.rudimento, $('partitura'));
  }

  function configurarVariacao() {
    const base = est.rudimento ? Dados.porId(est.rudimento.id) : null;
    const btn = $('btn-variacao');
    if (base && base.variacao) {
      variacaoAtiva = false;
      btn.classList.remove('oculto', 'ativo');
      btn.textContent = '↔ ' + base.variacao.nome;
    } else {
      btn.classList.add('oculto');
    }
  }

  function alternarVariacao() {
    if (!est.rudimento) return;
    const base = Dados.porId(est.rudimento.id);
    if (!base || !base.variacao) return;
    variacaoAtiva = !variacaoAtiva;
    aplicarNotas(variacaoAtiva ? base.variacao.notas : base.notas);
    const btn = $('btn-variacao');
    btn.classList.toggle('ativo', variacaoAtiva);
    btn.textContent = variacaoAtiva ? '↔ Voltar ao padrão (lead fixo)' : '↔ ' + base.variacao.nome;
  }

  function atualizarFavoritoBtn() {
    const fav = est.rudimento && Progresso.ehFavorito(est.rudimento.id);
    const b = $('btn-favorito');
    b.setAttribute('aria-pressed', String(!!fav));
    b.textContent = fav ? '★' : '☆';
  }
  function atualizarRestaurarBtn() {
    const tem = est.rudimento && Progresso.acentosDe(est.rudimento.id);
    $('btn-restaurar-acentos').classList.toggle('oculto', !tem);
  }

  function entrarEdicaoAcentos() {
    editandoAcentos = true;
    $('btn-editar-acentos').classList.add('ativo');
    $('btn-editar-acentos').textContent = '✓ Concluir';
    $('partitura').classList.add('editando');
    $('dica-acentos').classList.remove('oculto');
  }
  function sairEdicaoAcentos() {
    editandoAcentos = false;
    const b = $('btn-editar-acentos');
    if (b) { b.classList.remove('ativo'); b.textContent = '✎ Editar acentos'; }
    const p = $('partitura'); if (p) p.classList.remove('editando');
    const d = $('dica-acentos'); if (d) d.classList.add('oculto');
  }

  function restaurarAcentos() {
    if (!est.rudimento) return;
    const base = Dados.porId(est.rudimento.id);
    est.rudimento.notas.forEach(function (n, i) { n.acento = base.notas[i].acento; });
    Progresso.limparAcentos(est.rudimento.id);
    Partitura.renderizar(est.rudimento, $('partitura'));
    atualizarRestaurarBtn();
  }

  // tocar numa nota (em modo edição) põe/tira o acento dela
  $('partitura').addEventListener('click', function (ev) {
    if (!editandoAcentos || !est.rudimento) return;
    const g = ev.target.closest('[id^="nota-"]');
    if (!g) return;
    const i = parseInt(g.id.replace('nota-', ''), 10);
    const nota = est.rudimento.notas[i];
    if (!nota || !nota.mao) return;               // pausa não recebe acento
    nota.acento = !nota.acento;
    const indices = [];
    est.rudimento.notas.forEach(function (n, k) { if (n.acento) indices.push(k); });
    Progresso.salvarAcentos(est.rudimento.id, indices);
    Partitura.renderizar(est.rudimento, $('partitura'));
    atualizarRestaurarBtn();
  });

  function irParaAba(id) {
    document.querySelectorAll('.aba').forEach(function (a) {
      a.classList.toggle('ativa', a.dataset.aba === id);
    });
    document.querySelectorAll('.tela').forEach(function (t) {
      t.classList.toggle('ativa', t.id === id);
    });
    window.scrollTo(0, 0);
  }

  document.querySelectorAll('.aba').forEach(function (aba) {
    aba.addEventListener('click', function () { irParaAba(aba.dataset.aba); });
  });

  function abrirRudimento(id) {
    const base = Dados.porId(id);
    if (!base) return;
    if (est.tocando) pararTudo();
    sairEdicaoAcentos();

    // clona para não alterar os dados oficiais; aplica acentos personalizados
    const r = Object.assign({}, base);
    r.notas = base.notas.map(function (n) {
      return { mao: n.mao, acento: n.acento, buzz: n.buzz, graces: (n.graces || []).slice() };
    });
    const salvos = Progresso.acentosDe(id);
    if (salvos) r.notas.forEach(function (n, i) { if (n.mao) n.acento = salvos.indexOf(i) >= 0; });

    est.rudimento = r;
    est.ritmo = null;
    est.compasso = r.compasso;
    est.subdivisao = 1;
    montarSubdivisoes();
    montarPulsos();
    atualizarFavoritoBtn();
    atualizarRestaurarBtn();
    configurarVariacao();

    $('rud-nome').textContent = r.nome;
    $('rud-categoria').textContent = r.categoria;
    $('rud-nivel').textContent = r.nivel;
    $('rud-compasso').textContent = r.compasso;
    $('rud-descricao').textContent = r.descricao;

    $('rud-conferir').classList.toggle('oculto', !base.conferir);

    const reg = Progresso.registroDe(id);
    const et = $('rud-recorde');
    if (reg && reg.melhorNota > 0) {
      et.textContent = '★ recorde: nota ' + reg.melhorNota + ' a ' + reg.bpmDaMelhor + ' BPM';
      et.classList.remove('oculto');
    } else {
      et.classList.add('oculto');
    }

    Partitura.renderizar(r, $('partitura'));
    $('lista-rudimentos').classList.add('oculto');
    $('detalhe-rudimento').classList.remove('oculto');
    irParaAba('tela-rudimentos');
    refletir();
  }

  function voltarParaLista() {
    if (est.tocando) pararTudo();
    sairEdicaoAcentos();
    est.rudimento = null;
    Partitura.limpar();
    $('detalhe-rudimento').classList.add('oculto');
    $('lista-rudimentos').classList.remove('oculto');
    window.scrollTo(0, 0);
  }

  function pararTudo() {
    Motor.parar();
    soltarWakeLock();
    Partitura.limpar();
    PartituraRitmo.limpar();
    document.querySelectorAll('.pulso').forEach(function (p) {
      p.classList.remove('acesa', 'forte');
      p.style.opacity = '1';
    });
    refletir();
  }

  let praticaMarcada = false;
  function marcarPratica() {
    if (praticaMarcada) return;
    praticaMarcada = true;
    Progresso.registrarPratica();
    atualizarJumestre();
  }

  /* =====================================================================
     RITMOS — lista, filtros, favoritos e tela do groove
     ===================================================================== */
  const filtroOrigem = { origem: 'Todos' };
  const ORIGENS = ['Todos', 'Brasileiro', 'Estrangeiro'];
  const NOMES_VOZ = { prato: 'prato/ride', chimbal: 'chimbal', caixa: 'caixa', aro: 'aro (cross-stick)', bumbo: 'bumbo' };

  function montarFiltroOrigem() {
    $('filtro-origem').innerHTML = ORIGENS.map(function (o) {
      return '<button class="chip" data-filtro-rit="origem" data-v="' + esc(o) + '">' +
        esc(o === 'Todos' ? 'Todos' : o + 's') + '</button>';
    }).join('');
    atualizarChipsRit();
  }
  function atualizarChipsRit() {
    document.querySelectorAll('[data-filtro-rit]').forEach(function (ch) {
      ch.classList.toggle('ativo', filtroOrigem.origem === ch.dataset.v);
    });
  }

  function itemRitmoHTML(r, favorito) {
    return '<button class="item" data-acao="abrir-ritmo" data-rit="' + r.id + '">' +
      '<span class="item-num">' + (r.origem === 'Brasileiro' ? '🇧🇷' : '🌎') + '</span>' +
      '<span class="item-txt">' +
        '<span class="item-nome">' + esc(r.nome) + (favorito ? ' <span class="item-estrela">★</span>' : '') + '</span>' +
        '<span class="item-sub">' + esc(r.origem + ' · ' + r.nivel + ' · ' + r.compasso) + '</span>' +
      '</span><span class="item-seta">›</span></button>';
  }

  function desenharListaRitmos() {
    const favs = Progresso.listaFavoritosRitmo()
      .map(function (id) { return Ritmos.porId(id); }).filter(Boolean);
    $('secao-favoritos-rit').innerHTML = favs.length
      ? '<div class="rotulo-secao">★ Favoritos</div><div class="grade-lista">' +
        favs.map(function (r) { return itemRitmoHTML(r, true); }).join('') + '</div>'
      : '';
    const lista = Ritmos.lista.filter(function (r) {
      return filtroOrigem.origem === 'Todos' || r.origem === filtroOrigem.origem;
    });
    $('grade-ritmos').innerHTML = lista.map(function (r) {
      return itemRitmoHTML(r, Progresso.ehFavoritoRitmo(r.id));
    }).join('');
  }

  document.addEventListener('click', function (ev) {
    const chip = ev.target.closest('[data-filtro-rit]');
    if (!chip) return;
    filtroOrigem.origem = chip.dataset.v;
    atualizarChipsRit();
    desenharListaRitmos();
  });

  function atualizarFavoritoRitBtn() {
    const fav = est.ritmo && Progresso.ehFavoritoRitmo(est.ritmo.id);
    const b = $('btn-favorito-rit');
    b.setAttribute('aria-pressed', String(!!fav));
    b.textContent = fav ? '★' : '☆';
  }

  function montarLegenda(r) {
    const vozes = r.vozesLista.map(function (v) {
      let nome = NOMES_VOZ[v.voz] || v.voz;
      if (v.voz === 'chimbal' && r.chimbalDePe) nome = 'chimbal (pé)';
      return '<span><b>' + esc(nome) + '</b></span>';
    });
    if (r.vozesLista.some(function (v) { return v.voz === 'caixa' && v.passos.some(function (p) { return p === 'g'; }); })) {
      vozes.push('<span>(x) = ghost note</span>');
    }
    $('legenda-kit').innerHTML = vozes.join('');
  }

  function abrirRitmo(id) {
    const r = Ritmos.porId(id);
    if (!r) return;
    if (est.tocando) pararTudo();

    est.ritmo = r;
    est.rudimento = null;
    est.compasso = r.compasso;
    est.subdivisao = 1;
    montarSubdivisoes();
    montarPulsos();

    $('rit-nome').textContent = r.nome;
    $('rit-origem').textContent = r.origem;
    $('rit-nivel').textContent = r.nivel;
    $('rit-compasso').textContent = r.compasso;
    $('rit-descricao').textContent = r.descricao;
    $('rit-revisar').classList.toggle('oculto', !r.revisar);

    const reg = Progresso.registroRitmoDe(id);
    const et = $('rit-recorde');
    if (reg && reg.bpmMax) {
      et.textContent = '★ praticado até ' + reg.bpmMax + ' BPM';
      et.classList.remove('oculto');
    } else et.classList.add('oculto');

    atualizarFavoritoRitBtn();
    montarLegenda(r);
    PartituraRitmo.renderizar(r, $('partitura-ritmo'));

    $('lista-ritmos').classList.add('oculto');
    $('detalhe-ritmo').classList.remove('oculto');
    irParaAba('tela-ritmos');
    refletir();
  }

  function voltarParaListaRitmos() {
    if (est.tocando) pararTudo();
    est.ritmo = null;
    PartituraRitmo.limpar();
    $('detalhe-ritmo').classList.add('oculto');
    $('lista-ritmos').classList.remove('oculto');
    window.scrollTo(0, 0);
  }

  function registrarBpmRit() {
    if (!est.ritmo) return;
    Progresso.registrarBpmRitmo(est.ritmo.id, est.bpm);
    const reg = Progresso.registroRitmoDe(est.ritmo.id);
    if (reg && reg.bpmMax) {
      const et = $('rit-recorde');
      et.textContent = '★ praticado até ' + reg.bpmMax + ' BPM';
      et.classList.remove('oculto');
    }
  }

  function alternarPlay() {
    Motor.iniciarAudio();
    if (est.tocando) { registrarBpmRit(); pararTudo(); return; }
    marcarPratica();
    registrarBpmRit();
    Motor.tocar();
    pedirWakeLock();
    refletir();
  }

  /* ---------- Wake Lock: tela não apaga enquanto toca ----------
     Funciona em https (GitHub Pages) ou localhost; onde não houver,
     falha em silêncio. Reobtém o lock ao voltar para o app. */
  let wakeLock = null;
  async function pedirWakeLock() {
    try {
      if ('wakeLock' in navigator && document.visibilityState === 'visible') {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', function () { wakeLock = null; });
      }
    } catch (e) { /* sem suporte ou negado: segue a vida */ }
  }
  function soltarWakeLock() {
    if (wakeLock) { try { wakeLock.release(); } catch (e) {} wakeLock = null; }
  }
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && est.tocando) pedirWakeLock();
  });

  /* =====================================================================
     CONTROLES DO METRÔNOMO
     ===================================================================== */
  function montarSubdivisoes() {
    const opcoes = Motor.SUBDIVISOES[est.compasso];
    if (!opcoes.some(function (o) { return o[0] === est.subdivisao; })) est.subdivisao = opcoes[0][0];
    cada('subdivisao', function (sel) {
      sel.innerHTML = opcoes.map(function (o) {
        return '<option value="' + o[0] + '">' + o[1] + '</option>';
      }).join('');
      sel.value = String(est.subdivisao);
    });
  }

  function montarPulsos() {
    const n = Motor.temposPorCompasso();
    cada('pulsos', function (cx) {
      cx.innerHTML = '';
      for (let i = 0; i < n; i++) {
        const d = document.createElement('div');
        d.className = 'pulso';
        d.dataset.i = i;
        cx.appendChild(d);
      }
    });
  }

  function refletir() {
    cada('bpm', function (e) { e.textContent = est.bpm; });
    cada('slider', function (e) { e.value = est.bpm; });
    cada('compasso', function (e) { e.value = est.compasso; });
    cada('subdivisao', function (e) { e.value = String(est.subdivisao); });
    cada('acento', function (e) { e.checked = est.acentoPrimeiro; });
    cada('vol-metronomo', function (e) { e.value = Math.round(est.volumeMetronomo * 100); });
    cada('vol-caixa', function (e) { e.value = Math.round(est.volumeCaixa * 100); });
    cada('trainer-ativo', function (e) { e.checked = est.trainerAtivo; });
    cada('trainer-inc', function (e) { e.value = est.trainerIncremento; });
    cada('trainer-comp', function (e) { e.value = est.trainerCompassos; });
    cada('trainer-alvo', function (e) { e.value = est.trainerAlvo; });
    cada('gap-ativo', function (e) { e.checked = est.gapAtivo; });
    cada('gap-som', function (e) { e.value = est.gapSom; });
    cada('gap-silencio', function (e) { e.value = est.gapSilencio; });
    cada('pino-trainer', function (e) { e.textContent = est.trainerAtivo ? 'LIGADO' : ''; });
    cada('pino-gap', function (e) { e.textContent = est.gapAtivo ? 'LIGADO' : ''; });
    cada('trainer-status', function (e) {
      e.textContent = est.trainerAtivo
        ? ('Sobe ' + est.trainerIncremento + ' BPM a cada ' + est.trainerCompassos +
           ' compasso(s), até ' + est.trainerAlvo + ' BPM.')
        : 'Desligado.';
    });
    cada('play-label', function (e) { e.textContent = est.tocando ? '■ Parar' : '▶ Tocar'; });
    document.querySelectorAll('.btn-play[data-acao="play"]').forEach(function (b) {
      b.classList.toggle('tocando', est.tocando);
    });

    document.querySelectorAll('[data-acao="som-rudimento"]').forEach(function (bs) {
      bs.setAttribute('aria-pressed', String(est.somRudimento));
      bs.querySelector('[data-role="icone-som"]').textContent = est.somRudimento ? '🔊' : '🔈';
      bs.querySelector('[data-role="texto-som"]').textContent =
        (bs.dataset.label || 'Exemplo sonoro') + ': ' + (est.somRudimento ? 'ligado' : 'desligado');
    });
    document.querySelectorAll('[data-acao="som-metronomo"]').forEach(function (bm) {
      bm.setAttribute('aria-pressed', String(est.somMetronomo));
      bm.querySelector('[data-role="icone-metro"]').textContent = est.somMetronomo ? '🔔' : '🔕';
      bm.querySelector('[data-role="texto-metro"]').textContent =
        (bm.dataset.label || 'Clique') + ': ' + (est.somMetronomo ? 'ligado' : 'desligado');
    });
  }

  function guardar(chave, valor) { try { localStorage.setItem(chave, String(valor)); } catch (e) {} }
  function recuperar(chave) { try { return localStorage.getItem(chave); } catch (e) { return null; } }

  function limite(v, min, max, padrao) {
    const n = Number(v);
    if (!isFinite(n) || n === 0) return padrao;
    return Math.max(min, Math.min(max, Math.round(n)));
  }

  /* =====================================================================
     AVALIAÇÃO
     ===================================================================== */
  let modoAval = null;          // 'pad' quando a avaliação está rodando
  let calibrando = false;
  let estadoSalvo = null;
  let modoEntrada = null; // 'pad-mic' ou 'pad-midi'

  function selecionarModoEntradaPad() {
    // Preferir MIDI quando disponível e o navegador suportar Web MIDI.
    if (Avaliacao && Avaliacao.midi && Avaliacao.midi.suportado() && Avaliacao.midi.origemSegura()) return 'pad-midi';
    return 'pad-mic';
  }

  function avaliacaoDisponivel() {
    return !!est.rudimento;
  }

  /* ---------- contagem regressiva antes do teste ---------- */
  let contagemTimer = null;
  function contagemRegressiva(aoComecar) {
    Motor.iniciarAudio();
    let n = 3;
    abrirJanela(
      '<p class="nota-rotulo">Prepare as baquetas</p>' +
      '<p class="nota-grande" id="cont-numero">3</p>' +
      '<p class="dica" style="text-align:center">O teste começa ao chegar no zero.</p>'
    );
    Motor.caixa(0.5);
    clearInterval(contagemTimer);
    contagemTimer = setInterval(function () {
      n--;
      const el = $('cont-numero');
      if (n > 0) {
        if (el) el.textContent = n;
        Motor.caixa(0.5);
      } else {
        clearInterval(contagemTimer);
        if (el) el.textContent = 'Vai!';
        Motor.caixa(1.0);
        setTimeout(function () { fecharJanela(); aoComecar(); }, 350);
      }
    }, 1000);
  }

  function cancelarAvaliacao() {
    $('tapa-batida').classList.add('oculto');
    Motor.pararAlvos();
    if (est.tocando) pararTudo();
    if (Avaliacao.microfone.ligado()) Avaliacao.microfone.desligar();
    if (Avaliacao.midi && Avaliacao.midi.ligado()) Avaliacao.midi.desligar();
    modoAval = null;
    calibrando = false;
    modoEntrada = null;
    if (estadoSalvo) { restaurarEstado(); }
  }

  /* ---------- modo pad (microfone) ---------- */
  function comecarModoPad() {
    if (!avaliacaoDisponivel()) { avisar('Abra um rudimento antes de pedir nota.'); return; }
    modoEntrada = selecionarModoEntradaPad();

    if (modoEntrada === 'pad-mic') {
      if (!Avaliacao.microfone.suportado()) {
        avisar('Este navegador não oferece acesso ao microfone.');
        return;
      }
      if (!Avaliacao.microfone.origemSegura()) {
        avisar('O navegador só libera o microfone em endereço seguro (https) ou em localhost.\n\n' +
               'No Mac, abra o app por http://localhost:8000 que funciona. ' +
               'No celular isso vai funcionar na Fase 4, quando o app estiver publicado com https.');
        return;
      }
      abrirJanela(
        '<h3>🎧 Fone de ouvido é obrigatório</h3>' +
        '<p class="destaque">Neste modo o microfone escuta o seu pad. Se o clique do metrônomo sair pelo ' +
        'alto-falante, o microfone vai ouvir o clique e contar como se fosse batida sua — e a nota vira ficção.</p>' +
        '<p>Coloque o fone antes de continuar. O áudio não é gravado nem enviado para lugar nenhum: ' +
        'ele só passa pelo detector de batida e é descartado.</p>' +
        '<div class="janela-botoes">' +
        '<button class="btn-sec" data-acao="fechar-janela">Agora não</button>' +
        '<button class="btn-play" data-acao="confirmar-fones">Estou com fone</button>' +
        '</div>'
      );
    } else {
      // MIDI: não depende do microfone e funciona com qualquer trigger MIDI via OTG.
      abrirJanela(
        '<h3>🎛️ Trigger via USB (MIDI)</h3>' +
        '<p class="destaque">Conecte seu controlador MIDI no celular com OTG e habilite o acesso ao MIDI quando o navegador pedir.</p>' +
        '<p>Quando você bater no pad, o app vai registrar as batidas pelo sinal MIDI (sem gravar áudio).</p>' +
        '<div class="janela-botoes">' +
        '<button class="btn-sec" data-acao="fechar-janela">Agora não</button>' +
        '<button class="btn-play" data-acao="confirmar-fones">Estou pronto</button>' +
        '</div>'
      );
    }
  }

  function salvarEstado() {
    estadoSalvo = {
      rudimento: est.rudimento, compasso: est.compasso, subdivisao: est.subdivisao,
      bpm: est.bpm, somRudimento: est.somRudimento, trainerAtivo: est.trainerAtivo,
      gapAtivo: est.gapAtivo
    };
  }
  function restaurarEstado() {
    if (!estadoSalvo) return;
    Object.keys(estadoSalvo).forEach(function (k) { est[k] = estadoSalvo[k]; });
    estadoSalvo = null;
    montarSubdivisoes(); montarPulsos(); refletir();
  }

  async function iniciarCalibracao() {
    try {
      if (modoEntrada === 'pad-midi') {
        await Avaliacao.midi.ligar(aoDetectarBatida);
      } else {
        await Avaliacao.microfone.ligar(aoDetectarBatida);
      }
    } catch (e) {
      const qual = (modoEntrada === 'pad-midi') ? 'MIDI' : 'microfone';
      avisar('Não consegui usar o ' + qual + '.\n\n' + (e && e.message ? e.message : e));
      return;
    }
    P.fonesConfirmados = true;
    Progresso.salvar();

    salvarEstado();
    est.rudimento = null;          // na calibração a régua é o clique puro
    est.compasso = '4/4';
    est.subdivisao = 1;
    est.bpm = 80;
    est.trainerAtivo = false;
    est.gapAtivo = false;
    montarSubdivisoes(); montarPulsos(); refletir();

    calibrando = true;
    if (modoEntrada === 'pad-midi') Avaliacao.midi.zerar();
    else Avaliacao.microfone.zerar();
    Motor.iniciarAlvos();
    Motor.tocar();

    abrirJanela(
      '<h3>🎯 Calibração do aparelho</h3>' +
      '<p class="destaque">Bata <strong>8 vezes</strong> no pad, junto com o clique. ' +
      'O app vai medir quanto tempo o som demora para chegar até ele e descontar isso das suas notas.</p>' +
      '<p class="nota-grande" id="calib-contador">0</p>' +
      '<p class="nota-rotulo">de 8 batidas</p>' +
      '<div class="janela-botoes"><button class="btn-sec" data-acao="aval-cancelar">Cancelar</button></div>'
    );
  }

  function aoDetectarBatida(t, n) {
    if (calibrando) {
      const el = $('calib-contador');
      if (el) el.textContent = Math.min(8, n);
      if (n >= 8) terminarCalibracao();
    }
  }

  function terminarCalibracao() {
    calibrando = false;
    Motor.pararAlvos();
    const onsets = (modoEntrada === 'pad-midi') ? Avaliacao.midi.onsets() : Avaliacao.microfone.onsets();
    const r = Avaliacao.calcularLatencia(onsets, Motor.lerAlvos());
    pararTudo();

    if (!r) {
      abrirJanela(
        '<h3>Não deu para calibrar</h3>' +
        '<p>Não consegui casar suas batidas com o clique. Tente de novo batendo mais firme, ' +
        'e confira se o fone está no ouvido e o microfone não está tapado.</p>' +
        '<div class="janela-botoes">' +
        '<button class="btn-sec" data-acao="aval-cancelar">Desistir</button>' +
        '<button class="btn-play" data-acao="confirmar-fones">Tentar de novo</button></div>'
      );
      return;
    }
    P.latenciaMs = r.latenciaMs;
    Progresso.salvar();
    restaurarEstado();

    abrirJanela(
      '<h3>✅ Calibrado</h3>' +
      '<p class="nota-grande">' + r.latenciaMs + '</p>' +
      '<p class="nota-rotulo">MILISSEGUNDOS DE ATRASO</p>' +
      '<p>Esse valor será descontado de cada batida sua. Ele mistura o atraso do aparelho ' +
      'com a sua própria tendência — por isso vale recalibrar se trocar de fone ou de sala.</p>' +
      '<div class="janela-botoes">' +
      '<button class="btn-sec" data-acao="fechar-janela">Depois</button>' +
      '<button class="btn-play" data-acao="iniciar-sessao-pad">Começar avaliação</button></div>'
    );
  }

  function iniciarSessaoPad() {
    fecharJanela();
    marcarPratica();
    contagemRegressiva(function () {
      modoAval = 'pad';
      if (modoEntrada === 'pad-midi') Avaliacao.midi.zerar();
      else Avaliacao.microfone.zerar();   // ignora as batidas dadas antes do zero
      Motor.iniciarAlvos();
      if (!est.tocando) Motor.tocar();
      refletir();

      $('batida-titulo').textContent = '🎤 ' + est.rudimento.nome + ' · ' + est.bpm + ' BPM';
      $('batida-contador').textContent = '0';
      $('tapa-batida').classList.remove('oculto');
      $('batida-alvo').innerHTML =
        '<span class="batida-contador" id="batida-contador">0</span>' +
        '<span class="batida-dica">toque no pad de verdade — estou ouvindo</span>';
    });
  }

  function terminarModoPad() {
    Motor.pararAlvos();
    const latencia = (P.latenciaMs || 0) / 1000;
    const onsets = (modoEntrada === 'pad-midi') ? Avaliacao.midi.onsets() : Avaliacao.microfone.onsets();
    const toques = onsets.map(function (t) { return t - latencia; });
    const r = Avaliacao.calcular(toques, Motor.lerAlvos(), Motor.intervaloAlvo());
    if (modoEntrada === 'pad-midi') Avaliacao.midi.desligar();
    else Avaliacao.microfone.desligar();
    $('tapa-batida').classList.add('oculto');
    pararTudo();
    modoAval = null;
    modoEntrada = null;
    restaurarEstadoBatida();
    mostrarResultado(r, 'pad');
  }

  function restaurarEstadoBatida() {
    $('batida-alvo').innerHTML =
      '<span class="batida-contador" id="batida-contador">0</span>' +
      '<span class="batida-dica">toque aqui a cada nota</span>';
  }

  /* ---------- resultado ---------- */
  function mostrarResultado(r, modo) {
    if (!r.valida) {
      avisar('Faltou material para dar nota.\n\n' + Avaliacao.diagnostico(r));
      return;
    }
    const rudId = est.rudimento ? est.rudimento.id : null;
    if (rudId) Progresso.registrarNota(rudId, est.bpm, modo, r);

    const faixa = Mestres.faixaDaNota(r.nota);
    const comentario = falarMestre('avaliacao', faixa, { nota: r.nota });

    abrirJanela(
      '<p class="nota-grande">' + r.nota.toFixed(1) + '</p>' +
      '<p class="nota-rotulo">NOTA</p>' +
      '<p class="mestre-fala">' + esc(comentario) + '</p>' +
      '<div class="relatorio">' +
      '<div><span>Batidas certeiras</span><span>' + r.acertos + ' de ' + r.esperadas + '</span></div>' +
      '<div><span>Adiantadas</span><span>' + r.adiantadas + '</span></div>' +
      '<div><span>Atrasadas</span><span>' + r.atrasadas + '</span></div>' +
      '<div><span>Dentro de 8 ms</span><span>' + r.noTempo + '</span></div>' +
      '<div><span>Erro médio</span><span>' + r.desvioMedioMs + ' ms</span></div>' +
      '<div><span>Tendência</span><span>' + (r.mediaMs > 0 ? '+' : '') + r.mediaMs + ' ms</span></div>' +
      (r.extras ? '<div><span>Batidas sobrando</span><span>' + r.extras + '</span></div>' : '') +
      '</div>' +
      '<p class="dica">' + esc(Avaliacao.diagnostico(r)) + '</p>' +
      '<div class="janela-botoes"><button class="btn-play" data-acao="fechar-janela">Fechar</button></div>'
    );
    atualizarJumestre();
    if (rudId) {
      const reg = Progresso.registroDe(rudId);
      const et = $('rud-recorde');
      if (reg && reg.melhorNota > 0) {
        et.textContent = '★ recorde: nota ' + reg.melhorNota + ' a ' + reg.bpmDaMelhor + ' BPM';
        et.classList.remove('oculto');
      }
    }
  }

  /* =====================================================================
     CLIQUES (delegados)
     ===================================================================== */
  document.addEventListener('click', function (ev) {
    const alvo = ev.target.closest('[data-acao]');
    if (!alvo) return;
    const acao = alvo.dataset.acao;

    switch (acao) {
      case 'bpm':
        Motor.definirBpm(est.bpm + Number(alvo.dataset.delta)); refletir(); break;

      case 'play':
        alternarPlay();
        break;

      case 'tap': Motor.iniciarAudio(); Motor.tap(); refletir(); break;
      case 'voltar': voltarParaLista(); break;
      case 'som-rudimento': est.somRudimento = !est.somRudimento; refletir(); break;
      case 'som-metronomo': est.somMetronomo = !est.somMetronomo; refletir(); break;

      case 'tema': {
        const novo = document.documentElement.dataset.tema === 'escuro' ? 'claro' : 'escuro';
        document.documentElement.dataset.tema = novo;
        guardar('pad-tema', novo);
        break;
      }

      case 'abrir-rud':
        if (alvo.dataset.rud) abrirRudimento(alvo.dataset.rud);
        break;

      case 'abrir-ritmo':
        if (alvo.dataset.rit) abrirRitmo(alvo.dataset.rit);
        break;

      case 'voltar-ritmo':
        voltarParaListaRitmos();
        break;

      case 'favoritar-ritmo':
        if (est.ritmo) {
          Progresso.alternarFavoritoRitmo(est.ritmo.id);
          atualizarFavoritoRitBtn();
          desenharListaRitmos();
        }
        break;

      case 'favoritar':
        if (est.rudimento) {
          Progresso.alternarFavorito(est.rudimento.id);
          atualizarFavoritoBtn();
          desenharListaRudimentos();
        }
        break;

      case 'editar-acentos':
        if (editandoAcentos) sairEdicaoAcentos(); else entrarEdicaoAcentos();
        break;

      case 'restaurar-acentos':
        restaurarAcentos();
        break;

      case 'alternar-variacao':
        alternarVariacao();
        break;

      case 'fechar-janela': fecharJanela(); break;

      case 'salvar-nome': {
        const c = $('campo-nome');
        const nome = Progresso.definirNome(c ? c.value : '');
        if (!nome) { if (c) c.focus(); return; }
        fecharJanela();
        mostrarFalaMestre(Mestres.preencher(
          Mestres.fala(Mestres.jumestre, 'boasVindas'), { nome: nome }));
        atualizarJumestre();
        break;
      }

      case 'aval-pad': comecarModoPad(); break;
      case 'confirmar-fones': fecharJanela(); iniciarCalibracao(); break;
      case 'iniciar-sessao-pad': iniciarSessaoPad(); break;

      case 'aval-terminar':
        terminarModoPad();
        break;

      case 'aval-cancelar': fecharJanela(); cancelarAvaliacao(); break;

      case 'usar-paleta':
        P.paleta = (P.paleta === alvo.dataset.v) ? null : alvo.dataset.v;
        Progresso.salvar(); aplicarVisual(); desenharPremios(); break;

      case 'usar-timbre':
        P.timbre = (P.timbre === alvo.dataset.v) ? 'auto' : alvo.dataset.v;
        Progresso.salvar(); aplicarVisual(); desenharPremios();
        Motor.caixa(1.0, est.timbre); break;

      case 'usar-zurro':
        P.zurro = (P.zurro === alvo.dataset.v) ? 'padrao' : alvo.dataset.v;
        Progresso.salvar(); desenharPremios(); Motor.zurro(zurroEfetivo()); break;

      case 'usar-mestre':
        P.mestre = alvo.dataset.v;
        Progresso.salvar(); aplicarVisual(); montarSeletorMestre();
        mostrarFalaMestre(falarMestre('saudacao'));
        atualizarJumestre(); desenharPremios(); irParaAba('tela-jumestre'); break;
    }
  });

  $('btn-licao').addEventListener('click', function () {
    const id = this.dataset.rud;
    if (id) abrirRudimento(id);
    else irParaAba('tela-rudimentos');
  });

  $('escolher-mestre').addEventListener('change', function () {
    P.mestre = this.value;
    Progresso.salvar();
    aplicarVisual();
    mostrarFalaMestre(falarMestre('saudacao'));
    atualizarJumestre();
    desenharPremios();
  });

  /* ---------- campos ---------- */
  document.addEventListener('input', function (ev) {
    const role = ev.target.dataset.role;
    if (!role) return;
    if (role === 'slider') { Motor.definirBpm(ev.target.value); refletir(); }
    else if (role === 'compasso') { est.compasso = ev.target.value; montarSubdivisoes(); montarPulsos(); refletir(); }
    else if (role === 'subdivisao') { est.subdivisao = Number(ev.target.value); refletir(); }
    else if (role === 'acento') { est.acentoPrimeiro = ev.target.checked; refletir(); }
    else if (role === 'vol-metronomo') { Motor.definirVolume('metronomo', ev.target.value / 100); guardar('pad-vol-metronomo', est.volumeMetronomo); refletir(); }
    else if (role === 'vol-caixa') { Motor.definirVolume('caixa', ev.target.value / 100); guardar('pad-vol-caixa', est.volumeCaixa); refletir(); }
    else if (role === 'trainer-ativo') { est.trainerAtivo = ev.target.checked; refletir(); }
    else if (role === 'trainer-inc') { est.trainerIncremento = limite(ev.target.value, 1, 20, 5); refletir(); }
    else if (role === 'trainer-comp') { est.trainerCompassos = limite(ev.target.value, 1, 32, 4); refletir(); }
    else if (role === 'trainer-alvo') { est.trainerAlvo = limite(ev.target.value, 30, 300, 160); refletir(); }
    else if (role === 'gap-ativo') { est.gapAtivo = ev.target.checked; refletir(); }
    else if (role === 'gap-som') { est.gapSom = limite(ev.target.value, 1, 16, 4); refletir(); }
    else if (role === 'gap-silencio') { est.gapSilencio = limite(ev.target.value, 1, 16, 4); refletir(); }
  });

  document.addEventListener('keydown', function (ev) {
    if (ev.code === 'Space' && !/INPUT|SELECT|TEXTAREA/.test(ev.target.tagName)) {
      ev.preventDefault();
      alternarPlay();
    }
  });

  /* =====================================================================
     LAÇO VISUAL — segue o relógio do áudio
     ===================================================================== */
  let bpmMostrado = est.bpm;
  let silencioMostrado = null;

  function quadro() {
    const eventos = Motor.eventosVencidos();
    for (let i = 0; i < eventos.length; i++) {
      const e = eventos[i];
      if (e.tipo === 'pulso') acenderPulso(e.dado, e.audivel);
      else if (e.tipo === 'nota') Partitura.destacar(e.dado);
      else if (e.tipo === 'passo') PartituraRitmo.destacar(e.dado);
    }
    if (est.bpm !== bpmMostrado) {
      bpmMostrado = est.bpm;
      cada('bpm', function (el) { el.textContent = est.bpm; });
      cada('slider', function (el) { el.value = est.bpm; });
    }
    const emSilencio = est.tocando && est.gapAtivo && !est.audivel;
    if (emSilencio !== silencioMostrado) {
      silencioMostrado = emSilencio;
      cada('aviso-silencio', function (el) { el.classList.toggle('oculto', !emSilencio); });
    }
    if (modoAval === 'pad') {
      const n = (modoEntrada === 'pad-midi') ? Avaliacao.midi.onsets().length : Avaliacao.microfone.onsets().length;
      const el = $('batida-contador');
      if (el && el.textContent !== String(n)) el.textContent = n;
    }
    requestAnimationFrame(quadro);
  }

  function acenderPulso(indice, audivel) {
    document.querySelectorAll('.pulso').forEach(function (p) {
      const meu = Number(p.dataset.i) === indice;
      p.classList.toggle('acesa', meu);
      p.classList.toggle('forte', meu && indice === 0 && est.acentoPrimeiro);
      p.style.opacity = audivel ? '1' : '.45';
    });
  }

  /* =====================================================================
     ARRANQUE
     ===================================================================== */
  const t = recuperar('pad-tema');
  if (t) document.documentElement.dataset.tema = t;
  const vm = recuperar('pad-vol-metronomo');
  if (vm !== null && isFinite(Number(vm))) est.volumeMetronomo = Number(vm);
  const vc = recuperar('pad-vol-caixa');
  if (vc !== null && isFinite(Number(vc))) est.volumeCaixa = Number(vc);

  aplicarVisual();
  montarSubdivisoes();
  montarPulsos();
  refletir();
  montarFiltros();
  desenharListaRudimentos();
  montarFiltroOrigem();
  desenharListaRitmos();
  montarSeletorMestre();
  desenharFrase();
  desenharPremios();
  atualizarJumestre();

  // aviso do modo pad conforme o endereço em que o app foi aberto
  if (Avaliacao && Avaliacao.midi && Avaliacao.midi.suportado() && Avaliacao.midi.origemSegura()) {
    $('aval-aviso-mic').textContent =
      'Aceita triggers via USB OTG (MIDI). Se não quiser usar MIDI, use o modo microfone.';
  } else {
    $('aval-aviso-mic').textContent = Avaliacao.microfone.origemSegura()
      ? 'Exige fone de ouvido e uma calibração rápida antes de começar.'
      : 'Indisponível neste endereço — o navegador só libera o microfone em https ou localhost.';
  }

  // check-in do Jumestre
  if (Progresso.primeiraVez()) {
    pedirNome();
  } else {
    const seq = Progresso.sequenciaAtual();
    if (seq >= 2 && Math.random() < 0.5) {
      mostrarFalaMestre(Mestres.preencher(
        Mestres.fala(mestreAtivo(), 'streak') || Mestres.fala(Mestres.jumestre, 'streak'),
        { nome: P.nome, dias: seq }));
    } else {
      mostrarFalaMestre(falarMestre('saudacao'));
    }
  }

  requestAnimationFrame(quadro);
})();
