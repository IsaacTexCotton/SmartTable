// Testes do log de atualização (Alt+L, Módulo 4).
//
// O TESTE QUE MAIS IMPORTA é o primeiro: a versão do topo do log tem que ser
// a mesma de VERSAO_SMARTTABLE. Changelog que envelhece em silêncio é PIOR
// que não ter changelog nenhum -- ele passa a afirmar, com cara de
// autoridade, que a versão rodando faz coisas que ela não faz. Como o resto
// do projeto já aprendeu (o contador "(7 módulos)" fixo no código, os dois
// wrappers fora de sincronia), número escrito à mão diverge; o jeito de
// conviver com isso é fazer a suíte gritar.
const fs = require('fs');
const path = require('path');
const { novaJanela } = require('./helpers/dom-env');
const { criarChecador } = require('./helpers/checar');

const { checar, resumo } = criarChecador('changelog');

const RAIZ = path.join(__dirname, '..');
const w = novaJanela({
  url: 'https://texhub.texcotton.com.br/crm/clientes',
  specs: [{ arquivo: 'modulo0-utilitarios-compartilhados.js' }, { arquivo: 'modulo4-atalhos-teclado.js' }],
});

const { LOG_ATUALIZACOES, compararVersoes, versoesNaoLidas, alternarPainelNovidades } = w.__atalhosDebug;

const versaoDoModulo6 = fs
  .readFileSync(path.join(RAIZ, 'modulos', 'modulo6-contexto-adicional.js'), 'utf8')
  .match(/VERSAO_SMARTTABLE\s*=\s*'([^']+)'/)?.[1];

// =====================================================================
// SINCRONIA COM A VERSÃO REAL
// =====================================================================
checar(
  'a versão do topo do log é a versão que está rodando',
  LOG_ATUALIZACOES[0].versao === versaoDoModulo6,
  `log=${LOG_ATUALIZACOES[0].versao} VERSAO_SMARTTABLE=${versaoDoModulo6}`
);

// =====================================================================
// FORMA DOS DADOS
// =====================================================================
checar('o log não está vazio', LOG_ATUALIZACOES.length > 0);

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const DATA_BR = /^\d{2}\/\d{2}\/\d{4}$/;

LOG_ATUALIZACOES.forEach((e, i) => {
  checar(`entrada ${i} (${e.versao}) tem versão em semver`, SEMVER.test(e.versao), e.versao);
  checar(`entrada ${i} (${e.versao}) tem data em dd/mm/aaaa`, DATA_BR.test(e.data), e.data);
  checar(`entrada ${i} (${e.versao}) descreve ao menos uma mudança`, Array.isArray(e.mudancas) && e.mudancas.length > 0);
  checar(`entrada ${i} (${e.versao}) não tem mudança vazia`, e.mudancas.every((m) => typeof m === 'string' && m.trim().length > 10));
});

// Ordem: mais recente primeiro. Se inverter, o painel mente sobre o que é novo.
(function () {
  let foraDeOrdem = 0;
  for (let i = 1; i < LOG_ATUALIZACOES.length; i += 1) {
    if (compararVersoes(LOG_ATUALIZACOES[i].versao, LOG_ATUALIZACOES[i - 1].versao) >= 0) foraDeOrdem += 1;
  }
  checar('o log está em ordem decrescente de versão', foraDeOrdem === 0, `${foraDeOrdem} fora de ordem`);
})();

(function () {
  const versoes = LOG_ATUALIZACOES.map((e) => e.versao);
  checar('não há versão repetida no log', new Set(versoes).size === versoes.length);
})();

// =====================================================================
// compararVersoes
// =====================================================================
checar('1.8.0 é mais nova que 1.7.0', compararVersoes('1.8.0', '1.7.0') > 0);
checar('1.5.1 é mais nova que 1.5.0', compararVersoes('1.5.1', '1.5.0') > 0);
checar('1.10.0 é mais nova que 1.9.0 (compara número, não texto)', compararVersoes('1.10.0', '1.9.0') > 0);
checar('2.0.0 é mais nova que 1.99.99', compararVersoes('2.0.0', '1.99.99') > 0);
checar('versões iguais empatam', compararVersoes('1.8.0', '1.8.0') === 0);

// =====================================================================
// MARCAÇÃO DE "NOVO"
// =====================================================================
(function () {
  // Primeira vez de todas: nada marcado, senão o painel abriria com tudo
  // piscando NOVO, o que não informa nada.
  try { w.localStorage.clear(); } catch (erro) { /* ignora */ }
  checar('na primeira abertura, nenhuma versão é marcada como nova', versoesNaoLidas().size === 0, String(versoesNaoLidas().size));
})();

(function () {
  // Quem leu numa versão antiga vê como novo tudo que veio depois.
  w.localStorage.setItem('smarttable_ultima_versao_vista', '1.5.0');
  const novas = versoesNaoLidas();
  checar('versões posteriores à última leitura ficam marcadas', novas.has('1.8.0') && novas.has('1.6.0'), [...novas].join(','));
  checar('a versão já lida NÃO fica marcada', !novas.has('1.5.0'));
  checar('versões anteriores à leitura NÃO ficam marcadas', !novas.has('1.3.0'));
})();

(function () {
  // Abrir o painel marca como lido -- na próxima vez não repete o NOVO.
  w.localStorage.setItem('smarttable_ultima_versao_vista', '1.5.0');
  checar('antes de abrir, há versões novas', versoesNaoLidas().size > 0);

  alternarPainelNovidades();
  checar('o painel foi montado no documento', w.document.body.textContent.includes('O que mudou'));
  checar('depois de abrir, nada fica marcado como novo', versoesNaoLidas().size === 0, String(versoesNaoLidas().size));

  alternarPainelNovidades();
  checar('Alt+L de novo fecha o painel', !w.document.body.textContent.includes('O que mudou'));
})();

(function () {
  // localStorage bloqueado não pode derrubar o atalho.
  const proto = w.Storage.prototype;
  const original = proto.getItem;
  proto.getItem = () => { throw new Error('bloqueado'); };

  let excecao = null;
  try { versoesNaoLidas(); } catch (erro) { excecao = erro; }
  proto.getItem = original;
  checar('localStorage bloqueado não lança ao calcular as novidades', excecao === null, excecao && excecao.message);
})();

resumo();
