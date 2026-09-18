/* =========================================================================
 * MÓDULO 12: ALERTA DO CLIENTE (botão, não atalho) — CRM TexCotton
 * -------------------------------------------------------------------------
 * Um botão na página do cliente ("Alerta") que abre um formulário com:
 *   - checkbox "Não cobrar" -- ao marcar, aparece um campo de intervalo em
 *     DIAS (padrão 1). Enquanto o intervalo não expira, este cliente é
 *     EXCLUÍDO da fila por prioridade (Módulo 7, Alt+U) -- só dela, o Alt+I
 *     original (Módulo 3) não foi mencionado no pedido e continua igual.
 *   - campo de observação (texto livre).
 *   - botão Confirmar.
 *
 * PEDIDO EXPLÍCITO DO USUÁRIO: um BOTÃO, igual ao Módulo 11 -- mas ESTE não
 * é escondido (o Módulo 11 é; aqui nada foi pedido nesse sentido). Botão
 * visível de verdade, texto "Alerta", lado esquerdo -- inferior-esquerdo tem
 * "Continuar fila"+painéis, inferior-direito tem os toasts do Módulo 7 e o
 * gatilho do Módulo 11, superior-direito tem o indicador "Fila: X/Y" do
 * Módulo 3 enquanto ativo.
 *
 * ACHADO AO VIVO (não estava nos meus "cantos livres" da v1.21.0, e por
 * isso o botão nasceu invisível na primeira publicação): o cabeçalho do CRM
 * (`#sit-header`) cobre a largura inteira da tela do topo até y=80px, com
 * z-index 50 -- MESMO nível dos modais do CRM. `top:16px` (canto superior
 * esquerdo "de verdade") fica embaixo dele por completo. Ver
 * CONFIG_ALERTA.TOPO_BOTAO/TOPO_PAINEL: a correção é ficar inteiramente
 * ABAIXO da faixa do cabeçalho (80px + folga), não subir o z-index pra
 * vencê-lo -- isso colocaria o botão no mesmo nível de um modal de verdade,
 * quebrando a regra que todo painel daqui segue.
 *
 * SEGUNDO COMPORTAMENTO, PEDIDO À PARTE (regra deliberadamente distinta da
 * de cima): cliente com OBSERVAÇÃO mas SEM o checkbox marcado -- ou seja,
 * "não cobrar" não está ativo -- recebe um alerta automático ao ABRIR a
 * página dele, um pouco ACIMA do centro da tela, mostrando a observação.
 * Isso é INTENCIONALMENTE assimétrico: com "não cobrar" ativo o cliente já
 * sai da fila sozinho, então não repetimos o aviso toda vez que a página
 * dele é aberta; sem "não cobrar", a única forma de lembrar o operador é
 * avisar na cara toda vez que ele entrar nesse cliente. Se isso não for o
 * comportamento desejado (ex.: também avisar com "não cobrar" ativo), é
 * mudança de regra, não bug -- avise antes de eu tocar aqui de novo.
 *
 * ARMAZENAMENTO: um objeto por CNPJ em localStorage, sobrescrito inteiro a
 * cada "Confirmar" (não é um log -- é o estado ATUAL do alerta desse
 * cliente). Confirmar com o checkbox desmarcado e observação vazia REMOVE o
 * registro -- é assim que se limpa um alerta.
 *
 * "Não cobrar" usa timestamp corrido (Date.now() + dias*24h), não a
 * convenção de meio-dia do resto do projeto (normalizarData) -- de
 * propósito: normalizarData serve pra comparar DATAS DE CALENDÁRIO
 * (vencimento, promessa), e aqui o pedido é uma DURAÇÃO rolante ("por 1
 * dia a partir de agora"), não um dia específico do calendário.
 *
 * ONDE COLAR: depois do Módulo 0 (config/registro de painéis) e ANTES do
 * Módulo 7 (que consulta estaSuprimidoDaPrioridade ao montar a fila -- se
 * este módulo não tiver carregado, o Módulo 7 degrada silenciosamente pra
 * "ninguém suprimido", nunca lança exceção).
 * ========================================================================= */
