// Botão "Alerta" na página do cliente (Módulo 12).
//
// DUAS REGRAS:
//   1. "Não cobrar" (checkbox + dias, padrão 1) suprime o cliente da fila
//      por prioridade (Módulo 7) enquanto o intervalo não expira.
//   2. Qualquer alerta ativo -- "não cobrar" e/ou observação -- dispara um
//      aviso automático, um pouco acima do centro da tela, toda vez que a
//      página do cliente abre. Até a v1.21.1 isto era assimétrico (só
//      avisava com observação SEM "não cobrar"); corrigido na v1.21.2 a
//      pedido do usuário -- entrar num cliente marcado "não cobrar" é
//      exatamente quando o aviso mais importa.
//
// O BOTÃO tenta se encaixar dentro do card do cliente, logo depois do botão
// "Responsável financeiro" real da página; sem essa âncora, cai pro botão
// flutuante fixo (ver seção 9).
const { novaJanela } = require('./helpers/dom-env');
const { criarChecador } = require('./helpers/checar');

const { checar, resumo } = criarChecador('alerta-cliente');

const SPECS = [{ arquivo: 'modulo0-utilitarios-compartilhados.js' }, { arquivo: 'modulo12-alerta-cliente.js' }];
const CNPJ = '11111111/0001-11';
const URL_LISTA = 'https://texhub.texcotton.com.br/crm/clientes';
const MS_POR_DIA = 24 * 60 * 60 * 1000;

const abrirCliente = (cnpj = CNPJ) => novaJanela({ url: `https://texhub.texcotton.com.br/crm/clientes/grupo/1?cnpj=${encodeURIComponent(cnpj)}`, specs: SPECS });
const abrirLista = () => novaJanela({ url: URL_LISTA, specs: SPECS });

// HTML real do card do cliente (recorte relevante, colado pelo usuário ao
// vivo) -- é a âncora onde o botão deve se encaixar.
const HTML_CARD_COM_ANCORA = `
  <div class="flex items-center justify-between mb-3">
    <h3 class="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Informações de Contato</h3>
    <button type="button" onclick="abrirModalResponsavel()" class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-[11px] font-medium text-gray-600 hover:text-gray-900 transition">
      Responsável financeiro
    </button>
  </div>
`;
const abrirClienteComCard = (cnpj = CNPJ) => novaJanela({
  url: `https://texhub.texcotton.com.br/crm/clientes/grupo/1?cnpj=${encodeURIComponent(cnpj)}`,
  bodyHtml: HTML_CARD_COM_ANCORA,
  specs: SPECS,
});

// =====================================================================
// 1. SÓ EXISTE NA PÁGINA DO CLIENTE
// =====================================================================
(function soNaPaginaDoCliente() {
  const wLista = abrirLista();
  checar('sem CNPJ na URL, o botão não é desenhado', wLista.document.getElementById(wLista.__alertaCliente.CONFIG_ALERTA.ID_BOTAO) === null);

  const wCliente = abrirCliente();
  checar('com CNPJ na URL, o botão aparece', wCliente.document.getElementById(wCliente.__alertaCliente.CONFIG_ALERTA.ID_BOTAO) !== null);
})();

