// Botão "Alerta" na página do cliente (Módulo 12).
//
// DUAS REGRAS, DELIBERADAMENTE ASSIMÉTRICAS (ver cabeçalho do módulo):
//   1. "Não cobrar" (checkbox + dias, padrão 1) suprime o cliente da fila
//      por prioridade (Módulo 7) enquanto o intervalo não expira.
//   2. Observação SEM "não cobrar" ativo dispara um aviso automático, um
//      pouco acima do centro da tela, toda vez que a página do cliente
//      abre. COM "não cobrar" ativo, o aviso NÃO aparece -- o cliente já
//      saiu da fila sozinho.
const { novaJanela } = require('./helpers/dom-env');
const { criarChecador } = require('./helpers/checar');

const { checar, resumo } = criarChecador('alerta-cliente');

const SPECS = [{ arquivo: 'modulo0-utilitarios-compartilhados.js' }, { arquivo: 'modulo12-alerta-cliente.js' }];
const CNPJ = '11111111/0001-11';
const URL_LISTA = 'https://texhub.texcotton.com.br/crm/clientes';
const MS_POR_DIA = 24 * 60 * 60 * 1000;

const abrirCliente = (cnpj = CNPJ) => novaJanela({ url: `https://texhub.texcotton.com.br/crm/clientes/grupo/1?cnpj=${encodeURIComponent(cnpj)}`, specs: SPECS });
const abrirLista = () => novaJanela({ url: URL_LISTA, specs: SPECS });

// =====================================================================
// 1. SÓ EXISTE NA PÁGINA DO CLIENTE
// =====================================================================
(function soNaPaginaDoCliente() {
  const wLista = abrirLista();
  checar('sem CNPJ na URL, o botão não é desenhado', wLista.document.getElementById(wLista.__alertaCliente.CONFIG_ALERTA.ID_BOTAO) === null);

  const wCliente = abrirCliente();
  checar('com CNPJ na URL, o botão aparece', wCliente.document.getElementById(wCliente.__alertaCliente.CONFIG_ALERTA.ID_BOTAO) !== null);
})();

// =====================================================================
// 2. ARMAZENAMENTO: salvar, ler, limpar
// =====================================================================
(function armazenamento() {
  const w = abrirCliente();
  const a = w.__alertaCliente;

  checar('cliente sem alerta: obterAlerta devolve null', a.obterAlerta(CNPJ) === null);

  const agora = Date.now();
  a.salvarAlerta(CNPJ, { naoCobrar: true, intervaloDias: 3, observacao: '  liga só à tarde  ' }, agora);
  const alerta = a.obterAlerta(CNPJ);
  checar('observação é salva com espaços cortados', alerta.observacao === 'liga só à tarde', alerta.observacao);
  checar('naoCobrarAte é agora + 3 dias', alerta.naoCobrarAte === agora + 3 * MS_POR_DIA, String(alerta.naoCobrarAte));

  // Intervalo padrão quando não informado.
  a.salvarAlerta('22222222/0001-22', { naoCobrar: true }, agora);
  const alertaPadrao = a.obterAlerta('22222222/0001-22');
  checar('sem intervalo informado, usa o padrão (1 dia)', alertaPadrao.naoCobrarAte === agora + MS_POR_DIA);

  // Intervalo inválido (0, negativo, não-número) cai no padrão -- nunca uma
  // supressão que já nasce expirada ou apontando pro passado.
  [0, -5, NaN, undefined].forEach((valor, i) => {
    const cnpjTeste = `3333333${i}/0001-33`;
    a.salvarAlerta(cnpjTeste, { naoCobrar: true, intervaloDias: valor }, agora);
    const registro = a.obterAlerta(cnpjTeste);
    checar(`intervaloDias=${valor} cai no padrão (1 dia), não vira supressão inválida`, registro.naoCobrarAte === agora + MS_POR_DIA, String(registro.naoCobrarAte));
  });

  // Confirmar sem checkbox e sem observação LIMPA o alerta -- é o mecanismo
  // de remover.
  a.salvarAlerta(CNPJ, { naoCobrar: false, observacao: '' }, agora);
  checar('checkbox desmarcado + observação vazia remove o alerta', a.obterAlerta(CNPJ) === null);

  // Observação sozinha, sem "não cobrar", é um alerta válido (naoCobrarAte
  // fica null).
  a.salvarAlerta(CNPJ, { naoCobrar: false, observacao: 'só um lembrete' }, agora);
  const soObservacao = a.obterAlerta(CNPJ);
  checar('observação sozinha é salva', soObservacao.observacao === 'só um lembrete');
  checar('e naoCobrarAte fica null (não suprime a fila)', soObservacao.naoCobrarAte === null);
})();

