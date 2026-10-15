// Radar Descontos & Tech PT — motor automático (GitHub Actions, a cada 20 min)
// Publica no Telegram ofertas da Amazon ES: só produtos novos, com preço ANTES e AGORA
// ajustados ao IVA português. Às 21h (Lisboa) envia o Top 5 do dia em álbum.
//
// Fonte das ofertas: listas públicas de Mais Vendidos da Amazon.es (em português).
// O bot guarda o histórico de preços (price_history.json). O preço ANTES é o mais
// baixo que o bot viu nos 30 dias anteriores; publica quando hoje está ≥15% abaixo.
// Fontes de terceiros (Chollometro e afins) estão bloqueadas.
import fs from "fs";
import { buildCollage } from "./collage.mjs";

// ---------------------------------------------------------------------------
// Configuração — o token do bot vem SÓ do Secret do GitHub (nunca escrito no código)
// ---------------------------------------------------------------------------
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const CHAT_ID = process.env.TELEGRAM_CHAT_ID || "-1003846917730";
const TAG = process.env.AMAZON_PARTNER_TAG || "radardescontospt-21";
// Awin: preparado para quando a conta for aprovada (ainda não é usado)
const AWIN_PUBLISHER_ID = process.env.AWIN_PUBLISHER_ID || "3124493";
const DRY_RUN = process.env.DRY_RUN === "true"; // true = não envia nada, só mostra no log
const FORCE_TOP_DAY = process.env.FORCE_TOP_DAY === "true";

const MAX_POSTS_PER_RUN = Number(process.env.MAX_POSTS_PER_RUN || 2);
const MIN_DISCOUNT_PCT = 15;
const VAT_ES_TO_PT = 1.23 / 1.21;
const TOP_HOUR_LISBON = 21;
const DB_FILE = "sent_deals.json";
const DAILY_FILE = "daily_deals.json";
const HISTORY_FILE = "price_history.json";
const HISTORY_DAYS = 30;          // janela do preço de referência
const MIN_PRIOR_DAYS = 2;         // dias anteriores com preço registado antes de publicar
const MAX_DISCOUNT_PCT = 80;      // acima disto é quase sempre erro de leitura
const HISTORY_MAX_ASINS = 4000;
const CATEGORIES_PER_RUN = Number(process.env.CATEGORIES_PER_RUN || 3);
const CATEGORIES = [
  "electronics", "computers", "kitchen", "home", "videogames", "toys", "beauty",
  "sports", "diy", "hpc", "pet-supplies", "automotive", "baby", "lighting"
];
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

// Fontes bloqueadas: nenhum link, imagem ou oferta destes sites é aceite
const BLOCKED_SOURCES = /(^|\.|\/\/)(chollometro\.com|pepper\.com)/i;
function isBlockedSource(...urls) {
  return urls.some(u => BLOCKED_SOURCES.test(u || ""));
}

if (!BOT_TOKEN && !DRY_RUN) {
  console.error("ERRO: falta o Secret TELEGRAM_BOT_TOKEN no GitHub (Settings → Secrets and variables → Actions).");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Datas em hora de Lisboa (trata sozinho da mudança de hora verão/inverno)
// ---------------------------------------------------------------------------
function lisbonNow() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Lisbon", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23"
    }).formatToParts(new Date()).map(p => [p.type, p.value])
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) };
}
const { date: todayStr, hour: lisbonHour } = lisbonNow();

// ---------------------------------------------------------------------------
// Estado (ficheiros JSON guardados no repositório)
// ---------------------------------------------------------------------------
function readJson(file, fallback) {
  try {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    console.error(`Aviso: ${file} inválido, a recomeçar (${e.message})`);
  }
  return fallback;
}

