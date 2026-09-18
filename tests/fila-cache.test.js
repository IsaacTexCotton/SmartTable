// Classificação em paralelo + cache do dia (Módulo 7).
//
// POR QUE ISTO EXISTE: montar a fila visitava ~92 clientes em abas de fundo,
// UMA POR VEZ, com até 8s de espera cada -- 3 a 5 minutos, e a única forma de
// ver a fila era pagar esse preço inteiro. Agora são 4 abas ao mesmo tempo, e
// o resultado fica num cache do dia que o Alt+U reaproveita.
//
// A REGRA QUE ESTE ARQUIVO PROTEGE, e é a única que importa de verdade:
//
//     A FILA MONTADA DO CACHE TEM QUE SER IDÊNTICA À MONTADA NA HORA.
//
// Otimização que muda a saída não é otimização, é feature. O cache guarda um
// recorte dos resultados (paraOCache); se alguém usar no pipeline um campo
// que o recorte não carrega, o caminho do cache passa a divergir em silêncio
// -- fila diferente, ordem diferente, e nada na tela avisando. É esse o
// defeito que o teste de equivalência abaixo existe pra pegar.
const { novaJanela } = require('./helpers/dom-env');
const { criarChecador } = require('./helpers/checar');

const { checar, resumo } = criarChecador('fila-cache');

const URL_LISTA = 'https://texhub.texcotton.com.br/crm/clientes';
const SPECS = [
  { arquivo: 'modulo0-utilitarios-compartilhados.js' },
  // O diário entra porque duas asserções abaixo são sobre o que ele grava --
  // sem ele carregado, elas passariam por ausência em vez de por acerto.
  { arquivo: 'modulo8-diario.js' },
  { arquivo: 'modulo3-fila-atendimento.js' },
  { arquivo: 'modulo7-fila-prioridade.js' },
];

const abrir = () => novaJanela({ url: URL_LISTA, specs: SPECS });

/** Resultado de classificação, na forma que classificarCliente devolve. */
function resultado(i, prioridade, dias) {
  return {
    cliente: {
      url: `https://texhub.texcotton.com.br/crm/clientes/grupo/1?cnpj=${i}`,
      cnpj: String(i),
      label: `Cliente ${i}`,
    },
    escolhido: {
      diasAtrasoReal: dias,
      situacaoKey: 'EM_ATRASO',
      // Campos que o pipeline NÃO usa. Estão aqui de propósito: o cache não
      // deve carregá-los, e a fila não deve depender deles.
      dataVencimento: new Date(2026, 8, 1, 12, 0, 0),
      valor: 'R$ 1.000,00',
    },
    fluxo: 'SCPC',
    prioridade,
    empresasComVencido: [],
  };
}