// =====================================================================
// 3. estaSuprimidoDaPrioridade -- a pergunta que o Módulo 7 faz
// =====================================================================
(function supressao() {
  const w = abrirCliente();
  const a = w.__alertaCliente;
  const agora = Date.now();

  checar('cliente sem alerta nenhum: nunca suprimido', a.estaSuprimidoDaPrioridade('99999999/0001-99', agora) === false);

  a.salvarAlerta(CNPJ, { naoCobrar: true, intervaloDias: 2 }, agora);
  checar('dentro do intervalo: suprimido', a.estaSuprimidoDaPrioridade(CNPJ, agora) === true);
  checar('um instante antes de expirar: ainda suprimido', a.estaSuprimidoDaPrioridade(CNPJ, agora + 2 * MS_POR_DIA - 1000) === true);
  checar('depois de expirar: não suprimido mais (sem ação manual)', a.estaSuprimidoDaPrioridade(CNPJ, agora + 2 * MS_POR_DIA + 1000) === false);

  a.salvarAlerta('44444444/0001-44', { naoCobrar: false, observacao: 'nota qualquer' }, agora);
  checar('observação sem "não cobrar": nunca suprime a fila', a.estaSuprimidoDaPrioridade('44444444/0001-44', agora) === false);
})();

// =====================================================================
// 4. O PAINEL: checkbox revela o campo de dias, confirmar salva
// =====================================================================
(function painel() {
  const w = abrirCliente();
  const a = w.__alertaCliente;

  checar('painel fechado ao carregar', a.estaAberto() === false);
  a.abrirPainel(CNPJ);
  checar('abrirPainel abre o painel', a.estaAberto() === true);

  const painelEl = w.document.getElementById(a.CONFIG_ALERTA.ID_PAINEL);
  const checkbox = painelEl.querySelector('input[type="checkbox"]');
  const inputDias = painelEl.querySelector('input[type="number"]');
  const textarea = painelEl.querySelector('textarea');
  const linhaDias = inputDias.closest('div');

  checar('checkbox começa desmarcado (sem alerta prévio)', checkbox.checked === false);
  checar('campo de dias começa escondido', linhaDias.style.display === 'none');

  checkbox.checked = true;
  checkbox.dispatchEvent(new w.Event('change', { bubbles: true }));
  checar('marcar o checkbox revela o campo de dias', linhaDias.style.display !== 'none');

  inputDias.value = '5';
  textarea.value = 'cliente pediu prazo';
  const botaoConfirmar = [...painelEl.querySelectorAll('button')].find((b) => b.textContent === 'Confirmar');
  botaoConfirmar.click();

  checar('confirmar fecha o painel', a.estaAberto() === false);
  const salvo = a.obterAlerta(CNPJ);
  checar('confirmar salva o checkbox como "não cobrar" ativo', salvo.naoCobrarAte !== null);
  checar('confirmar salva a observação digitada', salvo.observacao === 'cliente pediu prazo', salvo.observacao);
  checar('confirmar salva os 5 dias pedidos (~5 dias de janela)', Math.round((salvo.naoCobrarAte - Date.now()) / MS_POR_DIA) === 5);
})();

// =====================================================================
// 5. REABRIR O PAINEL PRÉ-PREENCHE O ESTADO ATUAL
// =====================================================================
(function preenchimento() {
  const w = abrirCliente();
  const a = w.__alertaCliente;
  const agora = Date.now();

  a.salvarAlerta(CNPJ, { naoCobrar: true, intervaloDias: 4, observacao: 'nota existente' }, agora);
  a.abrirPainel(CNPJ);

  const painelEl = w.document.getElementById(a.CONFIG_ALERTA.ID_PAINEL);
  const checkbox = painelEl.querySelector('input[type="checkbox"]');
  const textarea = painelEl.querySelector('textarea');

  checar('reabrir com "não cobrar" ativo vem com o checkbox marcado', checkbox.checked === true);
  checar('e a observação existente pré-preenchida', textarea.value === 'nota existente');
})();

