# Contexto: Automação de Cobrança — CRM TexCotton (V7, atualizado)

Documento de transição. Cole isto no início de um chat novo pra continuar o
trabalho sem precisar reexplicar tudo. **Diferente da versão original deste
arquivo, agora não é preciso reanexar código nenhum**: tudo vive versionado
no repositório GitHub `IsaacTexCotton/SmartTable`, público, e o chat novo lê
direto de lá (branches `main` e `estavel`, histórico de commits, testes).
Este documento existe pra economizar o que o `git log` não conta sozinho: as
decisões, os fatos confirmados ao vivo e as armadilhas já pisadas.

**Atualizado em**: 2026-09-18, na versão do `main` **1.20.0** (canal estável
ainda em 1.18.1 até a próxima `npm run release`). Se o
`@version` do repo for maior que isso quando você ler, o texto abaixo ainda
descreve a arquitetura corretamente, mas pode haver módulo/atalho novo não
listado — checar `smart-table.user.js` e `modulos/` antes de assumir que a
lista está completa.

## O que mudou desde a versão anterior deste documento (histórico, não relevante pro dia a dia)

A versão original deste arquivo descrevia o projeto rodando via **Local
Overrides do Chrome DevTools**, 6 módulos, um usuário só. Isso foi
substituído por completo:

- **Distribuição via Tampermonkey** (userscript com `@require` apontando pro
  GitHub), não mais DevTools — resolve a praticidade de edição e permite
  distribuir pro time sem reenviar arquivo.
- **Dois canais** (`main` = desenvolvimento, `estavel` = o que o time
  instala) em vez de um arquivo só — ver seção própria abaixo.
- **12 módulos**, não 6 — a numeração histórica (1-6) foi mantida por
  compatibilidade e os novos entraram como 7-11 fora de ordem cronológica de
  criação.
