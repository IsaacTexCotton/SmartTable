// Testes da ordenação da fila com grupo de controle (Módulo 7).
//
// BUG REAL, achado conferindo uma fila de VERDADE (92 clientes, 17/09/2026):
// a chave do controle era sorteada no espaço das FAIXAS (`1 + sorteio * 9`,
// resultando em [1, 10)). Como a faixa 10 vale exatamente 10, nenhum cliente
// do controle conseguia ser ordenado depois de um faixa 10 -- e a faixa 10
// era 27% daquela fila. Resultado: 25 dos 92 lugares eram inalcançáveis, e o
// controle caía no terço final só 12% das vezes em vez de 33%.
//
// Isso não é detalhe: o grupo de controle existe pra medir o efeito de ser
// chamado CEDO ou TARDE. Se ele quase nunca é chamado tarde, a comparação
// mede menos do que deveria -- e enviesada a favor da régua.
const { novaJanela } = require('./helpers/dom-env');
const { criarChecador } = require('./helpers/checar');

const { checar, resumo } = criarChecador('grupo-controle-ordem');

const w = novaJanela({
  url: 'https://texhub.texcotton.com.br/crm/clientes',
  specs: [
    { arquivo: 'modulo0-utilitarios-compartilhados.js' },
    { arquivo: 'modulo8-diario.js' },
    { arquivo: 'modulo3-fila-atendimento.js' },
    { arquivo: 'modulo7-fila-prioridade.js' },
  ],
});

const { ordenarComGrupoControle } = w.filaPrioridadeDebug;
const diario = w.__diario;

// Distribuição REAL de faixas observada na fila de 17/09/2026 -- é a forma
// que expôs o bug, então é a forma com que o teste protege.
const DISTRIBUICAO_REAL = { 1: 16, 2: 8, 3: 1, 4: 2, 5: 7, 6: 13, 7: 2, 8: 0, 9: 18, 10: 25 };

function montarCandidatos(rodada) {
  const lista = [];
  let i = 0;
  Object.entries(DISTRIBUICAO_REAL).forEach(([faixa, quantos]) => {
    for (let j = 0; j < quantos; j += 1) {
      lista.push({
        cliente: { cnpj: `${rodada}-${i++}`, label: 'CLIENTE FICTICIO' },
        prioridade: Number(faixa),
        escolhido: { diasAtrasoReal: 5, situacaoKey: 'EM_ATRASO' },
      });
    }
  });
  return lista;
}

// =====================================================================
// A régua continua valendo pra quem NÃO é controle
// =====================================================================
(function () {
  const fila = ordenarComGrupoControle(montarCandidatos(1), diario, 20260917);
  const regua = fila.filter((r) => !r.controle);

  let quebras = 0;
  for (let i = 1; i < regua.length; i += 1) {
    if (regua[i].prioridade < regua[i - 1].prioridade) quebras += 1;
  }
  checar('entre os NÃO-controle, a ordem de faixa nunca quebra', quebras === 0, `${quebras} quebra(s)`);
})();

(function () {
  const lista = [
    { cliente: { cnpj: 'A' }, prioridade: 5, escolhido: { diasAtrasoReal: 3 } },
    { cliente: { cnpj: 'B' }, prioridade: 5, escolhido: { diasAtrasoReal: 9 } },
    { cliente: { cnpj: 'C' }, prioridade: 5, escolhido: { diasAtrasoReal: 6 } },
  ];
  // Sem diário, é régua pura -- dá pra conferir o desempate isolado.
  const fila = ordenarComGrupoControle(lista, null, null);
  checar('dentro da mesma faixa, mais dias de atraso vem primeiro', fila.map((r) => r.escolhido.diasAtrasoReal).join() === '9,6,3', fila.map((r) => r.escolhido.diasAtrasoReal).join());
})();

(function () {
  const fila = ordenarComGrupoControle(montarCandidatos(2), null, null);
  checar('sem o Módulo 8 carregado, ninguém entra no controle', fila.every((r) => r.controle === false));
  checar('sem o Módulo 8, a fila é a régua pura', fila[0].prioridade === 1 && fila[fila.length - 1].prioridade === 10);
})();

// =====================================================================
// REGRESSÃO: o controle tem que alcançar a fila INTEIRA
// =====================================================================
(function () {
  const RODADAS = 300;
  let totalControle = 0;
  let totalCandidatos = 0;
  const tercos = [0, 0, 0];
  let alcancouUltimoDecimo = 0;

  for (let r = 0; r < RODADAS; r += 1) {
    const fila = ordenarComGrupoControle(montarCandidatos(r), diario, 20260917 + r);
    totalCandidatos += fila.length;
    fila.forEach((item, indice) => {
      if (!item.controle) return;
      totalControle += 1;
      const posicao = indice + 1;
      if (posicao <= fila.length / 3) tercos[0] += 1;
      else if (posicao <= (fila.length * 2) / 3) tercos[1] += 1;
      else tercos[2] += 1;
      if (posicao > fila.length * 0.9) alcancouUltimoDecimo += 1;
    });
  }

  const pct = (n) => (n / totalControle) * 100;
  checar(
    'a proporção do controle fica perto de 1 em 5',
    totalControle / totalCandidatos > 0.17 && totalControle / totalCandidatos < 0.23,
    `${((totalControle / totalCandidatos) * 100).toFixed(1)}%`
  );

  // O coração do teste: espalhamento uniforme pelas POSIÇÕES.
  checar(
    'REGRESSÃO: o controle se espalha pelos três terços da fila (~33% cada)',
    pct(tercos[2]) > 28 && pct(tercos[2]) < 38,
    `terços: ${pct(tercos[0]).toFixed(0)}% / ${pct(tercos[1]).toFixed(0)}% / ${pct(tercos[2]).toFixed(0)}%`
  );
  checar(
    'REGRESSÃO: o controle alcança até o último décimo da fila',
    pct(alcancouUltimoDecimo) > 6,
    `${pct(alcancouUltimoDecimo).toFixed(1)}% no último décimo (esperado ~10%)`
  );
})();

(function () {
  // Determinismo: rodar o Alt+U duas vezes no mesmo dia não pode remexer a
  // fila, senão o cliente troca de posição no meio do experimento.
  const a = ordenarComGrupoControle(montarCandidatos(7), diario, 20260917).map((r) => r.cliente.cnpj).join();
  const b = ordenarComGrupoControle(montarCandidatos(7), diario, 20260917).map((r) => r.cliente.cnpj).join();
  checar('a mesma fila no mesmo dia sai na mesma ordem', a === b);

  const c = ordenarComGrupoControle(montarCandidatos(7), diario, 20260918).map((r) => r.cliente.cnpj).join();
  checar('em outro dia a ordem muda (o sorteio é por dia)', a !== c);
})();

(function () {
  // Bordas: listas degeneradas não podem quebrar nem produzir NaN de rank.
  checar('lista vazia devolve lista vazia', ordenarComGrupoControle([], diario, 20260917).length === 0);

  const um = ordenarComGrupoControle([{ cliente: { cnpj: 'X' }, prioridade: 4, escolhido: { diasAtrasoReal: 3 } }], diario, 20260917);
  checar('lista com um único cliente devolve ele mesmo', um.length === 1 && um[0].cliente.cnpj === 'X');
  checar('e o rank dele é um número válido', Number.isFinite(um[0].rank), String(um[0].rank));
})();

resumo();
