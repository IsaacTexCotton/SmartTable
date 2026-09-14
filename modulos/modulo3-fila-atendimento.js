/* =========================================================================
 * MÓDULO 3: FILA DE ATENDIMENTO — CRM TexCotton
 * -------------------------------------------------------------------------
 * O que faz: mantém a lista de clientes a atender e sua posição nela. Ao
 * detectar que "Registrar e Enviar" (Módulo 2) teve sucesso (WhatsApp
 * abriu), marca o cliente atual como atendido -- mas NÃO navega sozinho
 * pro próximo. O avanço de fato é sempre uma decisão sua: Alt+P ou o botão
 * "Próximo →" no painel, quando você estiver pronto.
 *
 * Onde colar: anexado ao FINAL do smart-table.js, depois dos módulos
 * "Aviso de Cobrança" (v4) e "Registrar e Enviar". Não substitui nada.
 *
 * Como usar no dia a dia:
 *   1. Abra a página que lista os clientes que você vai atender.
 *   2. Clique no botão flutuante "▶ Iniciar Fila de Atendimento" (canto
 *      inferior esquerdo). Isso te leva direto pro primeiro cliente.
 *   3. Em cada cliente, use o fluxo normal (ver títulos, gerar relatório,
 *      "Registrar e Enviar"). Ao detectar que o WhatsApp abriu, o cliente
 *      fica marcado como atendido -- a página continua a mesma até você
 *      decidir ir pro próximo.
 *   4. Quando quiser seguir, aperte Alt+P (ou clique "Próximo →" no painel).
 *      Se o cliente atual já foi registrado, ele conta como "atendido" no
 *      resumo final; senão conta como "pulado".
 *   5. Quando a fila acabar, aparece um aviso e o painel some sozinho.
 *
 * IMPORTANTE — calibração inicial:
 *   A fila NÃO depende de <a href> (a lista real não usa links — a linha
 *   navega via JavaScript). Em vez disso, ela lê o texto
 *   "Controle: {grupoId}|{cnpj}" de cada linha e remonta a URL de destino
 *   (confirmado com exemplo real: Controle: 0|48176147/0001-63 ->
 *   /crm/clientes/grupo/0?cnpj=48176147%2F0001-63). Se o formato da lista
 *   mudar no futuro, ajuste CONFIG.REGEX_CONTROLE e CONFIG.montarUrlCliente.
 * ========================================================================= */
