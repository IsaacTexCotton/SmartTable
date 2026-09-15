// Testes do Módulo 3 (Fila de Atendimento) -- portados dos harnesses ad hoc
// desta sessão de desenvolvimento (fuzz-memoria/harness-fila.js,
// harness-botao.js, harness-retomar.js), rodando contra o código REAL de
// modulos/modulo3-fila-atendimento.js via window.filaDebug (que já expõe
// tudo que os testes precisam -- nenhuma cópia "patched" é necessária).
const { JSDOM, VirtualConsole } = require('jsdom');
const { novaJanela, textoDoModulo } = require('./helpers/dom-env');
const { criarChecador } = require('./helpers/checar');

const { checar, resumo } = criarChecador('fila-atendimento');

const SPECS = [{ arquivo: 'modulo0-utilitarios-compartilhados.js' }, { arquivo: 'modulo3-fila-atendimento.js' }];

function carregarPagina(url, bodyHtml, opts) {
  return novaJanela({ url, bodyHtml, specs: SPECS, ...opts });
}

function linha(controleTexto, diasTexto, nome) {
  return `<tr><td>${nome || 'Cliente'} Controle: ${controleTexto} - ${diasTexto} dias de atraso</td></tr>`;
}

function lerRawStorage(w, chave) {
  const raw = w.localStorage.getItem(chave);
  return raw ? JSON.parse(raw) : null;
}

// =====================================================================
// A. iniciarFila() -- construção + gravação inicial
// =====================================================================
(function () {
  const w = carregarPagina('https://texhub.texcotton.com.br/crm/clientes');
  w.document.body.innerHTML = `<table><tbody>
    ${linha('0|11111111/0001-11', '15', 'Cliente A')}
    ${linha('0|22222222/0001-22', '5', 'Cliente B')}
  </tbody></table>`;

  w.filaDebug.iniciarFila();
  const salvo = lerRawStorage(w, w.filaDebug.CONFIG.CHAVE_STORAGE);

  checar('iniciarFila grava versao correta', salvo && salvo.versao === w.filaDebug.CONFIG.VERSAO_SCHEMA);
  checar('iniciarFila grava 2 clientes', salvo && salvo.clientes.length === 2, JSON.stringify(salvo));
  checar('iniciarFila ordena por diasAtraso desc (15 antes de 5)', salvo && salvo.clientes[0].cnpj === '11111111/0001-11');
  checar('iniciarFila começa com indiceAtual=-1', salvo && salvo.indiceAtual === -1);
  checar('iniciarFila começa com totalAtendidos=0 e totalPulados=0', salvo && salvo.totalAtendidos === 0 && salvo.totalPulados === 0);
  checar('iniciarFila grava iniciadoEm como timestamp de hoje', salvo && w.filaDebug.mesmoDiaDeHoje(salvo.iniciadoEm));
})();

// =====================================================================
// B. Unificação matriz/filial (mesma raiz de CNPJ) -- fica só o mais atrasado
// =====================================================================
(function () {
  const w = carregarPagina('https://texhub.texcotton.com.br/crm/clientes');
  w.document.body.innerHTML = `<table><tbody>
    ${linha('0|11111111/0001-11', '5', 'Matriz')}
    ${linha('0|11111111/0002-92', '20', 'Filial mais atrasada')}
  </tbody></table>`;

  const clientes = w.filaDebug.construirFilaAPartirDaPagina();
  checar('matriz/filial unificadas em 1 cliente só', clientes.length === 1, JSON.stringify(clientes));
  checar('mantém a entrada com MAIS dias de atraso (filial, 20 dias)', clientes[0] && clientes[0].cnpj === '11111111/0002-92');
})();

