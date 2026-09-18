// Testes do Módulo 5 — DETECÇÃO de grupo econômico com título vencido.
//
// O banner que este módulo desenhava saiu na v1.14.0: o próprio CRM passou a
// avisar ("1 CNPJ do grupo vencido", na página do cliente, ao lado do
// grupo). Com ele foram embora ~220 linhas de posicionamento -- z-index,
// acompanhar a barra de navegação rápida, ResizeObserver -- que sozinhas
// causaram três bugs. Os testes daquela parte foram embora junto, e
// tests/banner-posicao.test.js deixou de existir.
//
// O QUE SOBROU É O QUE IMPORTA MAIS, e passou a ser a razão de o módulo
// existir. window.__alertaGrupo.empresasComVencido alimenta:
//
//   - Módulo 4, Alt+G                     -> abre as outras razões com vencido.
//   - Módulo 4, temOutraRazaoComVencido() -> muda a frase do relatório na
//     MENSAGEM QUE O CLIENTE RECEBE.
//   - Módulo 7, fila por prioridade       -> só a razão mais urgente do
//     grupo entra na fila. Sem isso, o mesmo grupo econômico é cobrado em
//     duplicidade -- e em silêncio.
//   - Módulo 8, conferir().
//
// Nada disso tem aviso na tela quando quebra. Por isso a detecção é testada
// contra a estrutura REAL da tabela, conferida ao vivo em 18/09/2026:
// colunas [CNPJ, Razão Social, Cidade/UF, Vencido, A Vencer, Ações], com a
// linha do cliente atual marcada por bg-yellow-50.
const { novaJanela } = require('./helpers/dom-env');
const { criarChecador } = require('./helpers/checar');

const { checar, resumo } = criarChecador('alerta-grupo');

const SPECS = [{ arquivo: 'modulo0-utilitarios-compartilhados.js' }, { arquivo: 'modulo5-alerta-grupo.js' }];

/**
 * Monta a página do cliente com a tabela de grupo na estrutura real.
 *
 * @param {{cnpj: string, razao: string, vencido: string, atual?: boolean}[]} linhas
 */
function paginaComGrupo(linhas) {
  const corpo = linhas
    .map(
      (l) => `
      <tr class="${l.atual ? 'bg-yellow-50' : ''}">
        <td>${l.cnpj}</td>
        <td><span>${l.razao}</span></td>
        <td>SÃO PAULO/SP</td>
        <td>${l.vencido}</td>
        <td>R$ 10.000,00</td>
        <td>Ver detalhes</td>
      </tr>`
    )
    .join('');

  // Duas coisas da página real que o teste PRECISA reproduzir, senão ele
  // mede outra coisa:
  //
  //   1. O badge em #tab-grupo com a quantidade de empresas. iniciar() usa
  //      ele pra pular a etapa inteira quando o grupo tem só o próprio
  //      cliente -- sem o badge, a detecção nem chega a rodar. Foi
  //      exatamente o que aconteceu na primeira versão deste arquivo: todas
  //      as asserções de conteúdo davam lista vazia, e o teste "passava"
  //      pelo motivo errado nas que esperavam vazio.
  //   2. O aninhamento <h3> -> div.mb-4 -> container -> table, porque
  //      encontrarTabelaDoGrupo() sobe do título pro div pai e procura a
  //      tabela no container comum. Achatar isto faria o teste passar
  //      contra um DOM que não é o do CRM.
  return `
    <button id="tab-grupo" class="tab-btn">Grupo <span class="rounded-full">${linhas.length}</span></button>
    <div>
      <div class="mb-4"><h3>Clientes do grupo</h3></div>
      <div class="overflow-x-auto">
        <table>
          <thead><tr>
            <th>CNPJ</th><th>Razão Social</th><th>Cidade/UF</th>
            <th>Vencido</th><th>A Vencer</th><th>Ações</th>
          </tr></thead>
          <tbody>${corpo}</tbody>
        </table>
      </div>
    </div>`;
}

