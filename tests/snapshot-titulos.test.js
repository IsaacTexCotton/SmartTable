// Testes do retrato de títulos vencidos (Módulo 6 -- detecção de pagamento
// sem promessa associada) -- portados de
// fuzz-memoria/harness-snapshot.js, rodando contra o código REAL de
// modulos/modulo6-contexto-adicional.js via window.__contextoAdicionalDebug.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const { textoDoModulo } = require('./helpers/dom-env');
const { criarChecador } = require('./helpers/checar');

const { checar, resumo } = criarChecador('snapshot-titulos');

const CODIGO_MODULO0 = textoDoModulo('modulo0-utilitarios-compartilhados.js');
const CODIGO_MODULO6 = textoDoModulo('modulo6-contexto-adicional.js');

// Simula uma "visita a uma página" nova (nova instância de window/localStorage,
// como um reload real do navegador faria) -- mas semeada com o estado de
// localStorage persistido de visitas anteriores, e devolvendo o estado
// atualizado no final, pra próxima visita poder continuar de onde parou.
function visitar(estadoStorage, cnpj, avisoCobrancaMock) {
  const url = cnpj === null
    ? 'https://texhub.texcotton.com.br/crm/clientes/grupo/0'
    : `https://texhub.texcotton.com.br/crm/clientes/grupo/0?cnpj=${encodeURIComponent(cnpj)}`;
  const dom = new JSDOM('<!doctype html><body></body>', { url });
  global.window = dom.window;
  global.document = dom.window.document;
  global.localStorage = dom.window.localStorage;
  global.location = dom.window.location;
  global.URLSearchParams = dom.window.URLSearchParams;
  global.MutationObserver = dom.window.MutationObserver;
  global.requestAnimationFrame = (cb) => setTimeout(cb, 0);
  dom.window.requestAnimationFrame = global.requestAnimationFrame;

  Object.keys(estadoStorage).forEach((k) => dom.window.localStorage.setItem(k, estadoStorage[k]));

  dom.window.__avisoCobranca = avisoCobrancaMock === undefined ? { simular: () => ({ registros: [] }) } : avisoCobrancaMock;

  dom.window.eval(CODIGO_MODULO0);
  dom.window.eval(CODIGO_MODULO6);

  const resultado = dom.window.__contextoAdicionalDebug.verificarESalvarSnapshotTitulos();

  Object.keys(estadoStorage).forEach((k) => delete estadoStorage[k]);
  for (let i = 0; i < dom.window.localStorage.length; i++) {
    const k = dom.window.localStorage.key(i);
    estadoStorage[k] = dom.window.localStorage.getItem(k);
  }

  return { window: dom.window, resultado };
}

function registro(tituloCompleto) {
  return { tituloCompleto, situacaoKey: 'EM_ATRASO', diasAtrasoReal: 3, vencimentoTexto: '01/09/2026' };
}

function chaveSnapshot(w) {
  return w.__contextoAdicionalDebug.CHAVE_SNAPSHOT_TITULOS;
}

function lerRawDoEstado(estadoStorage, w) {
  const raw = estadoStorage[chaveSnapshot(w)];
  return raw ? JSON.parse(raw) : null;
}

// 1. Primeira visita a um CNPJ -- não há retrato anterior
(function () {
  const estado = {};
  const { window: w, resultado } = visitar(estado, 'AAA', { simular: () => ({ registros: [registro('90001/1'), registro('90002/1')] }) });

  checar('primeira visita: houve=false (nada pra comparar ainda)', resultado.houve === false);
  checar('primeira visita: titulos=[] (nada sumiu, não tem base)', Array.isArray(resultado.titulos) && resultado.titulos.length === 0);

  const bruto = lerRawDoEstado(estado, w);
  checar('primeira visita grava o retrato atual mesmo sem comparação', bruto && bruto['AAA'] && bruto['AAA'].titulos.length === 2, JSON.stringify(bruto));
})();

// 2. Segunda visita, MESMOS títulos -- não houve pagamento
(function () {
  const estado = {};
  visitar(estado, 'BBB', { simular: () => ({ registros: [registro('90001/1'), registro('90002/1')] }) });
  const { resultado } = visitar(estado, 'BBB', { simular: () => ({ registros: [registro('90001/1'), registro('90002/1')] }) });

  checar('mesmos títulos nas duas visitas -> houve=false', resultado.houve === false, JSON.stringify(resultado));
})();