// =====================================================================
// C. Cliente já atendido hoje é pulado na montagem da fila
// =====================================================================
(function () {
  const w = carregarPagina('https://texhub.texcotton.com.br/crm/clientes');
  w.filaDebug.marcarComoAtendidoHoje('33333333/0001-33');
  w.document.body.innerHTML = `<table><tbody>
    ${linha('0|33333333/0001-33', '10', 'Já atendido')}
    ${linha('0|44444444/0001-44', '10', 'Não atendido')}
  </tbody></table>`;

  const clientes = w.filaDebug.construirFilaAPartirDaPagina();
  checar('cliente já atendido hoje NÃO entra na fila nova', clientes.length === 1 && clientes[0].cnpj === '44444444/0001-44', JSON.stringify(clientes));
})();

// =====================================================================
// D. irParaProximo('pulado') -- avança, soma totalPulados, NÃO marca atendido
// =====================================================================
(function () {
  const w = carregarPagina('https://texhub.texcotton.com.br/crm/clientes');
  const fila = {
    versao: w.filaDebug.CONFIG.VERSAO_SCHEMA,
    clientes: [
      { url: 'https://x/a', cnpj: 'A', label: 'A' },
      { url: 'https://x/b', cnpj: 'B', label: 'B' },
    ],
    indiceAtual: 0,
    totalAtendidos: 0,
    totalPulados: 0,
    iniciadoEm: Date.now(),
  };
  w.filaDebug.salvarFila(fila);

  w.filaDebug.irParaProximo('pulado');
  const salvo = lerRawStorage(w, w.filaDebug.CONFIG.CHAVE_STORAGE);

  checar('irParaProximo(pulado) avança indiceAtual', salvo && salvo.indiceAtual === 1);
  checar('irParaProximo(pulado) soma totalPulados', salvo && salvo.totalPulados === 1);
  checar('irParaProximo(pulado) NÃO soma totalAtendidos', salvo && salvo.totalAtendidos === 0);
  checar('irParaProximo(pulado) NÃO marca CNPJ como atendido hoje', !w.filaDebug.obterAtendidosHoje().has('A'));
  checar('irParaProximo(pulado) grava ultimoMotivo=pulado', salvo && salvo.ultimoMotivo === 'pulado');
})();

// =====================================================================
// E. irParaProximo quando indiceRegistrado === indiceAtual -- conta como
//    'atendido' MESMO que o motivo passado seja 'pulado'
// =====================================================================
(function () {
  const w = carregarPagina('https://texhub.texcotton.com.br/crm/clientes');
  const fila = {
    versao: w.filaDebug.CONFIG.VERSAO_SCHEMA,
    clientes: [
      { url: 'https://x/a', cnpj: 'A', label: 'A' },
      { url: 'https://x/b', cnpj: 'B', label: 'B' },
    ],
    indiceAtual: 0,
    indiceRegistrado: 0,
    totalAtendidos: 0,
    totalPulados: 0,
    iniciadoEm: Date.now(),
  };
  w.filaDebug.salvarFila(fila);

  w.filaDebug.irParaProximo('pulado');
  const salvo = lerRawStorage(w, w.filaDebug.CONFIG.CHAVE_STORAGE);

  checar('cliente já registrado conta como atendido mesmo clicando "Próximo"', salvo && salvo.totalAtendidos === 1 && salvo.totalPulados === 0, JSON.stringify(salvo));
  checar('indiceRegistrado é limpo após avançar', salvo && !('indiceRegistrado' in salvo));
})();

// =====================================================================
// F. irParaProximo no fim da fila -- limpa o storage em vez de salvar
// =====================================================================
(function () {
  const w = carregarPagina('https://texhub.texcotton.com.br/crm/clientes');
  const fila = {
    versao: w.filaDebug.CONFIG.VERSAO_SCHEMA,
    clientes: [{ url: 'https://x/a', cnpj: 'A', label: 'A' }],
    indiceAtual: 0,
    totalAtendidos: 0,
    totalPulados: 0,
    iniciadoEm: Date.now(),
  };
  w.filaDebug.salvarFila(fila);

  w.filaDebug.irParaProximo('pulado');
  const salvo = w.localStorage.getItem(w.filaDebug.CONFIG.CHAVE_STORAGE);

  checar('fim da fila remove a chave do localStorage (não deixa lixo)', salvo === null, `valor residual: ${salvo}`);
})();