// Registos guardam a data (ASIN → "AAAA-MM-DD") e são apagados ao fim de RETENTION_DAYS
const RETENTION_DAYS = 35;
function toDatedMap(v) {
  if (Array.isArray(v)) return Object.fromEntries(v.filter(a => typeof a === "string").map(a => [a, todayStr])); // formato antigo
  return v && typeof v === "object" ? v : {};
}
function pruneDated(map) {
  for (const [k, d] of Object.entries(map)) if (daysBetween(d, todayStr) > RETENTION_DAYS) delete map[k];
  return map;
}

let sent = toDatedMap(readJson(DB_FILE, {}));
const wasSent = asin => Object.prototype.hasOwnProperty.call(sent, asin);

let dailyData = readJson(DAILY_FILE, null);
if (!dailyData || !Array.isArray(dailyData.deals)) dailyData = { date: "", lastSummaryDate: "", deals: [] };
if (dailyData.date !== todayStr) {
  dailyData.date = todayStr;
  dailyData.deals = [];
}

// ---------------------------------------------------------------------------
// Telegram
// ---------------------------------------------------------------------------
let telegramOk = 0, telegramFail = 0; // para o workflow ficar vermelho se o Telegram recusar tudo

async function telegram(method, payload) {
  if (DRY_RUN) {
    console.log(`\n[DRY_RUN] ${method}:\n${JSON.stringify(payload, null, 2)}\n`);
    return { ok: true };
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: CHAT_ID, ...payload }),
      signal: AbortSignal.timeout(30000)
    });
    const data = await res.json().catch(() => ({ ok: false, description: `HTTP ${res.status} sem JSON` }));
    if (data.ok) telegramOk++;
    else { telegramFail++; console.error(`Telegram ${method} falhou: ${data.description}`); }
    return data;
  } catch (e) {
    telegramFail++;
    console.error(`Telegram ${method} erro de rede: ${e.message}`);
    return { ok: false, description: e.message };
  }
}

// Envio de uma imagem gerada pelo bot (ficheiro, não URL)
async function telegramPhotoUpload(buffer, fields) {
  if (DRY_RUN) {
    if (process.env.PREVIEW_IMAGE) fs.writeFileSync(process.env.PREVIEW_IMAGE, buffer);
    console.log(`\n[DRY_RUN] sendPhoto (imagem ${Math.round(buffer.length / 1024)} KB):\n${JSON.stringify(fields, null, 2)}\n`);
    return { ok: true };
  }
  try {
    const form = new FormData();
    form.append("chat_id", CHAT_ID);
    for (const [k, v] of Object.entries(fields)) form.append(k, typeof v === "string" ? v : JSON.stringify(v));
    form.append("photo", new Blob([buffer], { type: "image/jpeg" }), "radar.jpg");
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, {
      method: "POST", body: form, signal: AbortSignal.timeout(60000)
    });
    const data = await res.json().catch(() => ({ ok: false, description: `HTTP ${res.status} sem JSON` }));
    if (data.ok) telegramOk++;
    else { telegramFail++; console.error(`Telegram sendPhoto (ficheiro) falhou: ${data.description}`); }
    return data;
  } catch (e) {
    telegramFail++;
    console.error(`Telegram sendPhoto (ficheiro) erro: ${e.message}`);
    return { ok: false, description: e.message };
  }
}

// ---------------------------------------------------------------------------
// Utilitários de texto e preços
// ---------------------------------------------------------------------------
function decodeEntities(s = "") {
  return s
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ");
}

