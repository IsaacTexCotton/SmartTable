# Contexto: Automação de Cobrança — CRM TexCotton (V7)

Documento de transição, sucessor do V6.md. Cole isto no início de um chat novo pra continuar o trabalho sem precisar reexplicar tudo. Os arquivos de código completos e validados devem ser anexados junto (ou peça pro usuário reenviar se não estiverem na conversa).

## O que é

Scripts JavaScript injetados via **Local Overrides do Chrome DevTools** no arquivo `smart-table.js`, servido pelo CRM interno (`texhub.texcotton.com.br`). Automatiza o fluxo de cobrança do Isaac (negociador): classifica títulos vencidos, gera relatório visual, monta mensagem personalizada por WhatsApp, registra contato, percorre uma fila de clientes sozinho, avisa sobre grupo econômico e promessas de pagamento quebradas, bloqueia cobrança indevida, e roda quase inteiramente por atalhos de teclado.

**Ainda não está hospedado como asset estático no servidor** — vive só no DevTools da máquina do Isaac. Foi discutida a migração para **Tampermonkey** (userscript) como alternativa mais robusta — resolveria tanto a praticidade de edição quanto a distribuição pro time — mas **não foi implementada ainda**, só desenhada. Ver "Itens em aberto".

## Estrutura atual (6 módulos, nessa ordem, colados no mesmo arquivo)

1. **Aviso de Cobrança (v4)** — classifica títulos vencidos, gera relatório em imagem, expõe `window.__avisoCobranca`. Contém a biblioteca `SmartTable` (tabela própria da página). **Módulos 1 e 2 não foram escritos por Claude originalmente** — vieram prontos de uma sessão anterior. Editar apenas com confirmação explícita do usuário; nunca reescrever de memória.
2. **Registrar e Enviar** — botão no modal de contato. `POST /api/crm/contatos`, depois abre WhatsApp e fecha a aba sozinho, depois `location.reload()`.
3. **Fila de Atendimento** — percorre a lista de clientes sozinha, priorizada por urgência.
4. **Atalhos de Teclado** — fluxo por teclado (`Alt+letra`), incluindo o Alt+A (mensagem personalizada — ver seção própria abaixo).
5. **Alerta de Grupo Econômico** — avisa se outra empresa do mesmo grupo também tem título vencido. Agora com otimização de badge (ver "Fatos técnicos").
6. **Contexto Adicional (NOVO nesta sessão)** — lê Promessas e Contatos ao carregar a página, expõe `window.__contextoAdicional` pro Alt+A consultar sem custo extra.

## Fatos técnicos confirmados (não redescobrir)

### Já conhecidos do V6
- Stack: jQuery + DataTables 2.x + ColReorder + Tailwind. Não é React.
- URL de cliente: `/crm/clientes/grupo/{grupoId}?cnpj={cnpj}`.
- `window.location.reload` é protegido pelo navegador — não dá pra sobrescrever.
- Aba "Grupo": via `window.showTab('grupo')`, dados carregados de forma assíncrona (só ela, não as outras abas — ver abaixo).

