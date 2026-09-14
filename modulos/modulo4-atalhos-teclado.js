/* =========================================================================
 * MÓDULO 4: ATALHOS DE TECLADO — CRM TexCotton
 * -------------------------------------------------------------------------
 * Atalhos (todos com Alt, pra não colidir com atalhos do navegador/CRM):
 *
 *   Alt + I  -> Iniciar Fila de Atendimento   (na página de lista)
 *   Alt + R  -> Gerar Relatório               (na página do cliente)
 *   Alt + C  -> Entrar na tela de contato     (na página do cliente)
 *   Alt + F  -> Selecionar a 1ª frase padrão  (dentro da tela de contato)
 *   Alt + A  -> Atendimento rápido            (gera relatório + abre contato + escreve mensagem personalizada pra situação do cliente)
 *   Alt + S  -> Registrar e Enviar            (dentro da tela de contato)
 *   Alt + P  -> Ir para o próximo da fila     (conta como "atendido" se você já
 *                                              registrou este cliente, senão como "pulado")
 *   Alt + H  -> Abrir/fechar painel de ajuda  (mostra esta lista na tela)
 *
 * Fluxo típico com teclado: Alt+C (abre contato) -> Alt+F (escolhe frase)
 * -> Alt+S (registra e envia, cliente fica marcado como atendido) -> Alt+P
 * quando você quiser seguir pro próximo da fila (Módulo 3 não navega
 * sozinho mais -- isso é sempre uma decisão sua).
 *
 * Onde colar: anexado ao FINAL do smart-table.js, depois dos módulos 1, 2
 * e 3 (Fila de Atendimento). Depende do Módulo 3 estar carregado antes
 * (usa window.filaDebug.iniciarFila / irParaProximo).
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

  /* ---------------------------------------------------------------------
   * 1. CONFIGURAÇÃO
   * --------------------------------------------------------------------- */
  const CONFIG_ATALHOS = {
    // Teclas físicas (event.code), sempre combinadas com Alt.
    TECLA_INICIAR_FILA: 'KeyI',
    TECLA_GERAR_RELATORIO: 'KeyR',
    TECLA_ABRIR_CONTATO: 'KeyC',
    TECLA_PROXIMO_DA_FILA: 'KeyP',
    TECLA_SELECIONAR_FRASE: 'KeyF',
    TECLA_REGISTRAR_ENVIAR: 'KeyS',
    TECLA_AJUDA: 'KeyH',
    TECLA_BUSCA_RAPIDA: 'KeyB',
    TECLA_ATENDIMENTO_RAPIDO: 'KeyA',
    // Tempo (ms) entre abrir a tela de contato e selecionar a frase --
    // dá tempo do modal terminar de aparecer antes de mexer nele.
    ATRASO_ATENDIMENTO_RAPIDO_MS: 150,
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
  };

  // Fonte única de verdade pra lista de atalhos — usada tanto no aviso do
  // console quanto no painel de ajuda visual (Alt+H), pra nunca ficarem
  // desalinhados entre si.
  const LISTA_ATALHOS = [
    { tecla: 'Alt+I', descricao: 'Iniciar Fila de Atendimento' },
    { tecla: 'Alt+R', descricao: 'Gerar Relatório' },
    { tecla: 'Alt+C', descricao: 'Entrar na tela de contato' },
    { tecla: 'Alt+F', descricao: 'Selecionar a 1ª frase padrão' },
    { tecla: 'Alt+A', descricao: 'Atendimento rápido (relatório + contato + mensagem personalizada)' },
    { tecla: 'Alt+S', descricao: 'Registrar e Enviar' },
    { tecla: 'Alt+P', descricao: 'Ir para o próximo da fila' },
    { tecla: 'Alt+B', descricao: 'Busca rápida de cliente' },
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

  function encontrarElementoVisivelPorTexto(seletorBase, trecho) {
    const alvo = trecho.trim().toLowerCase();
    if (!alvo) return null;

    const candidatos = Array.from(document.querySelectorAll(seletorBase));
    return (
      candidatos.find((el) => elementoVisivel(el) && (el.textContent || '').trim().toLowerCase().includes(alvo)) ||
      null
    );
  }

  function clicarBotaoPorTexto(trecho) {
    const encontrado = encontrarElementoVisivelPorTexto('button, a[role="button"], [role="button"]', trecho);
    if (encontrado) {
      simularCliqueCompleto(encontrado);
      return true;
    }
    return false;
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
   * 3. AÇÕES
   * --------------------------------------------------------------------- */
  function acionarIniciarFila() {
    if (window.filaDebug && typeof window.filaDebug.iniciarFila === 'function') {
      window.filaDebug.iniciarFila();
    } else {
      console.warn('[Atalhos] Módulo de Fila (Módulo 3) não encontrado. Confirme se ele foi colado ANTES deste arquivo.');
    }
  }

  function acionarProximoDaFila() {
    if (window.filaDebug && typeof window.filaDebug.irParaProximo === 'function') {
      window.filaDebug.irParaProximo('pulado');
    } else {
      console.warn('[Atalhos] Módulo de Fila (Módulo 3) não encontrado. Confirme se ele foi colado ANTES deste arquivo.');
    }
  }

  function acionarGerarRelatorio() {
    if (!clicarBotaoPorTexto(CONFIG_ATALHOS.TEXTO_BOTAO_RELATORIO)) {
      console.warn(
        `[Atalhos] Não encontrei um botão visível com "${CONFIG_ATALHOS.TEXTO_BOTAO_RELATORIO}" no texto. ` +
        'Me diga o texto exato do botão de gerar relatório pra eu ajustar CONFIG_ATALHOS.TEXTO_BOTAO_RELATORIO.'
      );
    }
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
   * regra que o Módulo 2 já usa pra montar o resumo do CRM (maiorAtraso
   * entre os títulos em ULTIMO_DIA; se não tiver nenhum, o de maior atraso
   * real, seja qual for a situação). Duplicada aqui de propósito -- Módulo
   * 2 não pode ser editado sem confirmação -- pra nota do CRM e mensagem
   * do cliente sempre baterem sobre o mesmo título. Confirmado com o
   * usuário: ULTIMO_DIA sempre vence, mesmo com outro título já em
   * cartório/negativado.
   * --------------------------------------------------------------------- */
  function escolherTituloRepresentativo(dados) {
    if (!dados || !dados.registros || dados.registros.length === 0) return null;
    const emUltimoDia = dados.registros.filter((r) => r.situacaoKey === 'ULTIMO_DIA');
    const candidatos = emUltimoDia.length > 0 ? emUltimoDia : dados.registros;
    return candidatos.reduce((a, b) => (b.diasAtrasoReal > a.diasAtrasoReal ? b : a));
  }

  // Linha de contexto por situação -- extraída/adaptada das frases padrão
  // reais do usuário (não escrita do zero). Retorna:
  //   - string vazia: sem linha extra, mensagem segue direto pro fechamento
  //   - string com texto: linha extra (pode conter {{variável}})
  //   - null: situação não deve gerar mensagem automática (ver chamador)
  function obterLinhaContexto(escolhido, fluxo) {
    switch (escolhido.situacaoKey) {
      case 'EM_ATRASO':
      case 'PRAZO_FINAL':
        return '';
      case 'ULTIMO_DIA':
        return fluxo === 'SCPC'
          ? 'Lembramos que o título vencido em {{data_vencimento}} está no prazo final antes de ser encaminhado ao SCPC.'
          : 'Lembramos que o título vencido em {{data_vencimento}} está no prazo final antes de ser encaminhado para cartório.';
      case 'NEGATIVADO_SCPC':
        return 'Lembramos que a regularização dos débitos negativados no SCPC permite a baixa das restrições.';
      case 'EM_CARTORIO':
        return 'Os títulos já em cartório aparecem destacados no relatório abaixo -- o restante ainda está dentro do prazo para pagamento via boleto.';
      default:
        // VERIFICAR_POSICAO (ou qualquer situação nova/desconhecida): situação
        // incerta demais pra afirmar algo pro cliente -- decisão do usuário foi
        // não gerar mensagem automática nesse caso, não inventar texto.
        return null;
    }
  }

  /* ---------------------------------------------------------------------
   * 3.0c LINHAS DE CONTEXTO ADICIONAL (Módulo 6) -- promessa e contato
   * -----------------------------------------------------------------
   * Lê window.__contextoAdicional (calculado pelo Módulo 6 já no carregamento
   * da página, sem custo extra aqui). Se o Módulo 6 não estiver carregado ou
   * não achar nada relevante, as duas funções devolvem string vazia -- a
   * mensagem segue normal, só sem essas linhas extras.
   * --------------------------------------------------------------------- */
  function obterLinhaContatoRecente() {
    const ctx = window.__contextoAdicional;
    if (!ctx || !ctx.contatoRecente) return '';
    // "Ontem" só é usado quando é literalmente verdade (dia útil anterior =
    // dia de calendário anterior). Quando o dia útil anterior pula um fim de
    // semana (ex.: hoje é segunda e o contato foi sexta) ou feriado, usamos
    // o nome do dia da semana em vez de "ontem" -- ver ehOntemLiteral no
    // Módulo 6.
    const { ehOntemLiteral, diaSemanaTexto } = ctx.contatoRecente;
    const referencia = ehOntemLiteral ? 'ontem' : diaSemanaTexto;
    return `Retomando o contato de ${referencia}, já que ainda não obtivemos retorno.`;
  }

  function obterLinhaPromessa() {
    const ctx = window.__contextoAdicional;
    if (!ctx || !ctx.promessa) return '';

    const { tipo, promessa } = ctx.promessa;
    const titulosTexto = promessa.titulos.join(', ');

    switch (tipo) {
      case 'DIA_DA_PROMESSA':
        return `Lembramos que hoje é o dia combinado para o pagamento do(s) título(s) ${titulosTexto}.`;
      case 'QUEBRADA':
        return (
          `Notamos que o pagamento combinado para ${encurtarData(promessa.dataPrometidaTexto)}, referente ao(s) título(s) ` +
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
          `${promessa.titulos.length} título(s). Ainda restam em aberto: ${pendentesTexto}.`
        );
      }
      default:
        return '';
    }
  }

  function montarMensagemPersonalizada(dados) {
    const ctx = window.__contextoAdicional;

    // Primeiro contato: cliente sem nenhum registro na aba Contatos. Mensagem
    // própria, só pra confirmar o responsável -- ignora relatório, situação
    // do título e promessa, que não fazem sentido antes desse primeiro passo.
    if (ctx && ctx.semContatoAnterior) {
      const textoPrimeiroContato = [
        '{{saudacao}}',
        '',
        'Sou o Isaac do financeiro da Tex Cotton referente as marcas Animê, Bimbi, Youccie, Authoria e Momi',
        'Este é o contato responsável pela razão social {{cliente_nome}}?',
      ].join('\n');
      return substituirVariaveisDaFrase(textoPrimeiroContato, dados);
    }

    const escolhido = escolherTituloRepresentativo(dados);
    if (!escolhido) {
      console.warn('[Atalhos] Nenhum título vencido encontrado para este cliente -- mensagem personalizada não gerada.');
      return null;
    }

    const linhaContexto = obterLinhaContexto(escolhido, dados.fluxo);
    if (linhaContexto === null) {
      console.warn(
        `[Atalhos] Situação "${escolhido.situacaoKey}" não gera mensagem automática (situação incerta demais) -- escreva manualmente.`
      );
      return null;
    }

    const partes = [
      '{{saudacao}}',
      '',
    ];

    const linhaContatoRecente = obterLinhaContatoRecente();
    const linhaPromessa = obterLinhaPromessa();
    if (linhaContatoRecente) partes.push(linhaContatoRecente);
    if (linhaPromessa) partes.push(linhaPromessa);
    if (linhaContatoRecente || linhaPromessa) partes.push('');

    partes.push('Segue o relatório atualizado do débito em aberto na razão social {{cliente_nome}}:');
    if (linhaContexto) {
      partes.push('', linhaContexto);
    }
    partes.push('', 'Podemos agendar para hoje o pagamento do débito em aberto?');

    return substituirVariaveisDaFrase(partes.join('\n'), dados);
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

  function acionarAtendimentoRapido() {
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

    // Passo 1: gera o relatório (mesma ação do Alt+R). Roda em paralelo --
    // não existe uma forma exposta de "esperar terminar de verdade" (é
    // assíncrono por dentro: captura de imagem, clipboard, download), então
    // só disparamos e seguimos com os próximos passos depois de um intervalo
    // curto, igual ao padrão já usado abaixo entre abrir contato e escrever.
    acionarGerarRelatorio();
    setTimeout(abrirContatoEEscrever, CONFIG_ATALHOS.ATRASO_ATENDIMENTO_RAPIDO_MS);
  }

  function acionarRegistrarEEnviar() {
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
   * 3.1 SELECIONAR PRIMEIRA FRASE PADRÃO
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
    valor_total_vencido: (dados) => {
      const soma = dados.registros.reduce((acumulado, r) => {
        const valor = converterMoedaBrParaNumero(r.saldoTexto);
        return acumulado + (valor || 0);
      }, 0);
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
   * 3.3 PAINEL DE AJUDA (Alt+H) — lista visual dos atalhos, liga/desliga
   * --------------------------------------------------------------------- */
  function alternarPainelAjuda() {
    if (painelAjudaEl) {
      painelAjudaEl.remove();
      painelAjudaEl = null;
      return;
    }

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
      // Só reage a Alt sozinho (sem Ctrl/Shift/Meta), pra minimizar colisão
      // com outros atalhos do navegador ou do próprio CRM.
      if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      if (e.repeat) return; // ignora repetição ao segurar a tecla
      if (estaDigitando()) return;

      switch (e.code) {
        case CONFIG_ATALHOS.TECLA_INICIAR_FILA:
          e.preventDefault();
          acionarIniciarFila();
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
})();
