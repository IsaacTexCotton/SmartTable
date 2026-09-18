// Alt+U continua a fila de hoje; Shift+Alt+U refaz do zero.
//
// O QUE MUDOU E POR QUÊ: iniciar() (Módulo 7) SEMPRE reconstruía. Não era
// decisão -- era ausência: a fila já ficava salva o dia inteiro (o Módulo 3
// só descarta no dia seguinte), mas nada nunca olhava pra ela. Reconstruir
// custa abrir ~140 abas de fundo, com até 8s de espera cada, E sobrescreve a
// fila em andamento junto com a posição onde a pessoa parou. Apertar Alt+U às
// 14h só pra voltar pra fila pagava tudo isso.
//
// O RISCO QUE ESTE ARQUIVO GUARDA, e que o usuário apontou: Módulo 3 (Alt+I)
// e Módulo 7 (Alt+U) gravam na MESMA chave do localStorage. Sem distinguir,
// o Alt+U "retomaria" uma fila do Alt+I e a chamaria de fila por prioridade
// -- os clientes existiriam, a ordem não seria a da régua, e nada na tela
// diria isso. O discriminador é o prioridadeTier.
const { novaJanela } = require('./helpers/dom-env');
const { criarChecador } = require('./helpers/checar');

const { checar, resumo } = criarChecador('fila-continuar');

const URL_LISTA = 'https://texhub.texcotton.com.br/crm/clientes';
const SPECS = [
  { arquivo: 'modulo0-utilitarios-compartilhados.js' },
  { arquivo: 'modulo3-fila-atendimento.js' },
  { arquivo: 'modulo7-fila-prioridade.js' },
];

function abrir(url) {
  return novaJanela({ url: url || URL_LISTA, specs: SPECS });
}

/**
 * Grava uma fila direto no localStorage, no formato que o Módulo 3 valida.
 *
 * @param {object} w
 * @param {{comPrioridade: boolean, total?: number, indiceAtual?: number, quando?: number}} opcoes
 */
function gravarFila(w, { comPrioridade, total = 3, indiceAtual = 0, quando = Date.now() }) {
  const clientes = Array.from({ length: total }, (_, i) => ({
    url: `https://texhub.texcotton.com.br/crm/clientes/grupo/1?cnpj=0000000${i}%2F0001-00`,
    cnpj: `0000000${i}/0001-00`,
    nome: `Cliente ${i}`,
    ...(comPrioridade ? { prioridadeTier: 3, prioridadeNome: 'Atraso inicial' } : {}),
  }));
  w.localStorage.setItem(
    w.filaDebug.CONFIG.CHAVE_STORAGE,
    JSON.stringify({ versao: w.filaDebug.CONFIG.VERSAO_SCHEMA, clientes, indiceAtual, iniciadoEm: quando })
  );
  return clientes;
}

// =====================================================================
// 1. O DISCRIMINADOR ENTRE AS DUAS FILAS
// =====================================================================
(function discriminador() {
  const w = abrir();
  const api = w.filaPrioridadeDebug;

  gravarFila(w, { comPrioridade: true });
  checar('fila com prioridadeTier é reconhecida como fila por prioridade', api.ehFilaDePrioridade(w.filaDebug.obterFila()) === true);

  gravarFila(w, { comPrioridade: false });
  checar(
    'fila do Alt+I (sem prioridadeTier) NÃO é reconhecida como fila por prioridade',
    api.ehFilaDePrioridade(w.filaDebug.obterFila()) === false
  );

  checar('nulo não estoura', api.ehFilaDePrioridade(null) === false);
  checar('objeto sem clientes não estoura', api.ehFilaDePrioridade({}) === false);
})();

// =====================================================================
// 2. QUANDO RETOMA
// =====================================================================
(function quandoRetoma() {
  const w = abrir();
  const api = w.filaPrioridadeDebug;

  const clientes = gravarFila(w, { comPrioridade: true, total: 5, indiceAtual: 2 });
  const alvo = api.alvoDeRetomada();

  checar('há o que retomar numa fila por prioridade de hoje', alvo !== null);
  checar('o alvo é o cliente onde você parou, não o seguinte', alvo.url === clientes[2].url, String(alvo?.url));
  checar('e conta quantos faltam, não quantos existem', alvo.restantes === 3 && alvo.total === 5, `${alvo.restantes}/${alvo.total}`);
  checar('retomarFilaDeHoje() confirma que assumiu', api.retomarFilaDeHoje() === true);

  // ARMADILHA DO JSDOM, já paga neste projeto: `location` como identificador
  // livre dentro do window.eval resolve pro global do Node, que aponta pra
  // ÚLTIMA janela criada. Esta asserção precisa rodar enquanto `w` ainda é a
  // janela mais recente -- movida pra cá depois de falhar lá embaixo, onde
  // uma janela criada depois fazia o módulo medir a URL errada.
  checar('numa página fora da fila, jaEstouNele é falso', alvo.jaEstouNele === false);
})();