### Novos, confirmados nesta sessão
- **`window.__TITULOS_ABERTOS__`** existe na página (array de objetos com todos os campos crus do título: `numeroTitulo`, `sequencia`, `valorEmAberto`, `dataVencimento`, `posicaoDescricao`, `portadorDescricao`, `sitCobrancaDescricao`, etc.) — mais confiável que ler célula por célula, mas o Módulo 1 **ainda lê via DOM da tabela** (não migrado pra essa fonte; ver "Itens em aberto", já era conhecido desde V6 e continua pendente).
- **Colunas confirmadas da tabela de títulos** (`data-key`): `numeroTitulo`, `sequencia`, `razaoSocial`, `dataEmissao`, `dataVencimento`, `portadorDescricao`, `posicaoDescricao`, `valorOriginal`, `valorEmAberto`, `diasAtraso`, `dataPagamento`, `historicoBaixa`, `colecao`, `representanteCodigo`, `sitCobrancaDescricao`.
- **`posicaoDescricao` tem pelo menos 4 valores confirmados**: `COBRANCA` (normal), `CARTORIO` (já protestado), `NAO COBRAR` e `CARTEIRA` (ambos = não deve ser cobrado, confirmado com o usuário — ver "Proteção não cobrar" abaixo). Se aparecer um valor novo, perguntar antes de tratar como normal.
- **Portador Itaú demora a atualizar posição pra CARTORIO** mesmo com o título já protestado de fato — regra de negócio confirmada, tratada no Módulo 1 (ver seção própria).
- **Abas "Promessas" e "Contatos" vêm PRÉ-CARREGADAS no HTML** desde o início (diferente da aba "Grupo", que só carrega ao abrir) — confirmado testando `document.querySelectorAll('#content-promessas .promessa-item').length` sem nunca ter clicado na aba. Isso permite o Módulo 6 ler direto, sem trocar de aba e sem o "flash" visual que o Módulo 5 tem.
- **Botão `#tab-grupo` ganha um `<span class="... rounded-full ...">` com o número de empresas do grupo quando são 2+.** Quando é só 1 empresa (ou sem grupo), esse span não existe. O Módulo 5 usa isso pra pular a etapa inteira (nem abre a aba) no caso mais comum.
- **Estrutura real da tela de Promessas** (`#content-promessas .promessa-item`): `data-status` (`QUEBRADA`, `PENDENTE`, `PARCIAL`, e por dropdown de filtro também existem `CUMPRIDA`/`CUMPRIDA PARCIAL` mas sem exemplo real confirmado), valor prometido, data prometida, e lista de títulos no formato `numero/parcela` (ex.: `901968/4`).
- **Estrutura real da tela de Contatos** (`#content-contatos .contato-item`): tudo em atributos `data-*` do próprio elemento — `data-data` ("10/09/2026 16:08"), `data-resumo`, `data-resultado-enum`, `data-efetivo` ("true"/"false"), sem precisar ler texto renderizado.
- **Cada `.contato-item` traz também `data-usuario` com o código do negociador que fez aquele contato** (ex.: `ISAAC.03876`, `BIANCA.03665`) — confirmado ao vivo no HTML real. É o que permite saber se ESTE negociador já falou com o cliente alguma vez.
- **O negociador logado sai do header, no botão `#user-menu-btn`**: dentro dele há um `<div>` folha com o código no formato `NOME.NUMERO` (ex.: `ISAAC.03876`). Confirmado ao vivo tanto na lista quanto na página do cliente. **A parte antes do ponto é o primeiro nome da pessoa** (confirmado com o usuário) — é daí que sai o nome usado na frase de apresentação.
- **`window.open(url, '_blank', 'noopener,noreferrer')` sempre retorna `null`** — não dá pra recuperar a referência da aba pra fechar depois. Contornado interceptando `window.open` temporariamente (ver Módulo 2).
- **CSP do CRM bloqueia (mas só como *report-only*, não trava de verdade) o carregamento do `html2canvas-pro` via unpkg** — aparece um aviso no console (`violates Content Security Policy`), mas não impede o funcionamento. Não é bug nosso, não perseguir isso como causa de erro.
- **Erro 404 em `/api/perfil/foto/...`** aparece рotineiramente no console — é do próprio CRM (foto de perfil ausente), não relacionado a nada do que construímos.

## Armadilhas já encontradas (não repetir)

### Já conhecidas do V6
Ver V6 pra lista completa (navegação mata timers, simulação de clique, localStorage sem schema, MutationObserver sem debounce, nunca usar innerHTML com texto interpolado, F5 obrigatório após colar módulo novo, Alt+letra em vez de Ctrl+letra).

