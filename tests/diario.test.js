// Testes do Diário de Cobrança (Módulo 8) -- a instrumentação que permite
// medir se a régua de prioridade do Alt+U funciona.
//
// O QUE MAIS IMPORTA AQUI não é o armazenamento, é a propriedade estatística:
// o grupo de controle precisa ser INDEPENDENTE da faixa. Se o sorteio
// correlacionasse com a prioridade, a comparação controle vs. régua mediria
// o próprio viés que ela existe pra eliminar -- e o relatório sairia
// confiante e errado. Há um teste dedicado a isso no fim.
const { novaJanela } = require('./helpers/dom-env');
const { criarChecador } = require('./helpers/checar');

const { checar, resumo } = criarChecador('diario');

const SPECS = [
  { arquivo: 'modulo0-utilitarios-compartilhados.js' },
  { arquivo: 'modulo8-diario.js' },
];

function abrir() {
  return novaJanela({ url: 'https://texhub.texcotton.com.br/crm/clientes', specs: SPECS });
}

function cnpjFicticio(i) {
  return String(10000000000000 + i);
}

// O grupo de controle vem DESLIGADO por padrão (decisão do usuário). Os
// testes do sorteio ligam explicitamente -- é o comportamento deles que está
// sendo protegido, pra quando for religado. Sem isso, eles passariam
// trivialmente com tudo zero, que é falso positivo.
function comControleLigado(d, fn) {
  const antes = d.CONFIG_DIARIO.ATIVAR_GRUPO_CONTROLE;
  d.CONFIG_DIARIO.ATIVAR_GRUPO_CONTROLE = true;
  try { fn(); } finally { d.CONFIG_DIARIO.ATIVAR_GRUPO_CONTROLE = antes; }
}

// =====================================================================
// GRAVAÇÃO E LEITURA
// =====================================================================
(function () {
  const w = abrir();
  const d = w.__diario;

  checar('registrar() devolve true quando grava', d.registrar('contato', { c: cnpjFicticio(1) }) === true);
  checar('o evento aparece em eventos()', d.eventos().length === 1);

  const [evento] = d.eventos();
  checar('o evento guarda o tipo', evento.t === 'contato', JSON.stringify(evento));
  checar('o evento guarda o dia em AAAAMMDD', String(evento.d).length === 8, String(evento.d));
  checar('o evento guarda a hora em minutos desde a meia-noite', evento.h >= 0 && evento.h < 1440, String(evento.h));
  checar('o evento guarda o cnpj', evento.c === cnpjFicticio(1));
})();

(function () {
  const w = abrir();
  const d = w.__diario;

  d.registrar('fila', { c: cnpjFicticio(1), f: 3 });
  d.registrar('contato', { c: cnpjFicticio(1) });
  d.registrar('baixa', { c: cnpjFicticio(1), tt: ['900001/1'] });

  checar('eventos() sem filtro devolve todos', d.eventos().length === 3);
  checar('eventos() filtra por tipo', d.eventos({ tipo: 'contato' }).length === 1);
  checar('eventos() de um tipo inexistente devolve vazio', d.eventos({ tipo: 'inexistente' }).length === 0);
})();

(function () {
  // registrarLote é o caminho do Alt+U: 150 candidatos numa gravação só.
  const w = abrir();
  const d = w.__diario;

  const lote = Array.from({ length: 150 }, (_, i) => ({ c: cnpjFicticio(i), f: (i % 10) + 1, p: i + 1 }));
  const gravados = d.registrarLote('fila', lote);

  checar('registrarLote grava os 150 de uma vez', gravados === 150, String(gravados));
  checar('todos aparecem em eventos()', d.eventos({ tipo: 'fila' }).length === 150);
  checar('a posição de cada um é preservada', d.eventos({ tipo: 'fila' })[42].p === 43);
  checar('registrarLote com lista vazia não grava nada', d.registrarLote('fila', []) === 0);
  checar('registrarLote com entrada inválida não quebra', d.registrarLote('fila', null) === 0);
})();