// =====================================================================
// 2. ARMAZENAMENTO: salvar, ler, limpar
// =====================================================================
(function armazenamento() {
  const w = abrirCliente();
  const a = w.__alertaCliente;

  checar('cliente sem alerta: obterAlerta devolve null', a.obterAlerta(CNPJ) === null);

  const agora = Date.now();
  a.salvarAlerta(CNPJ, { naoCobrar: true, intervaloDias: 3, observacao: '  liga só à tarde  ' }, agora);
  const alerta = a.obterAlerta(CNPJ);
  checar('observação é salva com espaços cortados', alerta.observacao === 'liga só à tarde', alerta.observacao);
  checar('naoCobrarAte é agora + 3 dias', alerta.naoCobrarAte === agora + 3 * MS_POR_DIA, String(alerta.naoCobrarAte));

  // Intervalo padrão quando não informado.
  a.salvarAlerta('22222222/0001-22', { naoCobrar: true }, agora);
  const alertaPadrao = a.obterAlerta('22222222/0001-22');
  checar('sem intervalo informado, usa o padrão (1 dia)', alertaPadrao.naoCobrarAte === agora + MS_POR_DIA);

  // Intervalo inválido (0, negativo, não-número) cai no padrão -- nunca uma
  // supressão que já nasce expirada ou apontando pro passado.
  [0, -5, NaN, undefined].forEach((valor, i) => {
    const cnpjTeste = `3333333${i}/0001-33`;
    a.salvarAlerta(cnpjTeste, { naoCobrar: true, intervaloDias: valor }, agora);
    const registro = a.obterAlerta(cnpjTeste);
    checar(`intervaloDias=${valor} cai no padrão (1 dia), não vira supressão inválida`, registro.naoCobrarAte === agora + MS_POR_DIA, String(registro.naoCobrarAte));
  });

  // Confirmar sem checkbox e sem observação LIMPA o alerta -- é o mecanismo
  // de remover.
  a.salvarAlerta(CNPJ, { naoCobrar: false, observacao: '' }, agora);
  checar('checkbox desmarcado + observação vazia remove o alerta', a.obterAlerta(CNPJ) === null);

  // Observação sozinha, sem "não cobrar", é um alerta válido (naoCobrarAte
  // fica null).
  a.salvarAlerta(CNPJ, { naoCobrar: false, observacao: 'só um lembrete' }, agora);
  const soObservacao = a.obterAlerta(CNPJ);
  checar('observação sozinha é salva', soObservacao.observacao === 'só um lembrete');
  checar('e naoCobrarAte fica null (não suprime a fila)', soObservacao.naoCobrarAte === null);
})();

// =====================================================================
// 3. estaSuprimidoDaPrioridade -- a pergunta que o Módulo 7 faz
// =====================================================================
(function supressao() {
  const w = abrirCliente();
  const a = w.__alertaCliente;
  const agora = Date.now();

  checar('cliente sem alerta nenhum: nunca suprimido', a.estaSuprimidoDaPrioridade('99999999/0001-99', agora) === false);

  a.salvarAlerta(CNPJ, { naoCobrar: true, intervaloDias: 2 }, agora);
  checar('dentro do intervalo: suprimido', a.estaSuprimidoDaPrioridade(CNPJ, agora) === true);
  checar('um instante antes de expirar: ainda suprimido', a.estaSuprimidoDaPrioridade(CNPJ, agora + 2 * MS_POR_DIA - 1000) === true);
  checar('depois de expirar: não suprimido mais (sem ação manual)', a.estaSuprimidoDaPrioridade(CNPJ, agora + 2 * MS_POR_DIA + 1000) === false);

  a.salvarAlerta('44444444/0001-44', { naoCobrar: false, observacao: 'nota qualquer' }, agora);
  checar('observação sem "não cobrar": nunca suprime a fila', a.estaSuprimidoDaPrioridade('44444444/0001-44', agora) === false);
})();