// 3. Segunda visita, um título SUMIU -- detecta pagamento e nomeia certo
(function () {
  const estado = {};
  visitar(estado, 'CCC', { simular: () => ({ registros: [registro('90001/1'), registro('90002/1')] }) });
  const { resultado } = visitar(estado, 'CCC', { simular: () => ({ registros: [registro('90001/1')] }) });

  checar('título sumido -> houve=true', resultado.houve === true, JSON.stringify(resultado));
  checar('título sumido -> nomeia o título certo (90002/1)', resultado.titulos.length === 1 && resultado.titulos[0] === '90002/1', JSON.stringify(resultado));
})();

// 4. Título NOVO apareceu (não sumiu nenhum) -- NÃO deve ser tratado como pagamento
(function () {
  const estado = {};
  visitar(estado, 'DDD', { simular: () => ({ registros: [registro('90001/1')] }) });
  const { resultado } = visitar(estado, 'DDD', { simular: () => ({ registros: [registro('90001/1'), registro('90003/1')] }) });

  checar('título novo (não sumiu nenhum) -> houve=false', resultado.houve === false, JSON.stringify(resultado));
})();

// 5. Isolamento por CNPJ
(function () {
  const estado = {};
  visitar(estado, 'EEE-1', { simular: () => ({ registros: [registro('A1'), registro('A2')] }) });
  const { window: w2, resultado } = visitar(estado, 'EEE-2', { simular: () => ({ registros: [registro('B1')] }) });

  checar('cliente diferente na primeira visita não confunde com outro CNPJ -> houve=false', resultado.houve === false, JSON.stringify(resultado));

  const bruto = lerRawDoEstado(estado, w2);
  checar('os dois CNPJs ficam em entradas separadas no mesmo retrato', bruto && bruto['EEE-1'] && bruto['EEE-2'], JSON.stringify(bruto));
})();

// 6. Múltiplos títulos sumindo ao mesmo tempo
(function () {
  const estado = {};
  visitar(estado, 'FFF', { simular: () => ({ registros: [registro('X1'), registro('X2'), registro('X3')] }) });
  const { resultado } = visitar(estado, 'FFF', { simular: () => ({ registros: [registro('X2')] }) });

  checar(
    'dois títulos somem ao mesmo tempo -> ambos nomeados',
    resultado.houve === true && resultado.titulos.length === 2 && resultado.titulos.includes('X1') && resultado.titulos.includes('X3'),
    JSON.stringify(resultado)
  );
})();

// 7. Todos os títulos somem (cliente quitou tudo)
(function () {
  const estado = {};
  visitar(estado, 'GGG', { simular: () => ({ registros: [registro('Y1'), registro('Y2')] }) });
  const { resultado } = visitar(estado, 'GGG', { simular: () => ({ registros: [] }) });

  checar('cliente quitou todos os títulos -> detecta os dois como pagos', resultado.houve === true && resultado.titulos.length === 2, JSON.stringify(resultado));
})();

// 8. Sem CNPJ na URL
(function () {
  const estado = {};
  let excecao = null;
  let resultado;
  try {
    ({ resultado } = visitar(estado, null, { simular: () => ({ registros: [registro('Z1')] }) }));
  } catch (e) {
    excecao = e;
  }
  checar('sem CNPJ na URL não lança exceção', excecao === null, excecao && excecao.message);
  checar('sem CNPJ na URL retorna houve=false', resultado && resultado.houve === false);
})();

// 9. window.__avisoCobranca não carregado
(function () {
  const estado = {};
  let excecao = null;
  let resultado;
  try {
    ({ resultado } = visitar(estado, 'HHH', null));
  } catch (e) {
    excecao = e;
  }
  checar('sem window.__avisoCobranca não lança exceção', excecao === null, excecao && excecao.message);
  checar('sem window.__avisoCobranca retorna houve=false', resultado && resultado.houve === false);
})();

// 10. window.__avisoCobranca.simular() lança exceção
(function () {
  const estado = {};
  visitar(estado, 'III', { simular: () => ({ registros: [registro('W1')] }) });

  let excecao = null;
  let resultado;
  let w2;
  try {
    ({ window: w2, resultado } = visitar(estado, 'III', { simular: () => { throw new Error('tabela ainda não carregou'); } }));
  } catch (e) {
    excecao = e;
  }
  checar('simular() lançando exceção não propaga pra fora', excecao === null, excecao && excecao.message);
  checar('simular() lançando exceção retorna houve=false (não inventa pagamento)', resultado && resultado.houve === false);

  const bruto = lerRawDoEstado(estado, w2);
  checar('retrato anterior NÃO é sobrescrito quando simular() falha', bruto && bruto['III'] && bruto['III'].titulos.length === 1, JSON.stringify(bruto));
})();