function escapeHtml(s = "") {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Aceita "61,15", "1.299,99", "1.299", "299.95", 299.95
function parseEuro(v) {
  if (v === null || v === undefined || v === "") return 0;
  if (typeof v === "number") return v;
  let s = String(v).replace(/[€\s]/g, "");
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

// 1299.9 → "1.299,90€"
function formatEur(n) {
  const [int, dec] = n.toFixed(2).split(".");
  return int.replace(/\B(?=(\d{3})+(?!\d))/g, ".") + "," + dec + "€";
}

// Bloquear recondicionados, usados, caixa aberta, Amazon Warehouse, etc.
function isUsedOrRefurbished(text = "") {
  const t = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return /\b(reaco|reacondicionad[oa]s?|recondicionad[oa]s?|segunda mano|caja abierta|caixa aberta|usad[oa]s?|warehouse|como nuevo|como novo|refurbished|renewed|seminuev[oa]s?)\b/.test(t);
}

// Preço ANTES e AGORA, com ajuste IVA ES 21% → PT 23% (só se o preço vier com IVA espanhol)
function computePrices(currentRaw, oldRaw, pricesIncludeEsVat = true) {
  const factor = pricesIncludeEsVat ? VAT_ES_TO_PT : 1;
  const cur = parseEuro(currentRaw) * factor;
  const old = parseEuro(oldRaw) * factor;
  if (cur <= 0.5 || old <= cur) return null;
  const discountPct = Math.round(((old - cur) / old) * 100);
  if (discountPct < MIN_DISCOUNT_PCT || discountPct > MAX_DISCOUNT_PCT) return null;
  return { currentPrice: formatEur(cur), oldPrice: formatEur(old), discountPct };
}

// Título em PT-PT: tirar preços e limpar palavras espanholas que sobrem
const TRANSLATIONS = [
  // (?<![\p{L}]) / (?![\p{L}]) = só palavras inteiras, mesmo com acentos
  [/(?<!\p{L})Auriculares inal[aá]mbricos(?!\p{L})/giu, "Auscultadores sem fios"],
  [/(?<!\p{L})Auriculares(?!\p{L})/giu, "Auscultadores"],
  [/(?<!\p{L})Barra de Sonido(?!\p{L})/giu, "Barra de Som"],
  [/(?<!\p{L})Mascarilla(?!\p{L})/giu, "Máscara Capilar"],
  [/(?<!\p{L})Cabello Te[ñn]ido(?!\p{L})/giu, "Cabelo Pintado"],
  [/(?<!\p{L})Cabello(?!\p{L})/giu, "Cabelo"],
  [/(?<!\p{L})Champ[uú](?!\p{L})/giu, "Champô"],
  [/(?<!\p{L})Crema de Noche(?!\p{L})/giu, "Creme de Noite"],
  [/(?<!\p{L})Crema de D[ií]a(?!\p{L})/giu, "Creme de Dia"],
  [/(?<!\p{L})Juego de(?!\p{L})/giu, "Conjunto de"],
  [/(?<!\p{L})en trozos(?!\p{L})/giu, "em pedaços"],
  [/(?<!\p{L})colores diferentes(?!\p{L})/giu, "cores diferentes"],
  [/(?<!\p{L})Env[ií]o gratis(?!\p{L})/giu, "Envio grátis"],
  [/(?<!\p{L})Rat[oó]n(?!\p{L})/giu, "Rato"],
  [/(?<!\p{L})Pulgadas(?!\p{L})/giu, "Polegadas"],
  [/(?<!\p{L})inal[aá]mbric[oa]s?(?!\p{L})/giu, "sem fios"],
  [/(?<!\p{L})Gel de Ba[ñn]o(?!\p{L})/giu, "Gel de Banho"],
  [/(?<!\p{L})Mu[ñn]ec([oa]s?)(?!\p{L})/giu, "Bonec$1"],
  [/(?<!\p{L})Zapatillas(?!\p{L})/giu, "Sapatilhas"],
  [/(?<!\p{L})Calcetines(?!\p{L})/giu, "Meias"],
  [/(?<!\p{L})Cargador(?!\p{L})/giu, "Carregador"],
  [/(?<!\p{L})Altavoz(?!\p{L})/giu, "Coluna"],
  [/(?<!\p{L})Reloj(?!\p{L})/giu, "Relógio"],
  [/(?<!\p{L})Gafas(?!\p{L})/giu, "Óculos"],
  [/(?<!\p{L})Funda(?!\p{L})/giu, "Capa"],
  [/(?<!\p{L})Juguete(?!\p{L})/giu, "Brinquedo"],
  [/(?<!\p{L})C[aá]mara(?!\p{L})/giu, "Câmara"],
  [/(?<!\p{L})Vigilancia(?!\p{L})/giu, "Vigilância"],
  [/(?<!\p{L})Pilas(?!\p{L})/giu, "Pilhas"],
  [/\bHombre\b/gi, "Homem"],
  [/\bMujer\b/gi, "Mulher"],
  [/\bNi[ñn]os\b/gi, "Crianças"],
  [/\bcon\b/gi, "com"],
  [/\by\b/g, "e"],
  [/\bnegro\b/gi, "preto"],
  [/\bnegra\b/gi, "preta"],
  [/\bblanco\b/gi, "branco"],
  [/\bblanca\b/gi, "branca"]
];

function cleanAndTranslateTitle(title = "") {
  let t = decodeEntities(title)
    .replace(/\s*[-–|]?\s*(?:por|a)?\s*[0-9]{1,3}(?:[.,][0-9]{1,3})*\s*€(?:\/\w+)?/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  for (const [re, pt] of TRANSLATIONS) t = t.replace(re, pt);
  return t.replace(/[\s,–-]+$/, "").trim();
}

// ---------------------------------------------------------------------------
// FONTE DAS OFERTAS — listas de Mais Vendidos da Amazon.es + histórico de preços próprio
// Devolve: [{ asin, title, currentPrice, oldPrice, imgUrl, pricesIncludeEsVat }]
// ---------------------------------------------------------------------------
let history = readJson(HISTORY_FILE, {});
if (!history || typeof history !== "object" || Array.isArray(history)) history = {};
if (!history._meta) history._meta = { nextCategory: 0 };
history._meta.featured = pruneDated(toDatedMap(history._meta.featured)); // produtos já mostrados nas grelhas

const sleep = ms => new Promise(r => setTimeout(r, ms));

function daysBetween(a, b) {
  return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000);
}

// Imagem em alta resolução (a lista traz 300x200)
function hiResAmazonImage(url) {
  if (!url) return null;
  return url.replace(/\._[^/]*_\.(jpg|jpeg|png|webp)$/i, "._AC_SL1500_.$1");
}

// Lê os cartões de produto de uma página de Mais Vendidos
function parseBestsellers(html) {
  const items = [];
  for (const card of html.split('id="gridItemRoot"').slice(1)) {
    const asin = (card.match(/data-asin="([A-Z0-9]{10})"/) || [])[1];
    if (!asin) continue;
    // "N ofertas desde X €" é o preço mais baixo entre vendedores (pode ser usado) → ignorar
    if (/ofertas?\s+(desde|a partir)|offers?\s+from/i.test(card)) continue;
    const price = (card.match(/class="[^"]*p13n-sc-price[^"]*">([^<]+)</) || [])[1];
    const title =
      (card.match(/line-clamp[^"]*">([^<]{5,})</) || [])[1] ||
      (card.match(/<img[^>]+alt="([^"]{5,})"/) || [])[1];
    const img = (card.match(/<img[^>]+src="(https:\/\/[^"]+)"/) || [])[1];
    const rating = parseEuro((card.match(/aria-label="([0-9][.,][0-9]) de 5/) || [])[1]);
    if (!price || !title) continue;
    items.push({
      asin,
      title: decodeEntities(title).split(" | ")[0].trim(),
      price: parseEuro(price),
      rating,
      imgUrl: hiResAmazonImage(img)
    });
  }
  return items;
}

async function fetchCategory(cat) {
  const url = `https://www.amazon.es/-/pt/gp/bestsellers/${cat}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": UA,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "pt-PT,pt;q=0.9,es-ES;q=0.8"
    },
    signal: AbortSignal.timeout(20000)
  });
  const html = await res.text();
  if (res.status === 503 || /captcha|api-services-support/i.test(html.slice(0, 20000)) && html.length < 20000) {
    return { blocked: true, items: [] };
  }
  if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
  return { blocked: false, items: parseBestsellers(html) };
}

// Regista o preço de hoje (fica o mais baixo do dia)
function recordPrice(item) {
  const h = history[item.asin] || (history[item.asin] = { p: {} });
  h.t = item.title;
  h.i = item.imgUrl || h.i || null;
  h.seen = todayStr;
  const prev = h.p[todayStr];
  h.p[todayStr] = prev ? Math.min(prev, item.price) : item.price;
}

// Preço de referência: o mais baixo dos 30 dias anteriores (não conta hoje)
function referencePrice(asin) {
  const h = history[asin];
  if (!h) return null;
  const prior = Object.entries(h.p).filter(([d]) => d < todayStr && daysBetween(d, todayStr) <= HISTORY_DAYS);
  if (prior.length < MIN_PRIOR_DAYS) return null;
  return Math.min(...prior.map(([, v]) => v));
}

function pruneHistory() {
  for (const [asin, h] of Object.entries(history)) {
    if (asin === "_meta") continue;
    for (const d of Object.keys(h.p)) if (daysBetween(d, todayStr) > RETENTION_DAYS) delete h.p[d];
    if (!Object.keys(h.p).length) delete history[asin];
  }
  const asins = Object.keys(history).filter(a => a !== "_meta");
  if (asins.length > HISTORY_MAX_ASINS) {
    asins.sort((a, b) => (history[a].seen || "").localeCompare(history[b].seen || ""))
      .slice(0, asins.length - HISTORY_MAX_ASINS)
      .forEach(a => delete history[a]);
  }
}

let lastSeenItems = []; // produtos lidos neste ciclo, pela ordem do ranking

async function fetchCandidateDeals() {
  const start = history._meta.nextCategory % CATEGORIES.length;
  const cats = Array.from({ length: Math.min(CATEGORIES_PER_RUN, CATEGORIES.length) }, (_, i) => CATEGORIES[(start + i) % CATEGORIES.length]);
  history._meta.nextCategory = (start + cats.length) % CATEGORIES.length;

  const seenNow = new Map();
  for (const [i, cat] of cats.entries()) {
    if (i > 0) await sleep(4000 + Math.random() * 3000); // pausa entre pedidos
    try {
      const { blocked, items } = await fetchCategory(cat);
      if (blocked) {
        console.warn(`Amazon pediu captcha em "${cat}" — paro por este ciclo.`);
        break;
      }
      console.log(`Categoria ${cat}: ${items.length} produtos com preço.`);
      for (const it of items) if (!seenNow.has(it.asin)) seenNow.set(it.asin, { ...it, cat });
    } catch (e) {
      console.error(`Categoria ${cat} falhou: ${e.message}`);
    }
  }

  lastSeenItems = [...seenNow.values()];
  const candidates = [];
  for (const it of seenNow.values()) {
    const ref = referencePrice(it.asin); // calcula ANTES de registar o preço de hoje
    recordPrice(it);
    if (ref && it.price < ref) {
      candidates.push({ asin: it.asin, title: it.title, currentPrice: it.price, oldPrice: ref, imgUrl: it.imgUrl, pricesIncludeEsVat: true });
    }
  }
  pruneHistory();

  // Maiores descontos primeiro
  candidates.sort((a, b) => (b.oldPrice - b.currentPrice) / b.oldPrice - (a.oldPrice - a.currentPrice) / a.oldPrice);
  console.log(`${seenNow.size} produtos lidos, ${candidates.length} com preço abaixo do histórico.`);
  return candidates;
}

// ---------------------------------------------------------------------------
// Top 5 do dia (álbum de fotos) — a partir das 21h de Lisboa, uma vez por dia
// ---------------------------------------------------------------------------
const MEDALS = ["🥇", "🥈", "🥉", "4️⃣", "5️⃣"];

function buildTopCaption(topDeals, titleLen) {
  let c = `🏆 <b>TOP ${topDeals.length} OFERTAS DO DIA — RADAR PT</b> 🔥\n<i>As melhores descidas de preço de hoje na Amazon ES:</i>\n\n`;
  topDeals.forEach((d, i) => {
    const t = d.title.length > titleLen ? d.title.slice(0, titleLen - 1) + "…" : d.title;
    c += `${MEDALS[i]} <b>${escapeHtml(t)}</b>\n<s>${d.oldPrice}</s> ➡️ <b>${d.currentPrice}</b> (-${d.discountPct}%)\n👉 <a href="${d.affUrl}">Ver oferta</a>\n\n`;
  });
  c += `⚡ <i>Envio para Portugal (IVA PT incluído) | Stock limitado</i>`;
  return c;
}

// Comprimento visível (o limite de 1024 do Telegram não conta as tags HTML)
function visibleLength(html) {
  return decodeEntities(html.replace(/<[^>]+>/g, "")).length;
}

async function publishDailyTopIfDue() {
  if (!FORCE_TOP_DAY && (lisbonHour < TOP_HOUR_LISBON || dailyData.lastSummaryDate === todayStr)) return;

  const valid = dailyData.deals.filter(d =>
    d.oldPrice && d.discountPct >= MIN_DISCOUNT_PCT && !isBlockedSource(d.affUrl, d.imgUrl)
  );
  if (valid.length < 2) {
    console.log(`Top do dia: só ${valid.length} oferta(s) hoje, não publicado.`);
    if (!FORCE_TOP_DAY && lisbonHour >= 23) dailyData.lastSummaryDate = todayStr;
    return;
  }

  const topDeals = [...valid].sort((a, b) => b.discountPct - a.discountPct).slice(0, 5);
  let caption = buildTopCaption(topDeals, 60);
  for (const len of [45, 32, 22]) if (visibleLength(caption) > 1000) caption = buildTopCaption(topDeals, len);

  let ok = false;
  const withImg = topDeals.filter(d => d.imgUrl);
  if (withImg.length >= 2) {
    const media = withImg.map((d, i) => ({
      type: "photo",
      media: d.imgUrl,
      ...(i === 0 ? { caption, parse_mode: "HTML" } : {})
    }));
    try {
      ok = (await telegram("sendMediaGroup", { media })).ok;
    } catch (e) {
      console.error("sendMediaGroup erro:", e.message);
    }
  }

  if (!ok) {
    const buttons = topDeals.map((d, i) => [{
      text: `${MEDALS[i]} ${d.currentPrice} (-${d.discountPct}%) · ${d.title.slice(0, 26)}`,
      url: d.affUrl
    }]);
    ok = (await telegram("sendMessage", {
      text: caption,
      parse_mode: "HTML",
      disable_web_page_preview: true,
      reply_markup: { inline_keyboard: buttons }
    })).ok;
  }

  if (ok) {
    dailyData.lastSummaryDate = todayStr;
    console.log(`Top ${topDeals.length} do dia publicado.`);
  }
}

// ---------------------------------------------------------------------------
// Publicação de uma oferta
// ---------------------------------------------------------------------------
async function publishDeal(asin, title, prices, imgUrl) {
  const affUrl = `https://www.amazon.es/dp/${asin}?tag=${TAG}`;
  const shortTitle = title.length > 300 ? title.slice(0, 299) + "…" : title;
  const caption =
    `🔥 <b>ALERTA DE PREÇO DETETADO!</b>\n\n` +
    `📦 <b>${escapeHtml(shortTitle)}</b>\n\n` +
    `❌ ANTES: <s>${prices.oldPrice}</s>\n` +
    `✅ <b>AGORA: ${prices.currentPrice}</b> <i>(-${prices.discountPct}% DESCONTO!)</i>\n\n` +
    `👉 <a href="${affUrl}">Ver oferta na Amazon ES</a>\n\n` +
    `⚡ <i>Envio para Portugal (IVA PT incluído) | Stock limitado</i>`;
  const reply_markup = { inline_keyboard: [[{ text: "🛒 Comprar na Amazon", url: affUrl }]] };

  let ok = false;
  if (imgUrl) {
    try {
      ok = (await telegram("sendPhoto", { photo: imgUrl, caption, parse_mode: "HTML", reply_markup })).ok;
    } catch (e) {
      console.error("sendPhoto erro:", e.message);
    }
  }
  if (!ok) ok = (await telegram("sendMessage", { text: caption, parse_mode: "HTML", reply_markup })).ok;
  return ok ? affUrl : null;
}

// ---------------------------------------------------------------------------
// Grelha "Mais vendidos" — quando não há descontos reais (ex.: primeiros dias sem histórico).
// Uma imagem com até 6 produtos numerados + links no texto + botões. Só preço atual,
// nunca um ANTES inventado. Máx. 1 a cada 3h, entre as 9h e as 23h.
// ---------------------------------------------------------------------------
const FEATURED_EVERY_MIN = 180;
const FEATURED_HOURS = [9, 23];
const FEATURED_MIN_PRICE = 10;
const FEATURED_COUNT = 6;
const NUMBERS = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣"];

// Escolhe produtos alternando categorias (pela ordem do ranking)
function pickFeatured() {
  const featured = history._meta.featured;
  const ok = lastSeenItems.filter(it =>
    !(it.asin in featured) && !wasSent(it.asin) &&
    it.price >= FEATURED_MIN_PRICE && it.imgUrl &&
    (!it.rating || it.rating >= 4.2) &&
    !isUsedOrRefurbished(it.title) && !isBlockedSource(it.imgUrl)
  );
  const byCat = new Map();
  for (const it of ok) (byCat.get(it.cat) || byCat.set(it.cat, []).get(it.cat)).push(it);
  const picks = [];
  while (picks.length < FEATURED_COUNT && [...byCat.values()].some(l => l.length)) {
    for (const list of byCat.values()) if (list.length && picks.length < FEATURED_COUNT) picks.push(list.shift());
  }
  return picks;
}

async function publishFeaturedIfDue() {
  if (lisbonHour < FEATURED_HOURS[0] || lisbonHour >= FEATURED_HOURS[1]) return;
  const last = history._meta.lastFeaturedAt ? Date.parse(history._meta.lastFeaturedAt) : 0;
  if (Date.now() - last < FEATURED_EVERY_MIN * 60000) return;

  const picks = pickFeatured();
  if (picks.length < 3) {
    console.log(`Grelha: só ${picks.length} produto(s) elegíveis, fica para o próximo ciclo.`);
    return;
  }

  const rows = picks.map(it => {
    const title = cleanAndTranslateTitle(it.title);
    return {
      ...it,
      title,
      priceLabel: formatEur(it.price * VAT_ES_TO_PT),
      affUrl: `https://www.amazon.es/dp/${it.asin}?tag=${TAG}`
    };
  });

  let caption = `🔥 <b>MAIS VENDIDOS HOJE NA AMAZON ES</b>\n<i>Preços atuais com IVA PT incluído</i>\n\n`;
  rows.forEach((r, i) => {
    const t = r.title.length > 70 ? r.title.slice(0, 69) + "…" : r.title;
    caption += `${NUMBERS[i]} <a href="${r.affUrl}">${escapeHtml(t)}</a> — <b>${r.priceLabel}</b>\n`;
  });
  caption += `\n⚡ <i>Envio para Portugal | Stock limitado</i>`;

  const buttons = [];
  for (let i = 0; i < rows.length; i += 2) {
    buttons.push(rows.slice(i, i + 2).map((r, j) => ({ text: `${NUMBERS[i + j]} ${r.priceLabel}`, url: r.affUrl })));
  }
  const reply_markup = { inline_keyboard: buttons };

  let ok = false;
  try {
    const image = await buildCollage(rows.map(r => ({ imgUrl: r.imgUrl, priceLabel: r.priceLabel })));
    ok = (await telegramPhotoUpload(image, { caption, parse_mode: "HTML", reply_markup })).ok;
  } catch (e) {
    console.error(`Grelha: não deu para montar a imagem (${e.message}) — envio em álbum.`);
  }
  if (!ok) {
    // Plano B: álbum com as fotos (sem botões, links no texto)
    const media = rows.map((r, i) => ({ type: "photo", media: r.imgUrl, ...(i === 0 ? { caption, parse_mode: "HTML" } : {}) }));
    ok = (await telegram("sendMediaGroup", { media })).ok;
  }
  if (ok) {
    for (const r of rows) history._meta.featured[r.asin] = todayStr;
    history._meta.lastFeaturedAt = new Date().toISOString();
    console.log(`Grelha publicada: ${rows.map(r => `${r.asin} ${r.priceLabel}`).join(" | ")}`);
  }
}

// ---------------------------------------------------------------------------
// Ciclo principal
// ---------------------------------------------------------------------------
async function run() {
  console.log(`A iniciar varrimento do Radar (${todayStr}, ${lisbonHour}h Lisboa)${DRY_RUN ? " [DRY_RUN]" : ""}...`);

  const candidates = await fetchCandidateDeals();
  const stats = { bloqueada: 0, usado: 0, semStock: 0, repetido: 0, semDesconto: 0 };
  let published = 0;

  for (const c of candidates) {
    if (published >= MAX_POSTS_PER_RUN) break;
    const asin = String(c.asin || "").toUpperCase();
    if (!/^[A-Z0-9]{10}$/.test(asin)) continue;
    if (isBlockedSource(c.imgUrl, c.url)) { stats.bloqueada++; continue; }
    if (wasSent(asin)) { stats.repetido++; continue; }
    if (c.available === false) { stats.semStock++; continue; }
    if ((c.condition && !/^(new|nuevo|novo)$/i.test(c.condition)) || isUsedOrRefurbished(c.title)) { stats.usado++; continue; }

    const prices = computePrices(c.currentPrice, c.oldPrice, c.pricesIncludeEsVat !== false);
    if (!prices) { stats.semDesconto++; continue; }

    const title = cleanAndTranslateTitle(c.title);
    const affUrl = await publishDeal(asin, title, prices, c.imgUrl || null);
    if (affUrl) {
      console.log(`Publicado: ${asin} | ${title} | ${prices.oldPrice} → ${prices.currentPrice} (-${prices.discountPct}%)`);
      sent[asin] = todayStr;
      published++;
      dailyData.deals.push({ asin, title, ...prices, affUrl, imgUrl: c.imgUrl || null });
    }
  }

  console.log(`Publicadas: ${published}. Ignoradas →`, JSON.stringify(stats));
  if (published === 0) await publishFeaturedIfDue();
  await publishDailyTopIfDue();
}

let exitCode = 0;
try {
  await run();
  if (telegramFail > 0 && telegramOk === 0) {
    console.error("ERRO: o Telegram recusou todos os envios deste ciclo (token ou canal errados?).");
    exitCode = 1;
  }
} catch (e) {
  console.error("Erro:", e.message);
  exitCode = 1;
} finally {
  // Remove do histórico do dia qualquer entrada de fontes bloqueadas
  dailyData.deals = dailyData.deals.filter(d => !isBlockedSource(d.affUrl, d.imgUrl));
  if (!DRY_RUN || process.env.SAVE_STATE === "true") {
    fs.writeFileSync(DB_FILE, JSON.stringify(pruneDated(sent), null, 2));
    fs.writeFileSync(DAILY_FILE, JSON.stringify(dailyData, null, 2));
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(history));
  }
}
process.exit(exitCode);
