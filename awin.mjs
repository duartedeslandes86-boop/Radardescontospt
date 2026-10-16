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
// Descarrega e lê o feed Create-a-Feed (CSV, com ou sem gzip)
export async function loadAwinFeed(feedUrl) {
  const res = await fetch(feedUrl, { signal: AbortSignal.timeout(60000) });
  if (!res.ok) throw new Error(`feed Awin HTTP ${res.status}`);
  let buf = Buffer.from(await res.arrayBuffer());
  if (buf[0] === 0x1f && buf[1] === 0x8b) buf = gunzipSync(buf); // gzip
  const text = buf.toString("utf8").replace(/^﻿/, "");
  const firstLine = text.slice(0, text.indexOf("\n"));
  const delimiter = (firstLine.match(/\|/g) || []).length > (firstLine.match(/,/g) || []).length ? "|" : ",";
  return parseCsv(text, delimiter);
}

export async function fetchAwinCandidates({ feedUrl, exclude, isUsed, isBlocked }) {
  if (!feedUrl) return [];
  const rows = await loadAwinFeed(feedUrl);

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

// ---------------------------------------------------------------------------
// OTTOCAST (Awin merchant 96499) — destaque conjunto de 4 produtos
// ---------------------------------------------------------------------------
export const AWIN_PUBLISHER = "3124493";
export const OTTOCAST_MID = "96499";

// Deep link de afiliado Awin (formato confirmado no Link Builder)
export function awinDeepLink(destinationUrl, mid = OTTOCAST_MID, affId = AWIN_PUBLISHER) {
  return `https://www.awin1.com/cread.php?awinmid=${mid}&awinaffid=${affId}&ued=${encodeURIComponent(destinationUrl)}`;
}
export const OTTOCAST_STORE_LINK = `https://www.awin1.com/cread.php?awinmid=${OTTOCAST_MID}&awinaffid=${AWIN_PUBLISHER}`;

// Os 4 campeões de vendas (handles da loja oficial ottocast.com) e o nome em PT-PT.
// Nota: o "A2Air Pro" já não existe na loja → substituído pelo U2Air Edge (CarPlay + Android Auto).
export const OTTOCAST_PICKS = [
  { handle: "u2-air-pro", title: "U2AIR Pro — Adaptador CarPlay sem fios" },
  { handle: "u2air-edge-wireless-carplay-android-auto-adapter", title: "U2Air Edge — CarPlay e Android Auto sem fios" },
  { handle: "play2video-all-in-1-wireless-carplay-android-auto-adapter", title: "Play2Video Pro — CarPlay/Android Auto sem fios + YouTube e Netflix" },
  { handle: "ottoaibox-p3-carplay-ai-box", title: "OttoAibox P3 — AI Box Android para o carro" }
];

const OTTO_MIN_PRICE = 20;

/**
 * Devolve até 4 produtos Ottocast: [{ id, title, price, oldPrice, imgUrl, url }] (preços em €, sem ajuste de IVA).
 * 1) Feed Awin (se existir): produtos do merchant 96499, em stock, ≥20€.
 * 2) Sem feed: preços e imagens em direto da loja oficial (mercado de Portugal, em EUR).
 */
export async function fetchOttocastPicks({ feedUrl } = {}) {
  if (feedUrl) {
    try {
      const rows = await loadAwinFeed(feedUrl);
      const otto = rows.filter(r =>
        (r.merchant_id === OTTOCAST_MID || /ottocast/i.test(r.merchant_name || "")) &&
        r.aw_deep_link && r.product_name && !NO_STOCK.test(r.in_stock || "") &&
        (!r.currency || r.currency.toUpperCase() === "EUR") && num(r.search_price) >= OTTO_MIN_PRICE
      ).map(r => ({
        id: `awin:${r.aw_product_id || r.merchant_product_id}`,
        title: r.product_name,
        price: num(r.search_price),
        oldPrice: num(r.rrp_price) > num(r.search_price) ? num(r.rrp_price) : 0,
        imgUrl: r.large_image || r.merchant_image_url || r.aw_image_url || null,
        url: r.aw_deep_link
      })).filter(p => p.imgUrl);
      if (otto.length >= 2) {
        const pct = p => (p.oldPrice ? (p.oldPrice - p.price) / p.oldPrice : 0);
        console.log(`Ottocast: ${otto.length} produtos no feed Awin.`);
        return otto.sort((a, b) => pct(b) - pct(a)).slice(0, 4);
      }
    } catch (e) {
      console.error(`Ottocast: feed Awin falhou (${e.message}) — uso a loja oficial.`);
    }
  }

  const out = [];
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const getJson = async url => {
    for (let attempt = 1; attempt <= 3; attempt++) {
      const res = await fetch(url, {
        // UA simples: a loja devolve 429 a pedidos com UA completo de Chrome vindos de servidores
        headers: { "User-Agent": "Mozilla/5.0", Accept: "*/*" },
        signal: AbortSignal.timeout(20000)
      });
      if (res.ok) return res.json();
      if (res.status !== 429 || attempt === 3) throw new Error(`HTTP ${res.status}`);
      await sleep(attempt * 8000); // a loja pediu calma → espera e tenta de novo
    }
  };
  for (const [i, pick] of OTTOCAST_PICKS.entries()) {
    if (i) await sleep(2500);
    try {
      const d = await getJson(`https://www.ottocast.com/products/${pick.handle}.js?country=PT`);
      const price = Number(d.price) / 100;
      const compare = Number(d.compare_at_price || 0) / 100;
      if (!d.available || !(price >= OTTO_MIN_PRICE)) continue;
      const img = d.featured_image ? (d.featured_image.startsWith("//") ? "https:" + d.featured_image : d.featured_image) : null;
      if (!img) continue;
      out.push({
        id: `otto:${pick.handle}`, title: pick.title, price,
        oldPrice: compare > price ? compare : 0, imgUrl: img,
        url: awinDeepLink(`https://www.ottocast.com/products/${pick.handle}`)
      });
    } catch (e) {
      console.error(`Ottocast: ${pick.handle} falhou (${e.message}).`);
    }
  }
  console.log(`Ottocast: ${out.length} produtos lidos da loja oficial.`);
  return out;
}