### Novas, descobertas nesta sessão
- **Convenção de horário nas datas é MEIO-DIA, e vale entre módulos.** O Módulo 4 construía a data de vencimento à meia-noite (`new Date(a, m, d)`) enquanto o Módulo 6 normaliza ao meio-dia. Comparar as duas dava `00:00 >= 12:00` = false e anulava em silêncio a correção do `>=` em `deveOmitirRelatorio`. Qualquer data nova passa por `window.__smartTableUtil.normalizarData`, sem exceção.
- **Fixture de teste escrita à mão mente.** O teste de regressão desse mesmo bug existia, com o nome certo, e passava — porque a fixture também era meia-noite. Fixture de contexto agora sai do módulo real (`tests/helpers/contexto-real.js`).
- **O retrato de títulos era consumido de forma destrutiva.** `verificarESalvarSnapshotTitulos` roda a cada CARREGAMENTO de página, e sobrescrevia o retrato antes de o operador apertar Alt+A — um F5 apagava o agradecimento de pagamento pra sempre. A detecção agora fica grudada no retrato pelo resto do dia; some sozinha quando o contato de hoje é registrado (aí `contatoRecente` vira null).
1. **Corrida entre `location.reload()` e fechamento assíncrono de aba.** O Módulo 2 chama `reload()` quase instantaneamente após abrir o WhatsApp. Um `setTimeout` pra fechar a aba do WhatsApp NUNCA disparava, porque o reload matava o timer antes. Solução: a função que fecha a aba (`chamarWhatsAppEFecharAbaAutomaticamente`) retorna uma **Promise** que só resolve depois do `.close()`, e o chamador usa `await` antes de seguir pro reload. Isso atrasa o fluxo inteiro em ~1,5s de propósito — trade-off aceito pelo usuário.
2. **Fechar aba de WhatsApp só funciona se ele abrir como aba do navegador.** Se o Chrome entrega a navegação pro app desktop do WhatsApp (janela separada do SO), não existe solução via JavaScript — é bloqueio de segurança do sistema operacional, não do site. Testado e confirmado: o caso real do usuário é aba de navegador mesmo, então a solução via `window.open` interceptado se aplica.
3. **Teste de fechamento de aba precisa ser via clique de verdade, não `window.open()` direto no console** — o bloqueador de pop-up do Chrome trata chamadas fora de um gesto do usuário de forma diferente, dando falsos resultados.
4. **jsdom/cheerio não estão disponíveis no ambiente de teste do Claude, e não há acesso de rede pra instalar.** Playwright + Chromium (já disponíveis) resolvem isso — dá pra testar parsing de HTML real e não só simulação de clique/teclado, criando fixtures com `page.setContent()` e chamando as funções internas via um hook de debug temporário (ver "Metodologia").

## Sistema de substituição de variáveis `{{ }}` (Módulo 4)

Frases padrão do CRM (48+ frases reais do usuário, catalogadas com `data-id`) usam variáveis tipo `{{cliente_nome}}`. Antes desta sessão, o Módulo 4 escrevia o texto cru na caixa, sem substituir nada (bug original). Agora:

- `substituirVariaveisDaFrase(texto, dadosPreCalculados?)` acha `{{variavel}}` via regex e substitui usando um mapa `RESOLVEDORES_VARIAVEL`.
- Variáveis com resolvedor: `cliente_nome`, `quantidade_titulos_vencidos`, `quantidade_titulos_protestados`, `valor_total_vencido`, `saudacao` (Bom dia/Boa tarde/Boa noite pelo horário do relógio), `data_vencimento` (do título "representativo", ver abaixo — formato curto `DD/MM`, sem ano).
- Variáveis **sem** resolvedor (`responsavel_nome`, `chave_pix`, `valor_protestado_atualizado` — decisão consciente do usuário, não são dado que o CRM expõe automaticamente) ficam com o `{{...}}` visível na própria caixa + aviso no console, em vez de arriscar um valor errado. Isso vale pra qualquer variável nova que apareça em frase futura sem resolvedor ainda.
- Datas em mensagem pro cliente usam formato curto (`01/09`, sem ano) — decisão do usuário, "data completa fica estranho".

## Sistema de mensagem personalizada do Alt+A (Módulo 4)

Alt+A não seleciona mais "a primeira frase da lista" — monta uma mensagem sob medida. Sequência:

1. Clica em "Gerar Relatório" (igual Alt+R) — **exceto** no caso de "primeiro contato" (ver abaixo), que pula esse passo.
2. 150ms depois, abre a tela de contato (igual Alt+C).
3. Mais 150ms depois, monta a mensagem e escreve na caixa. **Para aí** — Alt+S continua sendo passo separado e consciente.

### Escolha do título "representativo"
Regra confirmada com o usuário, **igual à que o Módulo 2 já usa** pro resumo do CRM (duplicada de propósito, Módulo 2 não pode ser editado sem confirmação): entre os títulos do cliente, se algum estiver em `ULTIMO_DIA`, esse sempre vence (mesmo que outro já esteja em cartório/negativado); senão, o de maior atraso real, seja qual for a situação.

### Molde da mensagem
```
{{saudacao}}

[linha de contato recente, se aplicável -- fixo "ontem"]
[linha de promessa, se aplicável]

Segue o relatório atualizado do débito em aberto na razão social {{cliente_nome}}:

[linha da situação do título, se aplicável]

Podemos agendar para hoje o pagamento do débito em aberto?
```

### Linha de contexto por situação do título (extraída das frases reais do usuário, não inventada do zero)
| Situação (código) | Linha |
|---|---|
| `EM_ATRASO` | nenhuma (vai direto pro fechamento) |
| `PRAZO_FINAL` (raro — 6º dia caiu em fim de semana/feriado) | nenhuma, tratado igual `EM_ATRASO` |
| `ULTIMO_DIA` + cartório | "Lembramos que o título vencido em {{data_vencimento}} está no prazo final antes de ser encaminhado para cartório." |
| `ULTIMO_DIA` + SCPC | "...antes de ser encaminhado ao SCPC." |
| `NEGATIVADO_SCPC` | "Lembramos que a regularização dos débitos negativados no SCPC permite a baixa das restrições." |
| `EM_CARTORIO` | "Os títulos já em cartório aparecem destacados no relatório abaixo -- o restante ainda está dentro do prazo para pagamento via boleto." |
| `VERIFICAR_POSICAO` | **nenhuma mensagem gerada** — situação incerta demais (prazo passou, CRM ainda não confirmou cartório), decisão do usuário foi não afirmar nada errado pro cliente. |

### Caso especial: primeiro contato
Se `window.__contextoAdicional.semContatoAnterior` for `true` (zero registros na aba Contatos), a mensagem vira só identificação — ignora relatório, situação, promessa:
```
{{saudacao}}

Sou o Isaac do financeiro da Tex Cotton referente as marcas Animê, Bimbi, Youccie, Authoria e Momi
Este é o contato responsável pela razão social {{cliente_nome}}?
```
E o Alt+A **pula o Alt+R** nesse caso (mensagem não menciona relatório).

## Módulo 6: Contexto Adicional (novo)

Roda ao carregar a página do cliente (sem trocar de aba — Promessas/Contatos já vêm no HTML). Calcula e expõe em `window.__contextoAdicional`:

- **`promessa`**: `{tipo: 'DIA_DA_PROMESSA'|'QUEBRADA'|'PARCIAL', promessa: {...}}` ou `null`. Regra confirmada: só entra na mensagem **no dia combinado** (se ainda `PENDENTE`) ou **no 1º dia útil depois** (se `QUEBRADA` ou `PARCIAL`). `PENDENTE` no dia útil seguinte fica **de propósito sem mensagem** (sem frase aprovada pra esse caso). `CUMPRIDA`/`CUMPRIDA PARCIAL` são ignoradas sempre.
- **`contatoRecente`**: `{dataTexto}` ou `null`. Só quando o contato mais recente foi efetivo (`data-efetivo="true"`) e caiu exatamente no dia útil anterior a hoje.
- **`semContatoAnterior`**: `true` se a lista de Contatos vier vazia.
- **`nuncaContatadoPorMim`**: `true` quando o cliente JÁ tem contatos, mas nenhum deles é do negociador logado (compara `data-usuario` de cada contato com o código lido do `#user-menu-btn`, os dois normalizados em maiúsculas). Cliente com ZERO contatos fica `false` de propósito — esse caso já é o `semContatoAnterior`, que também se apresenta; contar os dois juntos duplicaria a apresentação na mesma mensagem.
- **`nomeNegociador`**: primeiro nome do negociador logado, capitalizado (`BIANCA.03665` → `Bianca`). Fora do formato `NOME.NUMERO` devolve string vazia e quem chama cai no padrão, em vez de mandar mensagem com nome errado. Se o header não existir na página, cai no `CONFIG_CONTEXTO.USUARIO_NEGOCIADOR` (fallback) e avisa uma vez no console.
- **`calcularTitulosPendentes(titulosDaPromessa)`**: cruza títulos de uma promessa Parcial com os que ainda aparecem em aberto no Módulo 1 (via `tituloCompleto`) — o que sumiu, presume-se pago.