// =====================================================================
// 1. O POOL PARALELO
// =====================================================================
// classificarEmLote aceita um classificador injetado SÓ pra isto: abrir aba
// de verdade não acontece no jsdom, e a concorrência é justamente o que esta
// versão mudou. Sem a costura, o ponto da mudança ficaria sem cobertura.
async function pool() {
  const w = abrir();
  const api = w.filaPrioridadeDebug;

  checar(
    'a concorrência é conservadora (são ~92 cargas contra o CRM da empresa)',
    api.CONFIG.CONCORRENCIA_CLASSIFICACAO >= 2 && api.CONFIG.CONCORRENCIA_CLASSIFICACAO <= 6,
    String(api.CONFIG.CONCORRENCIA_CLASSIFICACAO)
  );

  const clientes = Array.from({ length: 12 }, (_, i) => ({ cnpj: String(i), label: `C${i}`, url: `u${i}` }));

  let emVoo = 0;
  let pico = 0;
  const chegada = [];
  const lento = async (c) => {
    emVoo += 1;
    pico = Math.max(pico, emVoo);
    // Tempos diferentes de propósito: força a ordem de CHEGADA a divergir da
    // ordem de ENTRADA, que é o que o teste de ordem abaixo precisa.
    await new Promise((r) => setTimeout(r, (Number(c.cnpj) % 3) * 6 + 3));
    emVoo -= 1;
    chegada.push(c.cnpj);
    return { cliente: c, escolhido: { diasAtrasoReal: 5, situacaoKey: 'EM_ATRASO' }, prioridade: 9, empresasComVencido: [] };
  };

  const { resultados, abortouPorPopup } = await api.classificarEmLote(clientes, () => {}, lento);

  checar('classifica todo mundo', resultados.length === 12, String(resultados.length));
  checar('não aborta quando os pop-ups funcionam', abortouPorPopup === false);
  checar(
    'roda em PARALELO de verdade (mais de um em voo ao mesmo tempo)',
    pico > 1,
    `pico de simultâneos = ${pico}`
  );
  checar(
    'e nunca passa do teto configurado',
    pico <= api.CONFIG.CONCORRENCIA_CLASSIFICACAO,
    `pico=${pico} teto=${api.CONFIG.CONCORRENCIA_CLASSIFICACAO}`
  );
  checar(
    'a ordem de CHEGADA de fato divergiu da de entrada (senão o teste abaixo não provaria nada)',
    chegada.join(',') !== clientes.map((c) => c.cnpj).join(','),
    chegada.join(',')
  );
  checar(
    'mas o RESULTADO acompanha a ordem de ENTRADA',
    resultados.map((r) => r.cliente.cnpj).join(',') === clientes.map((c) => c.cnpj).join(','),
    resultados.map((r) => r.cliente.cnpj).join(',')
  );

  // O AQUECIMENTO: com pop-up bloqueado desde o início, o disjuntor tem que
  // desistir depois de 3 tentativas -- não depois de 3 + as que já estavam
  // em voo. Foi exatamente essa frouxidão que o teste do disjuntor pegou
  // quando o paralelismo entrou sem aquecimento.
  let tentativas = 0;
  const sempreBloqueado = async (c) => { tentativas += 1; return { cliente: c, erro: 'popup-bloqueado' }; };
  const r2 = await api.classificarEmLote(clientes, () => {}, sempreBloqueado);
  checar('com pop-up bloqueado, aborta', r2.abortouPorPopup === true);
  checar(
    'e desiste em exatamente 3 tentativas, sem varrer os 12',
    tentativas === 3,
    `tentativas = ${tentativas}`
  );

  // Primeiro sucesso libera o paralelismo.
  let n = 0;
  const umRuimDepoisBom = async (c) => {
    n += 1;
    if (n === 1) return { cliente: c, erro: 'popup-bloqueado' };
    return { cliente: c, escolhido: { diasAtrasoReal: 1, situacaoKey: 'EM_ATRASO' }, prioridade: 10, empresasComVencido: [] };
  };
  const r3 = await api.classificarEmLote(clientes, () => {}, umRuimDepoisBom);
  checar('um bloqueio isolado não aborta nada', r3.abortouPorPopup === false && r3.resultados.length === 12);
}