// =====================================================================
// G. irParaAnterior -- desfaz exatamente a contagem do passo revertido
// =====================================================================
(function () {
  const w = carregarPagina('https://texhub.texcotton.com.br/crm/clientes');
  const fila = {
    versao: w.filaDebug.CONFIG.VERSAO_SCHEMA,
    clientes: [
      { url: 'https://x/a', cnpj: 'A', label: 'A' },
      { url: 'https://x/b', cnpj: 'B', label: 'B' },
    ],
    indiceAtual: 1,
    ultimoMotivo: 'atendido',
    totalAtendidos: 1,
    totalPulados: 0,
    iniciadoEm: Date.now(),
  };
  w.filaDebug.salvarFila(fila);

  w.filaDebug.irParaAnterior();
  const salvo = lerRawStorage(w, w.filaDebug.CONFIG.CHAVE_STORAGE);

  checar('irParaAnterior volta indiceAtual', salvo && salvo.indiceAtual === 0);
  checar('irParaAnterior desfaz totalAtendidos do passo revertido', salvo && salvo.totalAtendidos === 0, JSON.stringify(salvo));
  checar('irParaAnterior remove ultimoMotivo', salvo && !('ultimoMotivo' in salvo));
})();

// =====================================================================
// H. irParaAnterior no primeiro cliente (indiceAtual=0) -- NÃO deve alterar nada
// =====================================================================
(function () {
  const w = carregarPagina('https://texhub.texcotton.com.br/crm/clientes');
  const fila = {
    versao: w.filaDebug.CONFIG.VERSAO_SCHEMA,
    clientes: [{ url: 'https://x/a', cnpj: 'A', label: 'A' }],
    indiceAtual: 0,
    totalAtendidos: 0,
    totalPulados: 0,
    iniciadoEm: Date.now(),
  };
  w.filaDebug.salvarFila(fila);
  const antes = w.localStorage.getItem(w.filaDebug.CONFIG.CHAVE_STORAGE);

  w.filaDebug.irParaAnterior();
  const depois = w.localStorage.getItem(w.filaDebug.CONFIG.CHAVE_STORAGE);

  checar('irParaAnterior no primeiro cliente não modifica o storage', antes === depois);
})();

// =====================================================================
// I. registrarSucessoSemAvancar -- marca indiceRegistrado + atendidosHoje,
//    SEM incrementar totalAtendidos ainda (só quando de fato avançar)
// =====================================================================
(function () {
  const w = carregarPagina('https://texhub.texcotton.com.br/crm/clientes/grupo/0?cnpj=AAA');
  const fila = {
    versao: w.filaDebug.CONFIG.VERSAO_SCHEMA,
    clientes: [{ url: 'https://x/a', cnpj: 'AAA', label: 'A' }],
    indiceAtual: 0,
    totalAtendidos: 0,
    totalPulados: 0,
    iniciadoEm: Date.now(),
  };
  w.filaDebug.salvarFila(fila);
  w.filaDebug.sincronizarPosicao();

  w.filaDebug.registrarSucessoSemAvancar();
  const salvo = lerRawStorage(w, w.filaDebug.CONFIG.CHAVE_STORAGE);

  checar('registrarSucessoSemAvancar grava indiceRegistrado', salvo && salvo.indiceRegistrado === 0);
  checar('registrarSucessoSemAvancar NÃO incrementa totalAtendidos ainda', salvo && salvo.totalAtendidos === 0);
  checar('registrarSucessoSemAvancar marca CNPJ em atendidos hoje', w.filaDebug.obterAtendidosHoje().has('AAA'));
})();