// =====================================================================
// ROBUSTEZ -- instrumentação NUNCA pode derrubar a cobrança
// =====================================================================
(function () {
  const w = abrir();
  const d = w.__diario;

  // Simula cota estourada do localStorage.
  //
  // ATENÇÃO (armadilha real do jsdom, descoberta escrevendo este teste):
  // `w.localStorage.setItem = fn` NÃO pega -- a atribuição na instância falha
  // em silêncio, o setItem original continua valendo e o teste passa a não
  // testar nada. O mock precisa ir no PROTOTYPE de Storage.
  const proto = w.Storage.prototype;
  const originalSetItem = proto.setItem;
  proto.setItem = () => { throw new Error('QuotaExceededError'); };

  let excecao = null;
  let resultado = null;
  try {
    resultado = d.registrar('contato', { c: cnpjFicticio(1) });
  } catch (erro) {
    excecao = erro;
  }
  checar('cota estourada NÃO lança exceção pro chamador', excecao === null, excecao && excecao.message);
  checar('cota estourada devolve false, sem mentir que gravou', resultado === false);

  proto.setItem = originalSetItem;
  checar('depois que a cota volta, grava de novo', d.registrar('contato', { c: cnpjFicticio(2) }) === true);
})();

(function () {
  // JSON corrompido no dia não pode derrubar a leitura.
  const w = abrir();
  const d = w.__diario;
  w.localStorage.setItem(`${d.CONFIG_DIARIO.PREFIXO_CHAVE}${d.chaveDia()}`, '{{{ não é json');

  let excecao = null;
  try { d.eventos(); } catch (erro) { excecao = erro; }
  checar('dia corrompido não lança exceção ao ler', excecao === null, excecao && excecao.message);
  checar('dia corrompido é tratado como vazio', d.eventos().length === 0);
  checar('e ainda dá pra gravar por cima', d.registrar('contato', { c: cnpjFicticio(1) }) === true);
})();

// =====================================================================
// RETENÇÃO -- o diário não pode crescer pra sempre
// =====================================================================
(function () {
  const w = abrir();
  const d = w.__diario;
  const prefixo = d.CONFIG_DIARIO.PREFIXO_CHAVE;

  // Um dia bem além da janela de retenção e um dentro dela.
  const diaVelho = d.chaveDia(new Date(Date.now() - (d.CONFIG_DIARIO.DIAS_RETENCAO + 30) * 86400000));
  const diaRecente = d.chaveDia(new Date(Date.now() - 5 * 86400000));
  w.localStorage.setItem(prefixo + diaVelho, JSON.stringify([{ t: 'contato', d: diaVelho }]));
  w.localStorage.setItem(prefixo + diaRecente, JSON.stringify([{ t: 'contato', d: diaRecente }]));

  // A limpeza roda no carregamento do módulo -- abre uma janela nova com o
  // mesmo localStorage não é possível aqui, então exercitamos o efeito via
  // eventos(), que já filtra por janela ao receber ultimosDias.
  checar('dia velho existe antes da faxina', w.localStorage.getItem(prefixo + diaVelho) !== null);
  checar('eventos({ultimosDias}) ignora o que está fora da janela', d.eventos({ ultimosDias: 30 }).every((e) => e.d >= diaRecente));
  checar('eventos({ultimosDias}) inclui o que está dentro', d.eventos({ ultimosDias: 30 }).some((e) => e.d === diaRecente));
})();

(function () {
  const w = abrir();
  const d = w.__diario;
  d.registrar('contato', { c: cnpjFicticio(1) });
  checar('tamanho() devolve bytes maiores que zero quando há dado', d.tamanho() > 0, String(d.tamanho()));
})();

