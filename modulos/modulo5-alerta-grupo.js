/* =========================================================================
 * MÓDULO 5: ALERTA DE GRUPO ECONÔMICO — CRM TexCotton
 * -------------------------------------------------------------------------
 * O que faz: ao entrar na página de um cliente, verifica a tabela "Clientes
 * do grupo" (aba "Grupo") e mostra um aviso destacado no topo da página se
 * QUALQUER OUTRA empresa do mesmo grupo econômico tiver título vencido.
 * Não depende de clicar na aba "Grupo" — lê a tabela direto do HTML da
 * página, mesmo que ela esteja escondida (display:none) até a aba abrir.
 *
 * Também expõe o resultado em window.__alertaGrupo = { empresasComVencido:
 * [{cnpj, razaoSocial, vencido, url}, ...] } (sempre presente, mesmo vazio)
 * -- usado pelo Módulo 4 pra uma linha extra na mensagem do Alt+A e pro
 * atalho que abre as outras razões em nova aba (Alt+G), sem duplicar a
 * leitura da tabela.
 *
 * Onde colar: anexado ao FINAL do smart-table.js, junto com os outros
 * módulos. Não depende de nenhum deles pra funcionar (roda sozinho), mas o
 * Módulo 4 depende DELE pra essas duas funcionalidades -- colar antes.
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
   * 3. BANNER DE AVISO
   * --------------------------------------------------------------------- */
  function obterElementoHeaderFixo() {
    const header = document.querySelector('header');
    if (!header) return null;
    const estilo = window.getComputedStyle(header);
    return (estilo.position === 'fixed' || estilo.position === 'sticky') ? header : null;
  }

  function obterAlturaHeaderFixo() {
    // Mede a altura real do <header> da página (se existir e for fixo),
    // pra posicionar o aviso logo abaixo dele, sem tampar nada e sem
    // precisar adivinhar um valor fixo em pixels.
    const header = obterElementoHeaderFixo();
    return header ? header.getBoundingClientRect().height : 0;
  }

  /**
   * Onde termina, de verdade, a área fixa do topo da página.
   *
   * BUG REAL (o banner existia, estava visível, e mesmo assim ninguém via):
   * a medição olhava só a altura do <header> -- 80px no CRM. Mas dentro do
   * header existe uma barra de navegação rápida POSICIONADA, que transborda
   * pra baixo dele e vai até 157px. Como ela é DESCENDENTE do header, ela
   * pinta no contexto de empilhamento dele (z-50), e portanto cobre qualquer
   * coisa de fora com z-index menor -- inclusive este banner, que é z-30 de
   * propósito, pra não cortar os modais do CRM (que também são z-50).
   *
   * Ou seja: não existe z-index válido. Acima da barra seria acima dos
   * modais, e o bug antigo voltaria. A correção é POSICIONAL -- ficar abaixo
   * da área fixa inteira, não só do <header>.
   *
   * Mede genericamente (qualquer descendente posicionado e visível que
   * transborde), sem fixar o seletor da barra: se o CRM mudar o nome dela,
   * ou ganhar outra, a conta continua certa.
   *
   * @returns {number} Coordenada Y (viewport) onde a área fixa termina.
   */
  function obterFimDaAreaFixaSuperior() {
    const header = obterElementoHeaderFixo();
    if (!header) return 0;

    let limite = header.getBoundingClientRect().bottom;

    Array.from(header.querySelectorAll('*')).forEach((el) => {
      const estilo = window.getComputedStyle(el);
      if (estilo.position === 'static') return; // não transborda o pai
      if (estilo.display === 'none' || estilo.visibility === 'hidden') return;
      const r = el.getBoundingClientRect();
      if (r.height > 0 && r.bottom > limite) limite = r.bottom;
    });

    return limite;
  }

  // BUG REAL (relatado pelo usuário): o banner às vezes ficava por cima do
  // header do CRM. A medição em si bate certo quando testada isoladamente
  // (confirmado: position fixed, 80px de altura) -- o problema é de
  // TIMING: se o layout do header ainda não tiver assentado no instante
  // exato em que o banner é criado, o valor capturado fica desatualizado.
  // Reajusta o offset pouco depois de inserir (dá tempo do layout
  // assentar) e observa o header com ResizeObserver pra continuar
  // correto se a altura dele mudar depois (ex.: header responsivo).
  function manterBannerAlinhadoAoHeader(banner) {
    const observadoresExtras = [];

    function reajustar() {
      banner.style.top = obterFimDaAreaFixaSuperior() + 'px';
    }
    reajustar();
    requestAnimationFrame(reajustar);
    setTimeout(reajustar, 300);

    const header = obterElementoHeaderFixo();
    if (header && typeof ResizeObserver === 'function') {
      const observerHeader = new ResizeObserver(reajustar);
      observerHeader.observe(header);

      // A barra de navegação rápida ABRE E FECHA por clique do usuário, e é
      // `position: absolute` -- então o header não muda de tamanho quando
      // isso acontece, e o ResizeObserver acima não dispara. Observar
      // atributos e filhos do header pega a troca de classe/display que
      // abre e fecha a barra, e o banner desce ou sobe junto.
      const observerConteudoHeader = new MutationObserver(reajustar);
      observerConteudoHeader.observe(header, { attributes: true, childList: true, subtree: true });
      observadoresExtras.push(observerConteudoHeader);
      // Desliga sozinho quando o banner sai da tela (fechado ou trocou de
      // página) -- sem isso, o observer ficaria vivo pra sempre.
      const paradaObserver = new MutationObserver(() => {
        if (!document.body.contains(banner)) {
          observerHeader.disconnect();
          observadoresExtras.forEach((o) => o.disconnect());
          paradaObserver.disconnect();
        }
      });
      paradaObserver.observe(document.body, { childList: true, subtree: true });
    }
  }

  function criarBanner(empresas) {
    if (document.getElementById('alerta-grupo-vencido')) return; // já existe, não duplica

    const banner = document.createElement('div');
    banner.id = 'alerta-grupo-vencido';
    Object.assign(banner.style, {
      position: 'fixed',
      top: obterFimDaAreaFixaSuperior() + 'px',
      left: '0',
      right: '0',
      background: '#FEF3C7',
      borderBottom: '2px solid #F59E0B',
      color: '#78350F',
      padding: '12px 20px',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontSize: '14px',
      lineHeight: '1.4',
      // BUG REAL (relatado pelo usuário): o banner ficava por cima de
      // modais do CRM (ex.: "Registrar Contato"), cortando o modal ao
      // meio -- confirmado via diagnóstico ao vivo que o backdrop do
      // modal (#modal-contato) usa z-index: 50 (convenção Tailwind
      // "z-50", provavelmente compartilhada por outros modais do app).
      // z-index bem abaixo disso garante que qualquer modal desse padrão
      // sempre renderiza por cima do nosso banner -- ele passa a ficar
      // escondido atrás do esmaecimento do modal, igual ao resto da
      // página, em vez de furar por cima.
      zIndex: 30,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '12px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
    });

    const texto = document.createElement('div');
    const verbo = empresas.length > 1 ? 'têm' : 'tem';

    // CORREÇÃO (item A1): antes usava innerHTML com razaoSocial/vencido
    // interpolados por concatenação de string -- funciona hoje porque o
    // dado vem do próprio CRM, mas é um padrão perigoso (se um nome de
    // empresa algum dia contiver caracteres HTML, seriam executados).
    // Construindo com nós de texto reais em vez de innerHTML.
    const partePrefixo = document.createElement('span');
    const forte = document.createElement('strong');
    forte.textContent = 'Atenção:';
    partePrefixo.append('⚠️ ', forte, ` ${empresas.length} empresa(s) do mesmo grupo econômico também ${verbo} título vencido: `);

    const listaEmpresas = empresas.map((e) => `${e.razaoSocial} (${e.vencido})`).join(', ');
    texto.append(partePrefixo, document.createTextNode(listaEmpresas));

    const btnFechar = document.createElement('button');
    btnFechar.textContent = '×';
    btnFechar.setAttribute('aria-label', 'Fechar aviso');
    Object.assign(btnFechar.style, {
      background: 'transparent',
      border: 'none',
      fontSize: '20px',
      lineHeight: '1',
      cursor: 'pointer',
      color: '#78350F',
      padding: '0 6px',
      flexShrink: '0',
    });
    btnFechar.onclick = () => banner.remove();

    banner.appendChild(texto);
    banner.appendChild(btnFechar);
    document.body.appendChild(banner);
    manterBannerAlinhadoAoHeader(banner);
  }

  /* ---------------------------------------------------------------------
   * 4. INICIALIZAÇÃO
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
    const empresas = verificarOutrasEmpresasComVencido();
    expor(empresas);
    if (empresas.length > 0) {
      criarBanner(empresas);
    }
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
  // e window.__atalhosDebug no Módulo 4) -- expõe o banner direto, sem
  // precisar simular a leitura da tabela de grupo inteira.
  window.__alertaGrupoDebug = {
    criarBanner,
    obterAlturaHeaderFixo,
    verificarOutrasEmpresasComVencido,
    limparValorMonetario,
    obterFimDaAreaFixaSuperior,
  };
})();