// =====================================================================
// 2. O CACHE: GRAVAR, LER, EXPIRAR
// =====================================================================
function cache() {
  const w = abrir();
  const api = w.filaPrioridadeDebug;

  checar('sem nada gravado, não há cache', api.lerCacheClassificacao() === null);

  const resultados = [resultado(1, 3, 10), resultado(2, 9, 4)];
  checar('grava', api.gravarCacheClassificacao(resultados) === true);

  const lido = api.lerCacheClassificacao();
  checar('lê de volta', lido !== null && lido.resultados.length === 2);
  checar('e registra quando foi gerado', typeof lido.geradoEm === 'number' && lido.geradoEm > 0);

  // O recorte: só o que o pipeline consome.
  const primeiro = lido.resultados[0];
  checar('o cache guarda o cliente', primeiro.cliente.cnpj === '1');
  checar('a prioridade', primeiro.prioridade === 3);
  checar('os dias de atraso e a situação', primeiro.escolhido.diasAtrasoReal === 10 && primeiro.escolhido.situacaoKey === 'EM_ATRASO');
  checar('e as empresas do grupo', Array.isArray(primeiro.empresasComVencido));
  checar(
    'mas NÃO guarda campo que o pipeline não usa (Date não sobrevive ao JSON)',
    !('dataVencimento' in primeiro.escolhido) && !('valor' in primeiro.escolhido)
  );

  // Cache de outro dia não serve -- a régua depende de "hoje".
  const cru = JSON.parse(w.localStorage.getItem(api.CONFIG.CHAVE_CACHE_CLASSIFICACAO));
  cru.dia = '2020-01-01';
  w.localStorage.setItem(api.CONFIG.CHAVE_CACHE_CLASSIFICACAO, JSON.stringify(cru));
  checar('cache de outro dia é ignorado', api.lerCacheClassificacao() === null);

  // Lixo não pode virar fila.
  w.localStorage.setItem(api.CONFIG.CHAVE_CACHE_CLASSIFICACAO, '{não é json');
  checar('cache corrompido é ignorado sem estourar', api.lerCacheClassificacao() === null);

  // Formato antigo (sem campo que o pipeline usa) -> reclassificar é melhor
  // que montar fila silenciosamente errada.
  w.localStorage.setItem(api.CONFIG.CHAVE_CACHE_CLASSIFICACAO, JSON.stringify({
    dia: w.__smartTableUtil.dataIso(new Date()),
    geradoEm: Date.now(),
    resultados: [{ cliente: { cnpj: '1' } }],
  }));
  checar('cache em formato antigo é descartado', api.lerCacheClassificacao() === null);

  // Vazio também não serve.
  w.localStorage.setItem(api.CONFIG.CHAVE_CACHE_CLASSIFICACAO, JSON.stringify({
    dia: w.__smartTableUtil.dataIso(new Date()), geradoEm: Date.now(), resultados: [],
  }));
  checar('cache vazio é tratado como ausente', api.lerCacheClassificacao() === null);
}

// =====================================================================
// 3. EQUIVALÊNCIA — A ASSERÇÃO MAIS IMPORTANTE DO ARQUIVO
// =====================================================================
// Monta a fila pelos DOIS caminhos e compara cliente a cliente. Não o total:
// os itens, na ordem. Total igual com ordem trocada já aconteceu neste
// projeto, e a ordem É a saída da régua.
function equivalencia() {
  const w = abrir();
  const api = w.filaPrioridadeDebug;

  const frescos = [
    resultado(1, 9, 4),
    resultado(2, 3, 12),
    resultado(3, 10, 7),
    resultado(4, 3, 20),
  ];

  // Caminho FRESCO: finalizarFila direto com os resultados de classificação.
  api.finalizarFila(frescos, {}, null);
  const filaFresca = w.filaDebug.obterFila();
  checar('o caminho fresco monta uma fila', filaFresca !== null && filaFresca.clientes.length === 4);

  // Caminho do CACHE: grava, lê e monta a partir do que sobreviveu ao JSON.
  w.filaDebug.limparFila();
  api.gravarCacheClassificacao(frescos);
  const doCache = api.lerCacheClassificacao();
  api.finalizarFila(doCache.resultados, {}, null);
  const filaDoCache = w.filaDebug.obterFila();

  checar('o caminho do cache monta uma fila', filaDoCache !== null);
  checar(
    'MESMA quantidade de clientes',
    filaDoCache.clientes.length === filaFresca.clientes.length,
    `fresca=${filaFresca.clientes.length} cache=${filaDoCache.clientes.length}`
  );

  const chave = (c) => `${c.cnpj}|${c.prioridadeTier}|${c.diasAtraso}|${c.prioridadeNome}`;
  const fresca = filaFresca.clientes.map(chave);
  const cache = filaDoCache.clientes.map(chave);
  checar(
    'MESMOS clientes, na MESMA ordem, com a MESMA faixa e os MESMOS dias',
    fresca.join(' >> ') === cache.join(' >> '),
    `\n    fresca = ${fresca.join(' >> ')}\n    cache  = ${cache.join(' >> ')}`
  );

  // E a ordem tem que ser a da régua de verdade, não a de entrada.
  checar(
    'a fila sai ordenada pela faixa, não pela ordem de entrada',
    filaFresca.clientes[0].prioridadeTier <= filaFresca.clientes[1].prioridadeTier,
    filaFresca.clientes.map((c) => c.prioridadeTier).join(', ')
  );
}