function abrirPagina(bodyHtml) {
  return novaJanela({
    url: 'https://texhub.texcotton.com.br/crm/clientes/grupo/42?cnpj=11111111%2F0001-11',
    bodyHtml: bodyHtml || '',
    specs: SPECS,
  });
}

// =====================================================================
// 1. O MÓDULO NÃO DESENHA MAIS NADA
// =====================================================================
(function naoDesenha() {
  const w = abrirPagina(paginaComGrupo([
    { cnpj: '11111111/0001-11', razao: 'CLIENTE ATUAL LTDA', vencido: 'R$ 500,00', atual: true },
    { cnpj: '22222222/0001-22', razao: 'OUTRA RAZAO LTDA', vencido: 'R$ 2.500,00' },
  ]));

  checar('nenhum banner é criado na página', w.document.getElementById('alerta-grupo-vencido') === null);
  checar(
    'nada é acrescentado ao body além do que a página já tinha',
    w.document.querySelectorAll('[id^="alerta-grupo"]').length === 0
  );
  checar('o hook de teste não expõe mais nada de banner', !('criarBanner' in w.__alertaGrupoDebug));
  checar('nem as funções de medir área fixa', !('obterAlturaHeaderFixo' in w.__alertaGrupoDebug) && !('obterFimDaAreaFixaSuperior' in w.__alertaGrupoDebug));
  checar('a config não carrega mais a duração da animação do banner', !('DURACAO_SEGUIR_ANIMACAO_MS' in w.__alertaGrupoDebug.CONFIG_GRUPO));
})();

// =====================================================================
// 2. MAS CONTINUA PUBLICANDO O DADO — é disso que 3 módulos dependem
// =====================================================================
(function publicaODado() {
  const w = abrirPagina(paginaComGrupo([
    { cnpj: '11111111/0001-11', razao: 'CLIENTE ATUAL LTDA', vencido: 'R$ 500,00', atual: true },
    { cnpj: '22222222/0001-22', razao: 'OUTRA RAZAO LTDA', vencido: 'R$ 2.500,00' },
    { cnpj: '33333333/0001-33', razao: 'TERCEIRA RAZAO LTDA', vencido: '—' },
  ]));

  const grupo = w.__alertaGrupo;
  checar('window.__alertaGrupo existe', !!grupo);
  checar('e sempre traz a lista, mesmo que vazia', Array.isArray(grupo?.empresasComVencido));

  checar('acha a outra razão com vencido', grupo.empresasComVencido.length === 1, String(grupo.empresasComVencido.length));

  const achada = grupo.empresasComVencido[0];
  checar('com o CNPJ da coluna 0', achada.cnpj === '22222222/0001-22', achada.cnpj);
  checar('a razão social da coluna 1', achada.razaoSocial === 'OUTRA RAZAO LTDA', achada.razaoSocial);
  checar('o vencido da coluna 3', achada.vencido === 'R$ 2.500,00', achada.vencido);
  checar('e a URL montada com o grupoId da página', /grupo\/42/.test(achada.url || '') && /2222/.test(achada.url || ''), String(achada.url));

  // A linha do próprio cliente NÃO entra: avisar sobre quem você já está
  // olhando encheria a mensagem e faria o Alt+G abrir a página atual.
  checar(
    'a linha do cliente atual (bg-yellow-50) é ignorada',
    !grupo.empresasComVencido.some((e) => e.cnpj === '11111111/0001-11')
  );
  checar('e a razão sem vencido também fica de fora', !grupo.empresasComVencido.some((e) => e.cnpj === '33333333/0001-33'));
})();