- Uma segunda pessoa (**Bianca**) agora também vai usar o script — ainda não
  instalado na máquina dela até a data deste documento (ver "Itens em
  aberto").

## Como instalar / onde está o código

1. Tampermonkey no navegador.
2. Instalar a partir de uma destas URLs (Tampermonkey abre a tela de
   instalação sozinho ao acessar):
   - **Desenvolvimento** (Isaac, quem mexe no código):
     `https://raw.githubusercontent.com/IsaacTexCotton/SmartTable/main/smart-table.user.js`
   - **Estável** (resto do time):
     `https://raw.githubusercontent.com/IsaacTexCotton/SmartTable/main/smart-table-estavel.user.js`
3. `@grant none` — o script roda no mesmo `window` da página (confirmado em
   uso real, isso já não é mais suposição).

**Por que dois canais**: antes só existia `main`, e todo `git push` ia pro
navegador de todo mundo na checagem seguinte do Tampermonkey — sem
homologação, sem rollback. Agora o canal estável só anda quando alguém roda
`npm run release -- X.Y.Z` de propósito; trabalho do dia a dia em `main` não
chega lá.

**Por que branch e não tag** (decisão registrada, custo aceito): tag seria
imutável e mais correta num mundo sem atrito, mas esta sessão de manutenção
consegue mover branches e **não consegue criar tags** (403 do GitHub,
verificado ao vivo) — com tag, toda publicação dependeria de um comando
manual do usuário. Em troca da imutabilidade, `scripts/release.js` recusa
publicar uma versão que não seja **estritamente maior** que a já publicada,
pra "publicar" nunca significar "voltar atrás em silêncio".

### Publicar uma versão nova

```
npm run release -- 1.19.0
npm run release -- 1.19.0 --local     # prepara sem empurrar
```

Recusa se: árvore suja, `@version` do wrapper ≠ `VERSAO_SMARTTABLE` do
Módulo 6 (ficam em lockstep, sempre), versão não maior que a publicada, ou
`npm run verificar` falhar. Passando por tudo, regenera os `@require` do
canal estável, empurra `main` primeiro (é de lá que o Tampermonkey lê
`@version` para o aviso de atualização), depois `estavel` — com retentativa
exponencial (2/4/8/16s) em falha de rede.

## Estrutura atual (12 módulos, `modulos/*.js`, nesta ordem de carregamento)

Ordem real dos `@require` (importa: módulos posteriores dependem de
`window.__X` publicado pelos anteriores):

**0 → 9 → 10 → 8 → 1 → 2 → 3 → 7 → 11 → 5 → 4 → 6**

| # | Nome do arquivo | Função | Atalho |
|---|---|---|---|
| 0 | `modulo0-utilitarios-compartilhados.js` | Base de tudo: config (`localStorage`), cálculo de semana sáb-sex, hash/rotação de frases, registro de painéis (fecha um ao abrir outro), `normalizarData` (meio-dia), constantes SCPC. Não é numerado por acaso — carrega primeiro. | — |
| 1 | `modulo1-aviso-cobranca.js` | Classifica títulos vencidos, relatório em imagem. **PROTEGIDO** — não veio de mim originalmente, editar só com confirmação explícita do usuário. | Alt+R (relatório) |
| 2 | `modulo2-registrar-enviar.js` | Registra contato no CRM, abre WhatsApp (app ou web, conforme config), fecha a aba sozinho, recarrega. **PROTEGIDO**, mesma regra do Módulo 1. | Alt+S |
| 3 | `modulo3-fila-atendimento.js` | Fila de atendimento original, por dias de atraso. Dono de `obterAtendidosHoje()` (quem já foi contatado hoje) — o Módulo 7 usa essa função em vez de ler `localStorage` direto. | Alt+I |
| 4 | `modulo4-atalhos-teclado.js` | Todos os atalhos, mensagem personalizada do Alt+A, rotação de frases (`FRASES`), aviso de novidades/ajuda. | (dono do mapa de teclas) |
| 5 | `modulo5-alerta-grupo.js` | Hoje é só um **detector**, sem UI própria — `window.__alertaGrupo.empresasComVencido`. O banner que ele desenhava foi removido na v1.14.0 quando o CRM real passou a mostrar isso sozinho na tela do cliente. Consumido por Alt+G, pela frase do relatório, pela fila de prioridade e pelo diário. | Alt+G |
| 6 | `modulo6-contexto-adicional.js` | Lê Promessas/Contatos pré-carregados no HTML, expõe `window.__contextoAdicional` (promessa, contato recente, nunca-contatado-por-mim, nome do negociador logado). | — |
| 7 | `modulo7-fila-prioridade.js` | Fila ordenada por régua de negócio de 10 faixas (não só dias de atraso), com cache do dia e classificação em paralelo. Ver seção própria. | Alt+U (Shift+Alt+U reconstrói) |
| 8 | `modulo8-diario.js` | Instrumentação: grava eventos de fila/contato/baixa por dia, pra medir se a régua de prioridade funciona. Ver "Itens em aberto" — decisão de shipar pro time ainda em jogo. | — |
| 9 | `modulo9-painel-configuracoes.js` | Painel genérico de interruptores (Alt+O). Não conhece nenhuma config específica — só desenha o que está declarado em `DEFINICOES` no Módulo 0. | Alt+O |
| 10 | `modulo10-recebido-na-semana.js` | Total recebido na semana vigente (sáb-sex) por depósito e por promessa cumprida, Isaac e Bianca, vindo de dado real de API — não inferência. | Alt+D |
| 11 | `modulo11-progresso-fila.js` | Botão discreto (não atalho de teclado, pedido explícito) que abre um painel com uma barra por faixa de prioridade da fila de hoje: cobrados/total (ex.: "23/56"). Não recalcula nada — agrupa a mesma fila que o Alt+U já grava. Ver seção própria. | (botão na borda direita da tela) |

## Convenções obrigatórias (não redescobrir)

- **Módulos 1 e 2 são protegidos.** Nunca editar sem pedir confirmação
  explícita antes. Testar mudança hipotética só injetando lógica extra em
  memória (nunca escrevendo no arquivo real) até o usuário confirmar.
- **Convenção de meio-dia em toda data**: `window.__smartTableUtil.normalizarData`
  seta `setHours(12,0,0,0)`. Qualquer data nova, em qualquer módulo, passa
  por ela — comparar meia-noite com meio-dia já causou bug de silêncio uma
  vez (ver "Armadilhas").
- **Privacidade — regra permanente e literal do usuário**: *"Para todos os
  codigos no devstool, codifique de uma maneira que as informações
  sensíveis sejam censuradas."* Aplicada no Módulo 8: `exportar({censurado:
  true})` é o padrão, e todo diagnóstico que sai daqui pro console/relatório
  segue essa régua.
- **Versionamento** (`@version` do wrapper e `VERSAO_SMARTTABLE` do Módulo 6,
  sempre em lockstep):
  - **PATCH** (`1.0.x`) — correção de bug, ajuste de texto/frase.
  - **MINOR** (`1.x.0`) — atalho novo, botão novo, critério de faixa/prioridade
    novo, ou qualquer reordenação/redesenho.
  - **MAJOR** (`x.0.0`) — só quando exige atenção do usuário ANTES de
    continuar usando (ex.: passaria a enviar sem revisão manual). Nunca por
    acúmulo de MINORs.
  - **Em dúvida entre duas categorias, sempre a mais alta.**
- **Commits**: em português, terminando com a atribuição do Claude e a
  sessão (formato já usado em todo o histórico — ver `git log`). Sempre
  `git fetch origin main` antes; push direto em `main` (o canal estável só
  se move via `npm run release`).
- **Mutação como prática padrão**: toda correção é verificada reintroduzindo
  o bug de propósito e confirmando que o teste voz a acusar.
- **Nunca adivinhar DOM/regra de negócio** — pedir/gerar diagnóstico de
  console real antes de escrever lógica de extração. Todo fato "confirmado"
  listado abaixo veio assim, não de suposição.

## Fatos confirmados sobre o CRM (não redescobrir)

- Stack: jQuery + DataTables 2.x + ColReorder + Tailwind. Não é React.
- URL de cliente: `/crm/clientes/grupo/{grupoId}?cnpj={cnpj}`.
- `window.__TITULOS_ABERTOS__` existe na página com todos os campos crus do
  título; o Módulo 1 ainda lê a tabela via DOM (débito técnico conhecido,
  não migrado).
- `posicaoDescricao`: `COBRANCA` (normal), `CARTORIO` (protestado), `NAO
  COBRAR` e `CARTEIRA` (os dois = não cobrar — proteção de segurança no
  Módulo 1, banner sem botão de fechar, motivado por bug real de cobrança
  indevida em produção).
- Portador **Itaú** demora a atualizar posição pra `CARTORIO` mesmo já
  protestado de fato — tratado no Módulo 1 via
  `PORTADORES_CARTORIO_LENTO_PARA_ATUALIZAR`.
- Abas "Promessas" e "Contatos" vêm pré-carregadas no HTML; "Grupo" só
  carrega ao clicar — por isso o Módulo 5 evita abrir essa aba quando o
  badge `#tab-grupo` já diz que só há 1 empresa no grupo.
