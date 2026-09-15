// Assertion mínima usada por todos os testes -- mesmo padrão "checar()" já
// validado nos harnesses ad hoc desta sessão de desenvolvimento, só que
// agora com contagem por arquivo e process.exitCode pra integrar com CI.
function criarChecador(nomeArquivo) {
  let total = 0;
  let falhas = 0;

  function checar(nome, condicao, detalhe) {
    total++;
    if (condicao) {
      console.log(`  OK   - ${nome}`);
    } else {
      falhas++;
      console.log(`  FALHA- ${nome}${detalhe !== undefined ? ' :: ' + detalhe : ''}`);
    }
  }

  function resumo() {
    console.log(`[${nomeArquivo}] ${total - falhas}/${total} passaram.`);
    if (falhas > 0) process.exitCode = 1;
    return falhas === 0;
  }

  return { checar, resumo };
}

module.exports = { criarChecador };