// =====================================================================
// J. sincronizarPosicao -- realinha indiceAtual com a URL atual e
//    restaura indiceRegistrado se o CNPJ já está em atendidos hoje
// =====================================================================
(function () {
  const w = carregarPagina('https://texhub.texcotton.com.br/crm/clientes/grupo/0?cnpj=BBB');
  w.filaDebug.marcarComoAtendidoHoje('BBB');
  const fila = {
    versao: w.filaDebug.CONFIG.VERSAO_SCHEMA,
    clientes: [
      { url: 'https://x/a', cnpj: 'AAA', label: 'A' },
      { url: 'https://x/b', cnpj: 'BBB', label: 'B' },
    ],
    indiceAtual: 0,
    totalAtendidos: 0,
    totalPulados: 0,
    iniciadoEm: Date.now(),
  };
  w.filaDebug.salvarFila(fila);

  w.filaDebug.sincronizarPosicao();
  const salvo = lerRawStorage(w, w.filaDebug.CONFIG.CHAVE_STORAGE);

  checar('sincronizarPosicao realinha indiceAtual com a URL real (B = índice 1)', salvo && salvo.indiceAtual === 1, JSON.stringify(salvo));
  checar('sincronizarPosicao restaura indiceRegistrado quando CNPJ já foi atendido hoje', salvo && salvo.indiceRegistrado === 1);
  checar('sincronizarPosicao marca paginaNaFila=true quando encontra o CNPJ', w.filaDebug.getPaginaNaFila() === true);
})();

// =====================================================================
// K. sincronizarPosicao numa página que NÃO bate com a fila -- não deve
//    alterar o storage (evita "vazar" indiceAtual errado por navegação manual)
// =====================================================================
(function () {
  const w = carregarPagina('https://texhub.texcotton.com.br/crm/clientes/grupo/0?cnpj=ZZZ-nao-esta-na-fila');
  const fila = {
    versao: w.filaDebug.CONFIG.VERSAO_SCHEMA,
    clientes: [{ url: 'https://x/a', cnpj: 'AAA', label: 'A' }],
    indiceAtual: 0,
    totalAtendidos: 0,
    totalPulados: 0,
    iniciadoEm: Date.now(),
  };
  w.filaDebug.salvarFila(fila);
  const antes = w.localStorage.getItem(w.filaDebug.CONFIG.CHAVE_STORAGE);

  w.filaDebug.sincronizarPosicao();
  const depois = w.localStorage.getItem(w.filaDebug.CONFIG.CHAVE_STORAGE);

  checar('sincronizarPosicao fora da fila não altera o storage', antes === depois);
  checar('sincronizarPosicao fora da fila marca paginaNaFila=false', w.filaDebug.getPaginaNaFila() === false);
})();

// =====================================================================
// L. obterFila -- descarta fila com versao de schema errada
// =====================================================================
(function () {
  const w = carregarPagina('https://texhub.texcotton.com.br/crm/clientes');
  w.localStorage.setItem(w.filaDebug.CONFIG.CHAVE_STORAGE, JSON.stringify({
    versao: 999, clientes: [], indiceAtual: -1, iniciadoEm: Date.now(),
  }));

  const fila = w.filaDebug.obterFila();
  checar('obterFila descarta versao de schema incompatível', fila === null);
  checar('obterFila limpa o storage corrompido ao descartar', w.localStorage.getItem(w.filaDebug.CONFIG.CHAVE_STORAGE) === null);
})();

// =====================================================================
// M. obterFila -- descarta fila de um dia anterior (não "continua" sozinha)
// =====================================================================
(function () {
  const w = carregarPagina('https://texhub.texcotton.com.br/crm/clientes');
  const ontem = Date.now() - 24 * 60 * 60 * 1000;
  w.localStorage.setItem(w.filaDebug.CONFIG.CHAVE_STORAGE, JSON.stringify({
    versao: w.filaDebug.CONFIG.VERSAO_SCHEMA,
    clientes: [{ url: 'https://x/a', cnpj: 'A' }],
    indiceAtual: 0,
    iniciadoEm: ontem,
  }));

  const fila = w.filaDebug.obterFila();
  checar('obterFila descarta fila iniciada em dia anterior', fila === null);
})();