// =====================================================================
// 3. OS CASOS EM QUE NÃO HÁ NADA A PUBLICAR
// =====================================================================
(function semGrupo() {
  const semTabela = abrirPagina('<div><h3>Outra coisa qualquer</h3></div>');
  checar('página sem tabela de grupo publica lista vazia, não undefined', Array.isArray(semTabela.__alertaGrupo?.empresasComVencido) && semTabela.__alertaGrupo.empresasComVencido.length === 0);

  const soOAtual = abrirPagina(paginaComGrupo([
    { cnpj: '11111111/0001-11', razao: 'CLIENTE ATUAL LTDA', vencido: 'R$ 500,00', atual: true },
  ]));
  checar('grupo com só o cliente atual publica lista vazia', soOAtual.__alertaGrupo.empresasComVencido.length === 0);

  // Linha curta (o CRM mudando o número de colunas) não pode estourar nem
  // inventar empresa.
  const curta = abrirPagina(`
    <div><div class="mb-4"><h3>Clientes do grupo</h3></div>
    <div><table><tbody><tr><td>111</td><td>X</td></tr></tbody></table></div></div>`);
  checar('linha com menos colunas que o esperado é ignorada sem estourar', curta.__alertaGrupo.empresasComVencido.length === 0);
})();

// =====================================================================
// 4. O QUE CONTA COMO "VENCIDO"
// =====================================================================
// ENDURECIDO num achado de revisão: antes, QUALQUER texto que não fosse
// vazio nem travessão contava -- inclusive "R$ 0,00". Se o CRM renderizar
// zero assim, TODA empresa do grupo entraria na lista, mudando a mensagem
// do Alt+A e fazendo o Alt+G abrir abas à toa.
(function oQueContaComoVencido() {
  const w = abrirPagina();
  const limpar = w.__alertaGrupoDebug.limparValorMonetario;

  checar('"R$ 0,00" não conta como vencido', limpar('R$ 0,00') === null, String(limpar('R$ 0,00')));
  checar('"0,00" não conta como vencido', limpar('0,00') === null, String(limpar('0,00')));
  checar('travessão não conta', limpar('—') === null);
  checar('vazio não conta', limpar('   ') === null);
  checar('valor de verdade conta', limpar('R$ 1.000,00') === 'R$ 1.000,00', String(limpar('R$ 1.000,00')));
  checar('centavos sozinhos contam', limpar('R$ 0,01') === 'R$ 0,01', String(limpar('R$ 0,01')));
  checar('texto inesperado (sem número) segue confiando no texto', limpar('a combinar') === 'a combinar', String(limpar('a combinar')));

  // Ponta a ponta: o zero também não pode passar pela leitura da tabela.
  const comZero = abrirPagina(paginaComGrupo([
    { cnpj: '11111111/0001-11', razao: 'ATUAL', vencido: 'R$ 100,00', atual: true },
    { cnpj: '44444444/0001-44', razao: 'ZERADA LTDA', vencido: 'R$ 0,00' },
  ]));
  checar('razão com "R$ 0,00" não entra na lista publicada', comZero.__alertaGrupo.empresasComVencido.length === 0);
})();

// =====================================================================
// 5. O CONTRATO COM QUEM CONSOME
// =====================================================================
// Módulo 4 e Módulo 7 leem estes campos pelo nome. Renomear um deles aqui
// não quebraria nada visível -- só mudaria a mensagem do cliente e a fila.
(function contrato() {
  const w = abrirPagina(paginaComGrupo([
    { cnpj: '11111111/0001-11', razao: 'ATUAL', vencido: 'R$ 1,00', atual: true },
    { cnpj: '55555555/0001-55', razao: 'CONSUMIDA LTDA', vencido: 'R$ 9.000,00' },
  ]));
  const item = w.__alertaGrupo.empresasComVencido[0];
  ['cnpj', 'razaoSocial', 'vencido', 'url'].forEach((campo) => {
    checar(`o item publicado tem o campo "${campo}" (lido por nome pelos Módulos 4 e 7)`, campo in item);
  });
  checar('a flag de carregado continua de pé (contador do Módulo 6)', w.__alertaGrupoCarregado === true);
})();

resumo();