// 11. Expiração de retratos antigos (> 30 dias)
(function () {
  const estado = {};
  const { window: w } = visitar(estado, 'JJJ', { simular: () => ({ registros: [registro('V1')] }) });

  const bruto = lerRawDoEstado(estado, w);
  bruto['CLIENTE-ANTIGO'] = { titulos: ['velho/1'], salvoEm: Date.now() - 40 * 24 * 60 * 60 * 1000 };
  estado[chaveSnapshot(w)] = JSON.stringify(bruto);

  const { window: w2 } = visitar(estado, 'JJJ', { simular: () => ({ registros: [registro('V1')] }) });

  const depois = lerRawDoEstado(estado, w2);
  checar('entrada de CNPJ não visitado há >30 dias é removida', !('CLIENTE-ANTIGO' in depois), JSON.stringify(depois));
  checar('CNPJ atual continua presente após a faxina', 'JJJ' in depois);
})();

// 12. Retrato recente (< 30 dias) de outro CNPJ NÃO é removido
(function () {
  const estado = {};
  const { window: w } = visitar(estado, 'KKK', { simular: () => ({ registros: [registro('U1')] }) });

  const bruto = lerRawDoEstado(estado, w);
  bruto['CLIENTE-RECENTE'] = { titulos: ['recente/1'], salvoEm: Date.now() - 5 * 24 * 60 * 60 * 1000 };
  estado[chaveSnapshot(w)] = JSON.stringify(bruto);

  const { window: w2 } = visitar(estado, 'KKK', { simular: () => ({ registros: [registro('U1')] }) });

  const depois = lerRawDoEstado(estado, w2);
  checar('entrada de CNPJ visitado há <30 dias NÃO é removida', 'CLIENTE-RECENTE' in depois, JSON.stringify(depois));
})();

// 13. JSON corrompido no localStorage
(function () {
  const estado = {};
  const { window: wTmp } = visitar(estado, 'LLL', { simular: () => ({ registros: [registro('T1')] }) });
  estado[chaveSnapshot(wTmp)] = '{ json quebrado ][';

  let excecao = null;
  let resultado;
  try {
    ({ resultado } = visitar(estado, 'LLL', { simular: () => ({ registros: [registro('T1')] }) }));
  } catch (e) {
    excecao = e;
  }
  checar('JSON corrompido no retrato não lança exceção', excecao === null, excecao && excecao.message);
  checar('JSON corrompido é tratado como se não houvesse retrato anterior (houve=false)', resultado && resultado.houve === false);
})();

// 14. localStorage.setItem falhando (cota cheia)
(function () {
  const url = 'https://texhub.texcotton.com.br/crm/clientes/grupo/0?cnpj=MMM';
  const dom = new JSDOM('<!doctype html><body></body>', { url });
  global.window = dom.window;
  global.document = dom.window.document;
  global.localStorage = dom.window.localStorage;
  global.location = dom.window.location;
  global.URLSearchParams = dom.window.URLSearchParams;
  global.MutationObserver = dom.window.MutationObserver;
  global.requestAnimationFrame = (cb) => setTimeout(cb, 0);
  dom.window.requestAnimationFrame = global.requestAnimationFrame;
  dom.window.__avisoCobranca = { simular: () => ({ registros: [registro('S1')] }) };
  dom.window.eval(CODIGO_MODULO0);
  dom.window.eval(CODIGO_MODULO6);

  // CORRIGIDO (falso positivo achado ao escrever tests/diario.test.js):
  // `dom.window.localStorage.setItem = fn` NÃO pega no jsdom -- a atribuição
  // na instância falha em silêncio. O setItem de verdade continuava valendo,
  // nunca lançava, e este teste passava sem exercitar nada. O mock tem que ir
  // no PROTOTYPE de Storage.
  const proto = dom.window.Storage.prototype;
  const original = proto.setItem;
  proto.setItem = () => { throw new Error('QuotaExceededError simulado'); };

  let excecao = null;
  try {
    dom.window.__contextoAdicionalDebug.verificarESalvarSnapshotTitulos();
  } catch (e) {
    excecao = e;
  }
  checar('setItem falhando não propaga exceção', excecao === null, excecao && excecao.message);

  proto.setItem = original;
})();