// =====================================================================
// N. obterFila -- descarta estrutura malformada (defesa contra dado
//    corrompido/formato antigo)
// =====================================================================
(function () {
  const w = carregarPagina('https://texhub.texcotton.com.br/crm/clientes');
  w.localStorage.setItem(w.filaDebug.CONFIG.CHAVE_STORAGE, JSON.stringify({
    versao: w.filaDebug.CONFIG.VERSAO_SCHEMA,
    clientes: 'isso deveria ser um array',
    indiceAtual: 0,
    iniciadoEm: Date.now(),
  }));
  checar('obterFila descarta clientes que não é array', w.filaDebug.obterFila() === null);

  const w2 = carregarPagina('https://texhub.texcotton.com.br/crm/clientes');
  w2.localStorage.setItem(w2.filaDebug.CONFIG.CHAVE_STORAGE, JSON.stringify({
    versao: w2.filaDebug.CONFIG.VERSAO_SCHEMA,
    clientes: [{ url: 'https://x/a' /* falta cnpj */ }],
    indiceAtual: 0,
    iniciadoEm: Date.now(),
  }));
  checar('obterFila descarta cliente sem cnpj string', w2.filaDebug.obterFila() === null);
})();

// =====================================================================
// O. obterFila -- JSON literalmente corrompido não deve lançar exceção
// =====================================================================
(function () {
  const w = carregarPagina('https://texhub.texcotton.com.br/crm/clientes');
  w.localStorage.setItem(w.filaDebug.CONFIG.CHAVE_STORAGE, '{ isso não é json válido ][');
  let excecao = null;
  let resultado;
  try {
    resultado = w.filaDebug.obterFila();
  } catch (e) {
    excecao = e;
  }
  checar('obterFila não lança exceção com JSON corrompido', excecao === null, excecao && excecao.message);
  checar('obterFila retorna null com JSON corrompido', resultado === null);
})();

// =====================================================================
// P. marcarComoAtendidoHoje / obterAtendidosHoje -- round-trip e reset por dia
// =====================================================================
(function () {
  const w = carregarPagina('https://texhub.texcotton.com.br/crm/clientes');
  w.filaDebug.marcarComoAtendidoHoje('CNPJ-1');
  w.filaDebug.marcarComoAtendidoHoje('CNPJ-2');
  const lidos = w.filaDebug.obterAtendidosHoje();
  checar('obterAtendidosHoje contém os CNPJs marcados', lidos.has('CNPJ-1') && lidos.has('CNPJ-2'));

  const bruto = lerRawStorage(w, w.filaDebug.CONFIG.CHAVE_ATENDIDOS_HOJE);
  checar('estrutura salva tem "data" e "cnpjs"', bruto && typeof bruto.data === 'number' && Array.isArray(bruto.cnpjs));

  w.localStorage.setItem(w.filaDebug.CONFIG.CHAVE_ATENDIDOS_HOJE, JSON.stringify({
    data: Date.now() - 24 * 60 * 60 * 1000,
    cnpjs: ['CNPJ-1', 'CNPJ-2'],
  }));
  const lidosOntem = w.filaDebug.obterAtendidosHoje();
  checar('atendidosHoje de ontem reseta sozinho (Set vazio)', lidosOntem.size === 0, `size=${lidosOntem.size}`);
})();

// =====================================================================
// Q. marcarComoAtendidoHoje preserva CNPJs já marcados antes (não sobrescreve)
// =====================================================================
(function () {
  const w = carregarPagina('https://texhub.texcotton.com.br/crm/clientes');
  w.filaDebug.marcarComoAtendidoHoje('CNPJ-1');
  w.filaDebug.marcarComoAtendidoHoje('CNPJ-2');
  const lidos = w.filaDebug.obterAtendidosHoje();
  checar('marcar um segundo CNPJ não apaga o primeiro', lidos.has('CNPJ-1') && lidos.has('CNPJ-2') && lidos.size === 2, `size=${lidos.size}`);
})();

