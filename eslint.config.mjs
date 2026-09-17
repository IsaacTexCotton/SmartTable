// Piso de qualidade. Sejamos honestos sobre o alcance: das quatro falhas que
// chegaram a atrapalhar a cobrança de verdade nesta base (relatório omitido
// por divergência de convenção de data, Alt+A não gerando relatório, grupo de
// controle enviesado, fila gravada em duplicidade), o ESLint não teria pegado
// NENHUMA. Elas são de contrato entre módulos e de lógica, não de sintaxe.
//
// Ele está aqui pelo que pega de graça e ninguém revisa: variável morta,
// global não declarada, caso duplicado em switch, código inalcançável. Quem
// cobre as outras é `npm test` e, principalmente, window.__conferir() rodando
// contra dado real.
export default [
  {
    files: ['modulos/**/*.js', 'scripts/**/*.js', 'tests/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'script',
      globals: {
        window: 'readonly', document: 'readonly', localStorage: 'readonly', location: 'readonly',
        console: 'readonly', setTimeout: 'readonly', clearTimeout: 'readonly', setInterval: 'readonly',
        clearInterval: 'readonly', navigator: 'readonly', fetch: 'readonly', URL: 'readonly',
        URLSearchParams: 'readonly', Blob: 'readonly', MutationObserver: 'readonly',
        ResizeObserver: 'readonly', requestAnimationFrame: 'readonly', getComputedStyle: 'readonly',
        Event: 'readonly', MouseEvent: 'readonly', PointerEvent: 'readonly', KeyboardEvent: 'readonly',
        Image: 'readonly', Storage: 'readonly', ClipboardItem: 'readonly', html2canvas: 'readonly',
        HTMLElement: 'readonly', Node: 'readonly', alert: 'readonly', confirm: 'readonly',
        require: 'readonly', module: 'writable', process: 'readonly', __dirname: 'readonly',
        global: 'readonly', Buffer: 'readonly',
      },
    },
    rules: {
      // Só regras que apontam defeito, nunca estilo -- estilo aqui é decidido
      // pelo código existente, não por configuração.
      'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none' }],
      'no-undef': 'error',
      'no-dupe-keys': 'error',
      'no-dupe-args': 'error',
      'no-dupe-else-if': 'error',
      'no-duplicate-case': 'error',
      'no-unreachable': 'error',
      'no-fallthrough': 'error',
      'no-self-compare': 'error',
      'no-self-assign': 'error',
      'no-const-assign': 'error',
      'no-cond-assign': 'error',
      'no-sparse-arrays': 'error',
      'valid-typeof': 'error',
      'use-isnan': 'error',
    },
  },
  {
    // Os testes são CommonJS de verdade (require/module), e o runner usa
    // `return` no topo pra abortar cedo -- válido em módulo CJS.
    files: ['tests/**/*.js', 'scripts/**/*.js'],
    languageOptions: { sourceType: 'commonjs' },
  },
  {
    // MÓDULOS PROTEGIDOS: não foram escritos por Claude e exigem confirmação
    // explícita do usuário pra qualquer edição. Apontar 107 `var` num arquivo
    // que ninguém pode tocar só ensina a ignorar a saída do linter.
    files: ['modulos/modulo1-aviso-cobranca.js', 'modulos/modulo2-registrar-enviar.js'],
    rules: { 'no-unused-vars': 'off' },
  },
];
