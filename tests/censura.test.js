// Testes da censura dos diagnósticos (window.__diag, Módulo 8).
//
// A propriedade que importa não é "mascara bonito" -- é NADA SENSÍVEL ESCAPA.
// Os testes abaixo pegam a saída pronta e procuram nela o CNPJ, a razão
// social e o valor que entraram. Se qualquer um aparecer, falha.
//
// A segunda propriedade, quase tão importante: o apelido é ESTÁVEL. Foi
// cruzando identificadores repetidos que o bug da fila gravada 2x apareceu;
// se a censura quebrasse isso, ela tornaria o diagnóstico inútil.
const { novaJanela } = require('./helpers/dom-env');
const { criarChecador } = require('./helpers/checar');

const { checar, resumo } = criarChecador('censura');

const SPECS = [
  { arquivo: 'modulo0-utilitarios-compartilhados.js' },
  { arquivo: 'modulo8-diario.js' },
];

function abrir() {
  const w = novaJanela({ url: 'https://texhub.texcotton.com.br/crm/clientes/grupo/829?cnpj=A', specs: SPECS });
  w.console = Object.assign({}, w.console, { log() {}, warn() {}, error() {} });
  return w;
}

// Dados fictícios com a MESMA forma dos reais.
const CNPJ = '14475803/0001-07';
const RAZAO = 'EMPRESA FICTICIA LTDA';
const VALOR = 'R$ 1.778,69';

// =====================================================================
// NADA SENSÍVEL ESCAPA
// =====================================================================
(function () {
  const w = abrir();
  const d = w.__diario;

  w.__alertaGrupoCarregado = true;
  w.__alertaGrupo = { empresasComVencido: [{ cnpj: CNPJ, razaoSocial: RAZAO, vencido: VALOR, url: `https://texhub.texcotton.com.br/crm/clientes/grupo/829?cnpj=${encodeURIComponent(CNPJ)}` }] };

  const saida = JSON.stringify(d.relatorioGrupo());

  checar('o CNPJ não aparece na saída do relatório de grupo', !saida.includes(CNPJ), saida.slice(0, 160));
  checar('o CNPJ sem pontuação também não aparece', !saida.includes('14475803000107'));
  checar('a razão social não aparece', !saida.includes(RAZAO));
  checar('o valor vencido não aparece', !saida.includes('1.778,69'));
  checar('nem os dígitos do valor soltos', !saida.includes('1778'));
  checar('o cnpj não vaza pela URL', !saida.includes('14475803') && !saida.includes('0001-07'));
})();

(function () {
  const w = abrir();
  const d = w.__diario;
  d.registrarLote('fila', [{ c: CNPJ, f: 3, p: 1, k: 0, s: 'EM_ATRASO', a: 2 }]);
  const saida = JSON.stringify(d.relatorioFila());
  checar('o CNPJ não aparece na saída do relatório de fila', !saida.includes(CNPJ), saida);
  checar('mas a faixa, posição e situação continuam lá', /"f":3/.test(saida) && /"p":1/.test(saida) && /EM_ATRASO/.test(saida));
})();

(function () {
  // A exportação é o arquivo que vira anexo -- censurada por padrão.
  //
  // Testado em montarExportacao(), não atravessando Blob/createObjectURL: no
  // jsdom os identificadores livres do módulo resolvem pros globais do Node,
  // então substituir window.Blob não pega. Mais importante que o contorno: o
  // que precisa de garantia é O QUE SAI, não o encanamento do download.
  const w = abrir();
  const d = w.__diario;
  d.registrar('baixa', { c: CNPJ, tt: ['901968/4'] });

  const censurada = JSON.stringify(d.montarExportacao());
  checar('a exportação não leva o CNPJ', !censurada.includes(CNPJ), censurada.slice(0, 160));
  checar('a exportação não leva o número do título', !censurada.includes('901968/4'), censurada.slice(0, 160));
  checar('e se declara censurada', /"censurado":true/.test(censurada));
  checar('mas mantém o tipo e o dia do evento', /"t":"baixa"/.test(censurada) && /"d":\d{8}/.test(censurada));

  const crua = JSON.stringify(d.montarExportacao({ censurado: false }));
  checar('com censurado:false o CNPJ sai (uso interno)', crua.includes(CNPJ));
  checar('e se declara NÃO censurada', /"censurado":false/.test(crua));
})();