(function () {
  'use strict';

  if (window.__alertaClienteCarregado) return;
  window.__alertaClienteCarregado = true;

  const MS_POR_DIA = 24 * 60 * 60 * 1000;

  const CONFIG_ALERTA = {
    CHAVE_STORAGE: 'smarttable_alerta_cliente_v1',
    ID_BOTAO: 'smarttable-botao-alerta-cliente',
    ID_PAINEL: 'smarttable-painel-alerta-cliente',
    ID_AVISO: 'smarttable-aviso-observacao-cliente',
    // Mesmo z-index dos outros painéis nossos (Módulo 9/10/11): ABAIXO dos
    // modais do CRM (z-50).
    Z_INDEX: 30,
    INTERVALO_PADRAO_DIAS: 1,
    // CONFIRMADO AO VIVO (relatado pelo usuário): o cabeçalho do CRM
    // (`#sit-header`) cobre toda a largura da tela, do topo até y=80px, com
    // z-index 50 -- MESMO nível dos modais do CRM. O canto superior
    // esquerdo (top:16px, onde o botão nasceu) fica embaixo dele por
    // completo; `document.elementFromPoint` naquele ponto devolvia o botão
    // de recolher menu do próprio CRM (#sidebar-toggle-btn), nunca o nosso.
    // Subir nosso z-index acima de 50 pra vencer resolveria isso, mas
    // quebraria a regra que todo painel daqui segue: nunca competir com
    // modal de verdade. A solução é geométrica, não de z-index: ficar
    // inteiramente ABAIXO da faixa do cabeçalho (80px + folga).
    TOPO_BOTAO: '96px',
    TOPO_PAINEL: '150px',
  };

  const CORES = {
    tinta: '#16232F',
    texto: '#344054',
    apagado: '#98a2b3',
    borda: '#d0d5dd',
    linha: '#eef2f6',
    fundo: '#ffffff',
    alerta: '#B45309',
    perigo: '#B42318',
  };

  let painelEl = null;
  let avisoEl = null;
  let botaoEl = null;

  function cnpjDaPagina() {
    try {
      return new URLSearchParams(location.search).get('cnpj') || '';
    } catch {
      return '';
    }
  }

  /* ---------------------------------------------------------------------
   * ARMAZENAMENTO
   * --------------------------------------------------------------------- */

  function lerTodos() {
    try {
      const raw = localStorage.getItem(CONFIG_ALERTA.CHAVE_STORAGE);
      const dados = raw ? JSON.parse(raw) : {};
      return dados && typeof dados === 'object' && !Array.isArray(dados) ? dados : {};
    } catch {
      return {};
    }
  }

  function salvarTodos(dados) {
    try {
      localStorage.setItem(CONFIG_ALERTA.CHAVE_STORAGE, JSON.stringify(dados));
    } catch (erro) {
      console.warn('[Alerta Cliente] Não consegui salvar no localStorage.', erro);
    }
  }

  /** @returns {{observacao: string, naoCobrarAte: number|null, atualizadoEm: number}|null} */
  function obterAlerta(cnpj) {
    if (!cnpj) return null;
    return lerTodos()[cnpj] || null;
  }

  /**
   * Grava (ou remove, se ficar sem efeito) o alerta de um cliente.
   *
   * @param {string} cnpj
   * @param {{naoCobrar: boolean, intervaloDias?: number, observacao?: string}} opcoes
   * @param {number} [agora] Injetável pra teste.
   */
  function salvarAlerta(cnpj, opcoes, agora) {
    if (!cnpj) return;
    const observacaoLimpa = (opcoes.observacao || '').trim();
    const naoCobrar = !!opcoes.naoCobrar;

    const todos = lerTodos();

    if (!naoCobrar && !observacaoLimpa) {
      // Sem checkbox e sem observação não é um alerta -- é a forma de
      // LIMPAR um alerta anterior.
      delete todos[cnpj];
      salvarTodos(todos);
      return;
    }

    const dias = Number.isFinite(opcoes.intervaloDias) && opcoes.intervaloDias > 0
      ? opcoes.intervaloDias
      : CONFIG_ALERTA.INTERVALO_PADRAO_DIAS;

    todos[cnpj] = {
      observacao: observacaoLimpa,
      naoCobrarAte: naoCobrar ? (agora ?? Date.now()) + dias * MS_POR_DIA : null,
      atualizadoEm: agora ?? Date.now(),
    };
    salvarTodos(todos);
  }

  /**
   * A pergunta que o Módulo 7 faz ao montar a fila por prioridade: este
   * cliente está com "não cobrar" ativo agora? Nunca lança -- ausência de
   * dado (deste módulo não carregado, cliente sem alerta, JSON corrompido)
   * sempre significa "não suprimido", nunca "suprimido por engano".
   *
   * @param {string} cnpj
   * @param {number} [agora] Injetável pra teste.
   * @returns {boolean}
   */
  function estaSuprimidoDaPrioridade(cnpj, agora) {
    const alerta = obterAlerta(cnpj);
    if (!alerta || alerta.naoCobrarAte == null) return false;
    return (agora ?? Date.now()) < alerta.naoCobrarAte;
  }

  /* ---------------------------------------------------------------------
   * DESENHO
   * --------------------------------------------------------------------- */

  function criarDiv(texto, estilo) {
    const el = document.createElement('div');
    if (texto) el.textContent = texto;
    Object.assign(el.style, estilo || {});
    return el;
  }

  function fecharAviso() {
    if (!avisoEl) return;
    avisoEl.remove();
    avisoEl = null;
  }

  function fecharPainel() {
    if (!painelEl) return;
    painelEl.remove();
    painelEl = null;
  }

  /** O que o registro de painéis do Módulo 0 chama -- fecha o que estiver aberto dos dois. */
  function fecharTudo() {
    fecharAviso();
    fecharPainel();
  }

  function atualizarBadgeDoBotao(cnpj) {
    if (!botaoEl) return;
    const alerta = obterAlerta(cnpj);
    const ativo = !!alerta;
    botaoEl.style.background = ativo ? CORES.alerta : CORES.tinta;
    botaoEl.title = ativo
      ? 'Alerta do cliente (ativo) -- clique pra ver ou editar'
      : 'Alerta do cliente';
  }

  function mostrarAviso(cnpj, texto) {
    window.__smartTableUtil?.fecharOutrosPaineis?.('alertaCliente');
    fecharPainel();

    avisoEl = document.createElement('div');
    avisoEl.id = CONFIG_ALERTA.ID_AVISO;
    Object.assign(avisoEl.style, {
      position: 'fixed',
      // "Um pouco acima do centro da tela": 50% seria o centro exato.
      top: '42%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      background: CORES.fundo,
      border: `1px solid ${CORES.borda}`,
      borderLeft: `5px solid ${CORES.alerta}`,
      borderRadius: '10px',
      padding: '16px 18px',
      boxShadow: '0 10px 34px rgba(0,0,0,0.28)',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontSize: '13px',
      zIndex: CONFIG_ALERTA.Z_INDEX,
      width: '360px',
      maxWidth: '90vw',
    });

    avisoEl.appendChild(criarDiv('⚠ Observação deste cliente', {
      color: CORES.alerta, fontWeight: '700', fontSize: '13px', marginBottom: '8px',
    }));
    avisoEl.appendChild(criarDiv(texto, {
      color: CORES.texto, lineHeight: '1.5', marginBottom: '12px', whiteSpace: 'pre-wrap',
    }));

    const botaoOk = document.createElement('button');
    botaoOk.type = 'button';
    botaoOk.textContent = 'Entendi';
    Object.assign(botaoOk.style, {
      background: CORES.tinta, color: '#fff', border: 'none', borderRadius: '6px',
      padding: '7px 16px', fontSize: '13px', cursor: 'pointer', fontWeight: '600',
    });
    botaoOk.addEventListener('click', fecharAviso);
    avisoEl.appendChild(botaoOk);

    document.body.appendChild(avisoEl);
    void cnpj; // não usado no texto -- mantido no parâmetro por simetria com o resto do módulo
  }

  function mostrarAvisoSeNecessario(cnpj) {
    const alerta = obterAlerta(cnpj);
    if (!alerta || !alerta.observacao) return;
    // Regra assimétrica documentada no cabeçalho: só avisa quando "não
    // cobrar" NÃO está ativo agora.
    if (alerta.naoCobrarAte != null && Date.now() < alerta.naoCobrarAte) return;
    mostrarAviso(cnpj, alerta.observacao);
  }

  function abrirPainel(cnpj) {
    window.__smartTableUtil?.fecharOutrosPaineis?.('alertaCliente');
    fecharAviso();

    const existente = obterAlerta(cnpj);
    const naoCobrarAtivo = !!(existente && existente.naoCobrarAte != null && Date.now() < existente.naoCobrarAte);
    const diasRestantes = naoCobrarAtivo
      ? Math.max(1, Math.ceil((existente.naoCobrarAte - Date.now()) / MS_POR_DIA))
      : CONFIG_ALERTA.INTERVALO_PADRAO_DIAS;

    painelEl = document.createElement('div');
    painelEl.id = CONFIG_ALERTA.ID_PAINEL;
    Object.assign(painelEl.style, {
      position: 'fixed',
      top: CONFIG_ALERTA.TOPO_PAINEL,
      left: '16px',
      background: CORES.fundo,
      border: `1px solid ${CORES.borda}`,
      borderRadius: '10px',
      padding: '14px 16px',
      boxShadow: '0 4px 18px rgba(0,0,0,0.18)',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontSize: '13px',
      zIndex: CONFIG_ALERTA.Z_INDEX,
      width: '300px',
      maxWidth: '92vw',
    });

    painelEl.appendChild(criarDiv('Alerta do cliente', {
      color: CORES.tinta, fontWeight: '700', fontSize: '14px', marginBottom: '10px',
    }));

    // Checkbox "Não cobrar"
    const linhaCheckbox = criarDiv('', { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' });
    const checkboxNaoCobrar = document.createElement('input');
    checkboxNaoCobrar.type = 'checkbox';
    checkboxNaoCobrar.id = 'smarttable-alerta-checkbox-nao-cobrar';
    checkboxNaoCobrar.checked = naoCobrarAtivo;
    const rotuloCheckbox = document.createElement('label');
    rotuloCheckbox.htmlFor = checkboxNaoCobrar.id;
    rotuloCheckbox.textContent = 'Não cobrar';
    Object.assign(rotuloCheckbox.style, { color: CORES.texto, cursor: 'pointer' });
    linhaCheckbox.appendChild(checkboxNaoCobrar);
    linhaCheckbox.appendChild(rotuloCheckbox);
    painelEl.appendChild(linhaCheckbox);

    // Intervalo em dias -- só visível com o checkbox marcado.
    const linhaDias = criarDiv('', {
      display: naoCobrarAtivo ? 'flex' : 'none', alignItems: 'center', gap: '8px', marginBottom: '10px', paddingLeft: '24px',
    });
    linhaDias.appendChild(criarDiv('Por quantos dias:', { color: CORES.apagado, fontSize: '12px' }));
    const inputDias = document.createElement('input');
    inputDias.type = 'number';
    inputDias.min = '1';
    inputDias.step = '1';
    inputDias.value = String(diasRestantes);
    Object.assign(inputDias.style, {
      width: '56px', padding: '4px 6px', border: `1px solid ${CORES.borda}`, borderRadius: '6px', fontSize: '12px',
    });
    linhaDias.appendChild(inputDias);
    painelEl.appendChild(linhaDias);

    checkboxNaoCobrar.addEventListener('change', () => {
      linhaDias.style.display = checkboxNaoCobrar.checked ? 'flex' : 'none';
    });

    // Observação
    painelEl.appendChild(criarDiv('Observação', { color: CORES.apagado, fontSize: '12px', marginBottom: '4px' }));
    const textareaObservacao = document.createElement('textarea');
    textareaObservacao.value = (existente && existente.observacao) || '';
    textareaObservacao.rows = 3;
    Object.assign(textareaObservacao.style, {
      width: '100%', boxSizing: 'border-box', padding: '6px 8px', border: `1px solid ${CORES.borda}`,
      borderRadius: '6px', fontSize: '12.5px', fontFamily: 'inherit', resize: 'vertical', marginBottom: '10px',
    });
    painelEl.appendChild(textareaObservacao);

    const botaoConfirmar = document.createElement('button');
    botaoConfirmar.type = 'button';
    botaoConfirmar.textContent = 'Confirmar';
    Object.assign(botaoConfirmar.style, {
      background: CORES.tinta, color: '#fff', border: 'none', borderRadius: '6px',
      padding: '7px 16px', fontSize: '13px', cursor: 'pointer', fontWeight: '600', width: '100%',
    });
    botaoConfirmar.addEventListener('click', () => {
      salvarAlerta(cnpj, {
        naoCobrar: checkboxNaoCobrar.checked,
        intervaloDias: parseInt(inputDias.value, 10),
        observacao: textareaObservacao.value,
      });
      atualizarBadgeDoBotao(cnpj);
      fecharPainel();
    });
    painelEl.appendChild(botaoConfirmar);

    painelEl.appendChild(criarDiv('Esc pra fechar sem salvar', {
      marginTop: '8px', paddingTop: '8px', borderTop: `1px solid ${CORES.linha}`,
      color: CORES.apagado, fontSize: '11px', textAlign: 'center',
    }));

    document.body.appendChild(painelEl);
  }

  function criarBotao(cnpj) {
    const el = document.createElement('button');
    el.type = 'button';
    el.id = CONFIG_ALERTA.ID_BOTAO;
    el.textContent = '⚠ Alerta';
    Object.assign(el.style, {
      position: 'fixed',
      top: CONFIG_ALERTA.TOPO_BOTAO,
      left: '16px',
      background: CORES.tinta,
      color: '#fff',
      border: 'none',
      borderRadius: '8px',
      padding: '7px 14px',
      fontSize: '12.5px',
      fontWeight: '600',
      cursor: 'pointer',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      boxShadow: '0 4px 14px rgba(0,0,0,0.2)',
      zIndex: CONFIG_ALERTA.Z_INDEX,
    });
    el.addEventListener('click', () => {
      if (painelEl) {
        fecharPainel();
        return;
      }
      abrirPainel(cnpj);
    });
    document.body.appendChild(el);
    return el;
  }

  function aoCarregar() {
    const cnpj = cnpjDaPagina();
    if (!cnpj) return; // só faz sentido na página do cliente

    botaoEl = criarBotao(cnpj);
    atualizarBadgeDoBotao(cnpj);
    mostrarAvisoSeNecessario(cnpj);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', aoCarregar);
  } else {
    aoCarregar();
  }

  document.addEventListener('keydown', (e) => {
    if (e.code !== 'Escape') return;
    if (painelEl) fecharPainel();
    else if (avisoEl) fecharAviso();
  });

  window.__smartTableUtil?.registrarPainel?.('alertaCliente', fecharTudo);

  window.__alertaCliente = {
    obterAlerta,
    salvarAlerta,
    estaSuprimidoDaPrioridade,
    abrirPainel,
    fecharPainel,
    mostrarAvisoSeNecessario,
    fecharAviso,
    estaAberto: () => painelEl !== null,
    avisoEstaAberto: () => avisoEl !== null,
    CONFIG_ALERTA,
  };
})();