- Cada `.contato-item` traz `data-usuario` com o código do negociador
  (`ISAAC.03876`, `BIANCA.03665`) — permite saber se ESTE negociador já
  falou com o cliente. Premissa não confirmada: assume-se que o primeiro
  item da lista é o mais recente.
- **Não existe API de detalhe de cliente.** Só `/api/notificacoes/contagem`
  e `/api/perfil/foto/...`. Confirmado tentando via `fetch` direto.
- **`X-Frame-Options: deny`** — carregar a página em iframe é impossível,
  confirmado ao vivo (bloqueio do navegador, não contornável).
- **HTML buscado por `fetch` vem sem a tabela de títulos/SCPC/promessa/grupo**
  — a página provavelmente monta isso no navegador a partir de dado inline
  (`<script>`), do jeito que a lista já faz com `window.CLIENTES`. Hipótese
  não perseguida — ver "Alvos conhecidos" na skill de otimização.
- **`GET /api/crm/dashboard-consolidado?inicio=AAAA-MM-DD&fim=AAAA-MM-DD`**
  devolve `depositos`, `acordos`, `promessas`, `contatos`, `valoresAcordo`
  agregados por usuário — é a fonte do Módulo 10. **Duas nomenclaturas de
  usuário na MESMA resposta**: `isaac.s` (login) em depósitos/acordos,
  `ISAAC.03876` (código CRM) em promessas/contatos — a união é o texto antes
  do ponto.
