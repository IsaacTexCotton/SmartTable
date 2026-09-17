// Testes de POSIÇÃO do banner de alerta de grupo (Módulo 5).
//
// ARQUIVO PRÓPRIO DE PROPÓSITO. O harness compartilha os globais do Node
// entre as janelas criadas (ver helpers/dom-env.js): a última janela criada
// é a que os identificadores livres do módulo enxergam. Com este teste
// dentro de alerta-grupo.test.js, blocos posteriores criavam outro <header>
// e o reajuste passava a medir o header ERRADO -- escrevendo "80px" no
// banner desta janela por acaso, e fazendo o teste passar mesmo com o bug
// reintroduzido. Isolado, nada roda depois pra contaminar a medição.
//
// BUG REAL (relatado pelo usuário): ao FECHAR a barra de navegação rápida do
// CRM, o banner não acompanhava e ficava com um vão. O observer dispara no
// instante em que a classe muda -- ou seja, no COMEÇO da transição CSS,
// quando a barra ainda está aberta. Medir uma vez só pega o valor velho.
const { novaJanela } = require('./helpers/dom-env');
const { criarChecador } = require('./helpers/checar');

const { checar, resumo } = criarChecador('banner-posicao');

const w = novaJanela({
  url: 'https://texhub.texcotton.com.br/crm/clientes/grupo/0?cnpj=AAA',
  specs: [{ arquivo: 'modulo0-utilitarios-compartilhados.js' }, { arquivo: 'modulo5-alerta-grupo.js' }],
});

// Encurta o seguimento pra o teste não levar 600ms à toa.
w.__alertaGrupoDebug.CONFIG_GRUPO.DURACAO_SEGUIR_ANIMACAO_MS = 200;

const header = w.document.createElement('header');
header.style.position = 'fixed';
header.getBoundingClientRect = () => ({ width: 1000, height: 80, top: 0, left: 0, right: 1000, bottom: 80 });

// A barra que transborda o header, igual ao #sit-quicknav do CRM real:
// position absolute, começa em 80 e vai até 157 enquanto está aberta.
let fimDaBarra = 157;
const barra = w.document.createElement('div');
barra.style.position = 'absolute';
barra.getBoundingClientRect = () => ({ width: 1000, height: fimDaBarra - 80, top: 80, left: 0, right: 1000, bottom: fimDaBarra });
header.appendChild(barra);
w.document.body.appendChild(header);

w.__alertaGrupoDebug.criarBanner([{ cnpj: '99999999/0001-99', razaoSocial: 'FICTICIA LTDA', vencido: 'R$ 1.000,00', url: 'https://x' }]);
const banner = w.document.getElementById('alerta-grupo-vencido');

checar('com a barra ABERTA, o banner fica abaixo dela (157px)', banner.style.top === '157px', banner.style.top);
checar('e continua abaixo dos modais do CRM (z-index 30)', banner.style.zIndex === '30', banner.style.zIndex);

// A ordem aqui importa e já me enganou: o clique tem que vir DEPOIS que o
// laço de seguimento da CRIAÇÃO terminou, senão é ele que corrige a posição
// e o teste passa mesmo com o observer medindo cedo demais.
//
//   t=300  clique: a classe muda (barra AINDA aberta, como numa transição)
//   t=360  a altura colapsa de verdade
//   t=700  confere
setTimeout(() => { barra.setAttribute('data-estado', 'fechando'); }, 300);
setTimeout(() => { fimDaBarra = 80; }, 360);

setTimeout(() => {
  checar(
    'REGRESSÃO: ao FECHAR a barra, o banner acompanha e sobe pra 80px',
    banner.style.top === '80px',
    banner.style.top
  );
  resumo();
}, 700);
