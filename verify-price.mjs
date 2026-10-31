// Verificação de preço Amazon ES → Portugal via Firecrawl (modo barato: só markdown, sem IA).
// NÃO está ligado ao bot. Ver PLAN-FIRECRAWL.md. A chave vem de FIRECRAWL_API_KEY (GitHub Secrets).

const parseEuro = (s) => Number(String(s).replace(/[\s .]/g, "").replace(",", "."));

// Lê o preço PT, o preço recomendado (ANTES) e o stock a partir do markdown da página.
export function parseAmazonPT(md = "") {
  const prices = [...md.matchAll(/"displayPrice":"[^"]*","priceAmount":([\d.]+)/g)].map(m => Number(m[1]));
  const distinct = [...new Set(prices)];
  const rec = md.match(/Preço recomendado:?\s*([\d., ]+)\s*€/);
  return {
    price: distinct[0] ?? null,
    candidates: distinct,              // mais de 1 → variantes na página (ambíguo)
    ambiguous: distinct.length > 1,
    listPrice: rec ? parseEuro(rec[1]) : null,
    inStock: /Em stock/.test(md),
  };
}

// Confirma que o preço que o bot vai publicar bate com o da página PT (tolerância 1 cêntimo).
// Nunca lança erro: devolve { ok:false, reason } — o chamador NÃO publica quando ok=false.
export async function verifyAmazonPrice(asin, expectedPrice, { apiKey = process.env.FIRECRAWL_API_KEY, timeoutMs = 60000, fetchFn = fetch } = {}) {
  const checkedAt = new Date().toISOString();
  if (!/^[A-Z0-9]{10}$/.test(asin)) return { ok: false, reason: "asin_invalido", checkedAt };
  try {
    const res = await fetchFn("https://api.firecrawl.dev/v2/scrape", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}) },
      body: JSON.stringify({
        url: `https://www.amazon.es/dp/${asin}`, formats: ["markdown"],
        location: { country: "PT", languages: ["pt-PT"] }, onlyMainContent: true, maxAge: 0,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return { ok: false, reason: `firecrawl_http_${res.status}`, checkedAt };
    const body = await res.json();
    const md = body?.data?.markdown;
    if (!md) return { ok: false, reason: "sem_markdown", checkedAt };
    const p = parseAmazonPT(md);
    const base = { ...p, checkedAt };
    if (p.price == null) return { ok: false, reason: "preco_nao_lido", ...base };
    if (!p.inStock) return { ok: false, reason: "sem_stock", ...base };
    if (p.ambiguous) return { ok: false, reason: "variantes_ambiguas", ...base };
    if (Math.abs(p.price - expectedPrice) > 0.011) return { ok: false, reason: "preco_diferente", ...base };
    return { ok: true, reason: "ok", ...base };
  } catch (e) {
    return { ok: false, reason: `erro:${e.name}`, checkedAt };
  }
}
