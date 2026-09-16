// Testes de calcularNuncaContatadoPorMim (Módulo 6) -- PEDIDO DO USUÁRIO:
// cliente que JÁ foi contatado por outro negociador, mas nunca por este
// (CONFIG_CONTEXTO.USUARIO_NEGOCIADOR), recebe a linha de apresentação
// "Sou o Isaac do financeiro da Tex Cotton" na mensagem do Alt+A.
//
// O campo data-usuario de cada .contato-item foi CONFIRMADO ao vivo no HTML
// real do CRM (valores como "ISAAC.03876" e "BIANCA.03665") -- não é
// suposição. Roda contra o código REAL de modulos/modulo6-contexto-adicional.js
// via window.__contextoAdicionalDebug.
const { novaJanela } = require('./helpers/dom-env');
const { criarChecador } = require('./helpers/checar');

const { checar, resumo } = criarChecador('nunca-contatado-por-mim');

const SPECS = [{ arquivo: 'modulo0-utilitarios-compartilhados.js' }, { arquivo: 'modulo6-contexto-adicional.js' }];

const EU = 'ISAAC.03876';
const OUTRA = 'BIANCA.03665';

function contatoItem(usuario, dataTexto) {
  return `<div class="contato-item" data-data="${dataTexto || '15/09/2026 10:00'}" data-efetivo="true" data-usuario="${usuario}"></div>`;
}

function abrirPagina(itensContato) {
  const bodyHtml = '<div id="content-promessas"></div><div id="content-contatos">' + itensContato.join('') + '</div>';
  return novaJanela({
    url: 'https://texhub.texcotton.com.br/crm/clientes/grupo/0?cnpj=AAA',
    bodyHtml,
    specs: SPECS,
  });
}

function calcular(w) {
  const total = w.document.querySelectorAll('#content-contatos .contato-item').length;
  return w.__contextoAdicionalDebug.calcularNuncaContatadoPorMim(total);
}

// 1. PEDIDO DO USUÁRIO: só contatos de outra pessoa -> true.
(function () {
  const w = abrirPagina([contatoItem(OUTRA), contatoItem(OUTRA, '10/09/2026 09:00')]);
  checar('cliente contatado só por OUTRO negociador -> nuncaContatadoPorMim=true', calcular(w) === true);
})();

// 2. Já fui eu quem contatou (mesmo que uma única vez, no meio de vários
// contatos de outras pessoas) -> false.
(function () {
  const w = abrirPagina([contatoItem(OUTRA), contatoItem(EU, '12/09/2026 11:00'), contatoItem(OUTRA, '14/09/2026 08:00')]);
  checar('um contato meu no meio dos outros -> nuncaContatadoPorMim=false', calcular(w) === false);
})();

// 3. Todos os contatos são meus -> false.
(function () {
  const w = abrirPagina([contatoItem(EU), contatoItem(EU, '10/09/2026 09:00')]);
  checar('todos os contatos são meus -> nuncaContatadoPorMim=false', calcular(w) === false);
})();

// 4. ZERO contatos NÃO entra aqui de propósito -- esse caso já tem mensagem
// própria (semContatoAnterior), que também se apresenta. Contar os dois
// juntos duplicaria a apresentação na mesma mensagem.
(function () {
  const w = abrirPagina([]);
  checar('cliente sem NENHUM contato -> false (semContatoAnterior já cobre esse caso)', calcular(w) === false);
})();

// 5. Defensivo: contato sem data-usuario (campo ausente) não conta como
// meu -- na dúvida, me apresento, que é o comportamento mais seguro.
(function () {
  const w = abrirPagina(['<div class="contato-item" data-data="15/09/2026 10:00" data-efetivo="true"></div>']);
  checar('contato sem data-usuario -> não conta como meu (true)', calcular(w) === true);
})();

// 6. Defensivo: espaços em volta do código não quebram a comparação.
(function () {
  const w = abrirPagina([`<div class="contato-item" data-data="15/09/2026 10:00" data-efetivo="true" data-usuario="  ${EU}  "></div>`]);
  checar('data-usuario com espaços em volta ainda é reconhecido como meu (false)', calcular(w) === false);
})();

// 6b. ACHADO NA REVISÃO DE CÓDIGO: caixa diferente no código do usuário não
// pode fazer a comparação falhar em silêncio (o efeito seria eu me
// apresentar pra todo mundo, inclusive quem eu já conheço). Os dois lados
// são normalizados em maiúsculas, igual ao status da promessa.
(function () {
  const w = abrirPagina([`<div class="contato-item" data-data="15/09/2026 10:00" data-efetivo="true" data-usuario="isaac.03876"></div>`]);
  checar('data-usuario em minúsculas ainda é reconhecido como meu (false)', calcular(w) === false);
})();

// 7. Contato NÃO efetivo (tentativa sem resposta) meu ainda conta como
// contato meu -- eu já me apresentei naquela tentativa, mesmo sem retorno.
(function () {
  const w = abrirPagina([`<div class="contato-item" data-data="15/09/2026 10:00" data-efetivo="false" data-usuario="${EU}"></div>`]);
  checar('contato meu não-efetivo ainda conta como meu (false)', calcular(w) === false);
})();

// 8. Integração com o contexto completo: o campo entra em
// window.__contextoAdicional pro Módulo 4 consultar.
(function () {
  const w = abrirPagina([contatoItem(OUTRA)]);
  const ctx = w.__contextoAdicional;
  checar('window.__contextoAdicional expõe nuncaContatadoPorMim', ctx && ctx.nuncaContatadoPorMim === true, ctx && JSON.stringify({ nuncaContatadoPorMim: ctx.nuncaContatadoPorMim, semContatoAnterior: ctx.semContatoAnterior }));
  checar('semContatoAnterior continua false quando há contato de outra pessoa', ctx && ctx.semContatoAnterior === false);
})();

resumo();
