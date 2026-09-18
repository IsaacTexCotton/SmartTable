/* =========================================================================
 * MÓDULO 5: DETECÇÃO DE GRUPO ECONÔMICO COM VENCIDO — CRM TexCotton
 * -------------------------------------------------------------------------
 * O que faz: ao entrar na página de um cliente, lê a tabela "Clientes do
 * grupo" (aba "Grupo") e publica quais OUTRAS empresas do mesmo grupo
 * econômico têm título vencido. Não depende de clicar na aba "Grupo" — lê a
 * tabela direto do HTML da página, mesmo escondida (display:none).
 *
 *   window.__alertaGrupo = { empresasComVencido: [{cnpj, razaoSocial,
 *                            vencido, url}, ...] }   (sempre presente)
 *
 * ESTE MÓDULO NÃO DESENHA NADA. Ele já mostrou um banner no topo da página;
 * o banner saiu na v1.14.0, quando o próprio CRM passou a avisar ("1 CNPJ do
 * grupo vencido", ao lado do grupo, na página do cliente). Manter dois
 * avisos da mesma coisa é ruído, e o nosso carregava toda a lógica de
 * posicionamento (z-index, acompanhar a barra de navegação rápida,
 * ResizeObserver) que sozinha causou três bugs -- a parte mais difícil de
 * testar do projeto.
 *
 * O QUE O BANNER MOSTRAVA E O AVISO DO CRM NÃO MOSTRA: quem e quanto. Isso
 * continua a uma tecla de distância, no Alt+G, que abre todas as razões com
 * vencido de uma vez.
 *
 * QUEM DEPENDE DESTE MÓDULO (é por isso que ele continua existindo):
 *   - Módulo 4, Alt+G            -> abre as outras razões com vencido.
 *   - Módulo 4, temOutraRazaoComVencido() -> muda a frase do relatório na
 *     MENSAGEM QUE O CLIENTE RECEBE ("de cada razão social").
 *   - Módulo 7, fila por prioridade -> só a razão mais urgente do grupo
 *     entra na fila; sem isso o mesmo grupo seria cobrado em duplicidade.
 *   - Módulo 8, conferir().
 *
 * Onde colar: depois do Módulo 0 e ANTES do Módulo 4.
 *
 * IMPORTANTE — baseado em UM exemplo real de HTML da tabela "Clientes do
 * grupo". Se a estrutura variar (ex.: cliente sem grupo, mais colunas em
 * outra tela), ajuste CONFIG_GRUPO abaixo ou me manda o HTML que não bateu.
 * ========================================================================= */
