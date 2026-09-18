/* =========================================================================
 * MÓDULO 4: ATALHOS DE TECLADO — CRM TexCotton
 * -------------------------------------------------------------------------
 * Atalhos (todos com Alt, pra não colidir com atalhos do navegador/CRM):
 *
 *   Alt + I  -> Iniciar Fila de Atendimento   (na página de lista)
 *   Alt + U  -> Iniciar Fila por Prioridade   (na página de lista -- visita
 *               cada cliente em aba de fundo pra classificar por situação
 *               real, pode levar minutos; ver Módulo 7)
 *   Alt + R  -> Gerar Relatório               (na página do cliente)
 *   Alt + C  -> Entrar na tela de contato     (na página do cliente)
 *   Alt + F  -> Selecionar a 1ª frase padrão  (dentro da tela de contato)
 *   Alt + A  -> Atendimento rápido            (gera relatório + abre contato + escreve mensagem personalizada pra situação do cliente)
 *   Alt + S  -> Registrar e Enviar            (dentro da tela de contato)
 *   Alt + P  -> Ir para o próximo da fila     (conta como "atendido" se você já
 *                                              registrou este cliente, senão como "pulado")
 *   Alt + V  -> Voltar um cliente na fila     (desfaz a contagem do passo revertido)
 *   Alt + G  -> Abrir em nova aba as outras razões do grupo com saldo
 *               vencido (uma aba por razão -- gerar o relatório de cada
 *               uma continua sendo Alt+R manual, dentro de cada aba)
 *   Alt + B  -> Busca rápida de cliente       (por nome ou CNPJ, sem sair
 *               da lista -- reescreve o ?search= da URL atual)
 *   Alt + L  -> Ver o que mudou nas últimas versões (log de atualização,
 *               com marcação do que chegou desde a sua última leitura)
 *   Alt + H  -> Abrir/fechar painel de ajuda  (mostra esta lista na tela)
 *
 * Fluxo típico com teclado: Alt+C (abre contato) -> Alt+F (escolhe frase)
 * -> Alt+S (registra e envia, cliente fica marcado como atendido) -> Alt+P
 * quando você quiser seguir pro próximo da fila (Módulo 3 não navega
 * sozinho mais -- isso é sempre uma decisão sua).
 *
 * Onde colar: anexado ao FINAL do smart-table.js, depois dos módulos 0
 * (Utilitários Compartilhados), 1, 2, 3 (Fila de Atendimento), 7 (Fila por
 * Prioridade) e 5 (Alerta de Grupo). Depende do Módulo 0 (window.__smartTableUtil
 * -- esperar/escolherTituloRepresentativo/constantes SCPC), do Módulo 3
 * estar carregado antes (usa window.filaDebug.iniciarFila / irParaProximo /
 * irParaAnterior), do Módulo 7 (usa window.filaPrioridadeDebug.iniciar pro
 * Alt+U) e do Módulo 5 (usa window.__alertaGrupo pra linha de grupo com
 * vencido na mensagem e pro Alt+G).
 * * IMPORTANTE — dois atalhos ainda precisam de confirmação sua:
 *   "Gerar Relatório" e "Entrar na tela de contato" não têm uma função
 *   global exposta que eu conheça, então este módulo procura o botão certo
 *   por TEXTO (ver CONFIG_ATALHOS.TEXTO_BOTAO_RELATORIO e
 *   TEXTO_BOTAO_CONTATO). Se um atalho não fizer nada, olhe o console: vai
 *   aparecer um aviso "[Atalhos] Não encontrei...". Me diga o texto real e
 *   eu ajusto a linha certa. (Alt+F e Alt+S já estão confirmados com o
 *   HTML real do CRM.)
 * ========================================================================= */