// =====================================================================
// R. salvarFila / limparFila não lançam exceção se localStorage falhar
//    (ex.: cota cheia, modo privado bloqueando) -- simulado forçando erro
// =====================================================================
(function () {
  const w = carregarPagina('https://texhub.texcotton.com.br/crm/clientes');
  const original = w.localStorage.setItem.bind(w.localStorage);
  w.localStorage.setItem = () => { throw new Error('QuotaExceededError simulado'); };

  let excecao = null;
  try {
    w.filaDebug.salvarFila({ versao: 1, clientes: [], indiceAtual: -1 });
  } catch (e) {
    excecao = e;
  }
  checar('salvarFila não propaga exceção quando localStorage.setItem falha', excecao === null, excecao && excecao.message);

  w.localStorage.setItem = original;
})();

// =====================================================================
// S. Botão "Iniciar Fila" só aparece em páginas com clientes reconhecíveis
//    (BUG REAL: antes aparecia em toda página do CRM)
// =====================================================================
(function () {
  const html = `<table><tbody>
    <tr><td>Cliente A Controle: 0|11111111/0001-11 - 5 dias de atraso</td></tr>
  </tbody></table>`;
  const w = carregarPagina('https://texhub.texcotton.com.br/crm/clientes', html);
  checar('página de lista real: botão "Iniciar Fila" É criado', !!w.document.getElementById('fila-btn-iniciar'));
})();

(function () {
  const html = `<div id="content-promessas"></div><div id="content-contatos"></div>
    <table><tbody><tr><td>Histórico de pagamentos (tabela sem relação com a fila)</td></tr></tbody></table>`;
  const w = carregarPagina('https://texhub.texcotton.com.br/crm/clientes/grupo/0?cnpj=11111111%2F0001-11', html);
  checar('página de DETALHE de cliente: botão "Iniciar Fila" NÃO é criado (bug corrigido)', !w.document.getElementById('fila-btn-iniciar'));
})();

(function () {
  const w = carregarPagina('https://texhub.texcotton.com.br/crm/dashboard', '<div>Painel geral, sem tabela nenhuma</div>');
  checar('página sem tabela nenhuma: botão NÃO é criado', !w.document.getElementById('fila-btn-iniciar'));
})();

(function () {
  const html = `<table><tbody>
    <tr><td>Nome</td><td>Valor</td></tr>
    <tr><td>Produto X</td><td>R$ 100,00</td></tr>
  </tbody></table>`;
  const w = carregarPagina('https://texhub.texcotton.com.br/crm/produtos', html);
  checar('tabela sem padrão "Controle: X|Y": botão NÃO é criado', !w.document.getElementById('fila-btn-iniciar'));
})();

(function () {
  const html = `<table><tbody>
    <tr><td>Cliente A Controle: 0|11111111/0001-11 - 5 dias de atraso</td></tr>
    <tr><td>Linha sem padrão nenhum</td></tr>
  </tbody></table>`;
  const w = carregarPagina('https://texhub.texcotton.com.br/crm/clientes', html);
  const temClientes = w.filaDebug.paginaTemClientesParaFila();
  const clientesConstruidos = w.filaDebug.construirFilaAPartirDaPagina();
  checar('paginaTemClientesParaFila()=true quando construirFilaAPartirDaPagina() acha clientes', temClientes === true && clientesConstruidos.length > 0);
})();

(function () {
  const w = carregarPagina('https://texhub.texcotton.com.br/crm/clientes/grupo/0?cnpj=AAA', '<div>Tela de cliente</div>');
  const fila = {
    versao: w.filaDebug.CONFIG.VERSAO_SCHEMA,
    clientes: [{ url: 'https://x/a', cnpj: 'AAA', label: 'A' }],
    indiceAtual: 0,
    totalAtendidos: 0,
    totalPulados: 0,
    iniciadoEm: Date.now(),
  };
  w.filaDebug.salvarFila(fila);
  w.filaDebug.sincronizarPosicao();

  checar('sincronizarPosicao ainda reconhece a página como parte da fila (paginaNaFila=true)', w.filaDebug.getPaginaNaFila() === true);
  checar('e mesmo assim o botão "Iniciar Fila" continua ausente (não é a tela certa pra ele)', !w.document.getElementById('fila-btn-iniciar'));
})();