// =====================================================================
// O APELIDO É ESTÁVEL -- senão a censura inutiliza o diagnóstico
// =====================================================================
(function () {
  const w = abrir();
  const d = w.__diario;

  const a = d.apelido(CNPJ);
  const b = d.apelido(CNPJ);
  checar('o mesmo CNPJ vira sempre o mesmo apelido', a === b, `${a} vs ${b}`);
  checar('CNPJs diferentes viram apelidos diferentes', d.apelido(CNPJ) !== d.apelido('11111111/0001-11'));
  checar('o apelido não contém nenhum dígito do CNPJ', !/14475803/.test(a), a);
  checar('vazio não quebra', d.apelido('') === '(vazio)' && d.apelido(null) === '(vazio)');
})();

(function () {
  // Sal diferente produz apelido diferente pro MESMO CNPJ -- é isso que
  // impede reverter por força bruta de fora, já que o espaço de CNPJs é
  // pequeno. Trocado dentro de UMA janela: o sal é lido sob demanda, então
  // dá pra medir os dois sem depender de duas instâncias de localStorage
  // (que no jsdom acabam sendo a mesma, ver nota na exportação acima).
  const w = abrir();
  w.localStorage.setItem('smarttable_sal_diagnostico', 'sal-um');
  const comSalUm = w.__diario.apelido(CNPJ);
  w.localStorage.setItem('smarttable_sal_diagnostico', 'sal-dois');
  const comSalDois = w.__diario.apelido(CNPJ);
  checar('sal diferente muda o apelido (não é hash puro do CNPJ)', comSalUm !== comSalDois, `${comSalUm} vs ${comSalDois}`);
  checar('e com o mesmo sal o apelido volta a ser o mesmo', (() => {
    w.localStorage.setItem('smarttable_sal_diagnostico', 'sal-um');
    return w.__diario.apelido(CNPJ) === comSalUm;
  })());
})();

// =====================================================================
// O FORMATO É PRESERVADO -- é ele que denuncia erro de parsing
// =====================================================================
(function () {
  const w = abrir();
  const d = w.__diario;
  checar('"R$ 1.778,69" vira "R$ #.###,##"', d.valorMascarado('R$ 1.778,69') === 'R$ #.###,##', d.valorMascarado('R$ 1.778,69'));
  checar('"R$ 0,00" vira "R$ #,##" (dá pra ver que o formato bate)', d.valorMascarado('R$ 0,00') === 'R$ #,##');
  checar('travessão passa como está (não tem dígito pra esconder)', d.valorMascarado('—') === '—');
  checar('vazio é sinalizado', d.valorMascarado('') === '(vazio)');

  checar('o nome vira só o tamanho', d.nomeMascarado(RAZAO) === `nome.${RAZAO.length}car`, d.nomeMascarado(RAZAO));
  checar('nome com espaço colado revela o tamanho inflado', d.nomeMascarado('X           atual') === 'nome.17car');

  const u = d.urlMascarada('https://texhub.texcotton.com.br/crm/clientes/grupo/829?cnpj=14475803%2F0001-07');
  checar('a URL preserva a forma', /crm\/clientes\/grupo\/<id>/.test(u), u);
  checar('a URL oculta o valor do parâmetro', u.includes('cnpj=<oculto>') && !u.includes('14475803'), u);
})();

// =====================================================================
// REDE DE SEGURANÇA EM TEXTO LIVRE
// =====================================================================
(function () {
  const w = abrir();
  const d = w.__diario;
  const texto = `Cliente 14.475.803/0001-07 nao atendeu, CPF 123.456.789-00, tel (11) 98765-4321`;
  const limpo = d.censurarTexto(texto);
  checar('CNPJ em texto livre é trocado', !limpo.includes('14.475.803/0001-07'), limpo);
  checar('CPF em texto livre é trocado', !limpo.includes('123.456.789-00'), limpo);
  checar('telefone em texto livre é trocado', !limpo.includes('98765-4321'), limpo);
  checar('o resto do texto sobrevive', limpo.includes('nao atendeu'));
})();

resumo();
