from playwright.async_api import BrowserContext
from playwright_stealth import stealth_async

MAX_RESULTADOS = 5
SELETOR_RESULTADO = 'div[data-component-type="s-search-result"]'


async def procurar_amazon(context: BrowserContext, termo_pesquisa: str) -> list[dict]:
    page = await context.new_page()
    await stealth_async(page)

    url = f"https://www.amazon.es/s?k={termo_pesquisa.replace(' ', '+')}"
    await page.goto(url)
    await page.wait_for_selector(SELETOR_RESULTADO, timeout=10000)

    produtos = await page.query_selector_all(SELETOR_RESULTADO)
    resultados: list[dict] = []

    for produto in produtos[:MAX_RESULTADOS]:
        asin = await produto.get_attribute("data-asin")
        titulo_el = await produto.query_selector("h2 a span")
        preco_el = await produto.query_selector(".a-price-whole")
        decimal_el = await produto.query_selector(".a-price-fraction")

        if titulo_el and preco_el:
            titulo = await titulo_el.inner_text()
            preco_int = await preco_el.inner_text()
            preco_dec = await decimal_el.inner_text() if decimal_el else "00"
            resultados.append({
                "asin": asin,
                "titulo": titulo,
                "preco": f"{preco_int}{preco_dec}€",
                "url": f"https://www.amazon.es/dp/{asin}",
            })

    return resultados
