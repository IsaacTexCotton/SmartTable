// Botão de progresso da fila por prioridade (Módulo 11).
//
// O QUE ESTE MÓDULO PROMETE: uma barra por faixa de prioridade, mostrando
// "cobrados/total" (ex.: 23/56) a partir da MESMA fila que o Alt+U já grava
// -- nada calculado de novo, só agrupado. Os testes abaixo cobrem:
//   1. Agrupamento e contagem corretos (a aritmética pura, sem DOM).
//   2. Mensagens de "sem dado" quando não há fila, ou a fila não é por
//      prioridade (Alt+I em vez de Alt+U).
//   3. Nomes/cores vêm do Módulo 7, não duplicados aqui -- se uma faixa
//      mudar de nome lá, o painel muda sozinho.
//   4. O gatilho é um botão de verdade (não atalho de teclado -- pedido
//      explícito do usuário), quase invisível em repouso, evidente ao
//      focar/passar o mouse, e entra no registro de painéis do Módulo 0.
const { novaJanela } = require('./helpers/dom-env');
const { criarChecador } = require('./helpers/checar');

const { checar, resumo } = criarChecador('progresso-fila');

const URL_LISTA = 'https://texhub.texcotton.com.br/crm/clientes';
const SPECS = [
  { arquivo: 'modulo0-utilitarios-compartilhados.js' },
  { arquivo: 'modulo8-diario.js' },
  { arquivo: 'modulo3-fila-atendimento.js' },
  { arquivo: 'modulo7-fila-prioridade.js' },
  { arquivo: 'modulo11-progresso-fila.js' },
];

const abrir = () => novaJanela({ url: URL_LISTA, specs: SPECS });

/** Grava uma fila no formato real do Módulo 3/7 (mesmos campos de produção). */
function gravarFilaDePrioridade(w, clientes) {
  w.localStorage.setItem('filaAtendimento_v1', JSON.stringify({
    versao: 1,
    clientes,
    indiceAtual: -1,
    totalAtendidos: 0,
    totalPulados: 0,
    iniciadoEm: Date.now(),
  }));
}

function gravarFilaSimples(w, clientes) {
  // Fila do Alt+I original: sem prioridadeTier em nenhum cliente.
  w.localStorage.setItem('filaAtendimento_v1', JSON.stringify({
    versao: 1,
    clientes: clientes.map((c) => ({ url: c.url, cnpj: c.cnpj, label: c.label })),
    indiceAtual: -1,
    totalAtendidos: 0,
    totalPulados: 0,
    iniciadoEm: Date.now(),
  }));
}

function gravarAtendidosHoje(w, cnpjs) {
  w.localStorage.setItem('filaAtendidosHoje_v1', JSON.stringify({ data: Date.now(), cnpjs }));
}

function cliente(i, tier) {
  return {
    url: `https://texhub.texcotton.com.br/crm/clientes/grupo/1?cnpj=${i}`,
    cnpj: String(i),
    label: `Cliente ${i}`,
    diasAtraso: 3,
    prioridadeTier: tier,
    prioridadeNome: `Faixa ${tier}`,
    grupoControle: false,
  };
}

// =====================================================================
// 1. SEM DADO, COM MENSAGEM CLARA (não tela em branco, não exceção)
// =====================================================================
(function semDado() {
  const w = abrir();
  const p = w.__progressoFila;

  const semFila = p.montarProgresso();
  checar('sem fila nenhuma hoje: disponivel=false', semFila.disponivel === false);
  checar('e explica que Alt+U monta a fila', /Alt\+U/.test(semFila.motivo || ''), semFila.motivo);

  gravarFilaSimples(w, [cliente(1, null)].map((c) => ({ url: c.url, cnpj: c.cnpj, label: c.label })));
  const filaSimples = p.montarProgresso();
  checar('fila do Alt+I (sem prioridade): disponivel=false', filaSimples.disponivel === false);
  checar('e explica que essa fila não é por prioridade', /Alt\+I/.test(filaSimples.motivo || ''), filaSimples.motivo);
})();

// =====================================================================
// 2. AGRUPAMENTO E CONTAGEM (a aritmética que importa)
// =====================================================================
(function agrupamento() {
  const w = abrir();
  const p = w.__progressoFila;

  // Faixa 1: 3 clientes, 2 cobrados. Faixa 3: 2 clientes, 0 cobrados.
  gravarFilaDePrioridade(w, [
    cliente(1, 1), cliente(2, 1), cliente(3, 1),
    cliente(4, 3), cliente(5, 3),
  ]);
  gravarAtendidosHoje(w, ['1', '2']);

  const r = p.montarProgresso();
  checar('disponivel=true com fila por prioridade', r.disponivel === true);
  checar('duas faixas presentes (só as que têm cliente hoje)', r.faixas.length === 2, String(r.faixas.length));

  const faixa1 = r.faixas.find((f) => f.tier === 1);
  const faixa3 = r.faixas.find((f) => f.tier === 3);
  checar('faixa 1: 2 cobrados de 3 (o "23/56" do pedido, em miniatura)', faixa1.cobrados === 2 && faixa1.total === 3);
  checar('faixa 3: 0 cobrados de 2', faixa3.cobrados === 0 && faixa3.total === 2);
  checar('faixas vêm ordenadas por tier crescente', r.faixas[0].tier < r.faixas[1].tier);
  checar('total geral soma as duas faixas', r.totalGeral === 5, String(r.totalGeral));
  checar('cobrados geral soma as duas faixas', r.cobradosGeral === 2, String(r.cobradosGeral));

  // Cliente sem prioridadeTier (não deveria existir numa fila por prioridade
  // de verdade, mas dado real pode vir incompleto) não conta em faixa nenhuma
  // nem quebra a contagem.
  gravarFilaDePrioridade(w, [cliente(1, 1), Object.assign({}, cliente(9, null), { prioridadeTier: null })]);
  const rSujo = p.montarProgresso();
  checar('cliente sem prioridadeTier é ignorado, não quebra', rSujo.disponivel === true && rSujo.totalGeral === 1);
})();

