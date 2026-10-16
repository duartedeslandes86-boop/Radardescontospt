// Ofertas das lojas Awin, a partir do feed de produtos (Create-a-Feed).
// O link do feed fica no Secret AWIN_FEED_URL (tem a chave da conta — nunca no código).
import { gunzipSync } from "zlib";

// CSV com aspas, vírgulas e quebras de linha dentro dos campos
export function parseCsv(text, delimiter = ",") {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some(f => f !== "")) rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field !== "" || row.length) { row.push(field); if (row.some(f => f !== "")) rows.push(row); }
  if (!rows.length) return [];
  const header = rows[0].map(h => h.trim().toLowerCase());
  return rows.slice(1).map(r => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? "").trim()])));
}

function num(v) {
  if (!v) return 0;
  const s = String(v).replace(/[^\d.,-]/g, "");
  const n = parseFloat(s.includes(",") && !s.includes(".") ? s.replace(",", ".") : s.replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

const NO_STOCK = /^(0|false|no|n|out ?of ?stock|sem stock|agotado)$/i;

/**
 * Devolve candidatos no mesmo formato que a Amazon:
 * [{ id, title, currentPrice, oldPrice, imgUrl, url, store, pricesIncludeEsVat:false }]
 */
export async function fetchAwinCandidates({ feedUrl, exclude, isUsed, isBlocked }) {
  if (!feedUrl) return [];
  const res = await fetch(feedUrl, { signal: AbortSignal.timeout(60000) });
  if (!res.ok) throw new Error(`feed Awin HTTP ${res.status}`);
  let buf = Buffer.from(await res.arrayBuffer());
  if (buf[0] === 0x1f && buf[1] === 0x8b) buf = gunzipSync(buf); // gzip
  const text = buf.toString("utf8").replace(/^﻿/, "");
  const firstLine = text.slice(0, text.indexOf("\n"));
  const delimiter = (firstLine.match(/\|/g) || []).length > (firstLine.match(/,/g) || []).length ? "|" : ",";
  const rows = parseCsv(text, delimiter);

  const stats = { total: rows.length, moeda: 0, excluida: 0, stock: 0, usado: 0, semAntes: 0, ok: 0 };
  const out = [];
  for (const r of rows) {
    // "Wondershare Global Limited" → "Wondershare" (nome curto para botões e texto)
    const store = (r.merchant_name || "loja").replace(/\s+(global\s+)?(limited|ltd\.?|gmbh|s\.?l\.?u?\.?|inc\.?|llc)$/i, "").trim();
    const url = r.aw_deep_link || "";
    const title = r.product_name || "";
    if (!url || !title) continue;
    if (r.currency && r.currency.toUpperCase() !== "EUR") { stats.moeda++; continue; }
    if (exclude && exclude.test(store)) { stats.excluida++; continue; }
    if (r.in_stock && NO_STOCK.test(r.in_stock)) { stats.stock++; continue; }
    if ((r.condition && !/^(new|novo|nuevo|neu)$/i.test(r.condition)) || isUsed(`${title} ${r.product_short_description || ""}`)) { stats.usado++; continue; }
    const cur = num(r.search_price) || num(r.store_price) || num(r.display_price);
    // Preço anterior oficial da loja (rrp = preço recomendado / anterior)
    const old = num(r.rrp_price);
    const imgUrl = r.large_image || r.merchant_image_url || r.aw_image_url || null;
    if (isBlocked(url, imgUrl)) continue;
    if (!(cur > 0 && old > cur)) { stats.semAntes++; continue; }
    stats.ok++;
    out.push({
      id: `awin:${r.aw_product_id || r.merchant_product_id || url}`,
      title, currentPrice: cur, oldPrice: old, imgUrl, url, store, pricesIncludeEsVat: false
    });
  }
  console.log("Feed Awin:", JSON.stringify(stats));
  // Maiores descontos primeiro
  return out.sort((a, b) => (b.oldPrice - b.currentPrice) / b.oldPrice - (a.oldPrice - a.currentPrice) / a.oldPrice);
}
