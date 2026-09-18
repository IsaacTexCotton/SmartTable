# Como usar cada skill neste repositório

São sete. Invoque com `/nome-da-skill` seguido do que você quer.

A regra que vale para todas: **skill não substitui dado real.** O padrão que
mais funcionou aqui foi sempre o mesmo — um diagnóstico ao vivo no console do
CRM, censurado, e só então a skill. Os quatro bugs que de fato atrapalharam
cobrança nesta base foram achados por dado real, nenhum pela suíte.

---

## Escolha rápida

| A situação é... | Skill |
|---|---|
| Vou escrever ou refatorar código de módulo | `javascript-pro` |
| Algo quebrou e eu não sei por quê | `debugging-wizard` |
| Terminei algo e quero achar o que me escapou | `code-reviewer` |
| Está lento; quero o mesmo resultado mais rápido | `alternativa-mais-rapida` |
| Vou criar módulo novo ou mexer em contrato entre módulos | `architecture-designer` |
| Estou prestes a decidir algo caro ou difícil de desfazer | `the-fool` |
| Quero planejar cobertura de teste de um fluxo | `playwright-expert` (com ressalva) |

---

## `javascript-pro` — escrever e refatorar

**Use quando** for mexer em `modulos/*.js`: função nova, refatoração, async.

**Exemplo real:** `/javascript-pro implemente em tudo que usa ISAAC como
negociador fixo para trocar para o negociador atual`. Virou a leitura do
usuário logado (Módulo 6) que o Alt+D depende hoje.

**Ressalvas deste repo, que a skill não sabe sozinha:**
- Ela prega ESM (`import`/`export`). **Aqui não existe ESM**: os módulos são
  IIFEs carregadas por `@require` do Tampermonkey, e os testes são CommonJS.
  Ignore essa parte.
- Módulos **1 e 2 são protegidos** — exigem sua confirmação explícita.
- Datas seguem a convenção de meio-dia (`normalizarData`, Módulo 0).

---

## `debugging-wizard` — achar a causa

**Use quando** algo parou de funcionar e a causa não é óbvia.

**Exemplo real:** `/debugging-wizard Ele está excluindo algumas frases muito
importantes quando é último dia e o cliente já tem títulos negativados`.
Resultou na correção do SCPC de 19 dias.

**O jeito certo aqui:** comece pelo sintoma que VOCÊ viu na tela, com o cliente
e a situação. A skill exige reproduzir antes de hipotetizar, e reproduzir neste
projeto quase sempre significa um trecho no console do CRM — não um teste.

**Não use** para "está lento": lentidão não é bug. Isso é
`alternativa-mais-rapida`.

---

## `code-reviewer` — revisar o que já está feito

**Use quando** terminar uma mudança e quiser uma segunda leitura antes de
publicar, ou para auditar um módulo inteiro.

**Exemplo real:** foi ela que apontou a duplicação que originou o Módulo 0 —
`normalizarData` existia em três cópias, e uma delas usava meia-noite em vez de
meio-dia. Isso era um bug real, silencioso, que excluía cliente da fila.

**Não use** logo depois de escrever: revisar o próprio código quente rende
pouco. Melhor no dia seguinte ou antes de publicar no canal estável.

---

## `alternativa-mais-rapida` — mesmo resultado, mais rápido *(skill própria)*

**Use quando** algo demora e a saída deve continuar idêntica.

**Exemplo real:** o Alt+U revisitava ~140 clientes a cada acionamento. O
movimento 1 da skill — "isso precisa rodar agora?" — transformou isso em zero
na v1.16.0.

**A regra central:** "mesma saída" é a suíte passando **sem nenhum teste
editado**. Teste que precisa mudar significa que a saída mudou, e aí não é
otimização, é feature.

**Alvos já anotados dentro dela:** paralelismo entre abas do Shift+Alt+U, nunca
avaliado.

---

## `architecture-designer` — desenho entre módulos

**Use quando** a decisão for maior que uma função: criar módulo novo, mudar o
que um módulo publica para os outros, ou escolher onde uma responsabilidade
mora.

**Teria sido útil em dois casos reais desta base:**
- O Módulo 5 publica `window.__alertaGrupo`, consumido por três módulos. Quando
  o CRM ganhou alerta próprio, quase se apagou o módulo inteiro — o que teria
  mudado o texto da cobrança e duplicado cliente na fila.
- Módulo 3 (Alt+I) e Módulo 7 (Alt+U) gravam na **mesma chave** do
  `localStorage`, e uma sobrescreve a outra. Isso nunca foi decidido; aconteceu.

**Adaptação obrigatória:** a skill manda escrever ADRs em arquivo separado.
**Aqui não fazemos isso.** A decisão e o porquê vão para dois lugares que
ninguém consegue ignorar: o **cabeçalho do módulo** e a **mensagem do commit**.
Documento que vive longe do código envelhece sem avisar; comentário no arquivo
que a pessoa está editando, não.

**Não use** para performance — ela se declara fora do nível de código.

---

## `the-fool` — desafiar antes de decidir

**Use ANTES** de uma decisão cara ou difícil de desfazer, não depois. Cinco
modos: expor premissas, argumentar o contrário, achar modos de falha
(pre-mortem), red team, e auditar a evidência.

**Candidatos de agora, concretos:**
- Publicar 1.16.0 no canal estável (cinco versões de diferença, e o canal
  deixou de ser imutável quando virou branch)
- Religar o grupo de controle, que reordena 1 em cada 5 clientes da sua fila
- Paralelizar as abas do Shift+Alt+U

**Modo mais útil aqui:** *pre-mortem*. Este projeto roda na cobrança real, todo
dia, e o padrão das falhas foi sempre o mesmo — **degradam em silêncio**. Nada
na tela avisa quando a régua para de funcionar ou a mensagem sai errada.
"Como isso falharia sem eu perceber?" é a pergunta que mais rende.

**Não espere alternativa dela:** por desenho, ela fortalece a sua ideia ou
mostra que ela não se sustenta. Quem propõe substituto é você, ou a
`alternativa-mais-rapida`.

---

## `playwright-expert` — com ressalva importante

**Este repositório não usa Playwright.** A suíte são 1148 asserções em
Node + jsdom, sem navegador. Instalar Playwright aqui seria decisão nova, não
tomada.

**Para que ela serviu de verdade:** planejar *o que* testar. O exemplo real —
`/playwright-expert teste todas as mensagens em diversos clientes com condições
variadas e capte qualquer incongruência` — produziu a matriz de 335 cenários de
`mensagens.test.js`, que rodou em jsdom e achou 67 incongruências reais.

**Então use-a como QA sênior, não como ferramenta:** peça o plano e a matriz de
casos, e ignore a parte de Page Object Model e trace viewer enquanto não
houver navegador de verdade no projeto.

---

## Combinações que funcionaram

1. **Dado real → skill.** Diagnóstico censurado no console, depois a skill.
   Inverter a ordem produz palpite bem escrito.
2. **`the-fool` antes, `code-reviewer` depois.** Um desafia a decisão, o outro
   confere a execução.
3. **`alternativa-mais-rapida` + mutação.** A skill exige a prova; a mutação é
   a prova. Sem quebrar de propósito e ver a suíte reclamar, "mesma saída" é
   só uma frase.