// =====================================================================
// GRUPO DE CONTROLE -- a parte que decide se a medição vale algo
// =====================================================================
(function () {
  const w = abrir();
  const d = w.__diario;

  // Determinismo: rodar o Alt+U duas vezes no mesmo dia não pode remexer o
  // sorteio, senão o cliente trocaria de grupo no meio do experimento.
  comControleLigado(d, () => {
  const cnpj = cnpjFicticio(7);
  const dia = 20260917;
  checar('ehGrupoControle é determinístico no mesmo dia', d.ehGrupoControle(cnpj, dia) === d.ehGrupoControle(cnpj, dia));
  checar('sorteioEstavel é determinístico no mesmo dia', d.sorteioEstavel(cnpj, dia) === d.sorteioEstavel(cnpj, dia));
  checar('sorteioEstavel fica no intervalo [0,1)', d.sorteioEstavel(cnpj, dia) >= 0 && d.sorteioEstavel(cnpj, dia) < 1);
  });
})();

(function () {
  const w = abrir();
  const d = w.__diario;

  // Nenhum cliente pode ficar preso no controle pra sempre -- isso o tiraria
  // permanentemente da régua, o que é um custo real de cobrança.
  comControleLigado(d, () => {
  const cnpj = cnpjFicticio(7);
  const dias = [20260101, 20260102, 20260103, 20260104, 20260105, 20260106, 20260107, 20260108, 20260109, 20260110];
  const grupos = dias.map((dia) => d.ehGrupoControle(cnpj, dia));
  checar('o mesmo cliente NÃO fica sempre no mesmo grupo ao longo dos dias', new Set(grupos).size === 2, JSON.stringify(grupos));
  });
})();

(function () {
  const w = abrir();
  const d = w.__diario;

  // A proporção precisa bater com o combinado (~1 em 5). Amostra grande pra
  // não depender de sorte.
  comControleLigado(d, () => {
  const total = 5000;
  let controle = 0;
  for (let i = 0; i < total; i += 1) {
    if (d.ehGrupoControle(cnpjFicticio(i), 20260917)) controle += 1;
  }
  const proporcao = controle / total;
  checar(
    'a proporção de controle fica perto de 1 em 5 (18% a 22%)',
    proporcao > 0.18 && proporcao < 0.22,
    `${(proporcao * 100).toFixed(1)}%`
  );
  });
})();

(function () {
  // O TESTE QUE MAIS IMPORTA.
  //
  // O grupo de controle tem que ser independente da FAIXA. Se clientes de
  // faixa alta caíssem no controle com mais frequência que os de faixa
  // baixa, a comparação controle vs. régua mediria justamente o viés que ela
  // existe pra eliminar -- e o relatório sairia confiante e errado.
  //
  // Simula 10 faixas com 500 clientes cada e confere que a taxa de controle
  // é parecida em todas.
  const w = abrir();
  const d = w.__diario;
  comControleLigado(d, () => {
  const dia = 20260917;

  const taxas = [];
  for (let faixa = 1; faixa <= 10; faixa += 1) {
    let controle = 0;
    const porFaixa = 500;
    for (let i = 0; i < porFaixa; i += 1) {
      // O cnpj não carrega nenhuma informação da faixa -- é assim na vida
      // real também, a faixa é calculada depois, a partir do título.
      if (d.ehGrupoControle(cnpjFicticio(faixa * 100000 + i), dia)) controle += 1;
    }
    taxas.push(controle / porFaixa);
  }

  const menor = Math.min(...taxas);
  const maior = Math.max(...taxas);
  checar(
    'a taxa de controle é parecida em TODAS as faixas (independência)',
    maior - menor < 0.08,
    `menor=${(menor * 100).toFixed(1)}% maior=${(maior * 100).toFixed(1)}%`
  );
  });
})();