// =====================================================================
// 4. O PAINEL: checkbox revela o campo de dias, confirmar salva
// =====================================================================
(function painel() {
  const w = abrirCliente();
  const a = w.__alertaCliente;

  checar('painel fechado ao carregar', a.estaAberto() === false);
  a.abrirPainel(CNPJ);
  checar('abrirPainel abre o painel', a.estaAberto() === true);

  const painelEl = w.document.getElementById(a.CONFIG_ALERTA.ID_PAINEL);
  const checkbox = painelEl.querySelector('input[type="checkbox"]');
  const inputDias = painelEl.querySelector('input[type="number"]');
  const textarea = painelEl.querySelector('textarea');
  const linhaDias = inputDias.closest('div');

  checar('checkbox começa desmarcado (sem alerta prévio)', checkbox.checked === false);
  checar('campo de dias começa escondido', linhaDias.style.display === 'none');

  checkbox.checked = true;
  checkbox.dispatchEvent(new w.Event('change', { bubbles: true }));
  checar('marcar o checkbox revela o campo de dias', linhaDias.style.display !== 'none');

  inputDias.value = '5';
  textarea.value = 'cliente pediu prazo';
  const botaoConfirmar = [...painelEl.querySelectorAll('button')].find((b) => b.textContent === 'Confirmar');
  botaoConfirmar.click();

  checar('confirmar fecha o painel', a.estaAberto() === false);
  const salvo = a.obterAlerta(CNPJ);
  checar('confirmar salva o checkbox como "não cobrar" ativo', salvo.naoCobrarAte !== null);
  checar('confirmar salva a observação digitada', salvo.observacao === 'cliente pediu prazo', salvo.observacao);
  checar('confirmar salva os 5 dias pedidos (~5 dias de janela)', Math.round((salvo.naoCobrarAte - Date.now()) / MS_POR_DIA) === 5);
})();

// =====================================================================
// 5. REABRIR O PAINEL PRÉ-PREENCHE O ESTADO ATUAL
// =====================================================================
(function preenchimento() {
  const w = abrirCliente();
  const a = w.__alertaCliente;
  const agora = Date.now();

  a.salvarAlerta(CNPJ, { naoCobrar: true, intervaloDias: 4, observacao: 'nota existente' }, agora);
  a.abrirPainel(CNPJ);

  const painelEl = w.document.getElementById(a.CONFIG_ALERTA.ID_PAINEL);
  const checkbox = painelEl.querySelector('input[type="checkbox"]');
  const textarea = painelEl.querySelector('textarea');

  checar('reabrir com "não cobrar" ativo vem com o checkbox marcado', checkbox.checked === true);
  checar('e a observação existente pré-preenchida', textarea.value === 'nota existente');
})();

