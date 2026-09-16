// Testes do banner de alerta de grupo econômico (Módulo 5) -- BUGS REAIS
// relatados pelo usuário: (1) o banner às vezes ficava por cima do header
// do CRM (timing -- a medição da altura podia acontecer antes do layout
// do header assentar) e (2) ficava por cima de modais do CRM (ex.:
// "Registrar Contato"), cortando o modal ao meio, porque o z-index do
// banner (999996) era muito maior que o do backdrop do modal (confirmado
// via diagnóstico ao vivo: #modal-contato usa z-index 50, convenção
// Tailwind "z-50"). Roda contra o código REAL de
// modulos/modulo5-alerta-grupo.js via window.__alertaGrupoDebug.
const { novaJanela } = require('./helpers/dom-env');
const { criarChecador } = require('./helpers/checar');

const { checar, resumo } = criarChecador('alerta-grupo');

const SPECS = [{ arquivo: 'modulo0-utilitarios-compartilhados.js' }, { arquivo: 'modulo5-alerta-grupo.js' }];

function abrirPagina(bodyHtmlExtra) {
  return novaJanela({
    url: 'https://texhub.texcotton.com.br/crm/clientes/grupo/0?cnpj=AAA',
    bodyHtml: bodyHtmlExtra || '',
    specs: SPECS,
  });
}

function criarHeaderFixo(w, altura) {
  const header = w.document.createElement('header');
  header.style.position = 'fixed';
  header.getBoundingClientRect = () => ({ width: 1000, height: altura, top: 0, left: 0, right: 1000, bottom: altura });
  w.document.body.appendChild(header);
  return header;
}

function empresa(overrides) {
  return Object.assign({ cnpj: '99999999/0001-99', razaoSocial: 'OUTRA EMPRESA LTDA', vencido: 'R$ 1.000,00', url: 'https://x' }, overrides || {});
}

// 1. obterAlturaHeaderFixo -- sem header, retorna 0.
(function () {
  const w = abrirPagina();
  checar('sem <header> na página, altura é 0', w.__alertaGrupoDebug.obterAlturaHeaderFixo() === 0);
})();

// 2. obterAlturaHeaderFixo -- header existe mas NÃO é fixed/sticky, retorna 0.
(function () {
  const w = abrirPagina();
  const header = w.document.createElement('header');
  header.style.position = 'static';
  header.getBoundingClientRect = () => ({ width: 1000, height: 80, top: 0, left: 0, right: 1000, bottom: 80 });
  w.document.body.appendChild(header);
  checar('header não-fixo -- altura é 0 (não conta como header fixo)', w.__alertaGrupoDebug.obterAlturaHeaderFixo() === 0);
})();

// 3. obterAlturaHeaderFixo -- header fixed, retorna a altura real.
(function () {
  const w = abrirPagina();
  criarHeaderFixo(w, 80);
  checar('header fixed de 80px -- altura detectada é 80', w.__alertaGrupoDebug.obterAlturaHeaderFixo() === 80);
})();

// 4. criarBanner -- posiciona logo abaixo do header (top = altura dele).
(function () {
  const w = abrirPagina();
  criarHeaderFixo(w, 80);
  w.__alertaGrupoDebug.criarBanner([empresa()]);
  const banner = w.document.getElementById('alerta-grupo-vencido');
  checar('banner é criado', !!banner);
  checar('banner posicionado logo abaixo do header (top=80px)', banner && banner.style.top === '80px', banner && banner.style.top);
})();

// 5. BUG REAL: z-index do banner fica ABAIXO do padrão de modal do CRM
// (z-50 confirmado via diagnóstico ao vivo) -- garante que qualquer modal
// desse padrão renderiza por cima do banner, em vez do contrário.
(function () {
  const w = abrirPagina();
  w.__alertaGrupoDebug.criarBanner([empresa()]);
  const banner = w.document.getElementById('alerta-grupo-vencido');
  const zIndexBanner = Number(banner.style.zIndex);
  checar('z-index do banner é menor que o do modal confirmado (z-50)', zIndexBanner < 50, zIndexBanner);
})();

// 6. Chamar criarBanner duas vezes não duplica.
(function () {
  const w = abrirPagina();
  w.__alertaGrupoDebug.criarBanner([empresa()]);
  w.__alertaGrupoDebug.criarBanner([empresa()]);
  const banners = w.document.querySelectorAll('#alerta-grupo-vencido');
  checar('chamar duas vezes não duplica o banner', banners.length === 1, banners.length);
})();

// 7. Banner cita a(s) empresa(s) e o valor vencido.
(function () {
  const w = abrirPagina();
  w.__alertaGrupoDebug.criarBanner([empresa({ razaoSocial: 'FILIAL TESTE LTDA', vencido: 'R$ 2.500,00' })]);
  const banner = w.document.getElementById('alerta-grupo-vencido');
  checar('banner cita a razão social e o valor vencido', /FILIAL TESTE LTDA/.test(banner.textContent) && /2\.500,00/.test(banner.textContent), banner.textContent);
})();

// 8. MELHORIA (bug de timing corrigido): se a altura do header medida nas
// primeiras leituras (criação do banner + reajuste síncrono logo em
// seguida) ainda estava desatualizada -- layout genuinamente não tinha
// assentado a tempo nem daquela segunda leitura --, o reajuste posterior
// (requestAnimationFrame/setTimeout) corrige o "top" sozinho.
const promessa9 = (function () {
  const w = abrirPagina();
  const header = w.document.createElement('header');
  header.style.position = 'fixed';
  // As duas primeiras leituras (Object.assign inicial + reajustar()
  // síncrono dentro de manterBannerAlinhadoAoHeader) retornam um valor
  // desatualizado (0) -- só a partir da 3ª leitura (requestAnimationFrame
  // ou o setTimeout de segurança) o layout "assenta" no valor real (80).
  let leituras = 0;
  header.getBoundingClientRect = () => {
    leituras++;
    const altura = leituras <= 2 ? 0 : 80;
    return { width: 1000, height: altura, top: 0, left: 0, right: 1000, bottom: altura };
  };
  w.document.body.appendChild(header);

  w.__alertaGrupoDebug.criarBanner([empresa()]);
  const banner = w.document.getElementById('alerta-grupo-vencido');
  checar('BUG REAL: enquanto o layout do header não assentou, o top pode ficar desatualizado (0px)', banner.style.top === '0px', banner.style.top);

  return new Promise((resolve) => {
    setTimeout(() => {
      checar('MELHORIA: reajuste automático corrige o top pro valor real assentado (80px)', banner.style.top === '80px', banner.style.top);
      resolve();
    }, 400);
  });
})();

promessa9.then(resumo);