(function () {
  const w = abrir();
  const d = w.__diario;

  // As posições sorteadas precisam se espalhar pela fila inteira, não se
  // concentrar num pedaço -- senão o controle viraria "sempre chamado no
  // meio", que é outra ordem fixa, não uma ordem aleatória.
  const amostras = Array.from({ length: 2000 }, (_, i) => d.sorteioEstavel(cnpjFicticio(i), 20260917));
  const terços = [0, 0, 0];
  amostras.forEach((v) => { terços[Math.min(2, Math.floor(v * 3))] += 1; });
  const menor = Math.min(...terços);
  const maior = Math.max(...terços);
  checar(
    'as posições sorteadas se espalham pela fila toda',
    (maior - menor) / amostras.length < 0.08,
    JSON.stringify(terços)
  );
})();

// =====================================================================
// ANÁLISE -- o cruzamento entre fila, contato e baixa
// =====================================================================
(function () {
  const w = abrir();
  const d = w.__diario;
  const hoje = d.chaveDia();

  // Cliente 1: entrou na fila, foi contatado, e o título sumiu no mesmo dia.
  d.registrarLote('fila', [{ c: 'AAA', f: 3, p: 1, k: 0, s: 'EM_ATRASO', a: 2 }]);
  d.registrar('contato', { c: 'AAA' });
  d.registrar('baixa', { c: 'AAA', tt: ['900001/1'] });

  // Cliente 2: entrou na fila, NÃO foi contatado, sem baixa.
  d.registrarLote('fila', [{ c: 'BBB', f: 9, p: 2, k: 0, s: 'EM_ATRASO', a: 4 }]);

  const a = d.analisar();

  checar('analisar() conta todas as atribuições', a.totalAtribuicoes === 2, String(a.totalAtribuicoes));
  checar('faixa 3 aparece com 1 atribuição', a.porFaixa[3].atribuicoes === 1);
  checar('faixa 3 marca o cliente como contatado', a.porFaixa[3].contatados === 1);
  checar('faixa 3 marca a baixa', a.porFaixa[3].comBaixa === 1);
  checar('faixa 3 registra 0 dia até a baixa (mesmo dia)', a.porFaixa[3].medianaDiasAteBaixa === 0, String(a.porFaixa[3].medianaDiasAteBaixa));
  checar('faixa 9 não foi contatada', a.porFaixa[9].contatados === 0);
  checar('faixa 9 não teve baixa', a.porFaixa[9].comBaixa === 0);
  checar('faixa 9 tem mediana nula quando não houve baixa', a.porFaixa[9].medianaDiasAteBaixa === null);
})();

(function () {
  // Baixa FORA da janela não pode ser creditada à cobrança.
  const w = abrir();
  const d = w.__diario;
  const prefixo = d.CONFIG_DIARIO.PREFIXO_CHAVE;
  const hoje = d.chaveDia();
  const dezDiasAtras = d.chaveDia(new Date(Date.now() - 10 * 86400000));

  // Fila de 10 dias atrás, baixa hoje -- fora da janela padrão de 7 dias.
  w.localStorage.setItem(prefixo + dezDiasAtras, JSON.stringify([
    { t: 'fila', d: dezDiasAtras, h: 540, c: 'CCC', f: 5, p: 1, k: 0 },
  ]));
  w.localStorage.setItem(prefixo + hoje, JSON.stringify([
    { t: 'baixa', d: hoje, h: 540, c: 'CCC', tt: ['900002/1'] },
  ]));

  checar('baixa fora da janela de 7 dias NÃO é creditada', d.analisar().porFaixa[5].comBaixa === 0);
  checar('mas entra se a janela for alargada pra 15 dias', d.analisar({ janelaBaixaDias: 15 }).porFaixa[5].comBaixa === 1);
})();

(function () {
  // Baixa ANTERIOR à cobrança não pode ser creditada a ela.
  const w = abrir();
  const d = w.__diario;
  const prefixo = d.CONFIG_DIARIO.PREFIXO_CHAVE;
  const hoje = d.chaveDia();
  const ontem = d.chaveDia(new Date(Date.now() - 86400000));

  w.localStorage.setItem(prefixo + ontem, JSON.stringify([
    { t: 'baixa', d: ontem, h: 540, c: 'DDD', tt: ['900003/1'] },
  ]));
  w.localStorage.setItem(prefixo + hoje, JSON.stringify([
    { t: 'fila', d: hoje, h: 540, c: 'DDD', f: 4, p: 1, k: 0 },
  ]));

  checar('baixa anterior à cobrança NÃO é creditada a ela', d.analisar().porFaixa[4].comBaixa === 0);
})();

