// Testes da autoconferência (window.__conferir, Módulo 8).
//
// O ponto desta função é justamente cobrir o que a suíte NÃO alcança: código
// que abre aba de fundo, e invariantes que só se quebram com dado real. Mas
// ela própria precisa ser confiável -- um verificador que não detecta nada, ou
// que estoura numa página inesperada, é pior que não ter, porque dá uma
// sensação falsa de cobertura.
//
// Então aqui se testa o VERIFICADOR: ele acusa cada estado-ruim conhecido, e
// não quebra nos estados degenerados.
const { novaJanela } = require('./helpers/dom-env');
const { criarChecador } = require('./helpers/checar');

const { checar, resumo } = criarChecador('conferir');

const SPECS = [
  { arquivo: 'modulo0-utilitarios-compartilhados.js' },
  { arquivo: 'modulo8-diario.js' },
];

function abrir() {
  const w = novaJanela({ url: 'https://texhub.texcotton.com.br/crm/clientes', specs: SPECS });
  // Silencia a saída pra não poluir o relatório do teste.
  w.console = Object.assign({}, w.console, { log() {}, warn() {}, error() {} });
  return w;
}

function comFila(w, clientes) {
  w.filaDebug = { obterFila: () => ({ clientes }) };
}

function cliente(tier, dias, extras) {
  return Object.assign({ cnpj: String(Math.random()).slice(2), prioridadeTier: tier, diasAtraso: dias, grupoControle: false }, extras || {});
}

const achou = (r, trecho) => r.problemas.concat(r.avisos).some((m) => m.includes(trecho));

// =====================================================================
// NÃO PODE QUEBRAR
// =====================================================================
(function () {
  const w = abrir();
  let excecao = null;
  let r = null;
  try { r = w.__conferir(); } catch (erro) { excecao = erro; }
  checar('não estoura numa página sem fila nem contexto', excecao === null, excecao && excecao.message);
  checar('devolve a contagem de checagens', r && r.checagens > 0, r && String(r.checagens));
  checar('avisa que não há fila pra conferir', achou(r, 'Nenhuma fila salva'));
})();

(function () {
  const w = abrir();
  // filaDebug que estoura -- página em estado estranho não pode derrubar.
  w.filaDebug = { obterFila: () => { throw new Error('storage quebrado'); } };
  let excecao = null;
  try { w.__conferir(); } catch (erro) { excecao = erro; }
  checar('não estoura se obterFila lançar', excecao === null, excecao && excecao.message);
})();

// =====================================================================
// DETECTA OS ESTADOS-RUIM CONHECIDOS
// =====================================================================
(function () {
  const w = abrir();
  comFila(w, [cliente(1, 6), cliente(3, 2), cliente(9, 4), cliente(10, 5)]);
  const r = w.__conferir();
  checar('fila em ordem correta não gera problema de ordem', !achou(r, 'ordem de faixa quebra'));
})();

(function () {
  const w = abrir();
  // Faixa 9 antes da 3 -- régua fora de ordem.
  comFila(w, [cliente(1, 6), cliente(9, 4), cliente(3, 2)]);
  checar('detecta ordem de faixa quebrada', achou(w.__conferir(), 'ordem de faixa quebra'));
})();

(function () {
  const w = abrir();
  // Dentro da mesma faixa, dias crescendo -- desempate invertido.
  comFila(w, [cliente(9, 3), cliente(9, 4)]);
  checar('detecta desempate por dias invertido', achou(w.__conferir(), 'desempate por dias'));
})();

(function () {
  const w = abrir();
  comFila(w, [cliente(3, 2, { cnpj: 'AAA' }), cliente(9, 4, { cnpj: 'AAA' })]);
  checar('detecta CNPJ repetido na fila', achou(w.__conferir(), 'CNPJ repetido'));
})();

(function () {
  const w = abrir();
  // Grupo de controle desligado, mas cliente marcado como controle.
  comFila(w, [cliente(1, 6), cliente(3, 2, { grupoControle: true })]);
  checar('detecta marcação de controle com o experimento desligado', achou(w.__conferir(), 'DESLIGADO'));
})();

(function () {
  // REGRESSÃO DO BUG REAL: a mesma rodada gravada duas vezes no diário.
  const w = abrir();
  const d = w.__diario;
  d.registrarLote('fila', [{ c: 'A', f: 3, p: 1, k: 0 }, { c: 'B', f: 9, p: 2, k: 0 }]);
  d.registrarLote('fila', [{ c: 'A', f: 3, p: 1, k: 0 }, { c: 'B', f: 9, p: 2, k: 0 }]);
  checar('detecta a fila gravada em duplicidade no diário', achou(w.__conferir(), 'aparece 2x hoje'));
})();

(function () {
  const w = abrir();
  w.__diario.registrarLote('fila', [{ c: 'A', f: 3, p: 1, k: 0 }]);
  checar('uma rodada só não é acusada de duplicidade', !achou(w.__conferir(), 'duplicidade'));
})();

(function () {
  const w = abrir();
  w.__diario.registrarLote('fila', [{ c: '', f: 3, p: 1, k: 0 }]);
  checar('detecta registro de fila sem CNPJ', achou(w.__conferir(), 'sem CNPJ'));
})();

(function () {
  const w = abrir();
  w.__diario.registrarLote('fila', [{ c: 'A', f: 99, p: 1, k: 0 }]);
  checar('detecta faixa fora de 1..10', achou(w.__conferir(), 'faixa fora de'));
})();

// =====================================================================
// CONTRATO DE DATA ENTRE MÓDULOS (o bug da meia-noite)
// =====================================================================
(function () {
  const w = abrir();
  const meiaNoite = new w.Date(2026, 8, 14);
  meiaNoite.setHours(0, 0, 0, 0);
  w.__contextoAdicional = { contatoRecente: { data: meiaNoite } };
  checar('detecta data de contexto fora da convenção de meio-dia', achou(w.__conferir(), 'não ao meio-dia'));
})();

(function () {
  const w = abrir();
  const meioDia = new w.Date(2026, 8, 14);
  meioDia.setHours(12, 0, 0, 0);
  w.__contextoAdicional = { contatoRecente: { data: meioDia } };
  checar('data ao meio-dia não é acusada', !achou(w.__conferir(), 'não ao meio-dia'));
})();

(function () {
  const w = abrir();
  w.__contextoAdicional = { promessa: null, nomeNegociador: undefined };
  checar('detecta campo undefined no contexto', achou(w.__conferir(), 'undefined no contexto'));
})();

resumo();