(function () {
  'use strict';

  // Evita inicializar duas vezes se o arquivo for injetado/recarregado mais de uma vez.
  if (window.__filaAtendimentoCarregado) return;
  window.__filaAtendimentoCarregado = true;

  /* ---------------------------------------------------------------------
   * 1. CONFIGURAÇÃO — únicos pontos que talvez precisem de ajuste.
   * --------------------------------------------------------------------- */
  const CONFIG = {
    // Seletor das linhas candidatas na página de LISTA de clientes.
    SELETOR_LINHA: 'table tbody tr',
    // A lista não usa <a href>: a linha não é um link, o clique nela navega
    // via JavaScript. Em compensação, cada linha traz o texto
    // "Controle: {grupoId}|{cnpj}" — é esse padrão que usamos pra
    // reconstruir a URL de destino sem precisar de link nenhum.
    REGEX_CONTROLE: /Controle:\s*(\d+)\|([\d.\/-]+)/,
    // Monta a URL real do cliente a partir do grupoId + cnpj extraídos.
    // Confirmado com exemplo real: Controle: 0|48176147/0001-63 ->
    // https://texhub.texcotton.com.br/crm/clientes/grupo/0?cnpj=48176147%2F0001-63
    montarUrlCliente(grupoId, cnpj) {
      return `${location.origin}/crm/clientes/grupo/${grupoId}?cnpj=${encodeURIComponent(cnpj)}`;
    },
    // Texto usado para identificar o botão "Registrar e Enviar" (o script
    // procura esse trecho, em minúsculas, dentro do texto de qualquer botão).
    TEXTO_BOTAO_REGISTRAR: 'registrar e enviar',
    // Tempo máximo (ms) esperando o WhatsApp abrir (window.open) depois do
    // clique, antes de desistir de considerar que deu certo.
    TIMEOUT_SUCESSO_MS: 1200,
    // Regex pra extrair "X dias" do texto da linha, usado pra priorizar a
    // fila por urgência (mais dias de atraso primeiro). Ajuste se a lista
    // mostrar esse dado com outro texto (ex.: "15d" em vez de "15 dias").
    REGEX_DIAS_ATRASO: /(\d+)\s*dias?/i,
    // Chave usada no localStorage (não sessionStorage -- ver nota abaixo).
    CHAVE_STORAGE: 'filaAtendimento_v1',
    // Chave separada pra lembrar quem já foi atendido HOJE (evita cobrar o
    // mesmo cliente duas vezes no mesmo dia, mesmo em filas diferentes).
    CHAVE_ATENDIDOS_HOJE: 'filaAtendidosHoje_v1',
    // Versão do formato salvo no localStorage. Se um dia o formato mudar,
    // incremente isso -- qualquer fila salva com versão diferente é
    // descartada automaticamente em vez de causar erro (ver validarFila).
    VERSAO_SCHEMA: 1,
  };

  /* ---------------------------------------------------------------------
   * 2. ESTADO DO MÓDULO
   * --------------------------------------------------------------------- */
  let painelEl = null;      // referência ao painel flutuante "Fila: X/Y"
  let paginaNaFila = false; // true se a página atual corresponde a uma posição conhecida da fila
  let avancando = false;    // trava contra cliques duplicados enquanto aguardamos o WhatsApp abrir

  /* ---------------------------------------------------------------------
   * 3. UTILITÁRIOS
   * --------------------------------------------------------------------- */
  function extrairCnpjDaUrl(url) {
    // O cnpj é o identificador real do cliente na URL (o grupoId pode se
    // repetir entre clientes do mesmo grupo econômico, então não serve
    // sozinho pra saber "em qual cliente da fila eu estou").
    try {
      const u = new URL(url, location.href);
      return u.searchParams.get('cnpj') || '';
    } catch (e) {
      return '';
    }
  }

  function validarFormatoDaFila(fila) {
    // Defesa contra dado corrompido/desatualizado no localStorage (ex.: um
    // formato antigo de uma versão anterior deste script). Sem isso, um
    // único registro mal-formado pode lançar exceção em sincronizarPosicao()
    // -- que roda em TODA página -- e travar a automação inteira da sessão
    // ANTES do listener de clique ser registrado.
    if (!fila || typeof fila !== 'object') return false;
    if (fila.versao !== CONFIG.VERSAO_SCHEMA) return false;
    if (!Array.isArray(fila.clientes)) return false;
    if (typeof fila.indiceAtual !== 'number') return false;
    return fila.clientes.every(
      (c) => c && typeof c.url === 'string' && typeof c.cnpj === 'string'
    );
  }

  function obterFila() {
    try {
      const raw = localStorage.getItem(CONFIG.CHAVE_STORAGE);
      const fila = raw ? JSON.parse(raw) : null;
      if (!fila) return null;

      if (!validarFormatoDaFila(fila)) {
        console.warn('[Fila] Fila salva no localStorage está em formato inválido/desatualizado -- descartando.');
        limparFila();
        return null;
      }

      // Uma fila de um dia anterior é descartada automaticamente -- não faz
      // sentido "continuar" uma fila de ontem sem avisar.
      if (!mesmoDiaDeHoje(fila.iniciadoEm)) {
        limparFila();
        return null;
      }
      return fila;
    } catch (e) {
      console.warn('[Fila] Não consegui ler o localStorage -- tratando como se não houvesse fila.', e);
      return null;
    }
  }

  function salvarFila(fila) {
    try {
      localStorage.setItem(CONFIG.CHAVE_STORAGE, JSON.stringify(fila));
    } catch (e) {
      console.warn('[Fila] Não consegui salvar no localStorage.', e);
    }
  }

  function limparFila() {
    try {
      localStorage.removeItem(CONFIG.CHAVE_STORAGE);
    } catch (e) {
      // silencioso — não é crítico
    }
  }

  function mesmoDiaDeHoje(timestampMs) {
    if (!timestampMs) return false;
    const d1 = new Date(timestampMs);
    const d2 = new Date();
    return (
      d1.getFullYear() === d2.getFullYear() &&
      d1.getMonth() === d2.getMonth() &&
      d1.getDate() === d2.getDate()
    );
  }

  // "Atendidos hoje": persiste separado da fila (localStorage também), pra
  // sobreviver mesmo depois de uma fila terminar ou ser trocada por outra.
  // Reseta sozinho quando o dia vira -- não precisa de faxina manual.
  function obterAtendidosHoje() {
    try {
      const raw = localStorage.getItem(CONFIG.CHAVE_ATENDIDOS_HOJE);
      if (!raw) return new Set();
      const dados = JSON.parse(raw);
      if (!mesmoDiaDeHoje(dados.data)) return new Set();
      return new Set(dados.cnpjs || []);
    } catch (e) {
      return new Set();
    }
  }

  function marcarComoAtendidoHoje(cnpj) {
    if (!cnpj) return;
    try {
      const atuais = obterAtendidosHoje();
      atuais.add(cnpj);
      localStorage.setItem(
        CONFIG.CHAVE_ATENDIDOS_HOJE,
        JSON.stringify({ data: Date.now(), cnpjs: Array.from(atuais) })
      );
    } catch (e) {
      console.warn('[Fila] Não consegui salvar em "atendidos hoje".', e);
    }
  }

  function extrairDiasAtraso(texto) {
    const match = (texto || '').match(CONFIG.REGEX_DIAS_ATRASO);
    return match ? parseInt(match[1], 10) : 0;
  }

  // Toast próprio, não bloqueante, some sozinho (mesma filosofia do Módulo 1/2).
  function toast(mensagem, duracaoMs) {
    duracaoMs = duracaoMs || 3200;
    const el = document.createElement('div');
    el.textContent = mensagem;
    Object.assign(el.style, {
      position: 'fixed',
      bottom: '24px',
      right: '24px',
      background: '#16232F',
      color: '#fff',
      padding: '12px 18px',
      borderRadius: '8px',
      boxShadow: '0 4px 14px rgba(0,0,0,0.25)',
      fontSize: '14px',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      zIndex: 999999,
      maxWidth: '340px',
      opacity: '0',
      transition: 'opacity .25s ease',
      pointerEvents: 'none',
    });
    document.body.appendChild(el);
    requestAnimationFrame(() => { el.style.opacity = '1'; });
    setTimeout(() => {
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 300);
    }, duracaoMs);
  }

  /* ---------------------------------------------------------------------
   * 4. PAINEL FLUTUANTE (mostra "Fila: X/Y" enquanto está ativa)
   * --------------------------------------------------------------------- */
  function removerPainel() {
    if (painelEl) {
      painelEl.remove();
      painelEl = null;
    }
  }

  function atualizarPainel() {
    const fila = obterFila();
    if (!fila || !paginaNaFila) {
      removerPainel();
      return;
    }

    if (!painelEl) {
      painelEl = document.createElement('div');
      Object.assign(painelEl.style, {
        position: 'fixed',
        top: '16px',
        right: '16px',
        background: '#ffffff',
        border: '1px solid #d0d5dd',
        borderRadius: '10px',
        padding: '10px 14px',
        boxShadow: '0 2px 10px rgba(0,0,0,0.12)',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        fontSize: '13px',
        zIndex: 999998,
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
      });
      document.body.appendChild(painelEl);
    }

    const posicao = fila.indiceAtual + 1;
    const total = fila.clientes.length;

    painelEl.innerHTML = '';

    const label = document.createElement('span');
    label.textContent = `Fila: ${posicao}/${total}`;
    label.style.color = '#16232F';
    label.style.fontWeight = '600';
    label.style.whiteSpace = 'nowrap';

    const btnPular = document.createElement('button');
    btnPular.textContent = 'Próximo →';
    Object.assign(btnPular.style, {
      cursor: 'pointer', border: 'none', background: '#eef2f6',
      color: '#16232F', padding: '6px 10px', borderRadius: '6px', fontSize: '12px',
    });
    btnPular.onclick = () => irParaProximo('pulado');

    const btnEncerrar = document.createElement('button');
    btnEncerrar.textContent = 'Encerrar';
    Object.assign(btnEncerrar.style, {
      cursor: 'pointer', border: 'none', background: 'transparent',
      color: '#b42318', padding: '6px 8px', borderRadius: '6px', fontSize: '12px',
    });
    btnEncerrar.onclick = () => {
      limparFila();
      removerPainel();
      toast('Fila encerrada.');
    };

    painelEl.appendChild(label);
    painelEl.appendChild(btnPular);
    painelEl.appendChild(btnEncerrar);
  }

  /* ---------------------------------------------------------------------
   * 5. CONSTRUÇÃO DA FILA (rodado na página de LISTA de clientes)
   * --------------------------------------------------------------------- */
  function construirFilaAPartirDaPagina() {
    const linhas = document.querySelectorAll(CONFIG.SELETOR_LINHA);
    const clientes = [];
    const vistos = new Set();
    const atendidosHoje = obterAtendidosHoje();
    let pulosPorJaAtendido = 0;

    linhas.forEach((linha) => {
      const texto = linha.textContent || '';
      const match = texto.match(CONFIG.REGEX_CONTROLE);
      if (!match) return; // linha sem "Controle: X|Y" reconhecível — ignora

      const grupoId = match[1];
      const cnpj = match[2];

      if (vistos.has(cnpj)) return; // evita duplicar o mesmo cliente
      vistos.add(cnpj);

      if (atendidosHoje.has(cnpj)) {
        pulosPorJaAtendido += 1;
        return; // já foi atendido hoje -- não bota na fila de novo
      }

      const url = CONFIG.montarUrlCliente(grupoId, cnpj);
      const nome = texto.split('Controle:')[0].trim().slice(0, 60) || 'Cliente';
      const diasAtraso = extrairDiasAtraso(texto);

      clientes.push({ url, cnpj, label: nome, diasAtraso });
    });

    // Prioriza por urgência: mais dias de atraso primeiro. Quem não tem
    // "X dias" reconhecível fica com diasAtraso=0, então vai pro final.
    clientes.sort((a, b) => b.diasAtraso - a.diasAtraso);

    if (pulosPorJaAtendido > 0) {
      console.log(`[Fila] ${pulosPorJaAtendido} cliente(s) já atendido(s) hoje foram pulados na montagem da fila.`);
    }

    return clientes;
  }

  function iniciarFila() {
    const clientes = construirFilaAPartirDaPagina();

    if (clientes.length === 0) {
      toast('⚠️ Nenhum cliente encontrado nesta página com os seletores atuais. Rode o diagnóstico e ajuste CONFIG.');
      console.warn('[Fila] construirFilaAPartirDaPagina() não encontrou nada. Verifique se CONFIG.SELETOR_LINHA ainda encontra as linhas e se o texto delas ainda contém "Controle: X|Y" no formato esperado por CONFIG.REGEX_CONTROLE.');
      return;
    }

    const fila = {
      versao: CONFIG.VERSAO_SCHEMA,
      clientes,
      indiceAtual: -1,
      totalAtendidos: 0,
      totalPulados: 0,
      iniciadoEm: Date.now(),
    };

    salvarFila(fila);
    toast(`▶ Fila iniciada com ${clientes.length} cliente(s). Indo para o primeiro...`);

    setTimeout(() => {
      window.location.href = clientes[0].url;
    }, 400);
  }

  function criarBotaoIniciarFila() {
    if (document.getElementById('fila-btn-iniciar')) return;

    const btn = document.createElement('button');
    btn.id = 'fila-btn-iniciar';
    btn.textContent = '▶ Iniciar Fila de Atendimento';
    Object.assign(btn.style, {
      position: 'fixed',
      bottom: '16px',
      left: '16px',
      background: '#16232F',
      color: '#fff',
      border: 'none',
      padding: '10px 16px',
      borderRadius: '8px',
      fontSize: '13px',
      cursor: 'pointer',
      zIndex: 999997,
      boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
      fontFamily: 'system-ui, -apple-system, sans-serif',
    });
    btn.onclick = iniciarFila;
    document.body.appendChild(btn);
  }

  function removerBotaoRetomar() {
    const el = document.getElementById('fila-btn-retomar');
    if (el) el.remove();
  }

  function criarBotaoRetomar(fila) {
    if (document.getElementById('fila-btn-retomar')) return;

    const restantes = fila.clientes.length - fila.indiceAtual - 1;
    if (restantes <= 0) return; // não sobrou nada pra retomar

    const btn = document.createElement('button');
    btn.id = 'fila-btn-retomar';
    btn.textContent = `↻ Continuar fila anterior (${restantes} restante${restantes > 1 ? 's' : ''})`;
    Object.assign(btn.style, {
      position: 'fixed',
      bottom: '60px',
      left: '16px',
      background: '#B45309',
      color: '#fff',
      border: 'none',
      padding: '10px 16px',
      borderRadius: '8px',
      fontSize: '13px',
      cursor: 'pointer',
      zIndex: 999997,
      boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
      fontFamily: 'system-ui, -apple-system, sans-serif',
    });
    btn.onclick = () => {
      const proximo = fila.clientes[fila.indiceAtual + 1];
      if (proximo) window.location.href = proximo.url;
    };
    document.body.appendChild(btn);
  }

  /* ---------------------------------------------------------------------
   * 6. AVANÇO NA FILA (rodado na página de DETALHE do cliente)
   * --------------------------------------------------------------------- */
  function irParaProximo(motivo) {
    const fila = obterFila();
    if (!fila || fila.indiceAtual === -1 || fila.indiceAtual === null) return;

    const clienteAtual = fila.clientes[fila.indiceAtual];
    // Se o cliente atual já foi registrado com sucesso (Alt+S ou clique
    // manual em "Registrar e Enviar"), conta como "atendido" mesmo que
    // você tenha avançado pelo botão "Próximo →" (que também serve pra
    // pular sem registrar) -- ver registrarSucessoSemAvancar().
    const jaRegistrado = fila.indiceRegistrado === fila.indiceAtual;
    const motivoEfetivo = jaRegistrado ? 'atendido' : motivo;

    if (motivoEfetivo === 'atendido') {
      fila.totalAtendidos = (fila.totalAtendidos || 0) + 1;
      if (clienteAtual && !jaRegistrado) marcarComoAtendidoHoje(clienteAtual.cnpj);
    } else {
      fila.totalPulados = (fila.totalPulados || 0) + 1;
    }

    fila.indiceAtual += 1;
    delete fila.indiceRegistrado;

    if (fila.indiceAtual >= fila.clientes.length) {
      const msg = `🎉 Fila concluída! ${fila.totalAtendidos || 0} atendido(s), ${fila.totalPulados || 0} pulado(s).`;
      toast(msg, 4500);
      limparFila();
      paginaNaFila = false;
      removerPainel();
      return;
    }

    salvarFila(fila);
    const proximo = fila.clientes[fila.indiceAtual];
    toast(`→ ${proximo.label}`);

    // Aqui não há nenhum reload de terceiros competindo (diferente do
    // registro bem-sucedido, que é seguido de location.reload() pelo
    // Módulo 2) -- navegar direto é seguro.
    setTimeout(() => {
      window.location.href = proximo.url;
    }, 350);
  }

  // Chamado quando "Registrar e Enviar" tem sucesso (WhatsApp abriu). NÃO
  // navega e NÃO avança fila.indiceAtual -- só marca que este cliente já
  // foi registrado, pra "atendidos hoje" e pro resumo final da fila. Você
  // decide quando seguir pro próximo (Alt+P / botão "Próximo →").
  //
  // Roda de forma síncrona, dentro da interceptação de window.open (ver
  // aguardarEAvancar), porque o Módulo 2 chama location.reload() quase
  // instantaneamente depois do window.open() -- rápido demais pra qualquer
  // setTimeout nosso vencer essa corrida. marcarComoAtendidoHoje() e
  // salvarFila() gravam em localStorage, que sobrevive ao reload sem
  // precisar de nenhuma "ponte".
  function registrarSucessoSemAvancar() {
    if (!paginaNaFila) return;

    const fila = obterFila();
    if (!fila || fila.indiceAtual === -1) return;

    const clienteAtual = fila.clientes[fila.indiceAtual];
    if (clienteAtual) marcarComoAtendidoHoje(clienteAtual.cnpj);

    fila.indiceRegistrado = fila.indiceAtual;
    salvarFila(fila);
    toast('✓ Registrado. Use Alt+P (ou "Próximo →") quando quiser seguir.');
  }

  function aguardarEAvancar() {
    if (avancando) return; // já está processando um clique anterior
    avancando = true;

    let sucesso = false;
    const openOriginal = window.open;

    // Interceptação temporária e não invasiva: não mexe no módulo
    // "Registrar e Enviar" existente, só observa se ele chamou window.open
    // com sucesso (retorno diferente de null = não foi bloqueado por pop-up blocker).
    //
    // Marca o registro AQUI DENTRO, de forma síncrona, no exato instante em
    // que sabemos que deu certo -- não num setTimeout separado. Isso importa
    // porque o Módulo 2 chama location.reload() quase instantaneamente depois
    // do window.open() (confirmado no código real), rápido demais pra um
    // setTimeout nosso ter qualquer chance de rodar antes da página ser
    // destruída. registrarSucessoSemAvancar() só grava em localStorage
    // (marcarComoAtendidoHoje + salvarFila), que sobrevive ao reload sem
    // precisar de navegação nem de nenhuma ponte entre páginas.
    window.open = function (...args) {
      const janela = openOriginal.apply(window, args);
      if (janela && !sucesso) {
        sucesso = true;
        registrarSucessoSemAvancar();
      }
      return janela;
    };

    setTimeout(() => {
      window.open = openOriginal; // sempre restaura, independente do resultado
      avancando = false;

      if (!sucesso) {
        console.warn('[Fila] Não detectei o WhatsApp abrindo dentro do tempo esperado — não avancei a fila. Se o registro falhou (ex.: observações vazias ou cliente não identificado), confira o aviso de erro na tela.');
      }
    }, CONFIG.TIMEOUT_SUCESSO_MS);
  }

  /* ---------------------------------------------------------------------
   * 7. SINCRONIZAÇÃO DE POSIÇÃO (roda em qualquer página ao carregar)
   * --------------------------------------------------------------------- */
  function sincronizarPosicao() {
    const fila = obterFila();
    if (!fila) {
      paginaNaFila = false;
      removerPainel();
      removerBotaoRetomar();
      return;
    }

    const cnpjAtual = extrairCnpjDaUrl(location.href);
    const idx = cnpjAtual ? fila.clientes.findIndex((c) => c.cnpj === cnpjAtual) : -1;

    if (idx !== -1) {
      fila.indiceAtual = idx;
      salvarFila(fila);
      paginaNaFila = true;
      removerBotaoRetomar(); // já estamos na fila -- não faz sentido "retomar"
    } else {
      // Estamos numa página que não bate com nenhum item conhecido da fila
      // (ex.: navegação manual, ou reabriu o navegador na lista). Se ainda
      // sobra fila pra terminar, oferece continuar sem precisar iniciar de novo.
      paginaNaFila = false;
      criarBotaoRetomar(fila);
    }

    atualizarPainel();
  }

  /* ---------------------------------------------------------------------
   * 8. INICIALIZAÇÃO
   * --------------------------------------------------------------------- */
  function iniciar() {
    criarBotaoIniciarFila();

    // sincronizarPosicao() lê e valida dado do localStorage -- protegido
    // por try/catch aqui porque, mesmo com a validação de schema acima,
    // não queremos que NENHUMA falha inesperada impeça o registro do
    // listener de clique logo abaixo. Sem isso, um erro nesta função
    // desligaria a automação inteira da sessão silenciosamente.
    try {
      sincronizarPosicao();
    } catch (e) {
      console.error('[Fila] Erro ao sincronizar posição da fila -- continuando mesmo assim.', e);
    }

    // Listener em fase de captura, no document: não substitui nem interfere
    // no handler original do botão "Registrar e Enviar", só observa o clique.
    // Cobre o caso de CLIQUE REAL DE MOUSE no botão (sem passar pelo Alt+S).
    document.addEventListener('click', function (e) {
      const botao = e.target.closest('button');
      if (!botao) return;

      const texto = (botao.textContent || '').trim().toLowerCase();
      if (!texto.includes(CONFIG.TEXTO_BOTAO_REGISTRAR)) return;

      aguardarEAvancar();
    }, true);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar);
  } else {
    iniciar();
  }

  // Helpers de depuração e ganchos usados pelo Módulo 4 (Atalhos de
  // Teclado). Acessíveis no console (Isaac já usa o DevTools ativamente).
  window.filaDebug = {
    obterFila,
    limparFila,
    construirFilaAPartirDaPagina,
    iniciarFila,
    irParaProximo,
    // Expõe o "armar" da interceptação do window.open pro Módulo 4 chamar
    // explicitamente ANTES do clique simulado do Alt+S -- garante que a
    // detecção de sucesso funciona não importa qual estratégia de clique
    // seja usada (mesmo uma que não borbulhe evento real de DOM até o
    // listener acima). Chamar isto duas vezes seguidas é seguro
    // (aguardarEAvancar já tem proteção contra chamada dupla via a
    // variável "avancando").
    prepararEAguardarEnvio: aguardarEAvancar,
  };
})();
