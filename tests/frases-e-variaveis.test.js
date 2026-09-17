// Testes de substituição de variáveis {{ }}, concordância de plural e do
// toggle da busca rápida (Módulo 4) -- todos achados de revisão de código.
// Rodam contra o código REAL via window.__atalhosDebug.
const { novaJanela } = require('./helpers/dom-env');
const { criarChecador } = require('./helpers/checar');

const { checar, resumo } = criarChecador('frases-e-variaveis');

const w = novaJanela({
  url: 'https://texhub.texcotton.com.br/crm/clientes/grupo/1?cnpj=11111111000111',
  specs: [{ arquivo: 'modulo0-utilitarios-compartilhados.js' }, { arquivo: 'modulo4-atalhos-teclado.js' }],
});

const { substituirVariaveisDaFrase, concordarTitulos } = w.__atalhosDebug;

function registro(saldoTexto, extras) {
  return Object.assign({
    tituloCompleto: '90001/1',
    razaoSocial: 'CLIENTE TESTE LTDA',
    situacaoKey: 'EM_ATRASO',
    diasAtrasoReal: 3,
    vencimentoTexto: '01/09/2026',
    saldoTexto,
  }, extras || {});
}

// =====================================================================
// {{valor_total_vencido}} -- dinheiro NUNCA pode sair errado em silêncio.
//
// BUG REAL (achado de revisão): a soma fazia `acumulado + (valor || 0)`, então
// um saldo que o parser não entendesse virava zero sem nenhum aviso. No
// limite, a mensagem saía com "R$ 0,00" -- e como a string não é vazia, nem
// entrava no aviso de "variável não preenchida". Era o único ponto do sistema
// em que um valor financeiro ERRADO chegava ao cliente sem sinal nenhum.
// =====================================================================
(function () {
  const dados = { registros: [registro('R$ 1.000,00'), registro('R$ 234,56')] };
  const texto = substituirVariaveisDaFrase('Total: {{valor_total_vencido}}', dados);
  checar('soma de saldos válidos é formatada em reais', /1\.234,56/.test(texto), texto);
})();

(function () {
  const dados = { registros: [registro('R$ 1.000,00'), registro('valor a combinar')] };
  const texto = substituirVariaveisDaFrase('Total: {{valor_total_vencido}}', dados);
  checar(
    'saldo não interpretável NÃO vira zero em silêncio -- variável fica visível',
    texto.includes('{{valor_total_vencido}}'),
    texto
  );
  checar('e o total errado não aparece na frase', !/R\$\s*1\.000,00/.test(texto) && !/R\$\s*0,00/.test(texto), texto);
})();

(function () {
  const dados = { registros: [registro('R$ 0,00')] };
  const texto = substituirVariaveisDaFrase('Total: {{valor_total_vencido}}', dados);
  checar('zero LEGÍTIMO (parser entendeu) continua sendo preenchido', /R\$\s*0,00/.test(texto), texto);
})();

// =====================================================================
// Variável sem resolvedor continua visível, nunca inventa valor.
// =====================================================================
(function () {
  const dados = { registros: [registro('R$ 10,00')] };
  const texto = substituirVariaveisDaFrase('Pix: {{chave_pix}}', dados);
  checar('variável sem resolvedor fica visível na caixa', texto.includes('{{chave_pix}}'), texto);
})();

(function () {
  const dados = { registros: [registro('R$ 10,00')] };
  checar('frase sem variável passa intacta', substituirVariaveisDaFrase('Bom dia!', dados) === 'Bom dia!');
})();

// =====================================================================
// concordarTitulos -- preposição desconhecida não pode derrubar a mensagem.
//
// Antes: `const [a, b] = formas[preposicao]` lançava TypeError e a montagem
// da mensagem inteira morria na primeira frase nova com outra preposição.
// =====================================================================
checar('do + 1 -> "do título"', concordarTitulos('do', 1) === 'do título', concordarTitulos('do', 1));
checar('do + 2 -> "dos títulos"', concordarTitulos('do', 2) === 'dos títulos', concordarTitulos('do', 2));
checar('ao + 1 -> "ao título"', concordarTitulos('ao', 1) === 'ao título', concordarTitulos('ao', 1));
checar('ao + 3 -> "aos títulos"', concordarTitulos('ao', 3) === 'aos títulos', concordarTitulos('ao', 3));

(function () {
  let excecao = null;
  let resultado = null;
  try {
    resultado = concordarTitulos('pelo', 2);
  } catch (erro) {
    excecao = erro;
  }
  checar('preposição desconhecida NÃO lança exceção', excecao === null, excecao && excecao.message);
  checar('e devolve uma forma neutra utilizável', resultado === 'títulos', String(resultado));
})();

// =====================================================================
// Alt+B: o toggle era código morto -- com a busca aberta o foco fica no
// input dela, e estaDigitando() barrava o próprio atalho que deveria fechar.
// =====================================================================
(function () {
  const { abrirBuscaRapida, estaBuscaRapidaAberta, fecharBuscaRapida } = w.__atalhosDebug;

  function apertarAltB() {
    w.document.dispatchEvent(new w.KeyboardEvent('keydown', { code: 'KeyB', altKey: true, bubbles: true, cancelable: true }));
  }

  fecharBuscaRapida(); // garante estado limpo
  apertarAltB();
  checar('Alt+B abre a busca rápida', estaBuscaRapidaAberta() === true);

  const input = w.document.querySelector('#smarttable-busca-rapida input');
  checar('a busca tem um campo de texto', !!input);

  apertarAltB();
  checar('Alt+B com a busca aberta FECHA a busca (toggle deixou de ser código morto)', estaBuscaRapidaAberta() === false);
})();

(function () {
  // A exceção é dirigida: qualquer OUTRO Alt+letra continua bloqueado
  // enquanto o foco está no campo da busca -- senão um Alt+S no meio de uma
  // pesquisa registraria e enviaria a cobrança.
  const { abrirBuscaRapida, fecharBuscaRapida } = w.__atalhosDebug;
  fecharBuscaRapida();
  abrirBuscaRapida();

  const input = w.document.querySelector('#smarttable-busca-rapida input');
  input.focus();

  let registrou = false;
  w.filaDebug = { prepararEAguardarEnvio: () => { registrou = true; } };
  w.document.dispatchEvent(new w.KeyboardEvent('keydown', { code: 'KeyS', altKey: true, bubbles: true, cancelable: true }));
  checar('Alt+S digitando na busca NÃO dispara Registrar e Enviar', registrou === false);

  fecharBuscaRapida();
})();

resumo();
