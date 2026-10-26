# PLAN — Histórico de pesquisas em SQLite (bot Amazon)

## Objetivo
Guardar, para cada `/fetch <termo>` bem-sucedido, o termo pesquisado, o `user_id` do Telegram, a data e os produtos encontrados (ASIN, título, preço, link). Novo comando `/historico` mostra só as pesquisas do utilizador que o invoca.

## Decisões
- `BrowserBridge`: um **context por pesquisa**. Em timeout ou erro do Playwright fecha-se só esse context. O browser só é reiniciado se estiver desligado ou se fechar um context falhar.
- `amazon_scraper.py`: devolve `list[dict]` (asin, titulo, preco, url) em vez de texto. Recebe o context, não cria o seu próprio.
- `historico.py` (novo): `aiosqlite`, modo WAL, `foreign_keys=ON`, consultas com parâmetros (sem SQL por concatenação), lock para as escritas.
- `main.py`: formata o texto e grava no SQLite **só depois** de a extração terminar sem erro. Se a gravação falhar, a resposta ao utilizador sai na mesma, com um aviso.
- Pesquisas sem resultados são gravadas com 0 produtos (a pesquisa aconteceu).

## Passos e como provar que cada um funciona

| # | Passo | Prova |
|---|-------|-------|
| 1 | Criar `historico.py` com schema, guardar e consultar | Teste `test_historico.py`: guardar 2 pesquisas de utilizadores diferentes; `historico(user_a)` devolve só as de A; produtos ligados à pesquisa certa; ficheiro `.db-wal` existe |
| 2 | Refatorar `browser_bridge.py` para context por pesquisa | Teste `test_bridge.py`: job que excede o timeout → context fechado, browser **não** fechado, pesquisa seguinte corre sem problema |
| 3 | Refatorar `amazon_scraper.py` para devolver lista de dicionários | Compilação (`py_compile`) + revisão de campos. **Não verificado contra a Amazon real** (sem acesso à rede a partir daqui) — ver passo 6 |
| 4 | Atualizar `main.py`: formatação, gravação após sucesso, `/historico`, init/shutdown da base | `py_compile`; teste manual no Telegram com os passos do utilizador (ver passo 6) |
| 5 | Verificação global | `py_compile` em todos os ficheiros; testes 1 e 2 a correr; diff revisto contra o código atual |
| 6 | Teste real no Oracle VM | `/fetch <termo>` → resposta com produtos; `/historico` → mostra a pesquisa; segundo utilizador → não vê a pesquisa do primeiro. **Por fazer pelo utilizador ou com acesso ao servidor** |

## Fora do âmbito (não mexer)
- `deploy.yml`, Dockerfile, `cookies_pt.json`.
- Limite de 5 produtos, timeouts (60 s) e concorrência (2) mantêm-se.
- Formatação Markdown igual à atual (sem `parse_mode`).

## Riscos conhecidos
- Seletores da Amazon podem mudar; o scraper continua a depender deles.
- `termo.replace(' ', '+')` não faz URL-encoding completo (ex.: `&`). Mantido por ser mudança mínima; corrigir numa tarefa separada.
- Base SQLite num único ficheiro: o volume do container tem de persistir (`HISTORICO_DB`, por defeito `historico.db`).

## Estado
- [x] Plano aprovado pelo utilizador
- [x] Passo 1 — testado (`historico OK`)
- [x] Passo 2 — testado com browser falso (`bridge OK`); **não testado com Chromium real**
- [~] Passo 3 — compila; não verificado contra a Amazon
- [~] Passo 4 — compila; não testado no Telegram
- [~] Passo 5 — compilação e testes 1 e 2 a passar
- [ ] Passo 6 — por fazer no Oracle VM

## Para retomar noutra sessão
Ler este ficheiro, começar pelo primeiro passo por marcar. Se um passo falhar duas vezes, parar, registar o erro aqui e replanear.
