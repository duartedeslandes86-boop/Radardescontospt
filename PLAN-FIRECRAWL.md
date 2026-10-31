# PLAN — Verificação de preço Amazon com Firecrawl (antes de publicar)

(O `PLAN.md` existente é de outra tarefa — não foi alterado.)

## Objetivo
Antes de publicar um artigo da Amazon ES, confirmar o preço real para Portugal (com IVA, data e hora) e só publicar se bater certo com o preço que o bot vai mostrar. Guardar o preço verificado para ter histórico próprio (ANTES/AGORA a 30 dias).

## Decisões
- Modo barato: `formats: ["markdown"]`, `location: PT / pt-PT`, `maxAge: 0`. O preço é lido por código (`"priceAmount":73.19` e "Preço recomendado"), sem IA. Custo por página **por confirmar**.
- Só os candidatos finais (os que iam ser publicados) são verificados — não o catálogo todo.
- Chave só em `FIRECRAWL_API_KEY` (GitHub Secrets). Nunca em ficheiros.
- Se o Firecrawl falhar ou o preço não for lido: **não publica** esse artigo e regista o erro (nada silenciado).
- Sem mudança ao resto do bot; nova função isolada `verifyAmazonPrice(asin)`.

## Passos e prova
| # | Passo | Prova |
|---|-------|-------|
| 0 | **Comparar** o preço do bot com o da página PT em 3 ASINs (B08H99BPJN, B0H88JVF1P, B01FXI8J6U). O bot faz `preço × 1.23` (ES→PT): verificar se isso bate com o preço real PT (ex.: PS5 comando = 73,19 € já com IVA) | Tabela bot vs. Firecrawl vs. checkout real. **Se divergir, o cálculo do IVA tem de ser corrigido antes de tudo** |
| 1 | Confirmar créditos gastos por página no modo markdown | Valor `creditsUsed` real |
| 2 | Escrever `verifyAmazonPrice(asin)` + teste isolado | Os 3 ASINs devolvem preço, preço recomendado e data/hora; ASIN inválido devolve erro claro |
| 3 | Ligar ao bot só no momento de publicar (flag desligada por defeito) | Corrida de teste sem publicar (dry-run) mostra "verificado / rejeitado" |
| 4 | Guardar histórico (ASIN, preço, data/hora) em ficheiro novo | 2 corridas → 2 registos; ficheiro com backup antes de qualquer alteração |
| 5 | Ativar a flag após o teu "sim" | Primeira publicação real verificada por ti no Telegram |

## Fora do âmbito
- Não mexer em Awin, Mini App, nem no PLAN.md anterior.
- Não ativar publicações sem o teu "sim".

## Riscos
- A Amazon pode bloquear/mudar a página; o parsing pode falhar → o artigo não é publicado.
- Plano grátis: 1.000 créditos/mês; se cada página custar 1, ~1.000 verificações.
- Não confirmado ainda: onde o bot obtém `it.price` (origem do preço de partida).

## Estado
- [ ] Chave `FIRECRAWL_API_KEY` criada pelo Duarte
- [ ] Passo 0 em curso (1 de 3 ASINs lidos na página PT)