(function () {
  // A separação régua/controle é o que o relatório usa pra responder.
  const w = abrir();
  const d = w.__diario;

  d.registrarLote('fila', [
    { c: 'E1', f: 1, p: 1, k: 0 },
    { c: 'E2', f: 2, p: 2, k: 0 },
    { c: 'E3', f: 3, p: 3, k: 1 },
  ]);

  const a = d.analisar();
  checar('a régua recebe os que não são controle', a.regua.atribuicoes === 2, String(a.regua.atribuicoes));
  checar('o controle recebe os sorteados', a.controle.atribuicoes === 1, String(a.controle.atribuicoes));
  checar('régua + controle cobrem tudo', a.regua.atribuicoes + a.controle.atribuicoes === a.totalAtribuicoes);
})();

(function () {
  // Diário vazio não pode quebrar nem inventar número.
  const w = abrir();
  const a = w.__diario.analisar();
  checar('análise de diário vazio devolve zero atribuições', a.totalAtribuicoes === 0);
  checar('análise de diário vazio não inventa faixa', Object.keys(a.porFaixa).length === 0);

  let excecao = null;
  try { w.__diario.relatorio(); } catch (erro) { excecao = erro; }
  checar('relatorio() com diário vazio não lança', excecao === null, excecao && excecao.message);
})();

// =====================================================================
// PADRÃO: grupo de controle DESLIGADO
// =====================================================================
(function () {
  const w = abrir();
  const d = w.__diario;

  checar('vem desligado por padrão', d.CONFIG_DIARIO.ATIVAR_GRUPO_CONTROLE === false);
  checar('desligado, ehGrupoControle devolve false pra qualquer cnpj',
    Array.from({ length: 200 }, (_, i) => d.ehGrupoControle(cnpjFicticio(i), 20260917)).every((x) => x === false));
  checar('desligado, também devolve false em qualquer dia',
    [20260101, 20260615, 20261231].every((dia) => d.ehGrupoControle(cnpjFicticio(1), dia) === false));

  // O sorteio de POSIÇÃO continua funcionando -- só não é usado por ninguém
  // enquanto o experimento está desligado. Religar não pode depender de mais
  // nada além da flag.
  checar('sorteioEstavel continua válido mesmo com o experimento desligado',
    d.sorteioEstavel(cnpjFicticio(1), 20260917) >= 0 && d.sorteioEstavel(cnpjFicticio(1), 20260917) < 1);

  // E a gravação segue normal: desligar o experimento não desliga o diário.
  checar('desligado, o diário continua gravando', d.registrar('contato', { c: cnpjFicticio(1) }) === true);
  checar('e o evento gravado aparece', d.eventos({ tipo: 'contato' }).length === 1);
})();

(function () {
  // O relatório não pode apresentar a comparação vazia como se fosse
  // resultado -- tem que dizer que está desligada.
  const w = abrir();
  const d = w.__diario;
  d.registrarLote('fila', [{ c: cnpjFicticio(1), f: 3, p: 1, k: 0 }]);

  const linhas = [];
  const logOriginal = console.log;
  console.log = (...args) => linhas.push(args.join(' '));
  try { d.relatorio(); } finally { console.log = logOriginal; }

  const saida = linhas.join('\n');
  checar('o relatório avisa que o grupo de controle está desligado', /DESLIGADO/.test(saida), saida.slice(0, 200));
  checar('e não imprime a comparação régua vs controle como se valesse', !/é ESTA comparação que responde/.test(saida));
})();

resumo();
