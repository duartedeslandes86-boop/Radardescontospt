# Verificação do catálogo da mini app (branch verificacao-miniapp)

Data: 2026-10-24. Ficheiro verificado: `miniapp-live/products.json` (188 produtos).

## Resultados
- **Campos e formato:** 188/188 com nome, categoria, imagem, link, preço e desconto. Sem duplicados.
- **Cálculo do desconto:** 91/91 consistentes com preço atual e preço anterior.
- **Links de afiliado:** todos apontam para o ID de editor 3124493 e para o ID da loja correto (ALLPOWERS 125820, jimmy 128677, 4 Elementos 124836, Tenways 72399).
- **Preço real na loja (teste ao vivo, `.js` da Shopify):** 91/91 produtos com desconto. 90 iguais ao catálogo. 1 (Tenways CGO600) deu 503 na primeira tentativa e na repetição bateu certo (1099 €).

## Pontos de atenção
- **97 produtos sem preço anterior.** Aparecem no separador "Todos" sem riscado. Não são promoções. Decidir se ficam na lista principal.
- **Os preços são de um momento.** Estão verificados hoje, mas podem mudar. Recomendo atualizar o catálogo com a publicação diária.

## Ainda por fazer (não incluído neste branch)
- Separador "Códigos": DRUNI10 (Druni PT, até 30/10), EXTRA25 (4 Elementos), Halloween (Sinocare, 22–31/10).
- Não incluir: TITAN HAUS (fecha 4/11), lojas rejeitadas (Pandora, Dyson, etc.), programas +18.