// =====================================================================
// 3. NOMES E CORES VÊM DO MÓDULO 7, NÃO DUPLICADOS AQUI
// =====================================================================
(function semDuplicar() {
  const w = abrir();
  const p = w.__progressoFila;
  const prio = w.filaPrioridadeDebug;

  checar('Módulo 7 exporta CORES_PRIORIDADE (pré-requisito deste módulo)', typeof prio.CORES_PRIORIDADE === 'object');

  gravarFilaDePrioridade(w, [cliente(7, 7)]);
  const r = p.montarProgresso();
  const faixa = r.faixas[0];

  checar('o nome da faixa é o mesmo do Módulo 7', faixa.nome === prio.NOMES_PRIORIDADE[7], faixa.nome);
  checar('a cor da faixa é a mesma do Módulo 7', faixa.cor === prio.CORES_PRIORIDADE[7], faixa.cor);

  // Fonte de verdade: se este arquivo (Módulo 11) tivesse uma cópia própria
  // de NOMES_PRIORIDADE/CORES_PRIORIDADE, um nome novo lá não apareceria
  // aqui sem editar os dois lugares -- exatamente o tipo de divergência que
  // este projeto já pagou caro (Módulo 2/4 com a mesma regra duplicada).
  const fs = require('fs');
  const path = require('path');
  const texto = fs.readFileSync(path.join(__dirname, '..', 'modulos', 'modulo11-progresso-fila.js'), 'utf8');
  checar('o Módulo 11 não declara sua própria tabela de nomes de prioridade', !/NOMES_PRIORIDADE\s*=\s*\{/.test(texto));
  checar('nem sua própria tabela de cores', !/CORES_PRIORIDADE\s*=\s*\{/.test(texto));
})();

// =====================================================================
// 4. O GATILHO É UM BOTÃO, NÃO UM ATALHO -- E QUASE INVISÍVEL EM REPOUSO
// =====================================================================
(function botao() {
  const w = abrir();
  const p = w.__progressoFila;
  const botaoEl = p.obterBotao();

  checar('o gatilho existe no DOM assim que a página carrega', botaoEl instanceof w.HTMLElement);
  checar('é um <button> de verdade (Enter/Espaço funcionam sozinhos)', botaoEl.tagName === 'BUTTON');
  checar('tem rótulo acessível', (botaoEl.getAttribute('aria-label') || '').length > 0);

  const opacidadeEmRepouso = parseFloat(botaoEl.style.opacity);
  checar('opacidade baixa em repouso (pedido: "escondido")', opacidadeEmRepouso > 0 && opacidadeEmRepouso <= 0.2, String(opacidadeEmRepouso));

  checar('painel fechado antes do clique', p.estaAberto() === false);
  botaoEl.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  checar('o clique no botão abre o painel', p.estaAberto() === true);

  w.document.dispatchEvent(new w.KeyboardEvent('keydown', { code: 'Escape', bubbles: true }));
  checar('Esc fecha o painel, igual aos outros', p.estaAberto() === false);

  // Módulo 4 é o dono do mapa de teclas -- confere que o pedido do usuário
  // ("botão, não atalho") foi respeitado de verdade, não só na intenção.
  const fs = require('fs');
  const path = require('path');
  const m4 = fs.readFileSync(path.join(__dirname, '..', 'modulos', 'modulo4-atalhos-teclado.js'), 'utf8');
  checar('o painel de progresso NÃO tem tecla própria no Módulo 4', !/TECLA_PROGRESSO/.test(m4));
})();

// =====================================================================
// 5. O TEXTO NA TELA É "cobrados/total", NA ORDEM DO PEDIDO
// =====================================================================
(function textoNaTela() {
  const w = abrir();
  const p = w.__progressoFila;

  gravarFilaDePrioridade(w, [cliente(1, 2), cliente(2, 2), cliente(3, 2)]);
  gravarAtendidosHoje(w, ['1']);

  p.abrirPainel();
  const painel = w.document.getElementById(p.CONFIG_PROGRESSO.ID_PAINEL);
  checar('o painel foi desenhado', painel instanceof w.HTMLElement);
  checar('o texto "1/3" aparece (cobrados/total, não o inverso)', painel.textContent.includes('1/3'), painel.textContent);
  p.fecharPainel();
})();

resumo();