**Premissa não confirmada, documentada no próprio código**: assume que o primeiro `.contato-item` da lista é sempre o mais recente — só testado com 1 contato de exemplo, nunca com lista de vários pra confirmar a ordem real.

**Cálculo de "dia útil anterior"** é novo (Módulo 1 só tinha "próximo dia útil"/"a partir de", sempre pra frente no tempo) — reaproveita `window.__avisoCobranca.feriados(ano)` pros feriados, mas a aritmética de andar pra trás é só do Módulo 6.

## Proteção "Não Cobrar" / "Carteira" (Módulo 1) — SEGURANÇA, não só feature

**Motivação**: bug real em produção — cliente foi cobrado por engano porque tinha título marcado pra não cobrar no CRM, por falta de atenção do operador.

- `posicaoDescricao` igual a `NAO COBRAR` ou `CARTEIRA` (confirmado que os dois significam "não cobrar", lista em `POSICOES_EXCLUIDAS_DE_COBRANCA`) faz o título **nunca entrar em `registros`** — fora do relatório, da mensagem do Alt+A, da nota do Módulo 2, não importa os dias de atraso. Fica só no bucket separado `naoCobrar`, exposto em `simular().naoCobrar`.
- **Banner vermelho fixo no topo da página, SEM botão de fechar** (de propósito — o bug foi justamente algo "fechável"/ignorável passar despercebido), aparece sozinho ao carregar a página se o cliente tiver qualquer título nessas posições. Mostra título + motivo de cada um.
- Se aparecer um valor de posição novo (além de `COBRANCA`/`CARTORIO`/`NAO COBRAR`/`CARTEIRA`), perguntar ao usuário antes de assumir que é "normal" — não adicionar à lista de exclusão nem tratar como cobrança comum sem confirmar.

## Correção Itaú (Módulo 1)

Regra de negócio confirmada: quando o prazo de pagamento já passou, o fluxo é cartório, e a posição ainda mostra `COBRANCA` (não confirmado como `CARTORIO` no CRM), mas o **portador é Itaú**, classifica como `EM_CARTORIO` mesmo sem essa confirmação — esse banco especificamente demora mais de um dia útil pra atualizar o sistema, mesmo com o título já protestado de fato. Lista extensível em `PORTADORES_CARTORIO_LENTO_PARA_ATUALIZAR` (hoje só `['ITAU']`, comparação sem acento/caixa via `normalizarTexto`).

## Tabela de atalhos atual (Módulo 4)

| Tecla | Ação |
|---|---|
| Alt+I | Iniciar Fila de Atendimento |
| Alt+R | Gerar Relatório |
| Alt+C | Entrar na tela de contato |
| Alt+F | Selecionar a 1ª frase padrão (com substituição de `{{variável}}`) |
| **Alt+A** | **Atendimento rápido — relatório + contato + mensagem PERSONALIZADA (não é mais "primeira frase"), ver seção própria acima** |
| Alt+S | Registrar e Enviar (agora fecha a aba do WhatsApp sozinho, ~1,5s depois) |
| Alt+P | Ir para o próximo da fila |
| Alt+B | Busca rápida de cliente |
| Alt+H | Abrir/fechar painel de ajuda |