(function () {
  'use strict';

  if (window.__atalhosTecladoCarregados) return;
  window.__atalhosTecladoCarregados = true;

  // Utilitários compartilhados (Módulo 0) -- precisa estar carregado ANTES
  // deste arquivo no @require do wrapper.
  const {
    escolherTituloRepresentativo,
    normalizarData,
    DIAS_AVISO_SUSPENSAO_SCPC_MIN,
    DIAS_AVISO_SUSPENSAO_SCPC_MAX,
    DIAS_ULTIMO_DIA_SUSPENSAO_SCPC,
  } = window.__smartTableUtil;

  /* ---------------------------------------------------------------------
   * 1. CONFIGURAÇÃO
   * --------------------------------------------------------------------- */
  const CONFIG_ATALHOS = {
    // Teclas físicas (event.code), sempre combinadas com Alt.
    TECLA_INICIAR_FILA: 'KeyI',
    TECLA_FILA_PRIORIDADE: 'KeyU',
    TECLA_GERAR_RELATORIO: 'KeyR',
    TECLA_ABRIR_CONTATO: 'KeyC',
    TECLA_PROXIMO_DA_FILA: 'KeyP',
    TECLA_VOLTAR_FILA: 'KeyV',
    TECLA_SELECIONAR_FRASE: 'KeyF',
    TECLA_REGISTRAR_ENVIAR: 'KeyS',
    TECLA_AJUDA: 'KeyH',
    TECLA_NOVIDADES: 'KeyL',
    TECLA_BUSCA_RAPIDA: 'KeyB',
    TECLA_ATENDIMENTO_RAPIDO: 'KeyA',
    TECLA_ABRIR_GRUPO_VENCIDO: 'KeyG',
    TECLA_CONFIGURACOES: 'KeyO',
    TECLA_RECEBIDO_SEMANA: 'KeyD',
    // Tempo (ms) entre abrir a tela de contato e selecionar a frase --
    // dá tempo do modal terminar de aparecer antes de mexer nele.
    ATRASO_ATENDIMENTO_RAPIDO_MS: 150,
    // Alt+A com outra(s) razão(ões) do grupo com saldo vencido: tempo
    // máximo (ms) esperando o botão de relatório aparecer em cada aba de
    // fundo depois de aberta, e intervalo (ms) entre tentativas de polling
    // (reaproveitado também pra esperar o relatório TERMINAR de gerar --
    // ver TIMEOUT_AGUARDAR_RELATORIO_PRONTO_MS).
    TIMEOUT_CARREGAMENTO_OUTRA_RAZAO_MS: 8000,
    INTERVALO_POLL_OUTRA_RAZAO_MS: 200,
    // MELHORIA (pedido do usuário): antes, esperava um tempo FIXO depois
    // de clicar em "Gerar Relatório" (folga generosa pro pior caso --
    // captura de tela + conversão pra blob + clipboard.write + download,
    // tudo assíncrono -- CONFIRMADO com o usuário: 2000ms não era
    // suficiente, por isso a folga). Agora espera o SINAL real de que
    // terminou (o próprio botão só reabilita depois que tudo -- inclusive
    // a cópia pra área de transferência -- já aconteceu, ver
    // esperarRelatorioProntoNaJanela), então o caso comum fica bem mais
    // rápido que a folga fixa de antes. Este valor é só o TETO de
    // segurança, pro caso raro do botão nunca reabilitar.
    TIMEOUT_AGUARDAR_RELATORIO_PRONTO_MS: 10000,
    // Trechos de texto (minúsculo) usados pra achar os botões que ainda
    // não têm uma função global conhecida. AJUSTAR SE NÃO FUNCIONAR.
    TEXTO_BOTAO_RELATORIO: 'relatório',
    TEXTO_BOTAO_CONTATO: 'contato',
    TEXTO_BOTAO_REGISTRAR: 'registrar e enviar',
    // Confirmado no CRM real: cada frase padrão é um botão com esta classe,
    // e a ordem deles muda (o mais recente/favoritado aparece primeiro).
    SELETOR_BOTAO_FRASE: '.btn-inserir-frase',
    // IDs confirmados via diagnóstico real (mais confiável que texto/classe).
    ID_BOTAO_REGISTRAR: 'btn-registrar-enviar',
    ID_CAIXA_OBSERVACOES: 'contato-resumo',
    // Id do botão de relatório, criado pelo Módulo 1 (criarBotao). Buscar por
    // ID em vez de por texto é o que sobrevive à troca de rótulo: durante a
    // geração, aoClicar() muda o texto pra "Gerando...", que não contém
    // "relatório" -- e a busca por texto não achava mais o botão.
    ID_BOTAO_RELATORIO: 'aviso-cobranca-botao',
    // Id do overlay da busca rápida (Alt+B) -- precisa ser conhecido por
    // estaDigitando() pra que o próprio Alt+B consiga fechar a busca.
    ID_OVERLAY_BUSCA: 'smarttable-busca-rapida',
    // Última versão cujo log de atualização já foi lido -- é o que permite
    // marcar como NOVO só o que chegou depois da sua última olhada.
    CHAVE_ULTIMA_VERSAO_VISTA: 'smarttable_ultima_versao_vista',
  };

  // Fonte única de verdade pra lista de atalhos — usada tanto no aviso do
  // console quanto no painel de ajuda visual (Alt+H), pra nunca ficarem
  // desalinhados entre si.
  const LISTA_ATALHOS = [
    { tecla: 'Alt+I', descricao: 'Iniciar Fila de Atendimento' },
    { tecla: 'Alt+U', descricao: 'Fila por Prioridade: continua a de hoje; só monta do zero se não houver' },
    { tecla: 'Shift+Alt+U', descricao: 'Refazer a fila por prioridade do zero (tira quem já foi contatado hoje)' },
    { tecla: 'Alt+R', descricao: 'Gerar Relatório' },
    { tecla: 'Alt+C', descricao: 'Entrar na tela de contato' },
    { tecla: 'Alt+F', descricao: 'Selecionar a 1ª frase padrão' },
    { tecla: 'Alt+A', descricao: 'Atendimento rápido (relatório(s) de outra(s) razão(ões) do grupo, se houver, + relatório + contato + mensagem personalizada)' },
    { tecla: 'Alt+S', descricao: 'Registrar e Enviar' },
    { tecla: 'Alt+P', descricao: 'Ir para o próximo da fila' },
    { tecla: 'Alt+V', descricao: 'Voltar um cliente na fila' },
    { tecla: 'Alt+G', descricao: 'Abrir em nova aba as outras razões do grupo com saldo vencido' },
    { tecla: 'Alt+B', descricao: 'Busca rápida de cliente' },
    { tecla: 'Alt+L', descricao: 'Ver o que mudou nas últimas versões' },
    { tecla: 'Alt+D', descricao: 'Quanto entrou na semana (sáb a sex), Isaac e Bianca' },
    { tecla: 'Alt+O', descricao: 'Abrir/fechar as configurações (interruptores)' },
    { tecla: 'Alt+H', descricao: 'Abrir/fechar esta ajuda' },
  ];

  /* ---------------------------------------------------------------------
   * 2. ESTADO
   * --------------------------------------------------------------------- */
  let painelAjudaEl = null;

  /* ---------------------------------------------------------------------
   * 3. UTILITÁRIOS
   * --------------------------------------------------------------------- */
  function estaDigitando() {
    // Não dispara atalhos enquanto o usuário está digitando em algum campo
    // (busca, filtro, textarea de observação, etc.).
    const el = document.activeElement;
    if (!el) return false;

    const tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable === true;
  }

  // ÚNICA definição de "visível" no arquivo (correção de DRY -- antes esta
  // mesma função-seta estava duplicada em 3 lugares diferentes).
  function elementoVisivel(el) {
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  // doc opcional -- default é o document desta aba, mas pode receber o
  // document de outra janela same-origin (ver gerarRelatoriosDasOutrasRazoes).
  function encontrarElementoVisivelPorTexto(seletorBase, trecho, doc) {
    const documento = doc || document;
    const alvo = trecho.trim().toLowerCase();
    if (!alvo) return null;

    const candidatos = Array.from(documento.querySelectorAll(seletorBase));
    return (
      candidatos.find((el) => elementoVisivel(el) && (el.textContent || '').trim().toLowerCase().includes(alvo)) ||
      null
    );
  }

  function clicarBotaoPorTexto(trecho, doc) {
    const encontrado = encontrarElementoVisivelPorTexto('button, a[role="button"], [role="button"]', trecho, doc);
    if (encontrado) {
      simularCliqueCompleto(encontrado);
      return true;
    }
    return false;
  }

  // Espera (com polling) o botão aparecer em OUTRA janela same-origin já
  // aberta -- lê janela.document a cada tentativa (não guarda uma
  // referência fixa), porque o document de uma aba recém-aberta com
  // window.open(url) começa como about:blank e é substituído por um objeto
  // novo quando a navegação real termina. Resolve com o elemento encontrado,
  // ou com null se a aba fechar sozinha ou o tempo esgotar.
  function esperarElementoVisivelPorTextoNaJanela(seletorBase, trecho, janela, timeoutMs, intervaloMs) {
    return new Promise((resolve) => {
      const prazoFinal = Date.now() + timeoutMs;
      (function tentar() {
        if (janela.closed) return resolve(null);
        let el = null;
        try {
          el = encontrarElementoVisivelPorTexto(seletorBase, trecho, janela.document);
        } catch (erro) {
          return resolve(null);
        }
        if (el) return resolve(el);
        if (Date.now() >= prazoFinal) return resolve(null);
        setTimeout(tentar, intervaloMs);
      })();
    });
  }

  // Generaliza esperarElementoVisivelPorTextoNaJanela pra qualquer condição
  // (não só "elemento existe") -- usada pra esperar um SINAL real de que
  // uma operação assíncrona em OUTRA janela terminou, em vez de uma espera
  // fixa arbitrária (ver esperarRelatorioProntoNaJanela abaixo). Resolve
  // true quando a condição bate, false se a aba fechar ou o tempo esgotar.
  function esperarCondicaoNaJanela(condicao, janela, timeoutMs, intervaloMs) {
    return new Promise((resolve) => {
      const prazoFinal = Date.now() + timeoutMs;
      (function tentar() {
        if (janela.closed) return resolve(false);
        let pronto = false;
        try {
          pronto = !!condicao();
        } catch (erro) {
          return resolve(false);
        }
        if (pronto) return resolve(true);
        if (Date.now() >= prazoFinal) return resolve(false);
        setTimeout(tentar, intervaloMs);
      })();
    });
  }

  // PEDIDO DO USUÁRIO: em vez de esperar um tempo fixo (que precisava de
  // folga generosa pra cobrir o pior caso -- captura de tela + conversão
  // pra blob + clipboard.write + download, tudo assíncrono), espera o
  // SINAL real de que terminou. aoClicar() do Módulo 1 é assíncrono e o
  // finally dele só reabilita o botão DEPOIS que a Promise inteira resolve
  // -- captura, cópia pra área de transferência e download já aconteceram.
  // Usa o próprio botão (referência já obtida) em vez de buscar de novo
  // por texto, porque o texto dele muda pra "Gerando..." durante a
  // operação.
  function esperarRelatorioProntoNaJanela(botao, janela, timeoutMs, intervaloMs) {
    return esperarCondicaoNaJanela(() => botao.disabled === false, janela, timeoutMs, intervaloMs);
  }

  function dispararEventoDeMouse(elemento, tipo) {
    const opcoes = { bubbles: true, cancelable: true, view: window, button: 0 };
    let evento;
    try {
      evento = new PointerEvent(tipo, opcoes);
    } catch (e) {
      evento = new MouseEvent(tipo, opcoes);
    }
    elemento.dispatchEvent(evento);
  }

  function extrairPropsReact(elemento) {
    // Em apps React, o elemento DOM guarda uma referência às props internas
    // numa chave tipo "__reactProps$xxxxx" (React 17+) ou
    // "__reactEventHandlers$xxxxx" (React 16). É de lá que pegamos a função
    // onClick de verdade, sem depender do sistema de eventos sintéticos.
    const chave = Object.keys(elemento).find(
      (k) => k.startsWith('__reactProps$') || k.startsWith('__reactEventHandlers$')
    );
    return chave ? elemento[chave] : null;
  }

  function simularCliqueCompleto(elemento) {
    // NOTA: propositalmente NÃO chamamos elemento.focus() aqui. Em modais
    // com "focus trap", forçar foco no botão pode ser redirecionado pelo
    // próprio app para outro campo (ex.: a caixa de observações), deixando
    // o foco preso lá e travando os atalhos seguintes.

    // Estratégia 1: onClick interno do React, subindo até 4 ancestrais
    // (o texto pode estar num <span> dentro do botão real). É o método
    // mais confiável em apps React — chama a função direto, sem depender
    // do navegador "reconhecer" o clique como legítimo.
    let alvo = elemento;
    for (let i = 0; i < 4 && alvo; i++) {
      const props = extrairPropsReact(alvo);
      if (props && typeof props.onClick === 'function') {
        const eventoFalso = {
          bubbles: true,
          cancelable: true,
          defaultPrevented: false,
          isDefaultPrevented: () => false,
          isPropagationStopped: () => false,
          preventDefault() { this.defaultPrevented = true; },
          stopPropagation() {},
          persist() {},
          target: elemento,
          currentTarget: alvo,
          nativeEvent: new MouseEvent('click', { bubbles: true }),
        };
        console.log('[Atalhos] Clique disparado via onClick interno do React.');
        props.onClick(eventoFalso);
        liberarFocoInvoluntario();
        return;
      }
      alvo = alvo.parentElement;
    }

    // Estratégia 2: onclick "clássico" (atribuído via propriedade, não framework).
    if (typeof elemento.onclick === 'function') {
      console.log('[Atalhos] Clique disparado via elemento.onclick.');
      elemento.onclick(new MouseEvent('click', { bubbles: true, cancelable: true }));
      liberarFocoInvoluntario();
      return;
    }

    // Estratégia 3 (fallback): sequência completa de eventos nativos de mouse.
    console.log('[Atalhos] Clique disparado via sequência de eventos de mouse (fallback).');
    ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach((tipo) => {
      dispararEventoDeMouse(elemento, tipo);
    });
    liberarFocoInvoluntario();
  }

  function liberarFocoInvoluntario() {
    // Se alguma ação acima acabou deixando o foco preso numa caixa de texto
    // (efeito colateral de um "focus trap" no modal, por exemplo), tira o
    // foco de lá — senão o PRÓXIMO atalho se autobloqueia, porque
    // estaDigitando() vai achar que você está digitando de verdade.
    // Seguro fazer isso aqui: só chegamos até este ponto porque
    // estaDigitando() já confirmou, no momento do keydown, que você NÃO
    // estava digitando antes de apertar o atalho.
    const el = document.activeElement;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) {
      el.blur();
    }
  }

  /* ---------------------------------------------------------------------
   * 3.1 AÇÕES
   * --------------------------------------------------------------------- */
  function acionarIniciarFila() {
    if (window.filaDebug && typeof window.filaDebug.iniciarFila === 'function') {
      window.filaDebug.iniciarFila();
    } else {
      console.warn('[Atalhos] Módulo de Fila (Módulo 3) não encontrado. Confirme se ele foi colado ANTES deste arquivo.');
    }
  }

  /** @param {{reconstruir?: boolean}} [opcoes] */
  function acionarFilaPorPrioridade(opcoes) {
    if (window.filaPrioridadeDebug && typeof window.filaPrioridadeDebug.iniciar === 'function') {
      window.filaPrioridadeDebug.iniciar(opcoes);
    } else {
      console.warn('[Atalhos] Módulo de Fila por Prioridade (Módulo 7) não encontrado. Confirme se ele foi colado ANTES deste arquivo.');
    }
  }

  function acionarProximoDaFila() {
    if (window.filaDebug && typeof window.filaDebug.irParaProximo === 'function') {
      window.filaDebug.irParaProximo('pulado');
    } else {
      console.warn('[Atalhos] Módulo de Fila (Módulo 3) não encontrado. Confirme se ele foi colado ANTES deste arquivo.');
    }
  }

  function acionarVoltarFila() {
    if (window.filaDebug && typeof window.filaDebug.irParaAnterior === 'function') {
      window.filaDebug.irParaAnterior();
    } else {
      console.warn('[Atalhos] Módulo de Fila (Módulo 3) não encontrado, ou está desatualizado (sem irParaAnterior). Confirme se ele foi colado ANTES deste arquivo.');
    }
  }

  // Abre cada outra razão do grupo com saldo vencido em nova aba -- não
  // gera o relatório sozinho (isso continua sendo Alt+R, manual, em cada
  // aba que abrir), só poupa a busca manual pelo cliente. CONFIRMADO com o
  // usuário: dois relatórios separados, um por página -- sem combinar numa
  // imagem só (isso exigiria mexer no Módulo 1, que não pode ser editado
  // sem confirmação explícita).
  function acionarAbrirGrupoComVencido() {
    const grupo = window.__alertaGrupo;
    if (!grupo || !grupo.empresasComVencido || grupo.empresasComVencido.length === 0) {
      console.warn('[Atalhos] Nenhuma outra razão do grupo com saldo vencido nesta página (ou o Módulo 5 ainda não carregou -- confirme se ele foi colado ANTES deste arquivo).');
      return;
    }
    grupo.empresasComVencido.forEach((empresa) => {
      if (!empresa.url) {
        console.warn(`[Atalhos] Não consegui montar a URL de "${empresa.razaoSocial}" -- pulando.`);
        return;
      }
      // Navegador pode bloquear popups além do primeiro fora de um clique
      // direto -- Alt+G é um gesto real do usuário, então isso costuma
      // passar, mas se faltar alguma aba, pode ser o bloqueador de popup.
      window.open(empresa.url, '_blank', 'noopener,noreferrer');
    });
  }

  // Automação pedida pelo usuário: quando o cliente tem outra(s) razão(ões)
  // do grupo com saldo vencido, o Alt+A visita cada uma em aba de fundo,
  // gera o relatório lá e fecha a aba sozinho, antes de continuar com o
  // resto do Alt+A na razão original -- que nunca perde o foco/sai do
  // lugar (por isso "voltar" não precisa de navegação nenhuma aqui).
  //
  // IMPORTANTE sobre bloqueio de popup: todas as abas são abertas de uma
  // vez, de forma síncrona, ainda dentro do gesto do usuário (Alt+A) --
  // mesma tática do Alt+G. Se abríssemos cada aba só depois de esperar a
  // anterior carregar (com await no meio), o navegador não reconheceria
  // mais isso como gesto do usuário e bloquearia como popup. Só a ESPERA
  // pelo botão em cada aba já aberta acontece em sequência.
  async function gerarRelatoriosDasOutrasRazoes() {
    const grupo = window.__alertaGrupo;
    if (!grupo || !grupo.empresasComVencido || grupo.empresasComVencido.length === 0) {
      return;
    }

    const tentativas = grupo.empresasComVencido
      .filter((empresa) => {
        if (!empresa.url) {
          console.warn(`[Atalhos] Não consegui montar a URL de "${empresa.razaoSocial}" -- pulando.`);
          return false;
        }
        return true;
      })
      .map((empresa) => ({ empresa, aba: window.open(empresa.url, '_blank') }));

    for (const { empresa, aba } of tentativas) {
      if (!aba) {
        console.warn(`[Atalhos] Não consegui abrir aba para "${empresa.razaoSocial}" -- popup bloqueado?`);
        continue;
      }
      try {
        const botao = await esperarElementoVisivelPorTextoNaJanela(
          'button, a[role="button"], [role="button"]',
          CONFIG_ATALHOS.TEXTO_BOTAO_RELATORIO,
          aba,
          CONFIG_ATALHOS.TIMEOUT_CARREGAMENTO_OUTRA_RAZAO_MS,
          CONFIG_ATALHOS.INTERVALO_POLL_OUTRA_RAZAO_MS
        );
        if (botao) {
          simularCliqueCompleto(botao);
          const terminou = await esperarRelatorioProntoNaJanela(
            botao,
            aba,
            CONFIG_ATALHOS.TIMEOUT_AGUARDAR_RELATORIO_PRONTO_MS,
            CONFIG_ATALHOS.INTERVALO_POLL_OUTRA_RAZAO_MS
          );
          if (terminou) {
            console.log(`[Atalhos] Relatório gerado em aba de fundo para "${empresa.razaoSocial}".`);
          } else {
            console.warn(
              `[Atalhos] Não confirmei que o relatório de "${empresa.razaoSocial}" terminou de gerar a tempo -- fechando mesmo assim.`
            );
          }
        } else {
          console.warn(
            `[Atalhos] Não encontrei o botão de relatório em "${empresa.razaoSocial}" a tempo (aba fechada ou demorou demais) -- fechando mesmo assim.`
          );
        }
      } catch (erro) {
        console.warn(`[Atalhos] Erro gerando relatório em aba de fundo para "${empresa.razaoSocial}":`, erro);
      } finally {
        try {
          if (!aba.closed) aba.close();
        } catch (erro) {
          // aba pode já ter sido fechada manualmente -- ignora.
        }
      }
    }
  }

  /**
   * Acha o botão de gerar relatório.
   *
   * BUG REAL (intermitente, relatado pelo usuário): a busca era só por
   * TEXTO, e o Módulo 1 troca o rótulo do botão pra "Gerando..." durante a
   * geração. Apertar Alt+A enquanto um relatório anterior ainda rodava não
   * encontrava botão nenhum -- e o relatório novo não saía, sem erro claro.
   * O ID é criado pelo próprio Módulo 1 e não muda.
   *
   * @returns {HTMLElement|null}
   */
  function encontrarBotaoRelatorio() {
    const porId = document.getElementById(CONFIG_ATALHOS.ID_BOTAO_RELATORIO);
    if (porId) return porId;
    return encontrarElementoVisivelPorTexto(
      'button, a[role="button"], [role="button"]',
      CONFIG_ATALHOS.TEXTO_BOTAO_RELATORIO
    );
  }

  /**
   * Dispara a geração do relatório (mesma ação do Alt+R).
   *
   * @returns {HTMLElement|null} O botão acionado, pra quem precisar esperar
   *   a geração terminar (ver acionarAtendimentoRapido).
   */
  function acionarGerarRelatorio() {
    const botao = encontrarBotaoRelatorio();
    if (!botao) {
      console.warn(
        `[Atalhos] Não encontrei o botão de relatório (#${CONFIG_ATALHOS.ID_BOTAO_RELATORIO} ` +
        `nem um botão visível com "${CONFIG_ATALHOS.TEXTO_BOTAO_RELATORIO}" no texto). ` +
        'Confirme se a tabela de títulos carregou nesta página.'
      );
      return null;
    }

    // Já está gerando: clicar de novo não faz nada (o Módulo 1 desabilita o
    // botão) e só confundiria. Devolve mesmo assim, pra quem chamou esperar
    // a geração em curso terminar em vez de seguir por cima dela.
    if (botao.disabled) {
      console.log('[Atalhos] Relatório já está sendo gerado -- aguardando o que já está em andamento.');
      return botao;
    }

    simularCliqueCompleto(botao);
    return botao;
  }

  function acionarAbrirContato() {
    const encontrado = clicarBotaoPorTexto(CONFIG_ATALHOS.TEXTO_BOTAO_CONTATO);
    if (!encontrado) {
      console.warn(
        `[Atalhos] Não encontrei um botão visível com "${CONFIG_ATALHOS.TEXTO_BOTAO_CONTATO}" no texto. ` +
        'Me diga o texto exato do botão/link que abre a tela de contato pra eu ajustar CONFIG_ATALHOS.TEXTO_BOTAO_CONTATO.'
      );
    }
    return encontrado;
  }

  /* ---------------------------------------------------------------------
   * 3.0b MENSAGEM PERSONALIZADA (Alt+A) -- escolha do título e do texto
   * -----------------------------------------------------------------
   * Prioridade de qual título "representa" o cliente na mensagem: MESMA
   * regra que o Módulo 2 já usa pra montar o resumo do CRM -- centralizada
   * no Módulo 0 (window.__smartTableUtil.escolherTituloRepresentativo).
   * Módulo 2 continua com sua própria cópia local (não pode ser editado
   * sem confirmação explícita do usuário), mas todos os outros consumidores
   * dessa regra (este módulo e o Módulo 7) usam a versão compartilhada, pra
   * nota do CRM e mensagem do cliente sempre baterem sobre o mesmo título.
   * --------------------------------------------------------------------- */

  // Datas de vencimento (formato curto, sem duplicatas) dos títulos numa
  // dada situação -- usado só quando o relatório está sendo OMITIDO (ver
  // deveOmitirRelatorio): nesse caso a linha de situação não pode mais
  // dizer "grifado no relatório abaixo", porque nenhum relatório está
  // sendo enviado -- CONFIRMADO com o usuário, volta a citar a data.
  function obterDatasVencimentoPorSituacao(dados, situacaoKey) {
    const datas = dados.registros
      .filter((r) => r.situacaoKey === situacaoKey)
      .sort((a, b) => b.diasAtrasoReal - a.diasAtrasoReal)
      .map((r) => encurtarData(r.vencimentoTexto));
    return [...new Set(datas)];
  }

  // Texto do aviso de suspensão SCPC pra um dado nível de atraso -- extraído
  // pra ser reaproveitado tanto na linha principal (quando NEGATIVADO_SCPC é
  // a situação escolhida) quanto na linha complementar (quando NÃO é a
  // escolhida, mas ainda existe entre os títulos do cliente -- ver
  // obterLinhaNegativadoScpcAdicional).
  function textoAvisoScpc(dias) {
    // CONFIRMADO com o usuário: aviso específico nos últimos dias antes
    // da suspensão de cadastro por SCPC -- fora dessa janela, segue a
    // frase genérica de sempre.
    if (dias >= DIAS_AVISO_SUSPENSAO_SCPC_MIN && dias <= DIAS_AVISO_SUSPENSAO_SCPC_MAX) {
      return `Lembramos que, a partir do ${DIAS_ULTIMO_DIA_SUSPENSAO_SCPC}º dia de atraso, o cadastro é suspenso e os pedidos deixam de ser faturados.`;
    }
    if (dias === DIAS_ULTIMO_DIA_SUSPENSAO_SCPC) {
      return 'Hoje é o último dia para pagamento antes que o cadastro seja suspenso e o caso seja encaminhado a um de nossos analistas.';
    }
    return 'Lembramos que a regularização dos débitos negativados no SCPC permite a baixa das restrições.';
  }

  // Prioridade de urgência entre títulos NEGATIVADO_SCPC -- MESMA lógica de
  // escolherTituloRepresentativo (dia 19 exato > janela 16-18 > qualquer
  // outro), usada aqui só pra decidir qual texto usar quando mais de um
  // título negativado sobrou sem ser o escolhido (ver
  // obterLinhaNegativadoScpcAdicional).
  function prioridadeUrgenciaScpc(dias) {
    if (dias === DIAS_ULTIMO_DIA_SUSPENSAO_SCPC) return 3;
    if (dias >= DIAS_AVISO_SUSPENSAO_SCPC_MIN && dias <= DIAS_AVISO_SUSPENSAO_SCPC_MAX) return 2;
    return 1;
  }

  // Linha de contexto por situação -- extraída/adaptada das frases padrão
  // reais do usuário (não escrita do zero). Retorna:
  //   - string vazia: sem linha extra, mensagem segue direto pro fechamento
  //   - string com texto: linha extra
  //   - null: situação não deve gerar mensagem automática (ver chamador)
  function obterLinhaContexto(escolhido, dados, omitirRelatorio) {
    switch (escolhido.situacaoKey) {
      case 'EM_ATRASO':
      case 'PRAZO_FINAL':
        return '';
      case 'ULTIMO_DIA': {
        const destino = dados.fluxo === 'SCPC' ? 'ao SCPC' : 'para cartório';
        // CORRIGIDO (achado real via bateria de cobrança digna): sem
        // "Lembramos que" aqui -- essa frase pode ficar logo atrás da linha
        // de promessa DIA_DA_PROMESSA, que já abre com "Lembramos que...",
        // e duas frases seguidas com a mesma abertura soam repetitivas/
        // robóticas (ver skill cobrança-digna, princípio 3). Sem o prefixo
        // fica igual claro sozinha e nunca duplica quando combinada.
        if (omitirRelatorio) {
          const datas = obterDatasVencimentoPorSituacao(dados, 'ULTIMO_DIA');
          const datasTexto = datas.join(', ');
          return datas.length > 1
            ? `Os títulos vencidos em ${datasTexto} estão no prazo final antes de serem encaminhados ${destino}.`
            : `O título vencido em ${datasTexto} está no prazo final antes de ser encaminhado ${destino}.`;
        }
        // Com relatório sendo enviado, basta referenciar a cor -- os
        // títulos em último dia já aparecem grifados em vermelho nele.
        const quantidade = dados.registros.filter((r) => r.situacaoKey === 'ULTIMO_DIA').length;
        return quantidade > 1
          ? `Os títulos grifados em vermelho no relatório abaixo estão no prazo final antes de serem encaminhados ${destino}.`
          : `O título grifado em vermelho no relatório abaixo está no prazo final antes de ser encaminhado ${destino}.`;
      }
      case 'NEGATIVADO_SCPC':
        return textoAvisoScpc(escolhido.diasAtrasoReal);
      case 'EM_CARTORIO': {
        // CONFIRMADO com o usuário: referenciar a cor (amarelo) em vez de só
        // "aparecem destacados" -- e essa linha continua junto de qualquer
        // outra (ex.: "retomando o contato de ontem"), nunca é removida por
        // causa delas -- ver montarMensagemPersonalizada, que empilha cada
        // linha de forma independente.
        if (omitirRelatorio) {
          const datas = obterDatasVencimentoPorSituacao(dados, 'EM_CARTORIO');
          return `Os títulos vencidos em ${datas.join(', ')} já estão em cartório -- o pagamento do restante ainda é possível via boleto.`;
        }
        return 'Os títulos grifados em amarelo no relatório abaixo já estão em cartório -- o pagamento do restante ainda é possível via boleto.';
      }
      default:
        // VERIFICAR_POSICAO (ou qualquer situação nova/desconhecida): situação
        // incerta demais pra afirmar algo pro cliente -- decisão do usuário foi
        // não gerar mensagem automática nesse caso, não inventar texto.
        return null;
    }
  }

  // BUG REAL (relatado pelo usuário): cliente com títulos em MAIS de uma
  // situação ao mesmo tempo (ex.: um em ULTIMO_DIA + outro já EM_CARTORIO)
  // recebia uma mensagem que só falava do título escolhido como
  // representante (ULTIMO_DIA sempre vence -- ver escolherTituloRepresentativo
  // no Módulo 0) -- os títulos já em cartório apareciam grifados em amarelo
  // no relatório, mas a mensagem nunca explicava esse destaque, porque
  // obterLinhaContexto só descreve UMA situação por vez. Esta função cobre
  // o caso em que EM_CARTORIO não é a situação escolhida mas ainda assim
  // está presente entre os títulos do cliente -- complementa linhaContexto
  // em vez de substituí-la (ver montarMensagemPersonalizada).
  function obterLinhaEmCartorioAdicional(escolhido, dados, omitirRelatorio) {
    if (escolhido.situacaoKey === 'EM_CARTORIO') return ''; // já coberto pela linha principal

    const emCartorio = dados.registros.filter((r) => r.situacaoKey === 'EM_CARTORIO');
    if (emCartorio.length === 0) return '';

    if (omitirRelatorio) {
      const datas = obterDatasVencimentoPorSituacao(dados, 'EM_CARTORIO');
      const datasTexto = datas.join(', ');
      return datas.length > 1
        ? `Os títulos vencidos em ${datasTexto} também já estão em cartório -- o pagamento do restante ainda é possível via boleto.`
        : `O título vencido em ${datasTexto} também já está em cartório -- o pagamento do restante ainda é possível via boleto.`;
    }

    return emCartorio.length > 1
      ? 'Os títulos grifados em amarelo no relatório abaixo também já estão em cartório -- o pagamento do restante ainda é possível via boleto.'
      : 'O título grifado em amarelo no relatório abaixo também já está em cartório -- o pagamento do restante ainda é possível via boleto.';
  }

  // MESMA CLASSE DE BUG do EM_CARTORIO acima, achada ao auditar
  // sistematicamente outras combinações de situações simultâneas (pedido do
  // usuário, depois do bug real relatado): cliente com título em ULTIMO_DIA
  // (ou outra situação de maior atraso) escolhido como representante, e
  // OUTRO título já NEGATIVADO_SCPC -- inclusive no último dia antes da
  // suspensão de cadastro (dia 19) -- tinha esse aviso inteiramente
  // omitido, mesmo com o título aparecendo destacado (índigo) no relatório.
  function obterLinhaNegativadoScpcAdicional(escolhido, dados) {
    if (escolhido.situacaoKey === 'NEGATIVADO_SCPC') return ''; // já coberto pela linha principal

    const negativados = dados.registros.filter((r) => r.situacaoKey === 'NEGATIVADO_SCPC');
    if (negativados.length === 0) return '';

    // Entre os títulos negativados que sobraram, o mais urgente decide o
    // texto (dia 19 exato > janela 16-18 > qualquer outro).
    const maisUrgente = negativados.reduce((a, b) => {
      const pa = prioridadeUrgenciaScpc(a.diasAtrasoReal);
      const pb = prioridadeUrgenciaScpc(b.diasAtrasoReal);
      if (pb !== pa) return pb > pa ? b : a;
      return b.diasAtrasoReal > a.diasAtrasoReal ? b : a;
    });
    return textoAvisoScpc(maisUrgente.diasAtrasoReal);
  }

  /* ---------------------------------------------------------------------
   * 2b. VARIANTES DE FRASE (rotação por cliente + dia)
   * -----------------------------------------------------------------
   * Cada lista tem variantes do MESMO papel, com a MESMA firmeza e o MESMO
   * pedido. Trocar entre elas nunca pode mudar o estágio da cobrança: um
   * CTA de último dia jamais vira um CTA leve.
   *
   * A escolha é determinística por (cnpj, dia) -- ver escolherVariante no
   * Módulo 0 e o porquê de não ser sorteio.
   *
   * SELECIONADAS PELO USUÁRIO, uma a uma. Não acrescente frase aqui por
   * conta própria: cada uma dessas passou pelo crivo de quem fala com o
   * cliente do outro lado.
   * --------------------------------------------------------------------- */
  const FRASES = Object.freeze({
    // EM_ATRASO / PRAZO_FINAL, sem promessa ativa. Era 83% de todas as
    // mensagens numa frase só.
    ctaGenerico: Object.freeze([
      'Podemos agendar para hoje o pagamento do débito em aberto?',
      'Consegue regularizar ainda hoje?',
      // A única pergunta ABERTA do conjunto: não se responde com sim ou não,
      // e é a que mais puxa retorno de quem estava sumindo.
      'Como podemos resolver isso hoje?',
      'Consegue me confirmar se dá para acertar hoje?',
    ]),

    ctaUltimoDia: Object.freeze([
      'Consegue regularizar hoje para evitarmos o encaminhamento?',
      'Conseguimos quitar isso hoje antes que o título siga para o encaminhamento?',
      'Consegue acertar hoje para o título não seguir para encaminhamento?',
    ]),

    // EM_CARTORIO: fato já consumado. Toda variante nomeia o caminho de
    // volta, e nenhuma promete o que não se controla.
    ctaCartorio: Object.freeze([
      'Consegue regularizar hoje para eu confirmar a baixa da restrição?',
      'Assim que o pagamento for confirmado, sinalizo em nosso sistema. Consegue regularizar hoje?',
      'Consegue fechar isso hoje? Confirmado o pagamento, já sinalizo a baixa.',
    ]),

    // SCPC 16 a 18 dias: a suspensão ainda NÃO é hoje.
    //
    // CORRIGIDO ANTES DE ENTRAR: a variante proposta dizia "sem a
    // identificação do pagamento ATÉ O FIM DO DIA o cadastro é suspenso".
    // Isso é falso nos dias 16 e 17 -- o cliente tem até o 19º. Dizer um
    // prazo que não se cumpre queima o aviso: na próxima vez ele já sabe que
    // não acontece nada. A frase com prazo cravado foi movida pro dia 19,
    // onde é literalmente verdade.
    ctaSuspensaoScpc: Object.freeze([
      'Consegue regularizar hoje para evitarmos a suspensão do cadastro?',
      'A suspensão do cadastro é automática se o pagamento não for identificado. Consegue resolver hoje?',
      'Regularizando hoje, o cadastro segue ativo normalmente. Conseguimos agendar?',
    ]),

    // SCPC exatamente no 19º dia -- aqui o prazo é real.
    ctaUltimoDiaScpc: Object.freeze([
      'Consegue regularizar hoje, o último dia antes da suspensão?',
      'Sem a identificação do pagamento até o fim do dia o cadastro é suspenso automaticamente. Consegue resolver hoje?',
    ]),

    // Retomada de contato.
    //
    // A primeira AFIRMA que o cliente não retornou, e isso fica errado
    // quando ele respondeu e só não pagou -- são coisas diferentes. Ela
    // continua na rotação por decisão do usuário; as outras duas não fazem
    // nenhuma afirmação sobre o que o cliente fez.
    retomada: Object.freeze([
      'Retomando o contato de {{referencia}}, já que ainda não obtivemos retorno.',
      'Voltando aqui sobre o contato de {{referencia}}.',
      'Dando sequência ao contato de {{referencia}}.',
    ]),
  });

  /**
   * Semente da rotação: o cliente da página e o dia de hoje.
   *
   * Sem cnpj (página fora do padrão), cai numa semente só do dia -- todos os
   * clientes recebem a mesma variante naquele dia, o que ainda é melhor que
   * a frase única de sempre, e nunca estoura.
   *
   * @returns {string}
   */
  function sementeDaFrase() {
    let cnpj = '';
    try {
      cnpj = new URLSearchParams(location.search).get('cnpj') || '';
    } catch (erro) {
      cnpj = '';
    }
    const util = window.__smartTableUtil;
    const dia = util && typeof util.dataIso === 'function' ? util.dataIso(new Date()) : '';
    return `${cnpj}|${dia}`;
  }

  /**
   * @param {string[]} variantes Uma das listas de FRASES.
   * @returns {string}
   */
  function frase(variantes) {
    const util = window.__smartTableUtil;
    if (!util || typeof util.escolherVariante !== 'function') return variantes[0];
    return util.escolherVariante(sementeDaFrase(), variantes);
  }

  // CONFIRMADO com o usuário: a pergunta final não deve ser sempre a
  // mesma ("podemos agendar...") -- perto do encaminhamento (último dia)
  // ou já negativado/em cartório, o CTA pode ser mais específico e
  // urgente, sem virar ameaça: só nomeia a consequência real (evitar o
  // encaminhamento, confirmar a baixa da restrição, evitar a suspensão).
  function obterPerguntaFinal(escolhido) {
    switch (escolhido.situacaoKey) {
      case 'ULTIMO_DIA':
        return frase(FRASES.ctaUltimoDia);
      case 'EM_CARTORIO':
        return frase(FRASES.ctaCartorio);
      case 'NEGATIVADO_SCPC': {
        const dias = escolhido.diasAtrasoReal;
        if (dias >= DIAS_AVISO_SUSPENSAO_SCPC_MIN && dias <= DIAS_AVISO_SUSPENSAO_SCPC_MAX) {
          return frase(FRASES.ctaSuspensaoScpc);
        }
        if (dias === DIAS_ULTIMO_DIA_SUSPENSAO_SCPC) {
          return frase(FRASES.ctaUltimoDiaScpc);
        }
        return frase(FRASES.ctaCartorio);
      }
      default: // EM_ATRASO, PRAZO_FINAL -- estágio inicial, sem pressão
        return obterPerguntaFinalConsiderandoPromessa();
    }
  }

  /**
   * Pergunta final do estágio inicial (EM_ATRASO/PRAZO_FINAL), levando em
   * conta a promessa ativa.
   *
   * BUG REAL (relatado pelo usuário): a pergunta olhava SÓ a situação do
   * título e ignorava a promessa. Cliente que combinou pagar HOJE recebia
   * "Lembramos que hoje é o dia combinado para o pagamento do título X."
   * e, três linhas abaixo, "Podemos agendar para hoje o pagamento do débito
   * em aberto?" -- pedindo pra agendar o que já estava agendado. A promessa
   * é o compromisso mais recente e mais específico, então é ela que decide o
   * pedido final.
   *
   * Só troca a pergunta GENÉRICA. As perguntas de ULTIMO_DIA, EM_CARTORIO e
   * NEGATIVADO_SCPC continuam valendo mesmo com promessa ativa: elas nomeiam
   * uma consequência real e pedem AÇÃO ("consegue regularizar hoje"), não
   * agendamento -- não há contradição com ter prometido pagar hoje.
   *
   * QUEBRADA não passa por aqui: a linha dela já termina em pergunta ("Já
   * foi realizado?..."), então nenhuma pergunta final é acrescentada.
   *
   * @returns {string}
   */
  function obterPerguntaFinalConsiderandoPromessa() {
    const tipo = window.__contextoAdicional?.promessa?.tipo;

    // CONFIRMADO com o usuário: presume boa-fé -- trata o pagamento como algo
    // que vai acontecer, não como algo a renegociar -- e o comprovante é o
    // que fecha o ciclo (é ele que permite dar baixa).
    if (tipo === 'DIA_DA_PROMESSA') return 'Assim que efetuar, pode me enviar o comprovante?';

    // CONFIRMADO com o usuário: reconhece implicitamente que já houve
    // pagamento, em vez de falar do débito como se nada tivesse sido pago.
    if (tipo === 'PARCIAL') return 'Consegue quitar o restante hoje?';

    return frase(FRASES.ctaGenerico);
  }

  /* ---------------------------------------------------------------------
   * 3.0c LINHAS DE CONTEXTO ADICIONAL (Módulo 6) -- promessa e contato
   * -----------------------------------------------------------------
   * Lê window.__contextoAdicional (calculado pelo Módulo 6 já no carregamento
   * da página, sem custo extra aqui). Se o Módulo 6 não estiver carregado ou
   * não achar nada relevante, essas funções devolvem string vazia -- a
   * mensagem segue normal, só sem essas linhas extras.
   * --------------------------------------------------------------------- */
  // CONFIRMADO com o usuário: diferente do caso de zero contatos (que vira
  // uma mensagem só de identificação, sem relatório -- ver semContatoAnterior
  // em montarMensagemPersonalizada), aqui o cliente TEM contato registrado.
  // Mensagem continua normal (relatório, situação, promessa), só ganha essa
  // linha a mais logo após a saudação -- sem a pergunta de confirmação de
  // responsável, já que já houve contato antes.
  //
  // DOIS motivos levam à mesma linha, e CONFIRMADO com o usuário que "as
  // duas devem coexistir":
  //   - contatoAntigo: já falamos com o cliente, mas faz tanto tempo
  //     (anterior à data de corte, Módulo 6) que ele não deve lembrar.
  //   - nuncaContatadoPorMim (PEDIDO DO USUÁRIO): o cliente já foi contatado
  //     por OUTRO negociador, mas nunca por este -- do lado dele é a
  //     primeira vez que esta pessoa fala com ele, então cabe se apresentar.

  // Nome usado quando o Módulo 6 não está carregado (a mensagem continua
  // saindo, só sem saber quem está logado). Com ele carregado, o nome vem
  // de ctx.nomeNegociador, derivado do usuário logado no CRM.
  const NOME_NEGOCIADOR_PADRAO = 'Isaac';

  // PEDIDO DO USUÁRIO: o nome sai do negociador logado, não mais fixo no
  // código -- CONFIRMADO que a parte antes do ponto no código do CRM é o
  // primeiro nome ("BIANCA.03665" -> "Bianca").
  //
  // Sem artigo antes do nome ("Sou Isaac", não "Sou o Isaac") de propósito:
  // o artigo depende do gênero da pessoa, que o código não tem como saber a
  // partir do nome -- "Sou o Bianca" sairia errado. Sem artigo funciona pra
  // qualquer nome.
  function montarApresentacao() {
    const nome = window.__contextoAdicional?.nomeNegociador || NOME_NEGOCIADOR_PADRAO;
    return `Sou ${nome} do financeiro da Tex Cotton referente as marcas Animê, Bimbi, Youccie, Authoria e Momi`;
  }

  function obterLinhaApresentacao() {
    const ctx = window.__contextoAdicional;
    if (!ctx) return '';
    if (!ctx.contatoAntigo && !ctx.nuncaContatadoPorMim) return '';
    return montarApresentacao();
  }

  // CONFIRMADO com o usuário (substituiu a linha "Notamos que a empresa
  // X..." de uma versão anterior, que ficava ruim na mensagem): quando há
  // outra razão do grupo com saldo vencido, a frase do relatório fala "de
  // cada razão social" em vez de citar nome/valor específico. Lê
  // window.__alertaGrupo (Módulo 5) -- precisa dele carregado ANTES deste
  // arquivo.
  function temOutraRazaoComVencido() {
    const grupo = window.__alertaGrupo;
    return !!(grupo && grupo.empresasComVencido && grupo.empresasComVencido.length > 0);
  }

  function obterLinhaContatoRecente() {
    const ctx = window.__contextoAdicional;
    if (!ctx || !ctx.contatoRecente) return '';

    // CONFIRMADO com o usuário (bug real, 2 rodadas): "ainda não obtivemos
    // retorno" fica errado sempre que o último contato resultou numa
    // promessa -- independente do status ATUAL dela. ctx.promessa só cobre
    // promessa ainda ativa (pendente/quebrada/parcial); se a promessa do
    // último contato já foi paga/resolvida, ctx.promessa vem null mas o
    // cliente CONTINUA tendo retornado naquele contato -- daí
    // houvePromessaNoUltimoContato (Módulo 6), que checa qualquer promessa
    // datada pro mesmo dia do último contato, sem olhar status.
    // CORRIGIDO (mesma lógica, achado ao implementar o agradecimento de
    // pagamento): um título que sumiu desde a última visita (pago sem
    // nenhuma promessa associada) também É retorno do cliente -- dizer
    // "ainda não obtivemos retorno" bem ao lado de um agradecimento de
    // pagamento seria contraditório na mesma mensagem.
    if (ctx.promessa || ctx.houvePromessaNoUltimoContato || ctx.houveTituloPagoDesdeUltimaVisita) return '';

    // BUG REAL (achado na revisão de código, CONFIRMADO com o usuário):
    // quando OUTRO negociador falou com o cliente ontem e eu nunca falei, a
    // mensagem saía se apresentando ("Sou o Isaac do financeiro...") E
    // dizendo "Retomando o contato de ontem" ao mesmo tempo -- me apresento
    // como se fosse a primeira vez e cobro continuidade de uma conversa que
    // não foi minha, na mesma mensagem. Decisão do usuário: nesse caso vale
    // a apresentação, e o contato de ontem (de outra pessoa) não é citado.
    //
    // Isso NÃO acontecia antes de nuncaContatadoPorMim existir porque
    // contatoAntigo (contato mais recente ANTES da data de corte) e
    // contatoRecente (contato mais recente ONTEM) são mutuamente
    // exclusivos por construção -- a flag nova é ortogonal à data, então
    // precisa desta exclusão explícita.
    if (ctx.nuncaContatadoPorMim) return '';

    // REVERTIDO (confirmado com o usuário): a variação de 3 níveis puxava
    // datas velhas demais, sem relação com a cobrança atual -- volta a
    // valer só quando o contato mais recente foi EXATAMENTE o dia útil
    // anterior (garantido pelo Módulo 6 agora -- se não for, contatoRecente
    // nem vem preenchido). "Ontem" só quando é literalmente verdade (dia
    // útil anterior = dia de calendário anterior); senão, nome do dia da
    // semana (ex.: hoje é segunda, contato foi sexta).
    const { ehOntemLiteral, diaSemanaTexto } = ctx.contatoRecente;
    const referencia = ehOntemLiteral ? 'ontem' : diaSemanaTexto;
    return frase(FRASES.retomada).replace('{{referencia}}', referencia);
  }

  // NOVO (achado da revisão contra a skill cobrança-digna: reconhecer o
  // pagamento antes de cobrar o resto gera mais cooperação -- princípio de
  // reciprocidade -- do que só mandar a lista atualizada sem comentário).
  // Só agradece dentro da MESMA janela que o resto do recontato já usa --
  // contato mais recente exatamente no dia útil anterior (ctx.contatoRecente
  // só vem preenchido nesse caso, ver Módulo 6) -- pra não abrir uma janela
  // de tempo nova e inconsistente com o resto da régua.
  // Fica de fora quando há promessa ativa (ctx.promessa) porque a própria
  // linha de promessa (QUEBRADA/PARCIAL/DIA_DA_PROMESSA) já comenta o
  // pagamento daquele título -- agradecer de novo aqui duplicaria o assunto
  // e deixaria a mensagem maior do que precisa.
  function obterLinhaAgradecimentoPagamento() {
    const ctx = window.__contextoAdicional;
    if (!ctx || !ctx.contatoRecente || !ctx.houveTituloPagoDesdeUltimaVisita) return '';
    if (ctx.promessa) return '';

    const titulos = ctx.titulosPagosDesdeUltimaVisita || [];
    if (titulos.length === 0) return 'Recebemos a baixa de um dos títulos em aberto, obrigado!';
    const titulosTexto = titulos.join(', ');
    return titulos.length > 1
      ? `Recebemos a baixa dos títulos ${titulosTexto}, obrigado!`
      : `Recebemos a baixa do título ${titulosTexto}, obrigado!`;
  }

  /**
   * Converte "dd/mm/aaaa" para Date, na MESMA convenção de horário que todo
   * o resto do sistema (meio-dia, via normalizarData do Módulo 0).
   *
   * BUG REAL (achado em revisão): esta função construía a data à MEIA-NOITE
   * enquanto o Módulo 6 normaliza contatoRecente.data ao MEIO-DIA. As 12h de
   * diferença anulavam silenciosamente a correção do ">=" em
   * deveOmitirRelatorio -- um título vencido EXATAMENTE na data do último
   * contato comparava 00:00 >= 12:00 (false) e deixava de contar como
   * título novo, omitindo o relatório justo no dia em que apareceu dívida
   * nova. É exatamente o risco que o cabeçalho do Módulo 0 documenta
   * ("nunca meia-noite, sob risco de comparações inconsistentes entre
   * módulos").
   *
   * @param {string} texto Data no formato "dd/mm/aaaa".
   * @returns {Date|null} Data ao meio-dia, ou null se o texto não bater no formato.
   */
  function converterDataBrParaDate(texto) {
    const m = (texto || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!m) return null;
    return normalizarData(new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1])));
  }

  // CONFIRMADO com o usuário (bug real): recontato em dias seguidos sem
  // nenhum título NOVO ter vencido desde o último contato não deve
  // reenviar o relatório -- o cliente já viu a mesma informação. Compara
  // a data de vencimento de cada título com a data do contato mais
  // recente (só disponível quando o contato foi no dia útil anterior --
  // ver calcularContextoContato no Módulo 6).
  function deveOmitirRelatorio(dados) {
    const ctx = window.__contextoAdicional;
    if (!ctx || !ctx.contatoRecente || !ctx.contatoRecente.data) return false;

    // CONFIRMADO com o usuário: título que SUMIU da lista desde a última
    // visita (bem provavelmente pago) também é informação nova -- não só
    // título que apareceu. houveTituloPagoDesdeUltimaVisita vem do Módulo
    // 6 (retrato salvo no localStorage, por CNPJ -- não há como ler a
    // data de pagamento direto do CRM sem trocar o filtro visível da
    // tabela).
    if (ctx.houveTituloPagoDesdeUltimaVisita) return false;

    // MELHORIA (confirmada pelo usuário): se o contato de ontem já foi,
    // ele próprio, um recontato (o relatório provavelmente já tinha sido
    // omitido ontem também -- ver recontatoConsecutivo no Módulo 6), hoje
    // não repete a omissão por 2+ dias seguidos -- volta a enviar o
    // relatório atualizado, mesmo sem título novo.
    if (ctx.contatoRecente.recontatoConsecutivo) return false;

    const dataUltimoContato = ctx.contatoRecente.data;
    // CORREÇÃO (bug real, confirmado pelo usuário): comparação era ">" --
    // um título só entra em "registros" a partir de 1 dia de atraso (ver
    // DIAS_ATRASO_MIN no Módulo 1), ou seja, um título com vencimento
    // IGUAL à data do último contato ainda não estava atrasado (e por
    // isso não aparecia) NAQUELE dia -- só passou a aparecer no dia
    // seguinte. ">" tratava esse caso como "não é novo" por engano, por
    // vencimento e contato caírem na mesma data. ">=" reconhece
    // corretamente como novo.
    const temTituloNovo = dados.registros.some((r) => {
      const vencimento = converterDataBrParaDate(r.vencimentoTexto);
      return vencimento && vencimento.getTime() >= dataUltimoContato.getTime();
    });
    return !temTituloNovo;
  }

  // Concorda "do/dos" ou "ao/aos" + "título/títulos" com a quantidade real,
  // em vez do "(s)" genérico (ex.: "do(s) título(s)") que ficava estranho
  // tanto no singular quanto no plural.
  const FORMAS_CONCORDANCIA_TITULO = Object.freeze({
    do: ['do título', 'dos títulos'],
    ao: ['ao título', 'aos títulos'],
  });

  /**
   * Concorda preposição + "título" com a quantidade real, em vez do "(s)"
   * genérico (ex.: "do(s) título(s)"), que ficava estranho nos dois números.
   *
   * Preposição desconhecida devolve uma forma neutra em vez de estourar --
   * antes, `const [a, b] = formas[preposicao]` lançava TypeError e derrubava
   * a montagem da mensagem inteira na primeira frase nova que usasse outra
   * preposição.
   *
   * @param {'do'|'ao'} preposicao
   * @param {number} quantidade
   * @returns {string}
   */
  function concordarTitulos(preposicao, quantidade) {
    const formas = FORMAS_CONCORDANCIA_TITULO[preposicao];
    if (!formas) {
      console.warn(`[Atalhos] Preposição "${preposicao}" não tem forma de concordância definida -- usando forma neutra.`);
      return pluralizarTitulo(quantidade);
    }
    const [singular, plural] = formas;
    return quantidade === 1 ? singular : plural;
  }

  function pluralizarTitulo(quantidade) {
    return quantidade === 1 ? 'título' : 'títulos';
  }

  function obterLinhaPromessa() {
    const ctx = window.__contextoAdicional;
    if (!ctx || !ctx.promessa) return '';

    const { tipo, promessa } = ctx.promessa;
    const titulosTexto = promessa.titulos.join(', ');

    switch (tipo) {
      case 'DIA_DA_PROMESSA':
        return `Lembramos que hoje é o dia combinado para o pagamento ${concordarTitulos('do', promessa.titulos.length)} ${titulosTexto}.`;
      case 'QUEBRADA':
        return (
          `Notamos que o pagamento combinado para ${encurtarData(promessa.dataPrometidaTexto)}, referente ${concordarTitulos('ao', promessa.titulos.length)} ` +
          `${titulosTexto}, não foi identificado. Já foi realizado? Se sim, pode nos enviar o comprovante para conferência.`
        );
      case 'PARCIAL': {
        const pendentes =
          typeof ctx.calcularTitulosPendentes === 'function'
            ? ctx.calcularTitulosPendentes(promessa.titulos)
            : promessa.titulos;
        const pendentesTexto = pendentes.length > 0 ? pendentes.join(', ') : 'nenhum -- já regularizado';
        return (
          `Identificamos o pagamento parcial referente ao combinado para ${encurtarData(promessa.dataPrometidaTexto)}, totalizando ` +
          `${promessa.titulos.length} ${pluralizarTitulo(promessa.titulos.length)}. Ainda restam em aberto: ${pendentesTexto}.`
        );
      }
      default:
        return '';
    }
  }

  /**
   * Mensagem de primeiro contato: cliente sem NENHUM registro na aba
   * Contatos. Só se identifica e confirma o responsável -- relatório,
   * situação do título e promessa não fazem sentido antes desse passo.
   *
   * @param {object} dados Retorno de window.__avisoCobranca.simular().
   * @returns {string} Mensagem pronta, com as variáveis já substituídas.
   */
  function montarMensagemPrimeiroContato(dados) {
    const texto = [
      '{{saudacao}}',
      '',
      montarApresentacao(),
      'Este é o contato responsável pela razão social {{cliente_nome}}?',
    ].join('\n');
    return substituirVariaveisDaFrase(texto, dados);
  }

  /**
   * Junta, numa frase só, tudo que descreve a SITUAÇÃO dos títulos: a linha
   * do título representativo mais as complementares de cartório e SCPC,
   * quando esses títulos existem sem ter sido o escolhido.
   *
   * @returns {string|null} Frase montada, ou null quando a situação do
   *   título escolhido não deve gerar mensagem automática.
   */
  function montarLinhaSituacao(escolhido, dados, omitirRelatorio) {
    const linhaContexto = obterLinhaContexto(escolhido, dados, omitirRelatorio);
    if (linhaContexto === null) return null;

    // Complementam (não substituem) a linha principal -- ver
    // obterLinhaEmCartorioAdicional e obterLinhaNegativadoScpcAdicional.
    return [
      linhaContexto,
      obterLinhaEmCartorioAdicional(escolhido, dados, omitirRelatorio),
      obterLinhaNegativadoScpcAdicional(escolhido, dados),
    ]
      .filter(Boolean)
      .join(' ');
  }

  /**
   * Bloco de contexto da conversa (apresentação, agradecimento de pagamento,
   * retomada de contato e promessa), uma linha por assunto. Cada função
   * decide sozinha se tem algo a dizer; aqui só empilhamos o que sobrou.
   *
   * @returns {string} Linhas separadas por quebra simples, ou string vazia.
   */
  function montarBlocoContexto() {
    return [
      obterLinhaApresentacao(),
      obterLinhaAgradecimentoPagamento(),
      obterLinhaContatoRecente(),
      obterLinhaPromessa(),
    ]
      .filter(Boolean)
      .join('\n');
  }

  // CONFIRMADO com o usuário: com 2+ razões com saldo vencido, a frase fala
  // de "cada razão social" em vez de citar a específica -- e é frase fechada,
  // não um lead-in com ":" pra uma linha só.
  function montarLinhaRelatorio() {
    return temOutraRazaoComVencido()
      ? 'Segue o relatório atualizado com os débitos em aberto de cada razão social.'
      : 'Segue o relatório atualizado do débito em aberto na razão social {{cliente_nome}}:';
  }

  /**
   * Decide se a pergunta final entra na mensagem.
   *
   * BUG REAL achado via teste combinatório: a versão antiga usava
   * `!omitirRelatorio || !temConteudoAcionavel`, e por isso a pergunta sumia
   * sempre que o relatório era omitido E havia linha de contexto -- ou seja,
   * justamente nas situações mais graves (ULTIMO_DIA, EM_CARTORIO,
   * NEGATIVADO_SCPC), cuja linha nunca é vazia. A mensagem virava um aviso
   * solto, sem nenhum pedido de ação. O critério certo não é "já existe
   * conteúdo", é "esse conteúdo já pede alguma coisa" -- só a promessa
   * QUEBRADA embute isso ("Já foi realizado?...").
   */
  function precisaDePerguntaFinal(linhaSituacao, blocoContexto) {
    return !/\?/.test(linhaSituacao) && !/\?/.test(blocoContexto);
  }

  /**
   * Decide se o relatório entra, respeitando a omissão por recontato.
   *
   * CORRIGIDO (bateria de cobrança digna): blocoContexto e linhaSituacao
   * podem ficar os dois vazios ao mesmo tempo (ex.: EM_ATRASO + recontato sem
   * título novo + sem promessa ativa + promessa do último contato já
   * resolvida). Sem relatório e sem nenhuma dessas linhas, sobrava só
   * saudação + pergunta genérica, sem citar título, valor nem situação -- o
   * cliente não tinha como saber do que se tratava. Nesse caso o relatório
   * volta, mesmo com omitirRelatorio=true: é a única âncora que resta.
   */
  function precisaDoRelatorio(omitirRelatorio, linhaSituacao, blocoContexto) {
    const semNenhumaAncora = !blocoContexto && !linhaSituacao;
    return !omitirRelatorio || semNenhumaAncora;
  }

  /**
   * Monta a mensagem personalizada do Alt+A pra situação real do cliente.
   *
   * @param {object} dados Retorno de window.__avisoCobranca.simular().
   * @returns {string|null} Mensagem pronta, ou null quando não deve haver
   *   mensagem automática (sem título vencido, ou situação incerta demais --
   *   nos dois casos o motivo vai pro console).
   */
  function montarMensagemPersonalizada(dados) {
    const ctx = window.__contextoAdicional;

    if (ctx?.semContatoAnterior) {
      return montarMensagemPrimeiroContato(dados);
    }

    const escolhido = escolherTituloRepresentativo(dados);
    if (!escolhido) {
      console.warn('[Atalhos] Nenhum título vencido encontrado para este cliente -- mensagem personalizada não gerada.');
      return null;
    }

    // Precisa vir ANTES de montarLinhaSituacao: a linha de situação muda de
    // texto quando não há relatório ("grifado no relatório abaixo" deixa de
    // fazer sentido e volta a citar a data).
    const omitirRelatorio = deveOmitirRelatorio(dados);

    const linhaSituacao = montarLinhaSituacao(escolhido, dados, omitirRelatorio);
    if (linhaSituacao === null) {
      console.warn(
        `[Atalhos] Situação "${escolhido.situacaoKey}" não gera mensagem automática (situação incerta demais) -- escreva manualmente.`
      );
      return null;
    }

    const blocoContexto = montarBlocoContexto();

    // Cada item vira um parágrafo (separado por linha em branco).
    const blocos = ['{{saudacao}}'];
    if (blocoContexto) blocos.push(blocoContexto);
    if (precisaDoRelatorio(omitirRelatorio, linhaSituacao, blocoContexto)) blocos.push(montarLinhaRelatorio());
    if (linhaSituacao) blocos.push(linhaSituacao);
    if (precisaDePerguntaFinal(linhaSituacao, blocoContexto)) blocos.push(obterPerguntaFinal(escolhido));

    return substituirVariaveisDaFrase(blocos.join('\n\n'), dados);
  }

  function escreverMensagemPersonalizada() {
    const dados = obterDadosParaSubstituicao();
    if (!dados) {
      console.warn('[Atalhos] Não foi possível calcular a situação do cliente -- mensagem personalizada não gerada.');
      return;
    }

    const mensagem = montarMensagemPersonalizada(dados);
    if (!mensagem) return; // aviso específico já foi ao console acima

    const caixa = encontrarCaixaDeObservacoes();
    if (!caixa) {
      console.warn(
        `[Atalhos] Não encontrei a caixa de observações (#${CONFIG_ATALHOS.ID_CAIXA_OBSERVACOES}) pra escrever a mensagem personalizada.`
      );
      return;
    }

    definirValorControlado(caixa, mensagem);
    dispararEventosDeMudanca(caixa);
    console.log('[Atalhos] Mensagem personalizada escrita na caixa de observações.');
  }

  async function acionarAtendimentoRapido() {
    // Passo 0 (se houver outra razão do grupo com saldo vencido): gera o
    // relatório de cada uma em aba de fundo antes de seguir com o resto --
    // ver gerarRelatoriosDasOutrasRazoes acima. Sem outra razão, resolve
    // na hora e o fluxo segue exatamente como antes.
    await gerarRelatoriosDasOutrasRazoes();

    const ctx = window.__contextoAdicional;
    const semRelatorio = !!(ctx && ctx.semContatoAnterior);

    function abrirContatoEEscrever() {
      // Passo 2: abre a tela de contato (mesma ação do Alt+C). Pára aqui se
      // não achou o botão -- não faz sentido tentar escrever depois.
      const contatoAbriu = acionarAbrirContato();
      if (!contatoAbriu) return;

      setTimeout(() => {
        // Passo 3: monta a mensagem personalizada (situação do cliente +
        // variáveis) e escreve na caixa -- para aí, igual ao fluxo manual,
        // pra revisão antes do Alt+S.
        escreverMensagemPersonalizada();
        liberarFocoInvoluntario();
      }, CONFIG_ATALHOS.ATRASO_ATENDIMENTO_RAPIDO_MS);
    }

    if (semRelatorio) {
      // Mensagem de primeiro contato não menciona relatório -- pula direto
      // pro passo 2, sem gerar nada.
      abrirContatoEEscrever();
      return;
    }

    // Passo 1: gera o relatório (mesma ação do Alt+R).
    //
    // BUG REAL (intermitente, relatado pelo usuário): aqui havia uma espera
    // FIXA de 150ms antes de abrir a tela de contato. Mas a geração é
    // assíncrona e pode demorar segundos -- o html2canvas é baixado de um
    // CDN no momento do clique. Com a biblioteca fria, o modal de contato
    // abria POR CIMA da página enquanto a captura ainda estava rodando, e o
    // relatório saía errado ou falhava. Com ela quente, dava tempo -- por
    // isso falhava "às vezes".
    //
    // Agora espera o SINAL real de término, a mesma técnica que as abas de
    // fundo já usavam: o Módulo 1 desabilita o botão no início de aoClicar()
    // e só reabilita no finally, depois que captura, cópia e download
    // terminaram. O teto de tempo evita travar o Alt+A se algo der errado
    // lá dentro.
    const botaoRelatorio = acionarGerarRelatorio();

    if (!botaoRelatorio) {
      // Sem botão, não há o que esperar -- segue com o resto do Alt+A pra
      // não perder a mensagem por causa do relatório.
      setTimeout(abrirContatoEEscrever, CONFIG_ATALHOS.ATRASO_ATENDIMENTO_RAPIDO_MS);
      return;
    }

    const terminou = await esperarCondicaoNaJanela(
      () => botaoRelatorio.disabled === false,
      window,
      CONFIG_ATALHOS.TIMEOUT_AGUARDAR_RELATORIO_PRONTO_MS,
      CONFIG_ATALHOS.INTERVALO_POLL_OUTRA_RAZAO_MS
    );
    if (!terminou) {
      console.warn(
        '[Atalhos] O relatório não confirmou término a tempo -- seguindo com a tela de contato mesmo assim.'
      );
    }

    abrirContatoEEscrever();
  }

  /* ---------------------------------------------------------------------
   * 3.0d COPIAR A MENSAGEM PRA ÁREA DE TRANSFERÊNCIA (Alt+S)
   * -----------------------------------------------------------------
   * HISTÓRICO: chegamos a forçar web.whatsapp.com (em vez do link wa.me
   * de abrirWhatsAppCliente(), que aciona o app desktop e perde o texto
   * nesse handoff) e, depois, a abrir mensagens em aba separada uma a
   * uma -- CONFIRMADO com o usuário: reverter as duas coisas, ele
   * prefere que o Alt+S continue abrindo o APP DESKTOP (como
   * abrirWhatsAppCliente() já faz por conta própria, sem mexer na URL).
   * Fica só a rede de segurança abaixo: copia a mensagem pra área de
   * transferência, então se o app abrir sem o texto (o handoff
   * ocasionalmente perde), um Ctrl+V resolve sem precisar achar/cortar
   * da caixa de observações.
   * --------------------------------------------------------------------- */
  function instalarCorrecaoTextoWhatsApp() {
    const caixa = encontrarCaixaDeObservacoes();
    const mensagem = caixa ? caixa.value.trim() : '';
    if (!mensagem) return; // nada pra copiar -- deixa o fluxo normal (e o aviso de erro dele) seguir

    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      navigator.clipboard.writeText(mensagem).catch((erro) => {
        console.warn('[Atalhos] Não consegui copiar a mensagem pra área de transferência automaticamente:', erro);
      });
    }
  }

  function acionarRegistrarEEnviar() {
    instalarCorrecaoTextoWhatsApp();

    // CORREÇÃO (revisão de arquitetura, item C1): antes, o avanço da fila
    // só acontecia se o clique simulado abaixo disparasse um evento real de
    // DOM que borbulhasse até o listener do Módulo 3. Isso falha em
    // silêncio se uma estratégia de clique que NÃO dispara evento (ex.:
    // chamar onClick do React direto) for a que "vencer". Chamamos o
    // gancho explícito do Módulo 3 primeiro, ANTES do clique -- ele arma a
    // interceptação do window.open não importa qual estratégia de clique
    // seja usada a seguir. Seguro chamar mesmo se o clique real também
    // disparar o listener antigo depois (dupla chamada é protegida lá).
    if (window.filaDebug && typeof window.filaDebug.prepararEAguardarEnvio === 'function') {
      window.filaDebug.prepararEAguardarEnvio();
    }

    // Estratégia 1 (confirmada no CRM real): ID fixo do botão.
    const porId = document.getElementById(CONFIG_ATALHOS.ID_BOTAO_REGISTRAR);
    if (porId) {
      simularCliqueCompleto(porId);
      return;
    }

    // Estratégia 2 (fallback): busca por texto, caso o ID mude no futuro.
    if (!clicarBotaoPorTexto(CONFIG_ATALHOS.TEXTO_BOTAO_REGISTRAR)) {
      console.warn(
        `[Atalhos] Não encontrei o botão #${CONFIG_ATALHOS.ID_BOTAO_REGISTRAR} nem um botão com ` +
        `"${CONFIG_ATALHOS.TEXTO_BOTAO_REGISTRAR}" no texto. Confirme se a tela de contato está aberta.`
      );
    }
  }

  /* ---------------------------------------------------------------------
   * 3.4 SELECIONAR PRIMEIRA FRASE PADRÃO
   * -----------------------------------------------------------------
   * Cobre o caso mais comum (um <select> de frases). Se a tela de contato
   * usar uma LISTA de itens clicáveis em vez de dropdown, este atalho vai
   * avisar no console — me diga o formato real que eu ajusto.
   * --------------------------------------------------------------------- */
  function definirValorControlado(elemento, valor) {
    // Setar .value direto não dispara o onChange interno de campos
    // controlados por frameworks tipo React. Usar o "setter nativo" contorna
    // isso e funciona igual em campos não controlados também.
    // IMPORTANTE: <textarea> tem seu próprio prototype (HTMLTextAreaElement),
    // diferente de <input> (HTMLInputElement) — usar o errado faz o setter
    // não ser encontrado e o valor não "colar" de verdade em React.
    let proto;
    if (elemento.tagName === 'SELECT') {
      proto = window.HTMLSelectElement.prototype;
    } else if (elemento.tagName === 'TEXTAREA') {
      proto = window.HTMLTextAreaElement.prototype;
    } else {
      proto = window.HTMLInputElement.prototype;
    }
    const descritor = Object.getOwnPropertyDescriptor(proto, 'value');
    if (descritor && descritor.set) {
      descritor.set.call(elemento, valor);
    } else {
      elemento.value = valor;
    }
  }

  function dispararEventosDeMudanca(elemento) {
    elemento.dispatchEvent(new Event('input', { bubbles: true }));
    elemento.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function encontrarSelectDeFrase() {
    // Estratégia 1: select cujo id/name/aria-label sugira "frase" ou "mensagem".
    const porAtributo = document.querySelector(
      'select[id*="frase" i], select[name*="frase" i], select[aria-label*="frase" i], ' +
      'select[id*="mensagem" i], select[name*="mensagem" i], select[aria-label*="mensagem" i]'
    );
    if (porAtributo) return porAtributo;

    // Estratégia 2: <label> com texto "frase" -> pega o select associado.
    const labelFrase = Array.from(document.querySelectorAll('label')).find((l) =>
      (l.textContent || '').toLowerCase().includes('frase')
    );
    if (labelFrase) {
      if (labelFrase.htmlFor) {
        const el = document.getElementById(labelFrase.htmlFor);
        if (el && el.tagName === 'SELECT') return el;
      }
      const selectProximo = labelFrase.parentElement ? labelFrase.parentElement.querySelector('select') : null;
      if (selectProximo) return selectProximo;
    }

    return null;
  }

  function selecionarPrimeiraOpcaoValida(select) {
    const opcaoValida = Array.from(select.options).find((op) => {
      const texto = (op.textContent || '').trim().toLowerCase();
      const vazio = !op.value || texto === '' || texto.includes('selecione') || texto.includes('escolha');
      return !vazio;
    });
    if (!opcaoValida) return false;

    definirValorControlado(select, opcaoValida.value);
    select.selectedIndex = opcaoValida.index;
    dispararEventosDeMudanca(select);
    return true;
  }

  function encontrarCaixaDeObservacoes() {
    // Estratégia 1 (confirmada no CRM real): ID fixo da caixa.
    const porId = document.getElementById(CONFIG_ATALHOS.ID_CAIXA_OBSERVACOES);
    if (porId) return porId;

    // Estratégia 2 (fallback): campo cujo id/name/placeholder sugira "observa".
    const porAtributo = document.querySelector(
      'textarea[id*="observa" i], textarea[name*="observa" i], textarea[placeholder*="observa" i]'
    );
    if (porAtributo) return porAtributo;

    // Estratégia 3: <label> com texto "observa" -> textarea associado.
    const labelObs = Array.from(document.querySelectorAll('label')).find((l) =>
      (l.textContent || '').toLowerCase().includes('observa')
    );
    if (labelObs) {
      if (labelObs.htmlFor) {
        const el = document.getElementById(labelObs.htmlFor);
        if (el && el.tagName === 'TEXTAREA') return el;
      }
      const proximo = labelObs.parentElement ? labelObs.parentElement.querySelector('textarea') : null;
      if (proximo) return proximo;
    }

    // Estratégia 4 (último recurso): se só existe UM textarea visível agora.
    const textareasVisiveis = Array.from(document.querySelectorAll('textarea')).filter(elementoVisivel);
    if (textareasVisiveis.length === 1) return textareasVisiveis[0];

    return null;
  }

  /* ---------------------------------------------------------------------
   * 3.0a SUBSTITUIÇÃO DE VARIÁVEIS {{ }} NAS FRASES PADRÃO
   * -----------------------------------------------------------------
   * Antes desta correção, o botão de frase escrevia data-texto DIRETO na
   * caixa de observações (ver comentário na função abaixo sobre por que não
   * clicamos no botão real). Isso pulava a substituição de variáveis que o
   * próprio app faria dentro do handler de clique original -- por isso
   * {{cliente_nome}} etc. apareciam literalmente na mensagem.
   *
   * Fonte de dados: window.__avisoCobranca.simular() (Módulo 1), já
   * calculado pra classificação de títulos -- não duplicamos lógica aqui.
   *
   * Variáveis SEM resolvedor (ex.: {{responsavel_nome}}, {{chave_pix}},
   * {{valor_protestado_atualizado}} -- decisão consciente, não são dado que
   * o CRM expõe automaticamente) ficam com o {{...}} visível na própria
   * caixa de texto e geram aviso no console, em vez de tentar adivinhar um
   * valor. Isso vale também pra qualquer variável nova que apareça em frase
   * futura antes de alguém adicionar o resolvedor correspondente aqui --
   * fica visível, nunca falha em silêncio.
   * --------------------------------------------------------------------- */
  // Datas em mensagem pro cliente ficam mais naturais sem o ano (mesmo
  // padrão que o próprio usuário já usa nas frases reais dele, ex.: "vencido
  // em 04/09"). Se o texto não bater no formato esperado, devolve como veio
  // em vez de arriscar cortar errado.
  function encurtarData(textoData) {
    const m = (textoData || '').match(/^(\d{2}\/\d{2})\/\d{4}$/);
    return m ? m[1] : (textoData || '');
  }

  function converterMoedaBrParaNumero(texto) {
    if (!texto) return null;
    // Formato esperado: "R$ 1.234,56" -- remove tudo que não é dígito/vírgula/
    // ponto/sinal, tira separador de milhar (.), troca vírgula decimal por ponto.
    const limpo = String(texto)
      .replace(/[^\d,.-]/g, '')
      .replace(/\./g, '')
      .replace(',', '.');
    const numero = parseFloat(limpo);
    return Number.isFinite(numero) ? numero : null;
  }

  function formatarMoedaBr(numero) {
    return numero.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function obterDadosParaSubstituicao() {
    if (!window.__avisoCobranca || typeof window.__avisoCobranca.simular !== 'function') {
      console.warn('[Atalhos] Módulo de Aviso de Cobrança (Módulo 1) indisponível -- variáveis da frase não serão substituídas.');
      return null;
    }
    try {
      return window.__avisoCobranca.simular();
    } catch (erro) {
      console.warn('[Atalhos] Não foi possível calcular os dados do cliente para substituir variáveis:', erro.message);
      return null;
    }
  }

  // Cada resolvedor recebe o retorno de simular() ({registros, fluxo, scpc,
  // ignorados, divergentes}) e devolve a string pronta pra entrar na frase,
  // ou null/undefined se não conseguir. Adicionar variável nova = adicionar
  // uma linha aqui, sem mexer no resto da lógica de substituição.
  const RESOLVEDORES_VARIAVEL = {
    cliente_nome: (dados) => {
      const primeiro = dados.registros[0];
      return primeiro ? primeiro.razaoSocial : null;
    },
    quantidade_titulos_vencidos: (dados) => String(dados.registros.length),
    quantidade_titulos_protestados: (dados) =>
      String(dados.registros.filter((r) => r.situacaoKey === 'EM_CARTORIO').length),
    // CORRIGIDO (achado de revisão): antes, um saldo que o parser não
    // entendesse virava 0 em silêncio (`acumulado + (valor || 0)`) e a soma
    // saía errada -- no limite, "R$ 0,00" na mensagem do cliente. E como a
    // string não é vazia, nem entrava no aviso de "variável não preenchida".
    // Era o único ponto do sistema em que um valor financeiro ERRADO chegava
    // ao cliente sem nenhum sinal. Agora, se QUALQUER saldo não for
    // entendido, a variável não é resolvida: o {{valor_total_vencido}} fica
    // visível na caixa e o aviso do console aponta o problema -- mesmo
    // critério de "falhar à vista, nunca em silêncio" que o resto do módulo
    // já segue.
    valor_total_vencido: (dados) => {
      let soma = 0;
      for (const r of dados.registros) {
        const valor = converterMoedaBrParaNumero(r.saldoTexto);
        if (valor === null) {
          console.warn(
            `[Atalhos] Não consegui interpretar o saldo "${r.saldoTexto}" do título ${r.tituloCompleto} -- ` +
            'total não será preenchido automaticamente pra não enviar valor errado.'
          );
          return null;
        }
        soma += valor;
      }
      return formatarMoedaBr(soma);
    },
    // Saudação por horário do relógio -- usada na mensagem personalizada do
    // Alt+A. Não depende de dados do cliente, só ignora o parâmetro.
    saudacao: () => {
      const hora = new Date().getHours();
      if (hora < 12) return 'Bom dia, tudo bem?';
      if (hora < 18) return 'Boa tarde, tudo bem?';
      return 'Boa noite, tudo bem?';
    },
    // Data de vencimento do título "representativo" do cliente -- mesmo
    // título escolhido por escolherTituloRepresentativo() (ver seção 3.0b).
    data_vencimento: (dados) => {
      const escolhido = escolherTituloRepresentativo(dados);
      return escolhido ? encurtarData(escolhido.vencimentoTexto) : null;
    },
  };

  function substituirVariaveisDaFrase(texto, dadosPreCalculados) {
    if (!texto || texto.indexOf('{{') === -1) {
      return texto; // frase sem variável -- maioria dos casos, sai rápido
    }

    const dados = dadosPreCalculados || obterDadosParaSubstituicao();
    const naoResolvidas = [];

    const resultado = texto.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (trechoOriginal, nomeVariavel) => {
      const resolvedor = RESOLVEDORES_VARIAVEL[nomeVariavel];
      if (!resolvedor || !dados) {
        naoResolvidas.push(nomeVariavel);
        return trechoOriginal; // deixa "{{nomeVariavel}}" visível na caixa
      }
      try {
        const valor = resolvedor(dados);
        if (valor === null || valor === undefined || valor === '') {
          naoResolvidas.push(nomeVariavel);
          return trechoOriginal;
        }
        return valor;
      } catch (erro) {
        console.warn(`[Atalhos] Erro ao calcular a variável "${nomeVariavel}":`, erro.message);
        naoResolvidas.push(nomeVariavel);
        return trechoOriginal;
      }
    });

    if (naoResolvidas.length > 0) {
      console.warn(
        `[Atalhos] Variável(is) não preenchida(s) automaticamente -- confira a mensagem antes de enviar (Alt+S): ${naoResolvidas.join(', ')}`
      );
    }

    return resultado;
  }

  function acionarSelecionarPrimeiraFrase() {
    // Estratégia 1 (confirmada no CRM real): botões ".btn-inserir-frase".
    // A ordem muda com o tempo (o mais recente/favoritado vem primeiro),
    // então a regra é sempre "o primeiro visível no momento do atalho".
    const botoesDeFrase = Array.from(
      document.querySelectorAll(CONFIG_ATALHOS.SELETOR_BOTAO_FRASE)
    ).filter(elementoVisivel);

    if (botoesDeFrase.length > 0) {
      const botao = botoesDeFrase[0];
      const textoOriginal = botao.dataset ? botao.dataset.texto : null;

      if (!textoOriginal) {
        console.warn('[Atalhos] O botão de frase não tem o atributo data-texto esperado.');
        return;
      }

      // CORREÇÃO (bug reportado): antes o texto ia direto pra caixa, sem
      // substituir {{cliente_nome}} etc. -- ver seção 3.0a acima.
      const texto = substituirVariaveisDaFrase(textoOriginal);

      // IMPORTANTE: propositalmente NÃO clicamos no botão da frase. O clique
      // real aciona uma lógica do próprio app que foca a caixa de
      // observações — o que causava exatamente o travamento que resolvemos
      // agora. Em vez disso, escrevemos o texto direto na caixa (usando o
      // ID confirmado), sem nunca dar foco nela. Sem clique, sem foco,
      // sem briga de foco com o atalho seguinte.
      const caixa = encontrarCaixaDeObservacoes();
      if (caixa) {
        definirValorControlado(caixa, texto);
        dispararEventosDeMudanca(caixa);
        console.log('[Atalhos] Texto da frase escrito direto na caixa de observações (sem clicar no botão da frase).');
      } else {
        console.warn(
          `[Atalhos] Não encontrei a caixa de observações (#${CONFIG_ATALHOS.ID_CAIXA_OBSERVACOES}) pra escrever o texto da frase.`
        );
      }
      return;
    }

    // Estratégia 2 (fallback): select de frase, caso apareça em outra tela.
    const select = encontrarSelectDeFrase();
    if (select) {
      if (selecionarPrimeiraOpcaoValida(select)) return;
      console.warn('[Atalhos] Achei um <select> de frase, mas não consegui escolher uma opção válida nele (todas pareciam placeholder).');
      return;
    }

    console.warn(
      `[Atalhos] Não encontrei nenhum botão "${CONFIG_ATALHOS.SELETOR_BOTAO_FRASE}" nem um <select> de frase. ` +
      'Confirme se a tela de contato está aberta antes de usar Alt+F.'
    );
  }

  /* ---------------------------------------------------------------------
   * 3.2 BUSCA RÁPIDA (Alt+B) — pula direto pra um cliente por nome/CNPJ
   * -----------------------------------------------------------------
   * A URL da lista já aceita ?search=... (confirmado: /crm/clientes?
   * search=&negociador=ANA.01574&filtroScpc=). Preservamos os outros
   * parâmetros que já estiverem na URL atual (negociador, filtroScpc etc.)
   * e só trocamos/adicionamos o "search".
   * --------------------------------------------------------------------- */
  let overlayBuscaEl = null;

  function buscarCliente(termo) {
    const alvo = (termo || '').trim();
    if (!alvo) return;

    const params = new URLSearchParams(location.search);
    params.set('search', alvo);

    window.location.href = `${location.origin}/crm/clientes?${params.toString()}`;
  }

  function fecharBuscaRapida() {
    if (overlayBuscaEl) {
      overlayBuscaEl.remove();
      overlayBuscaEl = null;
    }
  }

  function abrirBuscaRapida() {
    if (overlayBuscaEl) {
      fecharBuscaRapida();
      return;
    }

    overlayBuscaEl = document.createElement('div');
    overlayBuscaEl.id = CONFIG_ATALHOS.ID_OVERLAY_BUSCA;
    Object.assign(overlayBuscaEl.style, {
      position: 'fixed',
      top: '0',
      left: '0',
      right: '0',
      bottom: '0',
      background: 'rgba(22, 35, 47, 0.35)',
      zIndex: 9999999,
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'center',
      paddingTop: '15vh',
      fontFamily: 'system-ui, -apple-system, sans-serif',
    });

    const caixa = document.createElement('div');
    Object.assign(caixa.style, {
      background: '#fff',
      borderRadius: '12px',
      boxShadow: '0 8px 30px rgba(0,0,0,0.3)',
      padding: '16px',
      width: '420px',
      maxWidth: '90vw',
    });

    const titulo = document.createElement('div');
    titulo.textContent = 'Buscar cliente (nome ou CNPJ)';
    Object.assign(titulo.style, {
      fontSize: '12px',
      fontWeight: '600',
      color: '#667085',
      marginBottom: '8px',
      textTransform: 'uppercase',
      letterSpacing: '.03em',
    });

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Digite e aperte Enter...';
    Object.assign(input.style, {
      width: '100%',
      boxSizing: 'border-box',
      padding: '10px 12px',
      fontSize: '15px',
      border: '1px solid #d0d5dd',
      borderRadius: '8px',
      outline: 'none',
    });

    input.addEventListener('keydown', (e) => {
      // Impede que Enter/Escape aqui dentro vazem pro listener global de
      // atalhos (senão um "Enter" poderia disparar outro atalho por engano).
      e.stopPropagation();
      if (e.key === 'Enter') {
        e.preventDefault();
        buscarCliente(input.value);
        fecharBuscaRapida();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        fecharBuscaRapida();
      }
    });

    overlayBuscaEl.addEventListener('mousedown', (e) => {
      if (e.target === overlayBuscaEl) fecharBuscaRapida(); // clicar fora fecha
    });

    caixa.appendChild(titulo);
    caixa.appendChild(input);
    overlayBuscaEl.appendChild(caixa);
    document.body.appendChild(overlayBuscaEl);

    input.focus();
  }

  /* ---------------------------------------------------------------------
   * 3.3a LOG DE ATUALIZAÇÃO (Alt+L)
   * -----------------------------------------------------------------
   * O que mudou em cada versão, em linguagem de quem USA o script -- não
   * mensagem de commit. A entrada mais recente fica em primeiro.
   *
   * MANTER ATUALIZADO a cada bump: tests/changelog.test.js FALHA se a versão
   * do topo desta lista não for a mesma de VERSAO_SMARTTABLE (Módulo 6). É
   * de propósito -- changelog que envelhece em silêncio é pior que não ter,
   * porque passa a mentir sobre o que está rodando.
   * --------------------------------------------------------------------- */
  const LOG_ATUALIZACOES = [
    {
      versao: '1.18.0', data: '18/09/2026',
      mudancas: [
        'As frases da cobrança passam a variar: cada papel tem 2 a 4 versões, escolhidas por cliente e por dia.',
        'O mesmo cliente não lê mais a mesma pergunta final todo dia -- antes 83% das mensagens terminavam igual.',
        'Dentro do mesmo dia a frase NÃO muda: apertar Alt+A duas vezes no mesmo cliente dá o mesmo texto.',
      ],
    },
    {
      versao: '1.17.0', data: '18/09/2026',
      mudancas: [
        'A classificação da fila passa a abrir 4 abas de fundo ao mesmo tempo, em vez de uma por vez: de ~4 minutos para ~1.',
        'O resultado fica guardado no dia. Alt+U monta a fila do que já foi classificado, sem revisitar ninguém.',
        'Shift+Alt+U continua refazendo tudo do zero quando você quiser.',
      ],
    },
    {
      versao: '1.16.0', data: '18/09/2026',
      mudancas: [
        'Alt+U agora CONTINUA a fila de hoje em vez de refazer tudo -- ele volta direto pro cliente onde você parou.',
        'Shift+Alt+U refaz a fila do zero, quando você quiser mesmo. Refazer já tira quem foi contatado hoje.',
        'Antes, apertar Alt+U às 14h revisitava ~140 clientes e ainda apagava a fila da manhã com a sua posição nela.',
      ],
    },
    {
      versao: '1.15.1', data: '18/09/2026',
      mudancas: [
        'Corrigido: os painéis de Ajuda, Novidades, Configurações e Entrou na semana abriam todos no mesmo canto, um por cima do outro.',
        'Agora abrir um fecha os outros -- só um painel flutuante na tela por vez.',
      ],
    },
    {
      versao: '1.15.0', data: '18/09/2026',
      mudancas: [
        'O Alt+D passa a mostrar o Total recuperado: depósitos + promessas cumpridas, por pessoa e somando os dois.',
        'As duas parcelas continuam na tela separadas, pra dar pra conferir o total contra as origens dele.',
      ],
    },
    {
      versao: '1.14.0', data: '18/09/2026',
      mudancas: [
        'O banner de grupo econômico saiu: o próprio CRM passou a avisar ("1 CNPJ do grupo vencido", na página do cliente).',
        'A detecção continua igual -- o Alt+G, a frase do relatório e a fila por prioridade não mudam em nada.',
        'O que o aviso do CRM não diz (quem e quanto) continua a uma tecla: Alt+G abre todas as razões com vencido.',
      ],
    },
    {
      versao: '1.13.0', data: '18/09/2026',
      mudancas: [
        'Novo atalho Alt+D: quanto entrou na semana vigente (sábado a sexta), seu e da Bianca, sem sair da página.',
        'Sai do dashboard consolidado do próprio CRM -- é o primeiro número financeiro que o SmartTable mostra sem inferir nada.',
        'São DOIS números: Depósitos (recuperado por negociações) e Promessas cumpridas (recuperado por promessas da cobrança). Eles não se somam.',
      ],
    },
    {
      versao: '1.12.0', data: '17/09/2026',
      mudancas: [
        'Novo atalho Alt+O: painel de configurações com interruptores, que valem na hora e ficam salvos neste navegador.',
        'Primeiro interruptor: "Enviar pelo WhatsApp Web" -- a mensagem abre em web.whatsapp.com numa aba fixa, em vez do app Desktop.',
        'Serve pra atender pela conta de outra pessoa sem desvincular a sua do app. Desligado por padrão: nada muda pra quem não mexer.',
      ],
    },
    {
      versao: '1.11.2', data: '17/09/2026',
      mudancas: [
        'Corrigido: ao FECHAR a barra de navegação rápida, o alerta de grupo não subia junto e ficava com um vão.',
      ],
    },
    {
      versao: '1.11.1', data: '17/09/2026',
      mudancas: [
        'Corrigido: o alerta de grupo econômico existia mas ficava escondido atrás da barra de navegação rápida do CRM.',
        'Ele agora se posiciona abaixo da área fixa inteira do topo, e acompanha quando você abre ou fecha essa barra.',
      ],
    },
    {
      versao: '1.11.0', data: '17/09/2026',
      mudancas: [
        'Novos window.__diag.fila() e window.__diag.grupo(): diagnósticos que já saem CENSURADOS, sem CNPJ, razão social nem valor.',
        'A exportação do diário passa a ser censurada por padrão -- o arquivo é justamente o que vira anexo de e-mail.',
      ],
    },
    {
      versao: '1.10.0', data: '17/09/2026',
      mudancas: [
        'Novo window.__conferir() no console: checa a fila, o diário e o contexto contra dado REAL e aponta o que estiver inconsistente.',
        'É a resposta aos bugs que a suíte não pegava -- eles viviam em código que abre aba de fundo e só quebra com dado de verdade.',
      ],
    },
    {
      versao: '1.9.2', data: '17/09/2026',
      mudancas: [
        'Corrigido: cada Alt+U gravava a fila DUAS vezes no diário, o que dobrava "na fila" e derrubava a taxa de contato pela metade.',
        'A análise passa a agrupar atribuições repetidas do mesmo dia -- rodar o Alt+U mais de uma vez por dia não distorce mais os números.',
      ],
    },
    {
      versao: '1.9.1', data: '17/09/2026',
      mudancas: [
        'Registrado que o 5º dia de atraso cai em "Demais dias" DE PROPÓSITO -- é a régua como foi desenhada, não uma faixa esquecida.',
      ],
    },
    {
      versao: '1.9.0', data: '17/09/2026',
      mudancas: [
        'Novo atalho Alt+L: mostra este log de atualização, com o que chegou desde a sua última leitura marcado como NOVO.',
      ],
    },
    {
      versao: '1.8.0', data: '17/09/2026',
      mudancas: [
        'A fila do Alt+U volta a sair 100% na ordem da régua -- o sorteio de posição que reordenava 1 em cada 5 clientes foi desligado.',
        'O diário continua gravando tudo; só a comparação "a ordem da régua ajuda?" fica em suspenso.',
      ],
    },
    {
      versao: '1.7.0', data: '17/09/2026',
      mudancas: [
        'Corrigido: o sorteio de posição nunca alcançava o fim da fila, o que enviesava a medição a favor da régua.',
      ],
    },
    {
      versao: '1.6.0', data: '17/09/2026',
      mudancas: [
        'Cliente que prometeu pagar HOJE não recebe mais "Podemos agendar para hoje?" -- agora pede o comprovante.',
        'Pagamento parcial passa a pedir "Consegue quitar o restante hoje?" em vez de falar do débito como se nada tivesse sido pago.',
      ],
    },
    {
      versao: '1.5.1', data: '17/09/2026',
      mudancas: [
        'Corrigido: o Alt+A às vezes não gerava o relatório. Agora ele espera a geração TERMINAR antes de abrir a tela de contato.',
        'Efeito colateral: a tela de contato abre alguns segundos depois no primeiro Alt+A do dia. É o preço de não perder o relatório.',
      ],
    },
    {
      versao: '1.5.0', data: '17/09/2026',
      mudancas: [
        'Novo diário de cobrança: registra a fila, a cobrança enviada e a baixa detectada.',
        'Veja a análise com window.__diario.relatorio() no console.',
      ],
    },
    {
      versao: '1.4.0', data: '17/09/2026',
      mudancas: [
        'Corrigido: o relatório era omitido por engano quando um título vencia no mesmo dia do último contato.',
        'Corrigido: o agradecimento de pagamento sumia se você recarregasse a página antes do Alt+A.',
        'Corrigido: um saldo ilegível virava R$ 0,00 em silêncio na mensagem. Agora a variável fica visível e avisa.',
        'Alt+B passa a fechar a própria busca rápida.',
      ],
    },
    {
      versao: '1.3.0', data: '16/09/2026',
      mudancas: [
        'As mensagens passam a se apresentar com o nome de quem está logado no CRM, não com um nome fixo no código.',
        'A régua de "nunca contatado por mim" também segue o usuário logado.',
      ],
    },
    {
      versao: '1.1.0', data: '16/09/2026',
      mudancas: [
        'Cliente já contatado por outro negociador, mas nunca por você, recebe a linha de apresentação.',
      ],
    },
  ];

  let painelNovidadesEl = null;

  /**
   * Compara duas versões semver. Devolve >0 se `a` for mais nova que `b`.
   *
   * @param {string} a @param {string} b @returns {number}
   */
  function compararVersoes(a, b) {
    const pa = String(a).split('.').map(Number);
    const pb = String(b).split('.').map(Number);
    for (let i = 0; i < 3; i += 1) {
      if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
    }
    return 0;
  }

  function lerUltimaVersaoVista() {
    try {
      return localStorage.getItem(CONFIG_ATALHOS.CHAVE_ULTIMA_VERSAO_VISTA);
    } catch (erro) {
      return null; // localStorage bloqueado -- só perde a marcação de NOVO
    }
  }

  function marcarLogComoLido() {
    try {
      localStorage.setItem(CONFIG_ATALHOS.CHAVE_ULTIMA_VERSAO_VISTA, LOG_ATUALIZACOES[0].versao);
    } catch (erro) {
      /* sem drama -- o log continua abrindo, só repete o "NOVO" da próxima vez */
    }
  }

  /**
   * Versões do log que chegaram depois da última leitura.
   * Primeira vez (nada salvo): nenhuma é marcada, senão abriria com tudo
   * piscando "NOVO", o que não informa nada.
   *
   * @returns {Set<string>}
   */
  function versoesNaoLidas() {
    const vista = lerUltimaVersaoVista();
    if (!vista) return new Set();
    return new Set(LOG_ATUALIZACOES.filter((e) => compararVersoes(e.versao, vista) > 0).map((e) => e.versao));
  }

  /**
   * Ponte pro painel do Módulo 10 (Alt+D). Mesma checagem de existência da
   * ponte do Alt+O: módulo que não carregou avisa, não derruba os outros.
   */
  function alternarPainelRecebido() {
    const painel = window.__recebidoSemana;
    if (!painel || typeof painel.alternarPainel !== 'function') {
      console.warn('[Atalhos] O Módulo 10 (recebido na semana) não carregou -- Alt+D sem efeito.');
      window.__smartTableUtil?.toast?.('Painel de recebimentos não carregou (veja o console).');
      return;
    }
    painel.alternarPainel();
  }

  /**
   * Ponte pro painel do Módulo 9 (Alt+O).
   *
   * Checa a existência em vez de assumir: se o Módulo 9 não carregar (cache
   * antigo do Tampermonkey, @require com 404), o atalho avisa e o resto dos
   * atalhos continua funcionando. É o mesmo cuidado que os outros módulos
   * tomam com as dependências entre si.
   */
  function alternarPainelConfiguracoes() {
    const painel = window.__painelConfiguracoes;
    if (!painel || typeof painel.alternarPainel !== 'function') {
      console.warn('[Atalhos] O Módulo 9 (painel de configurações) não carregou -- Alt+O sem efeito.');
      window.__smartTableUtil?.toast?.('Painel de configurações não carregou (veja o console).');
      return;
    }
    painel.alternarPainel();
  }

  function fecharPainelNovidades() {
    if (!painelNovidadesEl) return;
    painelNovidadesEl.remove();
    painelNovidadesEl = null;
  }

  function alternarPainelNovidades() {
    if (painelNovidadesEl) {
      fecharPainelNovidades();
      return;
    }
    // Só um painel flutuante nosso por vez (registrarPainel, Módulo 0).
    window.__smartTableUtil?.fecharOutrosPaineis?.('novidades');

    const naoLidas = versoesNaoLidas();

    painelNovidadesEl = document.createElement('div');
    Object.assign(painelNovidadesEl.style, {
      position: 'fixed',
      bottom: '112px',
      left: '16px',
      background: '#ffffff',
      border: '1px solid #d0d5dd',
      borderRadius: '10px',
      padding: '14px 16px',
      boxShadow: '0 4px 18px rgba(0,0,0,0.18)',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontSize: '13px',
      // Mesmo z-index do banner de grupo (Módulo 5): fica ABAIXO dos modais
      // do CRM, que usam z-50, pra nunca cortar um modal ao meio.
      zIndex: 30,
      width: '420px',
      maxWidth: '90vw',
      maxHeight: '60vh',
      overflowY: 'auto',
    });

    const titulo = document.createElement('div');
    titulo.textContent = `O que mudou — você está na v${LOG_ATUALIZACOES[0].versao}`;
    Object.assign(titulo.style, {
      color: '#16232F', fontWeight: '700', fontSize: '14px',
      marginBottom: '10px', borderBottom: '1px solid #eef2f6', paddingBottom: '6px',
      position: 'sticky', top: '0', background: '#fff',
    });
    painelNovidadesEl.appendChild(titulo);

    LOG_ATUALIZACOES.forEach((entrada) => {
      const bloco = document.createElement('div');
      bloco.style.marginBottom = '12px';

      const cabecalho = document.createElement('div');
      Object.assign(cabecalho.style, { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' });

      const versao = document.createElement('span');
      versao.textContent = `v${entrada.versao}`;
      Object.assign(versao.style, {
        fontFamily: 'ui-monospace, monospace', background: '#eef2f6', color: '#16232F',
        padding: '2px 7px', borderRadius: '5px', fontWeight: '600', fontSize: '12px',
      });
      cabecalho.appendChild(versao);

      const data = document.createElement('span');
      data.textContent = entrada.data;
      Object.assign(data.style, { color: '#98a2b3', fontSize: '11px' });
      cabecalho.appendChild(data);

      if (naoLidas.has(entrada.versao)) {
        const novo = document.createElement('span');
        novo.textContent = 'NOVO';
        Object.assign(novo.style, {
          background: '#1B6B4A', color: '#fff', padding: '1px 6px',
          borderRadius: '4px', fontSize: '10px', fontWeight: '700', letterSpacing: '.04em',
        });
        cabecalho.appendChild(novo);
      }

      bloco.appendChild(cabecalho);

      entrada.mudancas.forEach((texto) => {
        const linha = document.createElement('div');
        linha.textContent = `• ${texto}`;
        Object.assign(linha.style, { color: '#344054', lineHeight: '1.45', paddingLeft: '2px', marginTop: '2px' });
        bloco.appendChild(linha);
      });

      painelNovidadesEl.appendChild(bloco);
    });

    const dica = document.createElement('div');
    dica.textContent = 'Alt+L de novo pra fechar';
    Object.assign(dica.style, {
      marginTop: '4px', paddingTop: '6px', borderTop: '1px solid #eef2f6',
      color: '#98a2b3', fontSize: '11px', textAlign: 'center',
      position: 'sticky', bottom: '0', background: '#fff',
    });
    painelNovidadesEl.appendChild(dica);

    document.body.appendChild(painelNovidadesEl);

    // Marca como lido só DEPOIS de montar: se algo acima falhar, o "NOVO"
    // continua na próxima abertura em vez de sumir sem ter sido visto.
    marcarLogComoLido();
  }

  /* ---------------------------------------------------------------------
   * 3.3 PAINEL DE AJUDA (Alt+H) — lista visual dos atalhos, liga/desliga
   * --------------------------------------------------------------------- */
  function fecharPainelAjuda() {
    if (!painelAjudaEl) return;
    painelAjudaEl.remove();
    painelAjudaEl = null;
  }

  function alternarPainelAjuda() {
    if (painelAjudaEl) {
      fecharPainelAjuda();
      return;
    }
    window.__smartTableUtil?.fecharOutrosPaineis?.('ajuda');

    painelAjudaEl = document.createElement('div');
    Object.assign(painelAjudaEl.style, {
      position: 'fixed',
      bottom: '112px', // acima do botão "Continuar fila anterior" (Módulo 3), evita sobrepor
      left: '16px',
      background: '#ffffff',
      border: '1px solid #d0d5dd',
      borderRadius: '10px',
      padding: '14px 16px',
      boxShadow: '0 4px 18px rgba(0,0,0,0.18)',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontSize: '13px',
      zIndex: 999999,
      minWidth: '260px',
    });

    const titulo = document.createElement('div');
    titulo.textContent = 'Atalhos de teclado';
    Object.assign(titulo.style, {
      color: '#16232F',
      fontWeight: '700',
      fontSize: '14px',
      marginBottom: '8px',
      borderBottom: '1px solid #eef2f6',
      paddingBottom: '6px',
    });
    painelAjudaEl.appendChild(titulo);

    LISTA_ATALHOS.forEach((item) => {
      const linha = document.createElement('div');
      Object.assign(linha.style, {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '16px',
        padding: '4px 0',
      });

      const tecla = document.createElement('span');
      tecla.textContent = item.tecla;
      Object.assign(tecla.style, {
        fontFamily: 'ui-monospace, monospace',
        background: '#eef2f6',
        color: '#16232F',
        padding: '2px 7px',
        borderRadius: '5px',
        fontWeight: '600',
        whiteSpace: 'nowrap',
      });

      const desc = document.createElement('span');
      desc.textContent = item.descricao;
      desc.style.color = '#344054';
      desc.style.textAlign = 'right';

      linha.appendChild(tecla);
      linha.appendChild(desc);
      painelAjudaEl.appendChild(linha);
    });

    const dica = document.createElement('div');
    dica.textContent = 'Alt+H de novo pra fechar';
    Object.assign(dica.style, {
      marginTop: '8px',
      paddingTop: '6px',
      borderTop: '1px solid #eef2f6',
      color: '#98a2b3',
      fontSize: '11px',
      textAlign: 'center',
    });
    painelAjudaEl.appendChild(dica);

    document.body.appendChild(painelAjudaEl);
  }

  /* ---------------------------------------------------------------------
   * 4. LISTENER DE TECLADO
   * --------------------------------------------------------------------- */
  document.addEventListener(
    'keydown',
    function (e) {
      // EXCEÇÃO DIRIGIDA, e a única com Shift: Shift+Alt+U REFAZ a fila por
      // prioridade, enquanto Alt+U sozinho continua a de hoje.
      //
      // Precisa vir antes da guarda abaixo, que barra Shift de propósito. O
      // Shift aqui não é enfeite: refazer descarta a fila em andamento e
      // custa abrir ~140 abas de fundo. Exigir uma tecla a mais pra isso é o
      // que impede de acontecer por reflexo -- e evita um atalho novo,
      // dentro do orçamento de tela e de teclas do projeto.
      if (
        e.altKey && e.shiftKey && !e.ctrlKey && !e.metaKey && !e.repeat &&
        e.code === CONFIG_ATALHOS.TECLA_FILA_PRIORIDADE && !estaDigitando()
      ) {
        e.preventDefault();
        acionarFilaPorPrioridade({ reconstruir: true });
        return;
      }

      // Só reage a Alt sozinho (sem Ctrl/Shift/Meta), pra minimizar colisão
      // com outros atalhos do navegador ou do próprio CRM.
      if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      if (e.repeat) return; // ignora repetição ao segurar a tecla

      // EXCEÇÃO DIRIGIDA (corrige código morto achado em revisão): com a
      // busca rápida aberta, o foco está no input dela, então estaDigitando()
      // barrava o próprio Alt+B -- o toggle
      // `if (overlayBuscaEl) fecharBuscaRapida()` era inalcançável e só
      // Escape/clique fora fechavam. A exceção é só pra ESTA tecla: qualquer
      // outro Alt+letra continua bloqueado enquanto você digita, senão um
      // Alt+S no meio de uma pesquisa registraria e enviaria a cobrança.
      if (e.code === CONFIG_ATALHOS.TECLA_BUSCA_RAPIDA && overlayBuscaEl) {
        e.preventDefault();
        fecharBuscaRapida();
        return;
      }

      if (estaDigitando()) return;

      switch (e.code) {
        case CONFIG_ATALHOS.TECLA_INICIAR_FILA:
          e.preventDefault();
          acionarIniciarFila();
          break;
        case CONFIG_ATALHOS.TECLA_FILA_PRIORIDADE:
          e.preventDefault();
          acionarFilaPorPrioridade();
          break;
        case CONFIG_ATALHOS.TECLA_GERAR_RELATORIO:
          e.preventDefault();
          acionarGerarRelatorio();
          break;
        case CONFIG_ATALHOS.TECLA_ABRIR_CONTATO:
          e.preventDefault();
          acionarAbrirContato();
          break;
        case CONFIG_ATALHOS.TECLA_PROXIMO_DA_FILA:
          e.preventDefault();
          acionarProximoDaFila();
          break;
        case CONFIG_ATALHOS.TECLA_VOLTAR_FILA:
          e.preventDefault();
          acionarVoltarFila();
          break;
        case CONFIG_ATALHOS.TECLA_ABRIR_GRUPO_VENCIDO:
          e.preventDefault();
          acionarAbrirGrupoComVencido();
          break;
        case CONFIG_ATALHOS.TECLA_SELECIONAR_FRASE:
          e.preventDefault();
          acionarSelecionarPrimeiraFrase();
          break;
        case CONFIG_ATALHOS.TECLA_ATENDIMENTO_RAPIDO:
          e.preventDefault();
          acionarAtendimentoRapido();
          break;
        case CONFIG_ATALHOS.TECLA_REGISTRAR_ENVIAR:
          e.preventDefault();
          acionarRegistrarEEnviar();
          break;
        case CONFIG_ATALHOS.TECLA_AJUDA:
          e.preventDefault();
          alternarPainelAjuda();
          break;
        case CONFIG_ATALHOS.TECLA_NOVIDADES:
          e.preventDefault();
          alternarPainelNovidades();
          break;
        case CONFIG_ATALHOS.TECLA_CONFIGURACOES:
          e.preventDefault();
          alternarPainelConfiguracoes();
          break;
        case CONFIG_ATALHOS.TECLA_RECEBIDO_SEMANA:
          e.preventDefault();
          alternarPainelRecebido();
          break;
        case CONFIG_ATALHOS.TECLA_BUSCA_RAPIDA:
          e.preventDefault();
          abrirBuscaRapida();
          return; // sai sem rodar a limpeza de foco abaixo -- aqui o foco
                   // no campo de busca é intencional, não um efeito colateral
        default:
          return; // não é um dos nossos atalhos — não faz nada, nem a limpeza abaixo
      }

      // Rede de segurança geral: qualquer atalho que tenha, por efeito
      // colateral, deixado o foco preso numa caixa de texto (focus trap de
      // modal, por exemplo) libera esse foco aqui — assim o PRÓXIMO atalho
      // não se autobloqueia achando que você está digitando. Repetimos
      // algumas vezes com atraso porque alguns apps focam campos de forma
      // assíncrona (depois de um re-render), então uma limpeza só no
      // instante do clique pode ser cedo demais.
      liberarFocoInvoluntario();
      setTimeout(liberarFocoInvoluntario, 60);
      setTimeout(liberarFocoInvoluntario, 250);
    },
    true
  );

  console.log(
    '%c[Atalhos] ' + LISTA_ATALHOS.map((a) => `${a.tecla}: ${a.descricao}`).join(' | '),
    'color:#16232F;font-weight:bold;'
  );

  // Hook de depuração/teste (mesmo padrão do window.filaDebug no Módulo 3 e
  // window.__contextoAdicionalDebug no Módulo 6) -- expõe a montagem da
  // mensagem personalizada do Alt+A pra validação automatizada sem precisar
  // simular o atalho de teclado inteiro.
  // Os dois painéis deste módulo entram no mesmo registro dos painéis do
  // Módulo 9 e do Módulo 10 -- abrir qualquer um fecha os outros três.
  window.__smartTableUtil?.registrarPainel?.('novidades', fecharPainelNovidades);
  window.__smartTableUtil?.registrarPainel?.('ajuda', fecharPainelAjuda);

  window.__atalhosDebug = {
    FRASES,
    frase,
    sementeDaFrase,
    montarMensagemPersonalizada,
    deveOmitirRelatorio,
    gerarRelatoriosDasOutrasRazoes,
    esperarRelatorioProntoNaJanela,
    substituirVariaveisDaFrase,
    concordarTitulos,
    acionarGerarRelatorio,
    encontrarBotaoRelatorio,
    LOG_ATUALIZACOES,
    alternarPainelNovidades,
    versoesNaoLidas,
    compararVersoes,
    obterPerguntaFinal,
    acionarAtendimentoRapido,
    abrirBuscaRapida,
    fecharBuscaRapida,
    estaBuscaRapidaAberta: () => overlayBuscaEl !== null,
  };
})();