(function naoRetoma() {
  // Fila do Alt+I: o Alt+U não pode se apropriar dela.
  const w1 = abrir();
  gravarFila(w1, { comPrioridade: false, total: 5, indiceAtual: 1 });
  checar('NÃO retoma uma fila do Alt+I', w1.filaPrioridadeDebug.alvoDeRetomada() === null && w1.filaPrioridadeDebug.retomarFilaDeHoje() === false);

  // Fila de ontem: obterFila() já devolve null, e o Módulo 3 a descarta.
  const w2 = abrir();
  const ontem = Date.now() - 24 * 60 * 60 * 1000;
  gravarFila(w2, { comPrioridade: true, quando: ontem });
  checar('NÃO retoma fila de outro dia', w2.filaPrioridadeDebug.alvoDeRetomada() === null);

  // Fila terminada: retomar levaria pra lugar nenhum; reconstruir é o certo.
  const w3 = abrir();
  gravarFila(w3, { comPrioridade: true, total: 3, indiceAtual: 3 });
  checar('NÃO retoma fila já terminada', w3.filaPrioridadeDebug.alvoDeRetomada() === null);

  // Sem fila nenhuma.
  const w4 = abrir();
  checar('sem fila salva, não retoma', w4.filaPrioridadeDebug.alvoDeRetomada() === null && w4.filaPrioridadeDebug.retomarFilaDeHoje() === false);
})();

// =====================================================================
// 3. JÁ ESTANDO NO CLIENTE ONDE PAROU, NÃO RECARREGA
// =====================================================================
// Navegar seria um reload que apaga o que estiver na tela -- inclusive uma
// observação digitada pela metade.
(function jaEstouNele() {
  const w = abrir();
  const clientes = gravarFila(w, { comPrioridade: true, total: 4, indiceAtual: 1 });

  const janelaNoCliente = novaJanela({ url: clientes[1].url, specs: SPECS });
  janelaNoCliente.localStorage.setItem(
    janelaNoCliente.filaDebug.CONFIG.CHAVE_STORAGE,
    w.localStorage.getItem(w.filaDebug.CONFIG.CHAVE_STORAGE)
  );

  const alvo = janelaNoCliente.filaPrioridadeDebug.alvoDeRetomada();
  checar('há o que retomar', alvo !== null);
  checar('e o módulo sabe que você JÁ está nesse cliente', alvo.jaEstouNele === true);
  checar('retomar assume mesmo assim (sem recarregar)', janelaNoCliente.filaPrioridadeDebug.retomarFilaDeHoje() === true);
})();

// =====================================================================
// 4. O CONTRATO DO ATALHO
// =====================================================================
(function contratoDoAtalho() {
  const fs = require('fs');
  const path = require('path');
  const m4 = fs.readFileSync(path.join(__dirname, '..', 'modulos', 'modulo4-atalhos-teclado.js'), 'utf8');
  const m7 = fs.readFileSync(path.join(__dirname, '..', 'modulos', 'modulo7-fila-prioridade.js'), 'utf8');

  checar('Shift+Alt+U existe e pede reconstrução explícita', /acionarFilaPorPrioridade\(\{ reconstruir: true \}\)/.test(m4));
  checar(
    'a exceção do Shift vem ANTES da guarda que barra Shift',
    m4.indexOf('e.altKey && e.shiftKey') < m4.indexOf('if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;')
  );
  checar('e ela é a ÚNICA com Shift (Shift continua barrado pro resto)', (m4.match(/e\.shiftKey &&/g) || []).length === 1);
  checar('a ajuda do Alt+H documenta as duas', /tecla: 'Alt\+U'/.test(m4) && /tecla: 'Shift\+Alt\+U'/.test(m4));

  checar('iniciar() tenta retomar antes de reconstruir', /if \(!opcoes\?\.reconstruir && retomarFilaDeHoje\(\)\) return;/.test(m7));

  // O filtro de "já contatado hoje" NÃO é duplicado aqui: ele vem do
  // construirFilaAPartirDaPagina() do Módulo 3, que já pula atendidosHoje.
  // Duplicar seria manter duas regras que podem divergir em silêncio.
  const m3 = fs.readFileSync(path.join(__dirname, '..', 'modulos', 'modulo3-fila-atendimento.js'), 'utf8');
  checar('o Módulo 3 é quem exclui quem já foi contatado hoje', /atendidosHoje\.has\(cnpj\)/.test(m3));
  // O que esta asserção protege é NÃO DUPLICAR A REGRA -- duas cópias do
  // mesmo filtro divergem em silêncio. Ela NÃO proíbe o Módulo 7 de aplicar
  // o filtro; proíbe de reimplementá-lo.
  //
  // A distinção passou a importar na v1.18.1: o caminho do cache precisa
  // reaplicar o filtro (o cache é um retrato da manhã, quando quase ninguém
  // tinha sido atendido), e faz isso CHAMANDO obterAtendidosHoje do Módulo 3.
  // A versão anterior desta asserção proibia a simples menção da função, e
  // reprovou o conserto de um defeito real. Mirava no mecanismo, não na regra.
  checar(
    'o Módulo 7 não lê a chave de atendidos direto (isso é do Módulo 3)',
    !/CHAVE_ATENDIDOS_HOJE|filaAtendidosHoje/.test(m7)
  );
  checar(
    'quando ele filtra, é chamando a função do Módulo 3',
    !/obterAtendidosHoje/.test(m7) || /filaDebug\.obterAtendidosHoje\(\)/.test(m7)
  );
  checar('o Módulo 7 monta a base a partir do Módulo 3', /filaDebug\.construirFilaAPartirDaPagina\(\)/.test(m7));
})();

resumo();