// =====================================================================
// 6. O AVISO AUTOMÁTICO -- SEMPRE que houver alerta ativo
// =====================================================================
// mostrarAvisoSeNecessario é chamada de dentro de aoCarregar -- a seção 6b
// confirma essa ligação no código-fonte. Aqui testamos a DECISÃO em si
// (mesmo padrão da seção "esc": chamar a função exportada direto, sem
// precisar recriar duas janelas com localStorage compartilhado entre elas
// só pra provar uma ligação de uma linha).
//
// ATÉ A v1.21.1 isto era assimétrico (só avisava com observação SEM "não
// cobrar"). RELATADO PELO USUÁRIO como errado -- entrar num cliente
// marcado "não cobrar" é exatamente quando o aviso mais importa. Corrigido
// na v1.21.2: agora avisa sempre.
(function avisoAutomatico() {
  // Cenário A: observação sem "não cobrar" -- aviso aparece, tom "atenção".
  const wA = abrirCliente();
  wA.__alertaCliente.salvarAlerta(CNPJ, { naoCobrar: false, observacao: 'atenção: cliente já reclamou de cobrança errada' });
  wA.__alertaCliente.mostrarAvisoSeNecessario(CNPJ);
  checar('observação sem "não cobrar": mostrarAvisoSeNecessario abre o aviso', wA.__alertaCliente.avisoEstaAberto() === true);
  const avisoA = wA.document.getElementById(wA.__alertaCliente.CONFIG_ALERTA.ID_AVISO);
  checar('o texto da observação aparece no aviso', avisoA.textContent.includes('cliente já reclamou'), avisoA.textContent);
  checar('o título NÃO é o de "não cobrar" (não está ativo aqui)', !avisoA.textContent.includes('NÃO COBRAR'), avisoA.textContent);
  checar('o aviso fica um pouco ACIMA do centro (top < 50%)', parseFloat(avisoA.style.top) < 50, avisoA.style.top);

  // Cenário B: "não cobrar" ativo -- AGORA avisa também (correção pedida),
  // com título de urgência e a data até quando vale.
  const wB = abrirCliente();
  const CNPJ_B = '55555555/0001-55';
  const agoraB = Date.now();
  wB.__alertaCliente.salvarAlerta(CNPJ_B, { naoCobrar: true, intervaloDias: 2, observacao: 'nota junto do não cobrar' }, agoraB);
  wB.__alertaCliente.mostrarAvisoSeNecessario(CNPJ_B);
  checar('"não cobrar" ativo: o aviso aparece (correção pedida pelo usuário)', wB.__alertaCliente.avisoEstaAberto() === true);
  const avisoB = wB.document.getElementById(wB.__alertaCliente.CONFIG_ALERTA.ID_AVISO);
  checar('o título é o de "não cobrar" (urgência maior)', avisoB.textContent.includes('NÃO COBRAR'), avisoB.textContent);
  checar('a observação continua aparecendo junto', avisoB.textContent.includes('nota junto do não cobrar'), avisoB.textContent);

  // Cenário B2: "não cobrar" ativo SEM observação -- ainda avisa, só com o
  // título de urgência.
  const wB2 = abrirCliente();
  const CNPJ_B2 = '88888888/0001-88';
  wB2.__alertaCliente.salvarAlerta(CNPJ_B2, { naoCobrar: true, intervaloDias: 1 });
  wB2.__alertaCliente.mostrarAvisoSeNecessario(CNPJ_B2);
  checar('"não cobrar" ativo sem observação: aviso aparece do mesmo jeito', wB2.__alertaCliente.avisoEstaAberto() === true);

  // Cenário C: nada salvo -- nada aparece, e não lança exceção.
  const wC = abrirCliente();
  wC.__alertaCliente.mostrarAvisoSeNecessario('66666666/0001-66');
  checar('cliente sem alerta nenhum: sem aviso', wC.__alertaCliente.avisoEstaAberto() === false);

  // Cenário D: "não cobrar" já expirado, com observação -- o aviso volta a
  // valer com o tom de observação, não mais o de urgência (sem nenhuma
  // ação manual, mesma lógica de estaSuprimidoDaPrioridade).
  const wD = abrirCliente();
  const CNPJ_D = '77777777/0001-77';
  const passado = Date.now() - 10 * MS_POR_DIA;
  wD.__alertaCliente.salvarAlerta(CNPJ_D, { naoCobrar: true, intervaloDias: 1, observacao: 'nota antiga' }, passado);
  wD.__alertaCliente.mostrarAvisoSeNecessario(CNPJ_D);
  checar('"não cobrar" já expirado: o aviso ainda aparece (pela observação)', wD.__alertaCliente.avisoEstaAberto() === true);
  const avisoD = wD.document.getElementById(wD.__alertaCliente.CONFIG_ALERTA.ID_AVISO);
  checar('mas o título já não é mais o de urgência (expirou de verdade)', !avisoD.textContent.includes('NÃO COBRAR'), avisoD.textContent);
})();

// =====================================================================
// 6b. A LIGAÇÃO COM O CARREGAMENTO DA PÁGINA EXISTE DE VERDADE
// =====================================================================
// Sem isto, mostrarAvisoSeNecessario poderia estar perfeita e nunca ser
// chamada de verdade quando a página abre -- a seção 6 testaria uma função
// morta.
(function ligacaoComOCarregamento() {
  const fs = require('fs');
  const path = require('path');
  const texto = fs.readFileSync(path.join(__dirname, '..', 'modulos', 'modulo12-alerta-cliente.js'), 'utf8');
  const corpoAoCarregar = texto.match(/function aoCarregar\(\) \{([\s\S]*?)\n  \}/)?.[1] || '';
  checar('aoCarregar chama mostrarAvisoSeNecessario', /mostrarAvisoSeNecessario\(cnpj\)/.test(corpoAoCarregar));
})();

