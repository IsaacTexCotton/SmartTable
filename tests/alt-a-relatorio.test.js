// Testes do passo "gerar relatório" do Alt+A (Módulo 4) -- DOIS BUGS REAIS
// intermitentes, relatados pelo usuário ("faz tudo, às vezes não gera o
// relatório"):
//
//   1. O Módulo 1 troca o rótulo do botão pra "Gerando..." durante a geração.
//      O Alt+A procurava o botão por TEXTO ("relatório"), então apertar Alt+A
//      com um relatório em andamento não encontrava botão nenhum.
//   2. O Alt+A esperava 150ms FIXOS e abria a tela de contato. A geração é
//      assíncrona (o html2canvas vem de um CDN no clique) e podia ainda estar
//      capturando quando o modal abria por cima. Frio falhava, quente passava.
//
// O botão simulado aqui replica o contrato real do Módulo 1 (criarBotao +
// aoClicar): id "aviso-cobranca-botao", disabled=true e texto "Gerando..."
// no início, restaurados no fim.
const { novaJanela } = require('./helpers/dom-env');
const { criarChecador } = require('./helpers/checar');

const { checar, resumo } = criarChecador('alt-a-relatorio');

const SPECS = [
  { arquivo: 'modulo0-utilitarios-compartilhados.js' },
  { arquivo: 'modulo4-atalhos-teclado.js' },
];

/**
 * Réplica do botão do Módulo 1. `duracaoMs` simula quanto a captura demora --
 * é a variável que fazia o bug 2 ser intermitente.
 */
function instalarBotaoRelatorio(w, { duracaoMs = 0 } = {}) {
  const botao = w.document.createElement('button');
  botao.id = 'aviso-cobranca-botao';
  botao.textContent = 'Gerar Relatório';
  botao.getBoundingClientRect = () => ({ width: 160, height: 40 });
  const estado = { cliques: 0, terminouEm: null };

  botao.addEventListener('click', () => {
    estado.cliques += 1;
    const rotulo = botao.textContent;
    botao.disabled = true;
    botao.textContent = 'Gerando...'; // <- o que quebrava a busca por texto
    setTimeout(() => {
      botao.disabled = false;
      botao.textContent = rotulo;
      estado.terminouEm = Date.now();
    }, duracaoMs);
  });

  w.document.body.appendChild(botao);
  return { botao, estado };
}

function instalarBotaoContato(w) {
  const botao = w.document.createElement('button');
  botao.textContent = 'Registrar Contato';
  botao.getBoundingClientRect = () => ({ width: 160, height: 40 });
  const estado = { abertoEm: null };
  botao.addEventListener('click', () => { estado.abertoEm = Date.now(); });
  w.document.body.appendChild(botao);
  return estado;
}

function abrir() {
  return novaJanela({ url: 'https://texhub.texcotton.com.br/crm/clientes/grupo/0?cnpj=AAA', specs: SPECS });
}

// =====================================================================
// BUG 1: achar o botão mesmo com o rótulo trocado
// =====================================================================
(function () {
  const w = abrir();
  const { botao } = instalarBotaoRelatorio(w);
  checar('acha o botão de relatório pelo rótulo normal', w.__atalhosDebug.encontrarBotaoRelatorio() === botao);
})();

(function () {
  const w = abrir();
  const { botao } = instalarBotaoRelatorio(w);

  // Estado real durante uma geração em andamento.
  botao.textContent = 'Gerando...';
  botao.disabled = true;

  checar(
    'REGRESSÃO: acha o botão mesmo com o rótulo trocado pra "Gerando..."',
    w.__atalhosDebug.encontrarBotaoRelatorio() === botao,
    String(w.__atalhosDebug.encontrarBotaoRelatorio())
  );
})();

(function () {
  const w = abrir();
  const { botao, estado } = instalarBotaoRelatorio(w);
  botao.disabled = true; // já está gerando

  const devolvido = w.__atalhosDebug.acionarGerarRelatorio();
  checar('com geração em andamento, NÃO clica de novo', estado.cliques === 0, String(estado.cliques));
  checar('mas devolve o botão, pra quem chamou poder esperar', devolvido === botao);
})();

(function () {
  const w = abrir();
  const { estado } = instalarBotaoRelatorio(w);
  w.__atalhosDebug.acionarGerarRelatorio();
  checar('com o botão livre, clica normalmente', estado.cliques === 1, String(estado.cliques));
})();

(function () {
  const w = abrir();
  checar('sem botão nenhum na página, devolve null em vez de quebrar', w.__atalhosDebug.acionarGerarRelatorio() === null);
})();

// =====================================================================
// BUG 2: só abrir a tela de contato DEPOIS que o relatório terminar
// =====================================================================
(async function () {
  const w = abrir();
  w.__alertaGrupo = { empresasComVencido: [] };
  w.__contextoAdicional = { semContatoAnterior: false };

  // Captura "lenta" (biblioteca fria) -- 600ms, bem acima dos 150ms fixos
  // que a versão antiga esperava.
  const { estado: relatorio } = instalarBotaoRelatorio(w, { duracaoMs: 600 });
  const contato = instalarBotaoContato(w);

  await w.__atalhosDebug.acionarAtendimentoRapido();

  checar('o relatório foi disparado', relatorio.cliques === 1);
  checar('o relatório terminou', relatorio.terminouEm !== null);
  checar('a tela de contato abriu', contato.abertoEm !== null);
  checar(
    'REGRESSÃO: a tela de contato só abre DEPOIS do relatório terminar',
    contato.abertoEm !== null && relatorio.terminouEm !== null && contato.abertoEm >= relatorio.terminouEm,
    `relatório terminou em ${relatorio.terminouEm}, contato abriu em ${contato.abertoEm}`
  );

  resumo();
})();