// =====================================================================
// 4. O CONTRATO NO CÓDIGO
// =====================================================================
function contrato() {
  const fs = require('fs');
  const path = require('path');
  const m7 = fs.readFileSync(path.join(__dirname, '..', 'modulos', 'modulo7-fila-prioridade.js'), 'utf8');

  checar('o cache tem chave PRÓPRIA, separada da fila', /CHAVE_CACHE_CLASSIFICACAO:\s*'smarttable_classificacao_v1'/.test(m7));
  checar(
    'e NÃO reaproveita a chave da fila (gravar por cima destruiria a posição em que você parou)',
    !/CHAVE_CACHE_CLASSIFICACAO[^\n]*filaAtendimento/.test(m7)
  );
  checar('iniciar() consulta o cache antes de classificar', /lerCacheClassificacao\(\)/.test(m7));
  checar(
    'o cache é gravado ANTES de montar a fila (não perder as ~92 visitas)',
    m7.indexOf('gravarCacheClassificacao(resultados)') < m7.indexOf('finalizarFila(resultados, contadores, excluidos,')
  );
  checar(
    'só o caminho FRESCO pede pra registrar a atribuição no diário',
    (m7.match(/registrarAtribuicao: true/g) || []).length === 1
  );
  checar(
    'e o caminho do cache reaplica o filtro de já contatados hoje',
    /obterAtendidosHoje\(\)/.test(m7) && /aindaAbertos/.test(m7)
  );
  checar('Shift+Alt+U ignora o cache', /if \(!opcoes\?\.reconstruir\) \{\s*\n\s*const cache = lerCacheClassificacao\(\)/.test(m7));
  checar('há aquecimento sequencial antes de paralelizar', /while \(sucessos === 0 && !abortouPorPopup/.test(m7));
}

// =====================================================================
// 5. O CACHE NÃO REENTREGA QUEM JÁ FOI COBRADO HOJE
// =====================================================================
// DEFEITO REAL, achado em revisão depois de publicado. A fila se apaga
// sozinha ao terminar (limparFila, Módulo 3), então o dia normal era:
// classifica 92 -> atende os 92 -> a fila some -> Alt+U -> o cache
// reentregava os MESMOS 92, inclusive quem acabou de ser cobrado.
//
// O caminho FRESCO nunca teve isso: construirFilaAPartirDaPagina já exclui
// atendidosHoje. O do cache precisa reaplicar, porque o cache é um retrato de
// um momento em que quase ninguém tinha sido atendido.
async function cacheRespeitaAtendidosHoje() {
  const w = abrir();
  const api = w.filaPrioridadeDebug;

  const todos = [resultado(1, 3, 10), resultado(2, 9, 4), resultado(3, 10, 6)];
  api.gravarCacheClassificacao(todos);

  // Dois dos três já foram cobrados hoje.
  w.filaDebug.marcarComoAtendidoHoje('1');
  w.filaDebug.marcarComoAtendidoHoje('2');

  await api.iniciar();

  const fila = w.filaDebug.obterFila();
  checar('o caminho do cache ainda monta fila', fila !== null);
  checar(
    'mas SÓ com quem ainda não foi contatado hoje',
    fila.clientes.length === 1 && fila.clientes[0].cnpj === '3',
    fila.clientes.map((c) => c.cnpj).join(', ')
  );
}

async function cacheComTodosAtendidos() {
  const w = abrir();
  const api = w.filaPrioridadeDebug;

  const todos = [resultado(1, 3, 10), resultado(2, 9, 4)];
  api.gravarCacheClassificacao(todos);
  w.filaDebug.marcarComoAtendidoHoje('1');
  w.filaDebug.marcarComoAtendidoHoje('2');

  await api.iniciar();

  checar(
    'com todos já contatados, NÃO monta fila nenhuma (em vez de refazer a do início)',
    w.filaDebug.obterFila() === null
  );
}

// =====================================================================
// 6. UMA ATRIBUIÇÃO POR DIA NO DIÁRIO
// =====================================================================
// DEFEITO REAL, mesma revisão: registrarLote mora dentro de finalizarFila, e
// finalizarFila passou a ter DOIS chamadores. Remontar a fila do cache
// gravava uma segunda atribuição do mesmo dia para os mesmos clientes -- o
// mesmo defeito da v1.9.2, por um caminho novo.
//
// A análise sobreviveria (analisar() deduplica e mantém a primeira), mas
// atribuicoesRepetidas existe pra DENUNCIAR isso. Fazê-lo disparar todo dia é
// aposentar o alarme.
function umaAtribuicaoPorDia() {
  const w = abrir();
  const api = w.filaPrioridadeDebug;
  const d = w.__diario;

  const contarFila = () => {
    const cru = w.localStorage.getItem(d.CONFIG_DIARIO.PREFIXO_CHAVE + d.chaveDia());
    return cru ? JSON.parse(cru).filter((e) => e.t === 'fila').length : 0;
  };

  const resultados = [resultado(1, 3, 10), resultado(2, 9, 4)];

  checar('diário começa sem atribuição de fila', contarFila() === 0);

  // Caminho FRESCO: registra.
  api.finalizarFila(resultados, {}, null, { registrarAtribuicao: true });
  checar('o caminho fresco registra a atribuição do dia', contarFila() === 2, String(contarFila()));

  // Caminho do CACHE (mesmo dia, mesmos clientes): NÃO pode registrar de novo.
  api.finalizarFila(resultados, {}, null);
  checar(
    'remontar do cache NÃO grava uma segunda atribuição',
    contarFila() === 2,
    `${contarFila()} eventos 'fila' (esperado 2, um por cliente)`
  );

  // E o alarme do diário continua em zero -- que é o ponto.
  const analise = d.analisar();
  checar(
    'o contador atribuicoesRepetidas continua zerado',
    analise.atribuicoesRepetidas === 0,
    String(analise.atribuicoesRepetidas)
  );

  // O padrão é NÃO registrar: chamador novo tem que pedir.
  checar('sem pedir, não registra', (() => {
    const antes = contarFila();
    api.finalizarFila([resultado(9, 3, 5)], {}, null);
    return contarFila() === antes;
  })());
}

// =====================================================================
// EXECUÇÃO — sequencial, e isso não é estilo
// =====================================================================
// Os blocos eram IIFEs soltas, e os assíncronos terminavam DEPOIS dos
// síncronos. Duas consequências, as duas achadas na prática:
//
//   1. localStorage é identificador livre dentro do window.eval, então
//      resolve pro global do Node -- que aponta pra ÚLTIMA janela criada. Um
//      bloco síncrono criando janela no meio do await de outro fazia o
//      primeiro medir o localStorage do segundo. Foi assim que uma asserção
//      sobre a fila do cache leu a fila de outro teste.
//   2. resumo() rodava antes das asserções assíncronas chegarem: o arquivo
//      imprimia 25 de mais de 30. Contagem que não conta tudo é pior que
//      contagem nenhuma.
//
// Uma janela por vez, na ordem, e o resumo por último.
(async function main() {
    await pool();
  await cache();
  await equivalencia();
  await contrato();
  await cacheRespeitaAtendidosHoje();
  await cacheComTodosAtendidos();
  await umaAtribuicaoPorDia();
  resumo();
})();
