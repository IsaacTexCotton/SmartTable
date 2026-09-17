// Testes de calcularNuncaContatadoPorMim (Módulo 6) -- PEDIDO DO USUÁRIO:
// cliente que JÁ foi contatado por outro negociador, mas nunca por este
// (CONFIG_CONTEXTO.USUARIO_NEGOCIADOR), recebe a linha de apresentação
// "Sou <nome> do financeiro da Tex Cotton" na mensagem do Alt+A, com o
// nome vindo do negociador logado.
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

// Réplica do header real do CRM (confirmado ao vivo): o botão
// #user-menu-btn com o código do usuário logado num <div> folha dentro.
function headerUsuario(codigo) {
  if (!codigo) return '';
  return `<div class="relative" id="user-menu-wrap">
    <button id="user-menu-btn" type="button" onclick="toggleUserMenu()">
      <div id="header-avatar"><span id="header-avatar-initials" class="hidden">IS</span></div>
      <div class="hidden md:block text-right leading-tight max-w-[200px] min-w-0">
        <div class="text-sm font-semibold text-gray-900 truncate">${codigo}</div>
      </div>
    </button>
  </div>`;
}

function abrirPagina(itensContato, usuarioLogado) {
  const bodyHtml =
    headerUsuario(usuarioLogado === undefined ? EU : usuarioLogado) +
    '<div id="content-promessas"></div><div id="content-contatos">' + itensContato.join('') + '</div>';
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

// =====================================================================
// 9+. Usuário logado lido da PÁGINA (#user-menu-btn), não de um valor
// fixo no código -- âncora confirmada ao vivo, presente tanto na lista
// quanto na página de cliente.
// =====================================================================
(function () {
  const w = abrirPagina([contatoItem(OUTRA)], EU);
  checar('lerUsuarioLogado lê o código do header do CRM', w.__contextoAdicionalDebug.lerUsuarioLogado() === EU, w.__contextoAdicionalDebug.lerUsuarioLogado());
})();

(function () {
  // Sem o header na página (variante de tela inesperada), cai no valor
  // fixo do CONFIG em vez de quebrar.
  const w = abrirPagina([contatoItem(OUTRA)], null);
  checar('sem #user-menu-btn, lerUsuarioLogado devolve null', w.__contextoAdicionalDebug.lerUsuarioLogado() === null);
  checar('sem header, obterUsuarioNegociador cai no fallback do CONFIG', w.__contextoAdicionalDebug.obterUsuarioNegociador() === EU);
})();

(function () {
  // O QUE MOTIVOU A MUDANÇA: logado como OUTRA pessoa, a régua passa a
  // seguir quem está logado de verdade. Contatos da Bianca deixam de
  // contar como "de outra pessoa" -- são dela mesma.
  const w = abrirPagina([contatoItem(OUTRA)], OUTRA);
  checar('logado como outra pessoa -> obterUsuarioNegociador segue o logado', w.__contextoAdicionalDebug.obterUsuarioNegociador() === OUTRA);
  checar('logado como Bianca + contato da Bianca -> nuncaContatadoPorMim=false', calcular(w) === false);
})();

(function () {
  // Mesmo cenário invertido: logado como Bianca, contato só do Isaac ->
  // pra ela é primeiro contato.
  const w = abrirPagina([contatoItem(EU)], OUTRA);
  checar('logado como Bianca + contato só do Isaac -> nuncaContatadoPorMim=true', calcular(w) === true);
})();

// =====================================================================
// PEDIDO DO USUÁRIO: o NOME que aparece na mensagem também sai do
// negociador logado -- CONFIRMADO que a parte antes do ponto no código
// do CRM é o primeiro nome da pessoa.
// =====================================================================
(function () {
  const w = abrirPagina([], EU);
  const nome = w.__contextoAdicionalDebug.nomeDoNegociador;

  checar('"ISAAC.03876" -> "Isaac"', nome('ISAAC.03876') === 'Isaac', nome('ISAAC.03876'));
  checar('"BIANCA.03665" -> "Bianca"', nome('BIANCA.03665') === 'Bianca', nome('BIANCA.03665'));
  checar('minúsculas são capitalizadas', nome('isaac.03876') === 'Isaac', nome('isaac.03876'));
  checar('espaços em volta não atrapalham', nome('  BIANCA.03665  ') === 'Bianca', nome('  BIANCA.03665  '));
  checar('nome com acento é preservado', nome('MÔNICA.01234') === 'Mônica', nome('MÔNICA.01234'));

  // Fora do formato confirmado (NOME.NUMERO) não inventa nome nenhum --
  // quem chama cai no padrão em vez de mandar mensagem com nome errado.
  checar('formato inesperado -> string vazia', nome('SEM_PONTO') === '', nome('SEM_PONTO'));
  checar('null -> string vazia', nome(null) === '');
  checar('undefined -> string vazia', nome(undefined) === '');
})();

(function () {
  // O nome entra no contexto pro Módulo 4 montar a frase.
  const w = abrirPagina([contatoItem(OUTRA)], OUTRA);
  checar('logado como Bianca -> ctx.nomeNegociador = "Bianca"', w.__contextoAdicional.nomeNegociador === 'Bianca', w.__contextoAdicional.nomeNegociador);
})();

(function () {
  const w = abrirPagina([contatoItem(OUTRA)], EU);
  checar('logado como Isaac -> ctx.nomeNegociador = "Isaac"', w.__contextoAdicional.nomeNegociador === 'Isaac', w.__contextoAdicional.nomeNegociador);
})();

(function () {
  // Sem header, o nome vem do fallback do CONFIG -- mesma mensagem de
  // sempre, nada quebra.
  const w = abrirPagina([contatoItem(OUTRA)], null);
  checar('sem header -> ctx.nomeNegociador cai no fallback ("Isaac")', w.__contextoAdicional.nomeNegociador === 'Isaac', w.__contextoAdicional.nomeNegociador);
})();

(function () {
  // Caixa do header normalizada também (mesmo motivo do data-usuario).
  const w = abrirPagina([contatoItem(OUTRA)], 'isaac.03876');
  checar('código do header em minúsculas é normalizado', w.__contextoAdicionalDebug.lerUsuarioLogado() === EU);
})();

// =====================================================================
// CONTRATO DO CONTEXTO (achado de revisão): o objeto de fallback era um
// literal DUPLICADO em dois pontos do Módulo 6. Quem acrescentasse um campo
// novo ao contexto tinha que lembrar de editar os dois -- esquecer um não
// quebrava teste nenhum, só fazia o Módulo 4 receber `undefined` naquele
// campo e mudar de comportamento em silêncio, justamente no caminho de
// fallback (o menos testado). Agora existe uma fábrica só, e este teste
// trava que ela continua com a MESMA FORMA do contexto calculado de verdade.
// =====================================================================
(function () {
  const w = abrirPagina([contatoItem(OUTRA)], EU);
  const { contextoVazio, calcularContexto } = w.__contextoAdicionalDebug;

  const vazio = contextoVazio();
  const real = calcularContexto();

  const camposVazio = Object.keys(vazio).sort();
  const camposReal = Object.keys(real).sort();

  checar(
    'contextoVazio() tem exatamente os mesmos campos que calcularContexto()',
    camposVazio.join(',') === camposReal.join(','),
    `vazio=[${camposVazio}] real=[${camposReal}]`
  );

  // Nenhum campo pode vir undefined: é justamente o sintoma silencioso que a
  // duplicação produzia.
  const indefinidos = camposVazio.filter((k) => vazio[k] === undefined);
  checar('nenhum campo do contexto neutro vem undefined', indefinidos.length === 0, indefinidos.join(','));

  checar('contexto neutro desliga todas as regras', vazio.promessa === null && vazio.contatoRecente === null && vazio.semContatoAnterior === false && vazio.contatoAntigo === false && vazio.nuncaContatadoPorMim === false);
  checar('contexto neutro ainda sabe o nome do negociador (do CONFIG)', vazio.nomeNegociador === 'Isaac', vazio.nomeNegociador);
  checar('contexto neutro mantém calcularTitulosPendentes chamável', typeof vazio.calcularTitulosPendentes === 'function');
})();

resumo();