- Limiares de SCPC (Módulo 0): aviso de suspensão entre os dias **16 e 18**,
  suspensão de fato no dia **19** — uma frase que cravasse "suspenso hoje"
  nos dias 16-18 seria factualmente falsa (bug já cometido e corrigido, ver
  "Armadilhas").
- `window.open` sempre retorna `null` — não dá pra recuperar referência da
  aba; contornado interceptando `window.open` temporariamente no Módulo 2.

## Armadilhas já encontradas (não repetir)

- **Data à meia-noite vs. meio-dia**: comparar as duas dava `false` e anulava
  em silêncio uma correção de `>=`. Toda data nova passa por
  `normalizarData`, sem exceção.
- **Fixture de teste escrita à mão mente**: um teste de regressão passava
  porque a fixture também tinha o mesmo bug da meia-noite. Fixtures de
  contexto agora saem do módulo real (`tests/helpers/contexto-real.js`).
- **Retrato de títulos consumido de forma destrutiva**: rodava a cada
  carregamento de página e um F5 apagava sinal de pagamento pra sempre. A
  detecção agora persiste até o contato de hoje ser registrado.
- **Corrida entre `location.reload()` e fechamento assíncrono de aba**:
  resolvido com Promise que só resolve após `.close()`, atrasando o fluxo em
  ~1,5s de propósito (trade-off aceito).
- **Frase com prazo cravado num dia em que ele é falso** (dias 16-18 do
  aviso SCPC dizendo "suspenso ao fim do dia", que só é verdade no dia 19) —
  movida pro slot certo, testes travam os dois extremos.
- **Quatro painéis desenhados no mesmo pixel** (Ajuda/Novidades/Config/Alt+D),
  nenhum fechando o outro. Corrigido estruturalmente com um registro central
  de painéis no Módulo 0 (`registrarPainel`/`fecharOutrosPaineis`), não
  reposicionando (reposicionar só moveria o bug pro próximo painel novo).
- **`localStorage`/`fetch`/`location` como identificador livre em teste
  jsdom** resolvem pra globals do Node (última `window` criada), não pra
  janela simulada — corrigido usando `window.fetch`/`window.AbortController`
  explícitos e ordenando os blocos de teste.
- **Paralelismo afrouxando o disjuntor de pop-up**: com 4 abas simultâneas
  na classificação da fila, o disjuntor (limite de 3 tentativas) chegava a 6
  antes de desistir. Corrigido com aquecimento sequencial até o primeiro
  sucesso, mantendo o paralelismo só depois.
- **Self-review encontrou 2 defeitos reais sem teste** ao revisar a
  implementação do cache da fila: o cache reservia clientes já contatados
  hoje, e duas chamadas duplicavam o registro no diário. Lição: adicionar um
  SEGUNDO caminho pro mesmo resultado tende a esquecer regra de negócio que
  o primeiro caminho aplicava de graça.

## Painel de configurações — Alt+O (Módulo 9)

Genérico: lê `DEFINICOES` do Módulo 0 e desenha sozinho. Hoje só existe uma
configuração:

- **`usarWhatsAppWeb`** (padrão `false`) — desligado abre no app Desktop do
  WhatsApp; ligado abre em `web.whatsapp.com`, sempre na mesma aba. Serve
  pra atender pela conta de outra pessoa (ex.: cobrar pelos clientes da
  colega) sem deslogar o próprio app e perder mensagens. Lido no momento do
  clique (Módulo 2), então o toggle vale sem precisar recarregar a página.

Adicionar config nova = uma entrada em `DEFINICOES`; o painel não precisa
mudar.

## Recebido na semana — Alt+D (Módulo 10)

Sáb-sex vigente, Isaac e Bianca, dois números que **não são candidatos ao
mesmo total** (decisão explícita do usuário): depósitos (negociação) e
promessas cumpridas (promessa feita na cobrança), mais o **total combinado**
dos dois. Primeira métrica financeira do projeto vinda de dado real de API,
não de inferência.

## Fila por prioridade — Alt+U / Shift+Alt+U (Módulo 7)

Réguas de negócio, em ordem, primeira faixa que casar decide:

1. Cartório, último dia
2. Cluster "Novo" — vale em QUALQUER situação de título, inclusive já em
   cartório. É a ÚNICA faixa isenta do teto de dias de atraso
   (`DIAS_ATRASO_MAX`, 19 dias) no filtro da lista: pedido explícito do
   usuário, porque um Cluster Novo com título em cartório passa longe desse
   teto e precisa continuar na fila — é a cobrança quem bloqueia o
   faturamento desse cliente. A exceção vale pro cluster inteiro (não só
   quem de fato está em cartório) porque o filtro roda ANTES de visitar o
   cliente, sem saber ainda a situação real do título.
3. Segundo dia de atraso exato
4. Dia da promessa de pagamento (combinou pagar HOJE)
5. Promessa quebrada/parcial sem contato desde o vencimento
6. SCPC, último dia
7. Aviso final antes da suspensão SCPC (dia 19 exato)
8. Última movimentação há mais de 30 dias corridos
9. Atraso inicial, dias 3-4 (dia 1 fica de fora; dia 2 já é a faixa 3)
10. Demais dias

**Comportamento do atalho** (decisão do usuário, v1.16.0/1.17.0): Alt+U virou
"me leva pra fila" — instantâneo, continua a fila de hoje se já existir em
vez de reclassificar tudo de novo. **Shift+Alt+U** é quem reconstrói do
zero. A fila do dia fica em cache (`localStorage`); ao continuar, filtra
clientes já contatados hoje via `Módulo3.obterAtendidosHoje()` (nunca lê a
chave de storage direto). Classificação usa 4 abas em paralelo, com
aquecimento sequencial até o primeiro sucesso pra não afrouxar o disjuntor
de pop-up. Ganho medido: de 3-5 minutos pra ~30-45s na primeira vez do dia,
instantâneo depois.

## Progresso da fila — botão discreto, não atalho (Módulo 11)

Pedido explícito do usuário: um **botão**, "muito bem localizado e
escondido" — não um `Alt+letra`. Gatilho quase invisível (opacidade baixa,
evidente só ao passar o mouse/focar) fixo na **borda direita da tela**,
vertical-centralizado — o único canto ainda livre (esquerda-inferior já tem
"Continuar fila"+painéis; direita-inferior já tem os toasts de troca de
prioridade do Módulo 7). Ao clicar, abre um painel com **uma barra por faixa
de prioridade** da fila de hoje, escrito `cobrados/total` (ex.: `23/56`),
mais um total geral no topo.