// =====================================================================
// T. Botão "Continuar fila anterior" -- BUG REAL: retomava no índice
//    ERRADO (pulava o cliente onde a pessoa tinha parado)
// =====================================================================
function novaNavegacaoDetectada(dom) {
  let tentativas = 0;
  dom.virtualConsole.on('jsdomError', (e) => {
    if (/navigation/i.test(e.message)) tentativas++;
  });
  return () => tentativas;
}

function carregarPaginaComConsole(url, bodyHtml) {
  const virtualConsole = new VirtualConsole();
  const dom = new JSDOM(`<!doctype html><body>${bodyHtml || ''}</body></html>`, { url, virtualConsole });
  global.window = dom.window;
  global.document = dom.window.document;
  global.localStorage = dom.window.localStorage;
  global.location = dom.window.location;
  global.URL = dom.window.URL;
  global.requestAnimationFrame = (cb) => setTimeout(cb, 0);
  dom.window.requestAnimationFrame = global.requestAnimationFrame;
  SPECS.forEach(({ arquivo }) => {
    dom.window.eval(textoDoModulo(arquivo));
  });
  if (dom.window.document.readyState === 'loading') {
    dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded', { bubbles: true, cancelable: true }));
  }
  return dom;
}

(function () {
  const dom = carregarPaginaComConsole('https://texhub.texcotton.com.br/crm/outra-pagina-qualquer', '<div>fora da fila</div>');
  const w = dom.window;
  const contarNavegacoes = novaNavegacaoDetectada(dom);
  const fila = {
    versao: w.filaDebug.CONFIG.VERSAO_SCHEMA,
    clientes: [
      { url: 'https://x/a', cnpj: 'A', label: 'Cliente A' },
      { url: 'https://x/b', cnpj: 'B', label: 'Cliente B (onde eu parei)' },
      { url: 'https://x/c', cnpj: 'C', label: 'Cliente C' },
    ],
    indiceAtual: 1,
    totalAtendidos: 1,
    totalPulados: 0,
    iniciadoEm: Date.now(),
  };
  w.filaDebug.salvarFila(fila);
  w.filaDebug.criarBotaoRetomar(fila);
  const btn = w.document.getElementById('fila-btn-retomar');

  checar('botão "Continuar fila anterior" é criado', !!btn);
  checar('contador conta a partir do cliente ONDE PAROU (2 restantes: B e C)', btn.textContent.includes('2 restantes'), btn.textContent);

  let excecao = null;
  try { btn.onclick(); } catch (e) { excecao = e; }
  checar('clicar não lança exceção', excecao === null, excecao && excecao.message);
  checar('clicar de fato tenta navegar (uma tentativa de navegação)', contarNavegacoes() === 1, `tentativas=${contarNavegacoes()}`);
})();

(function () {
  const dom = carregarPaginaComConsole('https://texhub.texcotton.com.br/crm/outra-pagina', '<div>fora</div>');
  const w = dom.window;
  const fila = {
    versao: w.filaDebug.CONFIG.VERSAO_SCHEMA,
    clientes: [
      { url: 'https://x/a', cnpj: 'A' },
      { url: 'https://x/b', cnpj: 'B' },
      { url: 'https://x/c', cnpj: 'C' },
    ],
    indiceAtual: 1,
    totalAtendidos: 1,
    totalPulados: 0,
    iniciadoEm: Date.now(),
  };
  w.filaDebug.salvarFila(fila);
  w.filaDebug.criarBotaoRetomar(fila);
  const btn = w.document.getElementById('fila-btn-retomar');

  checar('NÃO mostra "1 restante" (esse seria o bug antigo, pulando o cliente atual)', !btn.textContent.includes('1 restante'), btn.textContent);
})();