// =====================================================================
// 7. ESC FECHA O QUE ESTIVER ABERTO (painel OU aviso, igual ao resto do projeto)
// =====================================================================
(function esc() {
  const w = abrirCliente();
  const a = w.__alertaCliente;

  a.abrirPainel(CNPJ);
  checar('painel aberto antes do Esc', a.estaAberto() === true);
  w.document.dispatchEvent(new w.KeyboardEvent('keydown', { code: 'Escape', bubbles: true }));
  checar('Esc fecha o painel', a.estaAberto() === false);

  w.__alertaCliente.salvarAlerta(CNPJ, { naoCobrar: false, observacao: 'nota' });
  w.__alertaCliente.mostrarAvisoSeNecessario(CNPJ);
  checar('aviso aberto antes do Esc', a.avisoEstaAberto() === true);
  w.document.dispatchEvent(new w.KeyboardEvent('keydown', { code: 'Escape', bubbles: true }));
  checar('Esc fecha o aviso', a.avisoEstaAberto() === false);
})();

// =====================================================================
// 8. O BOTÃO ALTERNA O PAINEL (clique abre, clique de novo fecha)
// =====================================================================
(function botao() {
  const w = abrirCliente();
  const a = w.__alertaCliente;
  const botaoEl = w.document.getElementById(a.CONFIG_ALERTA.ID_BOTAO);

  botaoEl.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  checar('clique no botão abre o painel', a.estaAberto() === true);
  botaoEl.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  checar('clique de novo fecha o painel', a.estaAberto() === false);
})();

// =====================================================================
// 9. ONDE O BOTÃO FICA: dentro do card (âncora real) ou fallback fixo
// =====================================================================
// Cada bloco fica numa IIFE própria, e nada cria uma SEGUNDA janela no meio
// de interagir com a primeira -- é a armadilha de jsdom já documentada no
// projeto (identificador livre dentro do código do módulo resolve pra
// última janela criada, não pra que criou o elemento). Ver
// tests/helpers/dom-env.js.
(function botaoComAncora() {
  // Com a âncora real na página (HTML colado pelo usuário): o botão entra
  // logo depois do "Responsável financeiro", como irmão no mesmo container
  // flex -- não como elemento flutuante.
  const w = abrirClienteComCard();
  const ancora = w.document.querySelector('button[onclick="abrirModalResponsavel()"]');
  const botaoInjetado = w.document.getElementById(w.__alertaCliente.CONFIG_ALERTA.ID_BOTAO);

  checar('com a âncora presente, o botão existe', botaoInjetado !== null);
  checar('o botão fica logo depois do "Responsável financeiro" (mesmo pai)', botaoInjetado.previousElementSibling === ancora);
  checar('nessa forma o botão NÃO é position:fixed (flui no card, não flutua)', botaoInjetado.style.position !== 'fixed');

  // A cor de "tem alerta ativo" funciona também nesse caminho -- pelo fluxo
  // real da UI (clicar no botão, preencher, confirmar), não pela API direta,
  // porque é o clique em "Confirmar" quem chama atualizarBadgeDoBotao.
  const corAntes = botaoInjetado.style.background;
  botaoInjetado.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  const painel = w.document.getElementById(w.__alertaCliente.CONFIG_ALERTA.ID_PAINEL);
  painel.querySelector('textarea').value = 'nota';
  const confirmar = [...painel.querySelectorAll('button')].find((b) => b.textContent === 'Confirmar');
  confirmar.click();
  checar('botão injetado no card muda de cor quando há alerta ativo', botaoInjetado.style.background !== corAntes, botaoInjetado.style.background);
})();

(function botaoSemAncoraCaiPraFallback() {
  // Sem a âncora (páginas antigas, layout diferente) -- cai pro botão
  // flutuante de antes, sem ficar sem opção nenhuma.
  const w = abrirCliente();
  const botaoFallback = w.document.getElementById(w.__alertaCliente.CONFIG_ALERTA.ID_BOTAO);
  checar('sem a âncora, ainda existe um botão (fallback)', botaoFallback !== null);
  checar(
    'e esse fallback É position:fixed, abaixo do cabeçalho do CRM',
    botaoFallback.style.position === 'fixed' && botaoFallback.style.top === w.__alertaCliente.CONFIG_ALERTA.TOPO_BOTAO
  );
})();

resumo();