**Não recalcula nada**: agrupa `window.filaDebug.obterFila().clientes` (cada
cliente já tem `prioridadeTier`, gravado pelo Módulo 7) por faixa, e cruza
com `window.filaDebug.obterAtendidosHoje()` pra saber quantos daquela faixa
já foram cobrados. Nomes e cores das faixas vêm do Módulo 7
(`NOMES_PRIORIDADE`/`CORES_PRIORIDADE`, o segundo passou a ser exportado
por causa deste módulo) — deliberadamente **não duplicados aqui**, pra nunca
divergir se uma faixa mudar de nome ou cor.

Mensagens de fallback claras, nunca tela em branco: sem fila hoje ("Alt+U
monta por prioridade"), fila existe mas é do Alt+I sem `prioridadeTier`
("essa fila não é por prioridade, use Alt+U"). Entra no registro de painéis
do Módulo 0 como qualquer outro (`registrarPainel('progressoFila', ...)`).
**Não é ao vivo** — como o resto dos painéis, recalcula só ao abrir; como
cada cliente da fila é uma navegação de página cheia, não haveria como
manter aberto durante o trabalho de qualquer forma.

## Diário — instrumentação (Módulo 8)

Grava três tipos de evento por dia (`fila`, `contato`, `baixa`) numa chave de
`localStorage` por dia, tudo em try/catch (nunca pode derrubar o fluxo de
cobrança). Existe pra responder "a régua de prioridade do Alt+U funciona de
verdade?" — e documenta no próprio cabeçalho que **não é prova de causa**,
só instrumentação. Exportação sempre censurada por padrão
(`exportar({censurado: true})`).

## Rotação de frases (Módulo 0 + Módulo 4)

Medido antes de mexer: 192 mensagens da matriz produziam só 18 distintas,
83% terminando na mesma pergunta. Com a carteira quase toda contatada todo
dia, o mesmo cliente lia a mesma frase todo dia. Corrigido com
`escolherVariante(semente, variantes)` — hash FNV-1a sobre `cnpj|data`,
**deliberadamente separado** do `hashEstavel` do Módulo 8 (que decide o
grupo de controle do experimento e não pode ser afetado por isso).

Papéis com variantes: `ctaGenerico`, `ctaUltimoDia`, `ctaCartorio`,
`ctaSuspensaoScpc`, `ctaUltimoDiaScpc`, `retomada` — todas escolhidas junto
com o usuário (ver `tests/rotacao-frases.test.js` pras propriedades
travadas: estável no dia, muda entre dias, nunca um CTA escalado soa como
genérico, nenhum prazo cravado num dia em que é falso).

## Tabela de atalhos atual (Módulo 4)

| Tecla | Ação |
|---|---|
| Alt+I | Iniciar Fila de Atendimento (original, por dias de atraso) |
| **Alt+U** | **Fila por prioridade — continua a de hoje se existir** |
| **Shift+Alt+U** | **Reconstrói a fila por prioridade do zero** |
| Alt+R | Gerar Relatório |
| Alt+C | Entrar na tela de contato |
| Alt+F | Selecionar a 1ª frase padrão (com substituição de `{{variável}}`) |
| Alt+A | Atendimento rápido — relatório + contato + mensagem personalizada, com rotação de frase |
| Alt+S | Registrar e Enviar (fecha a aba do WhatsApp sozinho) |
| Alt+P | Próximo da fila |
| Alt+V | Voltar na fila |
| Alt+B | Busca rápida de cliente |
| Alt+G | Abrir outras razões do grupo com vencido |
| Alt+H | Painel de ajuda |
| Alt+L | Painel de novidades (changelog) |
| **Alt+O** | **Painel de configurações** |
| **Alt+D** | **Recebido na semana** |

## Skills do projeto (`.claude/skills/`)

Sete skills instaladas, com instruções de uso específicas pro SmartTable em
`.claude/skills/COMO_USAR.md` (ler esse arquivo antes de invocar qualquer
uma — tem ressalvas que a skill genérica não sabe: nada de ESM aqui, sem
Playwright configurado, decisões de arquitetura vão no cabeçalho do módulo e
na mensagem de commit, não em documento separado):

- **`alternativa-mais-rapida`** — projeto próprio (não veio do
  jeffallan.github.io/claude-skills), pra planejar caminho mais rápido pra
  algo que já funciona, com a MESMA saída. Regra central: "suíte passando
  sem nenhum teste editado" é a única prova de equivalência aceita.
- **`architecture-designer`**, **`the-fool`**, **`code-reviewer`**,
  **`debugging-wizard`**, **`javascript-pro`**, **`playwright-expert`** —
  do catálogo público, adaptadas nesse `COMO_USAR.md`.

## Itens em aberto / decisões pendentes

- **Módulo 8 (diário) no canal estável, ainda sem decisão final**: publicado
  na 1.18.1, o que significa que a partir da instalação da Bianca o
  navegador dela vai gravar dados de cliente em `localStorage`. Reversível
  com outra publicação, mas nada chega na máquina dela até ela instalar —
  pendência levantada desde a v1.11.2, nunca fechada.
- **Instalar `smart-table-estavel.user.js` na máquina da Bianca** e conferir
  ao vivo se `@grant none` realmente expõe o `window` da página nessa outra
  máquina (o README trata isso como confirmado só na máquina do Isaac).
  Confirmar também que o console mostra `12/12 módulos` carregados (número
  sobe junto com `modulos/` — checar o valor atual antes de assumir 12).
  Se vier menos, é cache do Tampermonkey, não bug.
- **Módulo 11 ainda não foi publicado no canal estável** (só está em `main`,
  v1.19.0) — a Bianca não recebe o botão de progresso até rodar
  `npm run release`.
- **Toggle de liga/desliga do diário** e **marcar configuração não-padrão
  no Alt+O / badge de versão** — recomendados, ainda não construídos.
- **Réplica do grupo econômico deveria contar pra `nuncaContatadoPorMim`?**
  — em aberto.
- **Faixa 8 (movimentação +1 mês) nunca dispara?** — suspeita de que
  `movimentacaoDataIso` não está chegando no Módulo 7 como esperado, não
  investigado a fundo ainda.
- **`Dt. pagamento` apareceu no DOM** (18/09/2026) — poderia substituir a
  inferência por retrato do Módulo 6, mas isso muda a saída, então é
  feature, não otimização (fora do escopo da skill de velocidade).
- **Migrar leitura de títulos pra `window.__TITULOS_ABERTOS__`** em vez de
  DOM célula por célula — débito técnico conhecido, não crítico.
- **"HTML montado no navegador"** como única rota conhecida pra baixar o
  Alt+U de ~30-45s — não perseguido, seria mudança de arquitetura, não de
  otimização.

## Metodologia que funcionou (reforçar sempre)

- **Medir antes de mexer**, com número — vale tanto pra performance (Alt+U:
  3-5min → 30-45s) quanto pra qualidade de frase (192→18 distintas antes de
  escrever qualquer coisa nova).
- **Descartar hipótese de arquitetura contra o CRM real, não contra o
  teclado**: três arquiteturas melhores pro Alt+U morreram em minutos
  testadas ao vivo (API de cliente, iframe, fetch+DOMParser) — teriam levado
  meio dia se só fossem discutidas.
- **Mutação em toda correção**: reintroduzir o bug de propósito e confirmar
  que o teste acusa, senão a prova de que o teste cobre não vale nada.
- **Self-review do próprio código do dia** encontrou defeitos reais que a
  suíte grande não via — vale repetir depois de qualquer feature que
  adicione um SEGUNDO caminho pro mesmo resultado.

## Onde está tudo, de fato

Repositório `IsaacTexCotton/SmartTable` (público, GitHub). `main` é
desenvolvimento; `estavel` é o que o time instala. `npm run verificar` roda
lock + lint + suíte completa (28 arquivos em `tests/`). `README.md` tem o
detalhe operacional de publicação; este documento é o resumo de decisões e
fatos que não estão em nenhum commit isolado.