(function () {
  const dom = carregarPaginaComConsole('https://texhub.texcotton.com.br/crm/outra-pagina', '<div>fora</div>');
  const w = dom.window;
  const contarNavegacoes = novaNavegacaoDetectada(dom);
  const fila = {
    versao: w.filaDebug.CONFIG.VERSAO_SCHEMA,
    clientes: [
      { url: 'https://x/a', cnpj: 'A' },
      { url: 'https://x/b', cnpj: 'B' },
    ],
    indiceAtual: -1,
    totalAtendidos: 0,
    totalPulados: 0,
    iniciadoEm: Date.now(),
  };
  w.filaDebug.salvarFila(fila);
  w.filaDebug.criarBotaoRetomar(fila);
  const btn = w.document.getElementById('fila-btn-retomar');

  checar('indiceAtual=-1: contador mostra os 2 clientes completos', btn.textContent.includes('2 restantes'), btn.textContent);

  let excecao = null;
  try { btn.onclick(); } catch (e) { excecao = e; }
  checar('indiceAtual=-1: clicar não lança exceção (não tenta acessar índice negativo)', excecao === null, excecao && excecao.message);
  checar('indiceAtual=-1: ainda assim tenta navegar (pro primeiro cliente)', contarNavegacoes() === 1);
})();

(function () {
  const dom = carregarPaginaComConsole('https://texhub.texcotton.com.br/crm/outra-pagina', '<div>fora</div>');
  const w = dom.window;
  const contarNavegacoes = novaNavegacaoDetectada(dom);
  const fila = {
    versao: w.filaDebug.CONFIG.VERSAO_SCHEMA,
    clientes: [
      { url: 'https://x/a', cnpj: 'A' },
      { url: 'https://x/b', cnpj: 'B' },
    ],
    indiceAtual: 1,
    totalAtendidos: 1,
    totalPulados: 0,
    iniciadoEm: Date.now(),
  };
  w.filaDebug.salvarFila(fila);
  w.filaDebug.criarBotaoRetomar(fila);
  const btn = w.document.getElementById('fila-btn-retomar');

  checar('botão aparece mesmo parado no último cliente da fila', !!btn);
  checar('contador mostra 1 restante (o próprio último cliente, B)', btn && btn.textContent.includes('1 restante'), btn && btn.textContent);

  if (btn) {
    let excecao = null;
    try { btn.onclick(); } catch (e) { excecao = e; }
    checar('clicar no último cliente não lança exceção', excecao === null, excecao && excecao.message);
    checar('clicar no último cliente tenta navegar (retoma nele mesmo)', contarNavegacoes() === 1);
  }
})();

(function () {
  const dom = carregarPaginaComConsole('https://texhub.texcotton.com.br/crm/lista-de-clientes', '<div>lista, não é nenhum cliente da fila</div>');
  const w = dom.window;
  const fila = {
    versao: w.filaDebug.CONFIG.VERSAO_SCHEMA,
    clientes: [
      { url: 'https://x/a', cnpj: 'A' },
      { url: 'https://x/b', cnpj: 'B' },
      { url: 'https://x/c', cnpj: 'C' },
    ],
    indiceAtual: 0,
    totalAtendidos: 0,
    totalPulados: 0,
    iniciadoEm: Date.now(),
  };
  w.filaDebug.salvarFila(fila);
  w.filaDebug.sincronizarPosicao();
  const btn = w.document.getElementById('fila-btn-retomar');

  checar('sincronizarPosicao cria o botão de retomar numa página fora da fila', !!btn);
  checar('contador reflete parar no primeiro cliente (3 restantes: A, B, C)', btn && btn.textContent.includes('3 restantes'), btn && btn.textContent);
})();

resumo();