## Metodologia que funcionou bem (reforçada nesta sessão)

- **Nunca adivinhar estrutura sem confirmação** — pedir diagnóstico de console ou `outerHTML` real antes de escrever lógica de extração. Rendeu retrabalho toda vez que isso foi pulado.
- **Testar de verdade antes de entregar**, com ferramenta adequada ao tipo de lógica:
  - Lógica pura (parsers, cálculo de data, resolução de variável) → teste Node direto, sem DOM.
  - Lógica que depende de DOM real (parsing de HTML, querySelector encadeado) → **Playwright + Chromium** com `page.setContent()` simulando o HTML real confirmado, não mock manual de `document`.
  - Pra testar funções internas de um módulo (que não são expostas em `window`), usar um **hook de debug temporário**: copiar o arquivo pra uma versão `-teste-temp.js`, inserir `window.__debugX = { funcaoInterna }` só nessa cópia, nunca no arquivo entregue.
  - Cuidado com mocks de `document`/`window` incompletos: `document.body` ausente ou `MutationObserver` não definida podem causar loop infinito de `setTimeout` (já aconteceu, travou um teste por 300s).
- **Reproduzir o bug antes de "corrigir na teoria"** — a causa raiz da corrida do reload só apareceu testando de verdade com instrumentação (`[DIAG-REAL]`), não foi deduzida de antemão.

## Itens em aberto / decisões pendentes

- **Migrar pra Tampermonkey** — desenhado em conversa, não implementado. Precisa testar se `window.showTab`, `window.abrirWhatsAppCliente` e as variáveis trocadas entre módulos (`window.__avisoCobranca`, `window.__contextoAdicional`) continuam visíveis nesse modelo antes de migrar de verdade.
- **Distribuir pro time** (Ana, Jadir, Tarciso, Larissa, Bianca) — segue pendente; Tampermonkey facilitaria bastante isso.
- **Migrar leitura de títulos pra `window.__TITULOS_ABERTOS__`** em vez de ler célula por célula do DOM — ainda não feito, continua como débito técnico conhecido desde o V6.
- **Confirmar ordem real da lista de Contatos** (mais recente primeiro?) — Módulo 6 assume isso sem confirmação real com lista de vários itens.
- **Testar em produção, de verdade, pelo usuário**: a correção da corrida reload/fechamento de aba (Módulo 2) e a proteção Não Cobrar/Carteira (Módulo 1) foram entregues e testadas isoladamente (Playwright/Node), mas **ainda não confirmadas pelo usuário em uso real** no momento deste documento.
- **Configuração duplicada entre Módulos 2 e 4** (prioridade de título "representativo") — débito técnico conhecido e aceito, mesmo motivo do V6 (Módulo 2 não editável sem confirmação).
- Quarta-feira de cinzas (dia útil ou não) — ainda pendente desde o V5/V6, baixa prioridade.
- Endpoint de rede real por trás da aba "Grupo" — ainda pendente, precisa de diagnóstico de Network tab.

## Confirmar sempre antes de propor uma feature nova

Perguntar: (1) de onde vem o dado (já existe em algum `window.__X` exposto, ou precisa ler do DOM?); (2) qual o texto/estrutura real do elemento envolvido, se ainda não confirmado; (3) se a mudança é reversível/de baixo risco o suficiente pra implementar direto, ou se envolve enviar mensagem de verdade pro cliente ou decisão de segurança (ex.: não cobrar) — nesse caso, sempre checar explicitamente antes de construir, e considerar testar contra fixture real antes de entregar.

## Onde está o código

Os 6 arquivos completos e validados (`node --check`, e os que dependem de DOM também testados via Playwright) devem estar anexados nesta mesma entrega, junto com este documento. Se precisar recuperar os arquivos e eles não estiverem mais disponíveis, peça pro usuário reenviar — o conteúdo completo não persiste fora da conversa onde foi gerado.