// 15. Formato salvo tem exatamente os campos esperados
(function () {
  const estado = {};
  const antes = Date.now();
  const { window: w } = visitar(estado, 'NNN', { simular: () => ({ registros: [registro('R1'), registro('R2')] }) });
  const depois = Date.now();

  const bruto = lerRawDoEstado(estado, w);
  const entrada = bruto['NNN'];
  checar('entrada salva tem "titulos" como array com os tituloCompleto certos', entrada && Array.isArray(entrada.titulos) && entrada.titulos.includes('R1') && entrada.titulos.includes('R2'), JSON.stringify(entrada));
  checar('entrada salva tem "salvoEm" como timestamp plausível (agora)', entrada && entrada.salvoEm >= antes && entrada.salvoEm <= depois, JSON.stringify(entrada));
})();

// 16. BUG REAL (achado em revisão, com repro): a comparação era destrutiva --
// o retrato era sobrescrito a cada CARREGAMENTO de página. Como o
// agradecimento de pagamento só é montado quando o operador aperta Alt+A,
// bastava um F5 entre a detecção e a cobrança pra linha sumir pra sempre.
// A detecção agora fica grudada no retrato pelo resto do dia.
(function () {
  const estado = {};
  const doisTitulos = { simular: () => ({ registros: [registro('T1'), registro('T2')] }) };
  const umTitulo = { simular: () => ({ registros: [registro('T2')] }) };

  visitar(estado, 'RELOAD', doisTitulos);
  const deteccao = visitar(estado, 'RELOAD', umTitulo).resultado;
  checar('visita em que o título some detecta o pagamento', deteccao.houve === true && deteccao.titulos.join() === 'T1', JSON.stringify(deteccao));

  const depoisDoF5 = visitar(estado, 'RELOAD', umTitulo).resultado;
  checar('recarregar a página NÃO apaga a detecção do mesmo dia', depoisDoF5.houve === true && depoisDoF5.titulos.join() === 'T1', JSON.stringify(depoisDoF5));

  const depoisDeOutroF5 = visitar(estado, 'RELOAD', umTitulo).resultado;
  checar('recarregar várias vezes continua sem apagar', depoisDeOutroF5.houve === true, JSON.stringify(depoisDeOutroF5));
})();

// 17. A detecção grudada é do DIA -- um retrato marcado com data antiga não
// ressuscita o agradecimento (senão a linha voltaria dias depois do pagamento).
(function () {
  const estado = {};
  const umTitulo = { simular: () => ({ registros: [registro('T2')] }) };

  visitar(estado, 'ONTEM', { simular: () => ({ registros: [registro('T1'), registro('T2')] }) });
  const w0 = visitar(estado, 'ONTEM', umTitulo).window;
  checar('detecção aconteceu', JSON.parse(estado[chaveSnapshot(w0)])['ONTEM'].sumidos.join() === 'T1');

  // Reescreve o retrato como se a detecção tivesse sido em outro dia.
  const bruto = JSON.parse(estado[chaveSnapshot(w0)]);
  bruto['ONTEM'].sumidosEm = '2020-01-01';
  estado[chaveSnapshot(w0)] = JSON.stringify(bruto);

  const hoje = visitar(estado, 'ONTEM', umTitulo).resultado;
  checar('detecção de outro dia não é reaproveitada', hoje.houve === false, JSON.stringify(hoje));
})();

// 18. Retrato gravado por uma versão anterior (só {titulos, salvoEm}, sem os
// campos novos) continua sendo lido sem erro -- não houve quebra de formato.
(function () {
  const estado = {};
  const w0 = visitar(estado, 'ANTIGO', { simular: () => ({ registros: [registro('T1'), registro('T2')] }) }).window;
  const chave = chaveSnapshot(w0);
  estado[chave] = JSON.stringify({ ANTIGO: { titulos: ['T1', 'T2'], salvoEm: Date.now() } });

  const r = visitar(estado, 'ANTIGO', { simular: () => ({ registros: [registro('T2')] }) }).resultado;
  checar('formato antigo (sem sumidos/sumidosEm) ainda detecta o pagamento', r.houve === true && r.titulos.join() === 'T1', JSON.stringify(r));
})();

resumo();