// =====================================================================
// 6. O AVISO AUTOMÁTICO -- só quando NÃO há "não cobrar" ativo
// =====================================================================
// mostrarAvisoSeNecessario é chamada de dentro de aoCarregar -- a seção 6b
// confirma essa ligação no código-fonte. Aqui testamos a DECISÃO em si
// (mesmo padrão da seção "esc": chamar a função exportada direto, sem
// precisar recriar duas janelas com localStorage compartilhado entre elas
// só pra provar uma ligação de uma linha).
(function avisoAutomatico() {
  // Cenário A: observação sem "não cobrar" -- aviso aparece.
  const wA = abrirCliente();
  wA.__alertaCliente.salvarAlerta(CNPJ, { naoCobrar: false, observacao: 'atenção: cliente já reclamou de cobrança errada' });
  wA.__alertaCliente.mostrarAvisoSeNecessario(CNPJ);
  checar('observação sem "não cobrar": mostrarAvisoSeNecessario abre o aviso', wA.__alertaCliente.avisoEstaAberto() === true);
  const avisoEl = wA.document.getElementById(wA.__alertaCliente.CONFIG_ALERTA.ID_AVISO);
  checar('o texto da observação aparece no aviso', avisoEl.textContent.includes('cliente já reclamou'), avisoEl.textContent);
  checar('o aviso fica um pouco ACIMA do centro (top < 50%)', parseFloat(avisoEl.style.top) < 50, avisoEl.style.top);

  // Cenário B: "não cobrar" ativo -- SEM aviso, mesmo com observação
  // preenchida (a assimetria documentada no cabeçalho do módulo).
  const wB = abrirCliente();
  const CNPJ_B = '55555555/0001-55';
  wB.__alertaCliente.salvarAlerta(CNPJ_B, { naoCobrar: true, intervaloDias: 2, observacao: 'nota junto do não cobrar' });
  wB.__alertaCliente.mostrarAvisoSeNecessario(CNPJ_B);
  checar(
    '"não cobrar" ativo: aviso NÃO aparece, mesmo com observação (assimetria pedida)',
    wB.__alertaCliente.avisoEstaAberto() === false
  );

  // Cenário C: nada salvo -- nada aparece, e não lança exceção.
  const wC = abrirCliente();
  wC.__alertaCliente.mostrarAvisoSeNecessario('66666666/0001-66');
  checar('cliente sem alerta nenhum: sem aviso', wC.__alertaCliente.avisoEstaAberto() === false);

  // Cenário D: "não cobrar" já expirado -- o aviso volta a valer, sem
  // nenhuma ação manual (mesma lógica de estaSuprimidoDaPrioridade).
  const wD = abrirCliente();
  const CNPJ_D = '77777777/0001-77';
  const passado = Date.now() - 10 * MS_POR_DIA;
  wD.__alertaCliente.salvarAlerta(CNPJ_D, { naoCobrar: true, intervaloDias: 1, observacao: 'nota antiga' }, passado);
  wD.__alertaCliente.mostrarAvisoSeNecessario(CNPJ_D);
  checar(
    '"não cobrar" já expirado: o aviso da observação volta a aparecer',
    wD.__alertaCliente.avisoEstaAberto() === true
  );
})();

// =====================================================================
// 6b. A LIGAÇÃO COM O CARREGAMENTO DA PÁGINA EXISTE DE VERDADE
// =====================================================================
// Sem isto, mostrarAvisoSeNecessario poderia estar perfeita e nunca ser
// chamada de verdade quando a página abre -- a seção 6 testaria uma função
// morta.
(function ligacaoComOCarregamento() {
  const fs = require('fs');
  const path = require('path');
  const texto = fs.readFileSync(path.join(__dirname, '..', 'modulos', 'modulo12-alerta-cliente.js'), 'utf8');
  const corpoAoCarregar = texto.match(/function aoCarregar\(\) \{([\s\S]*?)\n  \}/)?.[1] || '';
  checar('aoCarregar chama mostrarAvisoSeNecessario', /mostrarAvisoSeNecessario\(cnpj\)/.test(corpoAoCarregar));
})();

// =====================================================================
// 7. ESC FECHA O QUE ESTIVER ABERTO (painel OU aviso, igual ao resto do projeto)
// =====================================================================
(function esc() {
  const w = abrirCliente();
  const a = w.__alertaCliente;

  a.abrirPainel(CNPJ);
  checar('painel aberto antes do Esc', a.estaAberto() === true);
  w.document.dispatchEvent(new w.KeyboardEvent('keydown', { code: 'Escape', bubbles: true }));
  checar('Esc fecha o painel', a.estaAberto() === false);

  w.__alertaCliente.salvarAlerta(CNPJ, { naoCobrar: false, observacao: 'nota' });
  w.__alertaCliente.mostrarAvisoSeNecessario(CNPJ);
  checar('aviso aberto antes do Esc', a.avisoEstaAberto() === true);
  w.document.dispatchEvent(new w.KeyboardEvent('keydown', { code: 'Escape', bubbles: true }));
  checar('Esc fecha o aviso', a.avisoEstaAberto() === false);
})();

// =====================================================================
// 8. O BOTÃO ALTERNA O PAINEL (clique abre, clique de novo fecha)
// =====================================================================
(function botao() {
  const w = abrirCliente();
  const a = w.__alertaCliente;
  const botaoEl = w.document.getElementById(a.CONFIG_ALERTA.ID_BOTAO);

  botaoEl.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  checar('clique no botão abre o painel', a.estaAberto() === true);
  botaoEl.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  checar('clique de novo fecha o painel', a.estaAberto() === false);
})();

resumo();