(function () {
  'use strict';

  if (window.__alertaGrupoCarregado) return;
  window.__alertaGrupoCarregado = true;

  // Utilitários compartilhados (Módulo 0) -- precisa estar carregado ANTES
  // deste arquivo no @require do wrapper.
  const { montarUrlCliente } = window.__smartTableUtil;

  /* ---------------------------------------------------------------------
   * 1. CONFIGURAÇÃO
   * --------------------------------------------------------------------- */
  const CONFIG_GRUPO = {
    // Texto usado pra localizar o título "Clientes do grupo" (minúsculo).
    TEXTO_TITULO_GRUPO: 'clientes do grupo',
    // Classe confirmada que marca a linha do cliente ATUAL na tabela —
    // essa linha é ignorada na checagem (não faz sentido alertar sobre o
    // próprio cliente que você já está vendo).
    CLASSE_LINHA_ATUAL: 'bg-yellow-50',
    // Índice das colunas da tabela (0 = primeira). Confirmado no HTML real:
    // CNPJ, Razão Social, Cidade/UF, Vencido, A Vencer, Ações.
    INDICE_COLUNA_CNPJ: 0,
    INDICE_COLUNA_RAZAO_SOCIAL: 1,
    INDICE_COLUNA_VENCIDO: 3,
  };

  /* ---------------------------------------------------------------------
   * 2. LOCALIZAR E LER A TABELA DE GRUPO
   * --------------------------------------------------------------------- */
  function encontrarTabelaDoGrupo() {
    const titulos = Array.from(document.querySelectorAll('h3'));
    const tituloGrupo = titulos.find((h) =>
      (h.textContent || '').toLowerCase().includes(CONFIG_GRUPO.TEXTO_TITULO_GRUPO)
    );
    if (!tituloGrupo) return null;

    // No HTML confirmado: o <h3> fica dentro de uma <div class="mb-4">, que
    // é irmã da <div class="overflow-x-auto"> que contém a <table>. Subimos
    // até o container comum e procuramos a tabela dentro dele.
    const containerDoTitulo = tituloGrupo.closest('div');
    const container = containerDoTitulo ? containerDoTitulo.parentElement : null;
    if (!container) return null;

    return container.querySelector('table');
  }

  /**
   * Normaliza a célula "Vencido" da tabela de grupo: devolve o texto original
   * quando há saldo vencido de verdade, ou null quando não há.
   *
   * ENDURECIDO (achado de revisão): antes, QUALQUER texto que não fosse
   * vazio nem travessão contava como "tem vencido" -- inclusive um
   * "R$ 0,00". Se o CRM renderizar zero assim em vez de "—" (não confirmado
   * ao vivo), TODA empresa do grupo entraria em empresasComVencido, mudando
   * a mensagem do Alt+A e fazendo o Alt+A abrir abas de fundo à toa. Zero
   * não é saldo vencido em nenhuma das duas formas de renderizar, então
   * tratar os dois casos é correto independentemente de qual o CRM usa.
   *
   * @param {string} texto Conteúdo cru da célula.
   * @returns {string|null} O texto original, ou null se não houver vencido.
   */
  function limparValorMonetario(texto) {
    const limpo = (texto || '').trim();
    if (!limpo || limpo === '—' || limpo === '-' || limpo === '--') return null;

    // "R$ 1.234,56" -> 1234.56. Se não sobrar número nenhum (texto
    // inesperado), mantém o comportamento antigo de confiar no texto -- na
    // dúvida, avisar a mais é mais seguro que deixar passar um vencido.
    const numero = parseFloat(limpo.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.'));
    if (Number.isFinite(numero) && numero === 0) return null;

    return limpo;
  }

  // Mesmo padrão de URL confirmado e já usado no Módulo 3 (fila): múltiplos
  // CNPJs podem compartilhar o mesmo grupoId, e como a outra razão está no
  // MESMO grupo da página atual, o grupoId já está na própria URL corrente.
  function extrairGrupoIdDaUrl() {
    const m = location.pathname.match(/\/crm\/clientes\/grupo\/(\d+)/);
    return m ? m[1] : null;
  }

  function verificarOutrasEmpresasComVencido() {
    const tabela = encontrarTabelaDoGrupo();
    if (!tabela) return []; // sem tabela de grupo nesta página -- nada a avisar

    const grupoId = extrairGrupoIdDaUrl();
    const linhas = Array.from(tabela.querySelectorAll('tbody tr'));
    const comVencido = [];

    linhas.forEach((linha) => {
      // Ignora a linha do cliente ATUAL -- não faz sentido "avisar" sobre
      // o próprio cliente que a página já está mostrando.
      if (linha.classList.contains(CONFIG_GRUPO.CLASSE_LINHA_ATUAL)) return;

      const celulas = linha.querySelectorAll('td');
      if (celulas.length <= CONFIG_GRUPO.INDICE_COLUNA_VENCIDO) return;

      const cnpj = (celulas[CONFIG_GRUPO.INDICE_COLUNA_CNPJ].textContent || '').trim();
      const celulaRazao = celulas[CONFIG_GRUPO.INDICE_COLUNA_RAZAO_SOCIAL];
      const spanNome = celulaRazao ? celulaRazao.querySelector('span') : null;
      const razaoSocial = ((spanNome ? spanNome.textContent : celulaRazao.textContent) || '').trim();

      const vencido = limparValorMonetario(celulas[CONFIG_GRUPO.INDICE_COLUNA_VENCIDO].textContent);

      if (vencido) {
        comVencido.push({
          cnpj,
          razaoSocial,
          vencido,
          url: grupoId && cnpj ? montarUrlCliente(grupoId, cnpj) : null,
        });
      }
    });

    return comVencido;
  }

  /* ---------------------------------------------------------------------
   * 3. EXPOSIÇÃO E INICIALIZAÇÃO
   * --------------------------------------------------------------------- */
  // Exposto pra outros módulos (Módulo 4: linha extra na mensagem do Alt+A
  // e o atalho de abrir as outras razões em nova aba) sem precisar reler a
  // tabela por conta própria. CONFIRMADO com o usuário: mensagem diferente
  // quando outra razão do grupo também tem saldo vencido, e um jeito
  // conveniente de gerar o relatório de cada uma (duas empresas = dois
  // relatórios separados, um por página, sem combinar numa imagem só).
  function expor(empresas) {
    window.__alertaGrupo = { empresasComVencido: empresas };
  }

  function checar() {
    expor(verificarOutrasEmpresasComVencido());
  }

  function obterNomeAbaAtiva() {
    // Heurística: entre os botões de aba (.tab-btn com id="tab-XXX"), o
    // botão INATIVO segue o padrão confirmado (classes "text-gray-500" +
    // "border-transparent"). O ativo é o que foge desse padrão.
    const botoes = Array.from(document.querySelectorAll('.tab-btn[id^="tab-"]'));
    const ativo = botoes.find((b) => {
      const classes = b.className || '';
      return !(classes.includes('text-gray-500') && classes.includes('border-transparent'));
    });
    return ativo && ativo.id ? ativo.id.replace(/^tab-/, '') : null;
  }

  // CONFIRMADO no HTML real: quando o cliente tem 2+ empresas no grupo, o
  // botão #tab-grupo ganha um <span class="... rounded-full ..."> extra só
  // com o número. Quando é 1 empresa só (ou sem grupo), esse span não existe.
  // Isso NÃO diz se alguma empresa está vencida (só a tabela de dentro da
  // aba sabe isso) -- mas se só tem 1 empresa, não tem "outra" pra alertar,
  // então dá pra pular a etapa inteira sem abrir aba nenhuma.
  function obterQuantidadeEmpresasNoGrupo() {
    const botaoGrupo = document.getElementById('tab-grupo');
    if (!botaoGrupo) return 0; // nem tem aba de grupo nesta página

    const badge = botaoGrupo.querySelector('.rounded-full');
    if (!badge) return 1; // aba existe mas sem número -- só o próprio cliente

    const numero = parseInt((badge.textContent || '').trim(), 10);
    return Number.isFinite(numero) ? numero : 1;
  }

  function iniciar() {
    // OTIMIZAÇÃO: se o badge do botão "Grupo" mostra 1 empresa (ou não tem
    // badge, ou nem tem a aba), não existe "outra" empresa pra alertar --
    // pula a etapa inteira, sem abrir aba nem esperar nada.
    if (obterQuantidadeEmpresasNoGrupo() <= 1) {
      expor([]); // mantém window.__alertaGrupo sempre presente pros outros módulos
      return;
    }

    // CONFIRMADO: a tabela "Clientes do grupo" só é carregada quando a aba
    // "Grupo" é aberta (não vem pronta no HTML inicial). Por isso, abrimos
    // essa aba sozinhos, checamos, e voltamos pra aba que estava ativa —
    // sem exigir nenhuma ação do usuário.
    const abaOriginal = obterNomeAbaAtiva();

    if (typeof window.showTab !== 'function') {
      console.warn('[Alerta Grupo] window.showTab não encontrada como função global -- checando sem abrir a aba.');
      checar();
      return;
    }

    window.showTab('grupo');

    let finalizado = false;
    let observer = null; // declarada aqui, ANTES de qualquer chamada a finalizar()

    function finalizar() {
      if (finalizado) return;
      finalizado = true;
      if (observer) observer.disconnect();
      checar();

      // CORREÇÃO (item C3): só restaura a aba original se ela ainda for a
      // mesma que deixamos (ou seja, nada mais mudou a aba nesse meio
      // tempo). Sem checar isso, se outra ação (ex.: Alt+C abrindo a tela
      // de contato, caso ela use o mesmo sistema de abas) mudar a aba
      // DURANTE nossa espera, nós forçaríamos a volta por cima dessa ação
      // mais recente -- fechando algo que o usuário acabou de abrir.
      const abaAgora = obterNomeAbaAtiva();
      if (abaOriginal && abaOriginal !== 'grupo' && abaAgora === 'grupo') {
        window.showTab(abaOriginal);
      }
    }

    // Verificação imediata: se os dados já estiverem lá (ex.: aba já tinha
    // sido aberta antes nesta mesma sessão, ou preservada num recarregamento),
    // nem precisa esperar nada.
    if (encontrarTabelaDoGrupo()) {
      finalizar();
      return;
    }

    // EM VEZ DE esperar um tempo fixo "por garantia", observamos o DOM e
    // agimos assim que a tabela aparecer. Isso deixa o "flash" da aba do
    // tamanho real do carregamento, em vez de sempre esperar o pior caso.
    //
    // CORREÇÃO (item A2): o callback do MutationObserver é agrupado com
    // requestAnimationFrame -- sem isso, cada mutação individual de DOM na
    // página (ex.: algum widget de terceiros atualizando algo) dispara uma
    // nova varredura de document.querySelectorAll('h3'), o que pode virar
    // dezenas de buscas no DOM por segundo numa página muito ativa.
    let verificacaoAgendada = false;
    observer = new MutationObserver(() => {
      if (verificacaoAgendada || finalizado) return;
      verificacaoAgendada = true;
      requestAnimationFrame(() => {
        verificacaoAgendada = false;
        if (encontrarTabelaDoGrupo()) {
          finalizar();
        }
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // Rede de segurança: se a tabela nunca aparecer (ex.: cliente sem
    // grupo, ou showTab com nome diferente do esperado), desiste depois de
    // um tempo em vez de ficar travado na aba Grupo pra sempre.
    setTimeout(finalizar, 2500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar);
  } else {
    iniciar();
  }

  // Hook de depuração/teste (mesmo padrão do window.filaDebug no Módulo 3
  // e window.__atalhosDebug no Módulo 4).
  window.__alertaGrupoDebug = {
    verificarOutrasEmpresasComVencido,
    limparValorMonetario,
    CONFIG_GRUPO,
  };
})();
