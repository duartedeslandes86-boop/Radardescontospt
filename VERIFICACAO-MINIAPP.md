# Verificação da mini app (revisão de 24/10/2026)

## Catálogo `miniapp-live/products.json`
- **203 produtos** (188 do catálogo anterior + 15 Sinocare em stock).
- Campos obrigatórios presentes; sem duplicados; links Awin com publisher 3124493.
- **Preços confirmados na loja:** 91/91 produtos com desconto real bateram com a loja (teste ao vivo). Os 15 Sinocare foram confirmados em EUR a 24/10.
- **Avisos do verificador (40, já existiam no `main`):**
  - 20 produtos (aspiradores JIMMY) têm `desconto: 0` e não têm `precoAntes`. O verificador exige `precoAntes` em todos. A app não mostra estes campos, por isso não afeta o que o utilizador vê.
  - Os restantes avisos são do mesmo tipo: produtos sem preço riscado, marcados como "preço inválido".
  - Nenhum dos 15 Sinocare gera aviso.
- **Por tratar:** a app não mostra o preço riscado nem a percentagem. Os descontos ficam só nos dados.

## Separador "Códigos" (`codigos.json` + `index.html`)
- 4 entradas, todas confirmadas em emails da Awin de 23/10/2026:
  - Druni PT, **DRUNI10** (até 30/10 23:59).
  - 4 Elementos, **EXTRA25** (sem data de fim indicada).
  - Sinocare, Halloween 20% (22–31/10, sem código).
  - Sinocare, Kit Safe Accu 50% (até 30/11, sem código).
- Os destinos dos links respondem 200 (um deles deu 503 em duas tentativas e 200 em seguida).
- Testado num navegador em 390 px: "Todos" mantém 188 produtos, o separador "Códigos" mostra 4 cartões, sem erros de consola.

## Links e imagens
- 15 Sinocare: links Awin redirecionam para a página do produto; imagens 200.
- 4 links de códigos: redirecionam para a loja correta.

## Por decidir
- Mostrar o preço riscado e a percentagem de desconto na app.
- Tratar os 40 avisos do verificador (dados ou regra).
- Druni: confirmar se DRUNI10 é preciso ou se o desconto é automático.
