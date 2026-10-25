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
import { fetchAwinCandidates, fetchOttocastPicks, OTTOCAST_STORE_LINK } from "./awin.mjs";
import { BRANDS, fetchBrandDeals, brandStoreLink } from "./brands.mjs";
import { CATEGORIES, tagsFor, isLowValue, shortenTitle, seasonFor } from "./content.mjs";

// ---------------------------------------------------------------------------
// Configuração — o token do bot vem SÓ do Secret do GitHub (nunca escrito no código)
// ---------------------------------------------------------------------------
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const CHAT_ID = process.env.TELEGRAM_CHAT_ID || "-1003846917730";
const TAG = process.env.AMAZON_PARTNER_TAG || "radardescontospt-21";
// Awin: preparado para quando a conta for aprovada (ainda não é usado)
const AWIN_PUBLISHER_ID = process.env.AWIN_PUBLISHER_ID || "3124493";
const AWIN_FEED_URL = process.env.AWIN_FEED_URL || ""; // link do Create-a-Feed (Secret)
// Lojas Awin que não entram no canal (não combinam com Tech/Casa/Desporto)
const AWIN_EXCLUDE = new RegExp(process.env.AWIN_EXCLUDE || "sinocare", "i");
// Chat privado do dono: recebe um resumo quando um ciclo não publica nada no canal
const ADMIN_CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID || "1411671951"; // Telegram privado do Duarte
const runNotes = []; // motivos a incluir no resumo privado
const DRY_RUN = process.env.DRY_RUN === "true"; // true = não envia nada, só mostra no log
const FORCE_TOP_DAY = process.env.FORCE_TOP_DAY === "true";
const FORCE_OTTOCAST = process.env.FORCE_OTTOCAST === "true"; // publicar já a Grelha Especial Ottocast
// publicar já um especial de marca: "allpowers", "jimmy" ou "tenways" (vazio = nenhum)
const FORCE_BRAND = String(process.env.FORCE_BRAND || "").toLowerCase().trim();
// Grelha temática a pedido (ex.: "tech" = eletrónica, informática e gaming), publicada já
const FORCE_GRID_SETS = { tech: ["electronics", "computers", "videogames"], energia: ["energia", "autotech"] }; // energia = power banks e carregadores/cabos
const FORCE_GRID = FORCE_GRID_SETS[String(process.env.FORCE_GRID || "").toLowerCase().trim()] || null;
// Montra: publica já uma grelha de cada categoria nova, espaçadas (workflow manual)
const FORCE_SHOWCASE = process.env.FORCE_SHOWCASE === "true";
const SHOWCASE_CATS = ["projetores", "autotech", "fitness", "smarthome", "energia", "drones", "wearables",
  "print3d", "pcgaming", "cozinhagadgets", "mobilidade", "office", "lawn-garden", "personalcare", "minipc"];
const SHOWCASE_ONLY = String(process.env.SHOWCASE_ONLY || "").split(",").map(x => x.trim()).filter(x => SHOWCASE_CATS.includes(x));
const SHOWCASE_GAP_SEC = Number(process.env.SHOWCASE_GAP_SEC || 40);

const PUBLISH_WELCOME = process.env.PUBLISH_WELCOME === "true"; // publicar e fixar a mensagem de boas-vindas
const MAX_POSTS_BASE = Number(process.env.MAX_POSTS_PER_RUN || 2);
const MIN_DISCOUNT_PCT = 15;
// Preços da Amazon guardados SEM IVA (o GitHub está nos EUA e a Amazon.es mostra-lhe preços de exportação, sem IVA).
// Preço para Portugal = sem IVA × 1,23 (IVA PT). Se a página vier com IVA (entrega em Espanha/Portugal), tiramos o IVA antes.
const VAT_ES_TO_PT = 1.23;
const PT_NOTE = "📍 <i>Preço para entrega em Portugal. Se a app mostrar outro valor, confirma a morada de entrega no checkout.</i>";
const TOP_HOUR_LISBON = 21;
const DB_FILE = "sent_deals.json";
const DAILY_FILE = "daily_deals.json";
const HISTORY_FILE = "price_history.json";
const HISTORY_DAYS = 30;          // janela do preço de referência
const MIN_PRIOR_DAYS = 2;         // dias anteriores com preço registado antes de publicar
const MAX_DISCOUNT_PCT = 80;      // acima disto é quase sempre erro de leitura
const HISTORY_MAX_ASINS = 4000;
// 1 categoria por ciclo (3 ciclos/hora → todas as categorias várias vezes por dia) = menos captchas da Amazon
const CATEGORIES_PER_RUN = Number(process.env.CATEGORIES_PER_RUN || 1);
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
// Datas especiais: Black Friday, Cyber Monday, 11.11 → mais publicações e cabeçalho próprio
const SEASON = seasonFor(todayStr);
const MAX_POSTS_PER_RUN = SEASON?.boost ? MAX_POSTS_BASE + 1 : MAX_POSTS_BASE;

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
  dailyData.cheapSlots = [];
  dailyData.recordAlerts = 0;
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
  // Marcas que a tradução automática da Amazon estraga
  [/(?<!\p{L})Tampa (C\d{2,4}\w*)/gu, "Tapo $1"],
  [/(?<!\p{L})Videojuegos?(?!\p{L})/giu, "Videojogo"],
  [/(?<!\p{L})Juego de(?!\p{L})/giu, "Conjunto de"],
  [/(?<!\p{L})Juegos?(?!\p{L})/giu, "Jogo"],
  [/(?<!\p{L})[UÚ]ltima generaci[oó]n(?!\p{L})/giu, "Última geração"],
  [/(?<!\p{L})Pantalla(?!\p{L})/giu, "Ecrã"],
  [/(?<!\p{L})Altavoces(?!\p{L})/giu, "Colunas"],
  [/(?<!\p{L})Mando(?!\p{L})/giu, "Comando"],
  [/(?<!\p{L})Cafetera(?!\p{L})/giu, "Máquina de café"],
  [/(?<!\p{L})Aspiradora(?!\p{L})/giu, "Aspirador"],
  [/(?<!\p{L})Freidora de aire(?!\p{L})/giu, "Fritadeira sem óleo"],
  [/(?<!\p{L})Freidora(?!\p{L})/giu, "Fritadeira"],
  [/(?<!\p{L})Sart[eé]n(?!\p{L})/giu, "Frigideira"],
  [/(?<!\p{L})Olla(?!\p{L})/giu, "Panela"],
  [/(?<!\p{L})Bombilla(s?)(?!\p{L})/giu, "Lâmpada$1"],
  [/(?<!\p{L})L[aá]mpara(?!\p{L})/giu, "Candeeiro"],
  [/(?<!\p{L})Taladro(?!\p{L})/giu, "Berbequim"],
  [/(?<!\p{L})Herramientas?(?!\p{L})/giu, "Ferramentas"],
  [/(?<!\p{L})Silla(?!\p{L})/giu, "Cadeira"],
  [/(?<!\p{L})Almohada(?!\p{L})/giu, "Almofada"],
  [/(?<!\p{L})Coche(?!\p{L})/giu, "Carro"],
  [/(?<!\p{L})Patinete el[eé]ctrico(?!\p{L})/giu, "Trotinete elétrica"],
  [/(?<!\p{L})El[eé]ctric([oa]s?)(?!\p{L})/giu, "Elétric$1"],
  [/(?<!\p{L})Recargables?(?!\p{L})/giu, "Recarregável"],
  [/(?<!\p{L})Gris(?!\p{L})/giu, "Cinzento"],
  [/(?<!\p{L})Rojo(?!\p{L})/giu, "Vermelho"],
  [/(?<!\p{L})Plata(?!\p{L})/giu, "Prateado"],
  [/(?<!\p{L})sin(?!\p{L})/gu, "sem"],
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
history._meta.featuredAt = Object.fromEntries(Object.entries(history._meta.featuredAt || {})
  .filter(([, at]) => Date.now() - Date.parse(at) < 4 * 86400000));

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
    // "N ofertas desde X €": preço mais baixo entre vendedores → só para grelhas ("desde X€"), nunca para ANTES/AGORA
    const from = /ofertas?\s+(desde|a partir)|offers?\s+from/i.test(card);
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
      imgUrl: hiResAmazonImage(img),
      ...(from ? { from: true } : {})
    });
  }
  return items;
}

async function fetchCategory(path) {
  const url = `https://www.amazon.es/-/pt/gp/${path}`;
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
  const items = parseBestsellers(html);
  // Para onde a Amazon acha que entrega: Espanha/Portugal → preços com IVA; outros países → sem IVA
  const country = decodeEntities((html.match(/id="glow-ingress-line2"[^>]*>([^<]+)</) || [])[1] || "").trim();
  const vatIn = /espanha|espa[ñn]a|spain/i.test(country) ? 1.21 : /portugal/i.test(country) ? 1.23 : 1;
  if (vatIn !== 1) for (const it of items) it.price = Math.round((it.price / vatIn) * 100) / 100;
  return { blocked: false, items, html, country };
}

// ---------------------------------------------------------------------------
// Variedade: cada categoria alterna entre a lista principal, uma subcategoria
// (descobertas sozinhas na página principal) e as Novidades.
// ---------------------------------------------------------------------------
const SUB_EXCLUDE = /vcr|descodificador|antena|sat[eé]lite|garantia|sexo|sensualidade|[ií]ntim|medicament|vitamina|suplement|beb[eé]|crian[cç]|neve|planta|semente|bolbo|p[aá]ssaro|p[aá]gina seguinte|cart[aã]o|gift/i;
// Só aparelhos (para as listas de cuidado pessoal, que também têm cremes, pastas, champôs…)
const GADGET_RE = /el[eé]tric|eletr[oó]nic|recarreg|sem fios|wireless|bateria|m[aá]quina|aparador|barbear|depilad|epilad|secador|alisador|modelador|ondulador|escova de dentes|irrigador|balan[cç]a|tensi[oó]metro|term[oó]metro|massaj|massag|\bipl\b|luz pulsada/i;
const NOT_GADGET_RE = /pasta de dentes|dent[ií]frico|cabe[cç]as de (substitui|recarga)|recarga|creme|gel |champ[oô]|lo[cç][aã]o/i;
const CAT_SOURCES = {
  // Cuidado pessoal: escovas e irrigadores (Cuidados Orais), depilação/barbear, cabelo
  personalcare: { lists: ["hpc/4346882031", "beauty/4346878031", "beauty/4347698031"], only: t => GADGET_RE.test(t) && !NOT_GADGET_RE.test(t) },
  // Jardim: ferramentas e rega, churrascos, corta-relvas, terraço, piscinas
  "lawn-garden": { lists: ["lawn-garden", "lawn-garden/26381675031", "lawn-garden/5940020031", "lawn-garden/5940100031", "lawn-garden/5940567031", "lawn-garden/5940640031"] },
  projetores: { lists: ["electronics/934343031", "electronics/934342031"] },                    // projetores, ecrãs de projeção
  autotech: { lists: ["electronics/1461677031", "electronics/2458831031", "electronics/1461662031", "electronics/1461678031", "electronics/934181031"] }, // eletrónica auto, câmaras marcha-atrás, GPS, som, carregadores
  fitness: { lists: ["sports/2928495031", "sports/2928765031", "sports/2928768031", "sports/2928767031"] }, // fitness, tecnologia fitness, máquinas, força
  smarthome: { lists: ["smart-home", "electronics/930858031"] },                                // Alexa/Echo e casa inteligente, câmaras de vigilância
  energia: { lists: ["electronics/5520542031", "electronics/934182031", "electronics/934184031", "electronics/934185031"] }, // powerbanks, carregadores parede/sem fios/solares
  drones: { lists: ["toys/14525755031", "electronics/2929854031"] },                            // drones, câmaras de ação
  wearables: { lists: ["electronics/3457446031"] },                                             // smartwatches
  print3d: { lists: ["industrial/6684190031"] },                                                // impressão 3D
  pcgaming: { lists: ["videogames/911106031", "videogames/911111031", "videogames/911112031", "videogames/13987407031", "computers/937887031", "computers/937992031"] }, // headsets, ratos, teclados, monitores
  cozinhagadgets: { lists: ["kitchen/2165384031", "kitchen/13713554031", "kitchen/2165441031", "kitchen/2165154031"] }, // fritadeiras de ar, cafeteiras, vácuo, café
  mobilidade: { lists: ["sports/2928513031"], only: t => /el[eé]tric|e-?scooter|motor|bateria/i.test(t) }, // trotinetes elétricas
  minipc: { lists: ["computers/56164442031"] }                                                             // mini PCs / PCs Stick
};

// Listas escolhidas à mão (entram na rotação antes das subcategorias descobertas)
const CAT_PICKS = {
  electronics: [
    "electronics/934339031",  // Sistemas de home cinema
    "electronics/934250031",  // Streaming (Fire TV, Chromecast…)
    "electronics/934337031"   // Altifalantes
  ],
  sports: [
    "sports/2928496031",      // Eletrónica e dispositivos
    "sports/2928487031",      // Ciclismo
    "sports/2928513031",      // Trotinetes
    "sports/2928518031",      // Padel
    "sports/2928523031",      // Corrida
    "sports/2928471031"       // Campismo
  ]
};
const PICKS_ONLY = new Set(["sports"]); // aqui não usa as subcategorias descobertas (muitas são de nicho)
const OFFICE_EXCLUDE = /papel|post-it|caneta|esferogr|agrafe|envelope|l[aá]pis|marcador|fita adesiva|cola\b/i;

function nextSource(cat) {
  const st = ((history._meta.srcState ||= {})[cat] ||= { n: 0, si: -1 });
  st.n++;
  const fixed = CAT_SOURCES[cat];
  if (fixed) {
    st.si = (st.si + 1) % fixed.lists.length;
    return { path: `bestsellers/${fixed.lists[st.si]}`, label: fixed.lists[st.si], only: fixed.only };
  }
  const only = cat === "office" ? t => !OFFICE_EXCLUDE.test(t) : null;
  if (st.n % 3 === 0) return { path: `new-releases/${cat}`, label: `${cat} (novidades)`, only };
  const disc = history._meta.subcats?.[cat] || { ids: [], names: [] };
  const subs = [...(CAT_PICKS[cat] || []).map(x => ({ p: x, name: x }))]
    .concat(PICKS_ONLY.has(cat) ? [] : disc.ids.map((id, i) => ({ p: `${cat}/${id}`, name: disc.names?.[i] || id })));
  if (st.n % 3 === 1 || !subs.length) return { path: `bestsellers/${cat}`, label: cat, discover: true, only };
  st.si = (st.si + 1) % subs.length;
  return { path: `bestsellers/${subs[st.si].p}`, label: `${cat} › ${subs[st.si].name}`, only };
}

// Guarda as subcategorias que aparecem no menu da lista principal
function discoverSubcats(cat, html) {
  const re = new RegExp(`/gp/bestsellers/${cat}/(\\d+)[^>]*>([^<]{2,60})<`, "g");
  const found = new Map();
  for (const m of html.matchAll(re)) {
    const name = decodeEntities(m[2]).trim();
    if (!SUB_EXCLUDE.test(name) && !found.has(m[1])) found.set(m[1], name);
  }
  if (found.size) {
    (history._meta.subcats ||= {})[cat] = { ids: [...found.keys()], names: [...found.values()], at: todayStr };
    console.log(`Subcategorias de ${cat}: ${found.size}.`);
  }
}

// Regista o preço de hoje (fica o mais baixo do dia)
function recordPrice(item) {
  const h = history[item.asin] || (history[item.asin] = { p: {} });
  h.t = item.title;
  h.i = item.imgUrl || h.i || null;
  if (item.cat) h.c = item.cat;
  if (item.rating) h.r = item.rating;
  if (item.from) h.fr = 1; else delete h.fr;
  h.seen = todayStr;
  const prev = h.p[todayStr];
  h.p[todayStr] = prev ? Math.min(prev, item.price) : item.price;
}

// Quantos dias anteriores (até 30) têm preço registado — para dizer a verdade no post
function priorDays(asin) {
  const h = history[asin];
  return h ? Object.keys(h.p).filter(d => d < todayStr && daysBetween(d, todayStr) <= HISTORY_DAYS).length : 0;
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
  const start = (history._meta.nextCategory || 0) % CATEGORIES.length;
  const cats = Array.from({ length: Math.min(CATEGORIES_PER_RUN, CATEGORIES.length) }, (_, i) => CATEGORIES[(start + i) % CATEGORIES.length]);
  history._meta.nextCategory = (start + cats.length) % CATEGORIES.length;

  const seenNow = new Map();
  for (const [i, cat] of cats.entries()) {
    if (i > 0) await sleep(4000 + Math.random() * 3000); // pausa entre pedidos
    try {
      const src = nextSource(cat);
      const { blocked, items: all, html } = await fetchCategory(src.path);
      if (blocked) {
        console.warn(`Amazon pediu captcha em "${src.label}" — paro por este ciclo.`);
        runNotes.push(`a Amazon pediu captcha em "${src.label}"`);
        break;
      }
      if (src.discover && html) discoverSubcats(cat, html);
      const items = src.only ? all.filter(it => src.only(it.title)) : all;
      console.log(`Lista ${src.label}: ${items.length} produtos com preço.`);
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
    if (ref && it.price < ref && !it.from) {
      candidates.push({ asin: it.asin, title: it.title, currentPrice: it.price, oldPrice: ref, imgUrl: it.imgUrl, cat: it.cat, refDays: priorDays(it.asin), pricesIncludeEsVat: true });
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
  let c = `🏆 <b>TOP ${topDeals.length} OFERTAS DO DIA — RADAR PT</b> 🔥\n<i>As melhores descidas de preço de hoje:</i>\n\n`;
  topDeals.forEach((d, i) => {
    const t = d.title.length > titleLen ? d.title.slice(0, titleLen - 1) + "…" : d.title;
    c += `${MEDALS[i]} <b>${escapeHtml(t)}</b>\n<s>${d.oldPrice}</s> ➡️ <b>${d.currentPrice}</b> (-${d.discountPct}%)\n👉 <a href="${d.affUrl}">Ver oferta</a>\n\n`;
  });
  c += `⚡ <i>Preços verificados hoje | Stock limitado</i>`;
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
  return ok;
}

// ---------------------------------------------------------------------------
// Publicação de uma oferta
// ---------------------------------------------------------------------------
// Linha honesta sobre o histórico: só diz "30 dias" quando há mesmo 30 dias de registos
function historyNote(refDays) {
  if (!refDays) return "";
  return refDays >= HISTORY_DAYS
    ? `📉 <i>Preço mais baixo dos últimos 30 dias</i>\n`
    : `📉 <i>Mais barato do que em qualquer dia que registámos (${refDays} dias)</i>\n`;
}

// Marca de origem nos links Awin (aparece no relatório da Awin como "Click Ref"): sabes que post gerou a venda
function withClickref(url, ref) {
  if (!/awin1\.com\/cread\.php/.test(url || "") || /[?&]clickref=/.test(url)) return url;
  return `${url}&clickref=${encodeURIComponent(ref)}`;
}

const seasonHeader = () => (SEASON?.label ? `<b>${SEASON.label}</b>\n` : "");
const seasonFooter = () => (SEASON?.note ? `\n${SEASON.note}` : "");

async function publishDeal(affUrl, store, title, prices, imgUrl, vatNote, { tags = "", refDays = 0, header = "🔥 <b>ALERTA DE PREÇO DETETADO!</b>" } = {}) {
  const caption =
    seasonHeader() + `${header}\n\n` +
    `📦 <b>${escapeHtml(title)}</b>\n\n` +
    `❌ ANTES: <s>${prices.oldPrice}</s>\n` +
    `✅ <b>AGORA: ${prices.currentPrice}</b> <i>(-${prices.discountPct}% DESCONTO!)</i>\n` +
    historyNote(refDays) + `\n` +
    `👉 <a href="${affUrl}">Ver oferta na ${escapeHtml(store)}</a>\n\n` +
    `⚡ <i>${vatNote ? "Envio para Portugal (IVA PT incluído) | " : ""}Stock limitado</i>` +
    (vatNote ? `\n${PT_NOTE}` : "") +
    (tags ? `\n${tags}` : "") + seasonFooter();
  const reply_markup = { inline_keyboard: [[{ text: `🛒 Comprar na ${store}`, url: affUrl }]] };

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
// Publicação de 20 em 20 minutos (9h–22h): em cada ciclo sai UMA publicação com até 4 produtos.
//  1) Há descontos reais → 1 oferta sozinha, ou grelha com até 4 ofertas (ANTES/AGORA).
//  2) Não há → grelha temática com até 4 mais vendidos (preço atual, nunca um ANTES inventado).
// Se a Amazon pedir captcha, usa os produtos vistos nos últimos 2 dias (reserva).
// ---------------------------------------------------------------------------
// Horário de publicação no canal (hora de Lisboa): das 9h00 às 22h00. Fora disto só regista preços.
const POST_HOURS = [9, 22];
const inPostHours = () => lisbonHour >= POST_HOURS[0] && lisbonHour < POST_HOURS[1];
const MIN_GAP_MIN = 15;          // evita duas publicações seguidas se o bot correr 2x no mesmo período
const GRID_SIZE = 4;             // até 4 produtos por publicação
const GRID_MIN_PRICE = 20;
const GRID_REPEAT_HOURS = 72;    // um produto só volta a uma grelha passados 3 dias…
const GRID_MIN_REPEAT_HOURS = 12; // …ou 12 horas, se não houver produtos novos suficientes
const NUMBERS = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣"];
const CAT_TITLES = {
  electronics: "📱 TOP TECNOLOGIA", computers: "💻 TOP INFORMÁTICA", videogames: "🎮 TOP GAMING",
  kitchen: "🍳 TOP COZINHA", home: "🏠 TOP CASA", toys: "🧸 TOP BRINQUEDOS", sports: "⚽ TOP DESPORTO",
  tools: "🛠️ TOP BRICOLAGE", appliances: "🔌 TOP ELETRODOMÉSTICOS",
  automotive: "🚗 TOP AUTO", lighting: "💡 TOP ILUMINAÇÃO",
  office: "🖊️ TOP ESCRITÓRIO", "lawn-garden": "🌿 TOP JARDIM", personalcare: "🪒 TOP CUIDADO PESSOAL",
  projetores: "📽️ TOP PROJETORES & ECRÃS", autotech: "🚗 TOP TECH PARA CARRO", fitness: "🏋️ TOP FITNESS & GINÁSIO",
  smarthome: "🏠 TOP CASA INTELIGENTE", energia: "🔋 TOP POWERBANKS & CARREGADORES", drones: "🚁 TOP DRONES & CÂMARAS DE AÇÃO",
  wearables: "⌚ TOP SMARTWATCHES", print3d: "🖨️ TOP IMPRESSÃO 3D", pcgaming: "🖱️ TOP PERIFÉRICOS GAMING",
  cozinhagadgets: "☕ TOP GADGETS DE COZINHA", mobilidade: "🛴 TOP MOBILIDADE ELÉTRICA",
  minipc: "💻 TOP MINI PCS"
};

const minutesSinceLastPost = () =>
  history._meta.lastPostAt ? (Date.now() - Date.parse(history._meta.lastPostAt)) / 60000 : Infinity;
const markPosted = () => { history._meta.lastPostAt = new Date().toISOString(); };

// Produtos disponíveis: os lidos agora + os vistos nos últimos 2 dias (reserva para quando há captcha)
function productPool() {
  const pool = new Map(lastSeenItems.map(it => [it.asin, it]));
  for (const [asin, h] of Object.entries(history)) {
    if (asin === "_meta" || pool.has(asin) || !h.i || !h.t || !h.seen) continue;
    if (daysBetween(h.seen, todayStr) > 1) continue;
    const price = h.p[h.seen];
    if (!price) continue;
    pool.set(asin, { asin, title: h.t, imgUrl: h.i, price, cat: h.c || "", rating: h.r || 0, fromHistory: true, ...(h.fr ? { from: true } : {}) });
  }
  return [...pool.values()];
}

// Há quantas horas o produto saiu numa grelha (Infinity = nunca)
function hoursSinceFeatured(asin) {
  const at = (history._meta.featuredAt || {})[asin];
  return at ? (Date.now() - Date.parse(at)) / 3600000 : Infinity;
}
const recentlyFeatured = asin => hoursSinceFeatured(asin) < GRID_REPEAT_HOURS;

// Escolhe até 4 mais vendidos: tenta uma categoria-tema (diferente da última), completa com outras
// Grelha "ACHADOS ATÉ 15€": produtos baratos (preço PT entre 5 e 15€), 2x por dia
// Avaliação mínima na Amazon (estrelas) para entrar nas grelhas e no destaque do dia
const MIN_RATING = 2.5;
const CHEAP_MIN = 5, CHEAP_MAX = 15;
const CHEAP_HOURS = [12, 20];

function pickGrid({ cheap = false, cats = null } = {}) {
  const inRange = it => {
    const pt = it.price * VAT_ES_TO_PT;
    return cheap ? pt >= CHEAP_MIN && pt <= CHEAP_MAX : it.price >= GRID_MIN_PRICE;
  };
  const eligible = productPool().filter(it =>
    it.imgUrl && inRange(it) && (!it.rating || it.rating >= MIN_RATING) && !wasSent(it.asin) &&
    hoursSinceFeatured(it.asin) >= GRID_MIN_REPEAT_HOURS &&
    !isLowValue(it.title) && !isUsedOrRefurbished(it.title) && !isBlockedSource(it.imgUrl) &&
    (!cats || cats.includes(it.cat))
  );
  // Primeiro os que não saíram nos últimos 3 dias; se faltarem, os que saíram há mais tempo
  let ok = eligible.filter(it => !recentlyFeatured(it.asin));
  if (ok.length < GRID_SIZE) {
    const older = eligible.filter(it => recentlyFeatured(it.asin))
      .sort((a, b) => hoursSinceFeatured(b.asin) - hoursSinceFeatured(a.asin));
    ok = ok.concat(older.slice(0, GRID_SIZE - ok.length));
  }
  if (cats) {
    // Grelha a pedido: os mais bem avaliados dessas categorias, variando a categoria
    const sorted = [...ok].sort((a, b) => (b.rating || 0) - (a.rating || 0));
    const picks = [], seen = new Map();
    for (let round = 1; picks.length < GRID_SIZE && round <= GRID_SIZE; round++)
      for (const it of sorted) if (!picks.includes(it) && (seen.get(it.cat) || 0) < round && picks.length < GRID_SIZE) { picks.push(it); seen.set(it.cat, (seen.get(it.cat) || 0) + 1); }
    return { picks, theme: null };
  }
  if (cheap) {
    // Variedade: primeiro um por categoria (melhor avaliação), depois completa
    const sorted = [...ok].sort((a, b) => (b.rating || 0) - (a.rating || 0));
    const picks = [], cats = new Set();
    for (const it of sorted) if (!cats.has(it.cat) && picks.length < GRID_SIZE) { picks.push(it); cats.add(it.cat); }
    for (const it of sorted) if (!picks.includes(it) && picks.length < GRID_SIZE) picks.push(it);
    return { picks, theme: null };
  }
  const byCat = new Map();
  for (const it of ok) (byCat.get(it.cat) || byCat.set(it.cat, []).get(it.cat)).push(it);
  // Categoria-tema em rotação: a seguir à última usada, a primeira com pelo menos 3 produtos
  const order = [...new Set(CATEGORIES)];
  const start = order.indexOf(history._meta.lastGridCat) + 1;
  // Preferência: categoria com 4 produtos; se nenhuma tiver 4, a primeira com 3; senão, com 2
  let theme = null;
  // Categoria mais votada na sondagem: entra de 3 em 3 grelhas (se tiver pelo menos 3 produtos)
  const fav = favCat();
  if (fav && fav !== history._meta.lastGridCat && (history._meta.gridsSinceFav ?? 99) >= 2 && (byCat.get(fav) || []).length >= 3) theme = fav;
  for (const need of [GRID_SIZE, 3, 2]) {
    if (theme) break;
    for (let i = 0; i < order.length && !theme; i++) {
      const c = order[(start + i) % order.length];
      if ((byCat.get(c) || []).length >= need) theme = c;
    }
    if (theme) break;
  }
  // Com tema: só produtos dessa categoria (3 ou 4), para o título "TOP X" bater certo com o conteúdo.
  // Sem tema: grelha mista "MAIS VENDIDOS".
  if (theme) return { picks: byCat.get(theme).slice(0, GRID_SIZE), theme };
  return { picks: ok.slice(0, GRID_SIZE), theme: null };
}

// Envia a imagem em grelha (ou álbum, se a imagem falhar) com texto e botões
async function sendGrid(rows, caption, collageTitle, collageSubtitle) {
  const buttons = [];
  for (let i = 0; i < rows.length; i += 2) {
    buttons.push(rows.slice(i, i + 2).map((r, j) => ({ text: `${NUMBERS[i + j]} ${r.buttonLabel}`, url: r.affUrl })));
  }
  let ok = false;
  try {
    const image = await buildCollage(rows.map(r => ({ imgUrl: r.imgUrl, priceLabel: r.imageLabel })), { title: collageTitle, ...(collageSubtitle ? { subtitle: collageSubtitle } : {}) });
    ok = (await telegramPhotoUpload(image, { caption, parse_mode: "HTML", reply_markup: { inline_keyboard: buttons } })).ok;
  } catch (e) {
    console.error(`Grelha: não deu para montar a imagem (${e.message}) — envio em álbum.`);
  }
  if (!ok) {
    const media = rows.map((r, i) => ({ type: "photo", media: r.imgUrl, ...(i === 0 ? { caption, parse_mode: "HTML" } : {}) }));
    ok = (await telegram("sendMediaGroup", { media })).ok;
  }
  return ok;
}

// ---------------------------------------------------------------------------
// Grelha Especial Ottocast (Awin 96499): 1x por dia, no 1.º ciclo a partir das 13h, ou a pedido
// ---------------------------------------------------------------------------
const OTTOCAST_HOUR = 13;
const OTTOCAST_CACHE_DAYS = 3;   // se a loja não responder, usa os últimos preços lidos (até 3 dias)

async function publishOttocastGrid({ force = false } = {}) {
  if (!force && (lisbonHour < OTTOCAST_HOUR || dailyData.ottocastDate === todayStr)) return false;

  let picks = await fetchOttocastPicks({ feedUrl: AWIN_FEED_URL });
  const cache = history._meta.ottocastCache;
  if (picks.length >= 2) {
    history._meta.ottocastCache = { at: new Date().toISOString(), picks };
  } else if (cache && (Date.now() - Date.parse(cache.at)) / 86400000 <= OTTOCAST_CACHE_DAYS) {
    console.log(`Ottocast: loja sem resposta — uso os preços lidos em ${cache.at}.`);
    picks = cache.picks;
  }
  if (picks.length < 2) {
    console.log("Ottocast: sem produtos suficientes, fica para o próximo ciclo.");
    runNotes.push("Ottocast: sem produtos suficientes");
    return false;
  }

  const rows = picks.slice(0, GRID_SIZE).map(p => {
    const now = formatEur(p.price);
    const pct = p.oldPrice > p.price ? Math.round(((p.oldPrice - p.price) / p.oldPrice) * 100) : 0;
    return {
      ...p, affUrl: withClickref(p.url, "tg-ottocast-grelha"),
      imageLabel: pct >= 5 ? `${now}  -${pct}%` : now,
      buttonLabel: pct >= 5 ? `${now} (-${pct}%)` : now,
      line: pct >= 5 ? `PVP <s>${formatEur(p.oldPrice)}</s> ✅ <b>${now}</b> (-${pct}%)` : `✅ <b>${now}</b>`
    };
  });

  let caption = seasonHeader() + `🚗 <b>ESPECIAL AUTO — OTTOCAST</b>\n<i>CarPlay & Android Auto sem fios · loja oficial</i>\n\n`;
  rows.forEach((r, i) => {
    caption += `${NUMBERS[i]} <a href="${r.affUrl}">${escapeHtml(r.title)}</a>\n      ${r.line}\n`;
  });
  caption += `\n🛒 <a href="${withClickref(OTTOCAST_STORE_LINK, "tg-ottocast-loja")}">Ver toda a loja Ottocast</a>\n` +
    `⚡ <i>Preços da loja oficial para Portugal, podem mudar | Stock limitado</i>\n#auto #tech #ottocast` + seasonFooter();

  const ok = await sendGrid(rows, caption, "ESPECIAL AUTO · OTTOCAST", "Loja oficial Ottocast · CarPlay & Android Auto sem fios");
  if (ok) {
    // Publicação a pedido (fora do horário) não conta como a do dia: a das 13h sai na mesma
    if (!force || inPostHours()) dailyData.ottocastDate = todayStr;
    console.log(`Grelha Ottocast publicada: ${rows.map(r => `${r.id} ${formatEur(r.price)}`).join(" | ")}`);
  }
  return ok;
}

// ---------------------------------------------------------------------------
// Especiais de marca (lojas Awin lidas da loja oficial, preço para Portugal)
//  - ALLPOWERS: grelha diária a partir das 17h
//  - jimmy.eu:  grelha a partir das 19h, só com pelo menos 2 produtos em promoção
//  - Tenways:   1 e-bike sozinha, no máximo 1x por semana (a partir das 11h), só com desconto ≥10%
// ---------------------------------------------------------------------------
const BRAND_SPECIALS = {
  allpowers: {
    hour: 17, minItems: 2, everyDays: 1,
    header: "🔋 <b>ESPECIAL ENERGIA — ALLPOWERS</b>\n<i>Estações de energia e kits solares · loja oficial Portugal</i>",
    collageTitle: "ESPECIAL ENERGIA · ALLPOWERS", collageSubtitle: "Loja oficial ALLPOWERS Portugal · energia portátil e solar",
    tags: "#energia #casa #tech #allpowers"
  },
  jimmy: {
    hour: 19, minItems: 2, everyDays: 1,
    header: "🧹 <b>ESPECIAL CASA — JIMMY</b>\n<i>Aspiradores sem fios e purificadores · loja oficial</i>",
    collageTitle: "ESPECIAL CASA · JIMMY", collageSubtitle: "Loja oficial JIMMY · aspiradores sem fios",
    tags: "#casa #tech #jimmy"
  },
  quatroelementos: {
    hour: 15, minItems: 2, everyDays: 1,
    header: "👟 <b>ESPECIAL TÉNIS & STREETWEAR — 4 ELEMENTOS</b>\n<i>Nike, Jordan, adidas, New Balance, Carhartt · loja portuguesa</i>",
    collageTitle: "ESPECIAL TÉNIS · 4 ELEMENTOS", collageSubtitle: "Loja portuguesa 4 Elementos · ténis e streetwear em promoção",
    tags: "#tenis #moda #desporto #4elementos"
  },
  tenways: {
    hour: 11, minItems: 1, everyDays: 7, single: true,
    header: "🚲 <b>ESPECIAL E-BIKE — TENWAYS</b>",
    tags: "#desporto #ebike #tenways"
  }
};
const BRAND_REPEAT_DAYS = 3; // um produto só volta a um especial passados 3 dias (se houver outros)

function brandFeaturedRecently(id) {
  const d = (history._meta.brandFeatured || {})[id];
  return !!d && daysBetween(d, todayStr) < BRAND_REPEAT_DAYS;
}

async function publishBrandSpecial(key, { force = false } = {}) {
  const cfg = BRAND_SPECIALS[key], brand = BRANDS[key];
  const st = (history._meta.brandState ||= {})[key] ||= {};
  if (!force) {
    if (lisbonHour < cfg.hour) return false;
    if (st.checkedDate === todayStr) return false;                       // já tentou hoje
    if (st.postedDate && daysBetween(st.postedDate, todayStr) < cfg.everyDays) return false;
  }

  let picks;
  try {
    picks = await fetchBrandDeals(brand, { max: cfg.single ? 1 : GRID_SIZE, skip: brandFeaturedRecently });
  } catch (e) {
    console.error(`${brand.name}: loja sem resposta (${e.message}) — tento no próximo ciclo.`);
    runNotes.push(`${brand.name}: loja sem resposta`);
    return false;
  }
  if (picks.length < cfg.minItems) {
    console.log(`${brand.name}: só ${picks.length} produto(s) em promoção — hoje não há especial.`);
    st.checkedDate = todayStr; // não volta a verificar hoje
    return false;
  }

  let ok;
  if (cfg.single) {
    const p = picks[0];
    p.url = withClickref(p.url, `tg-${key}`);
    ok = !!(await publishDeal(p.url, brand.name, p.title,
      { oldPrice: formatEur(p.oldPrice), currentPrice: formatEur(p.price), discountPct: p.pct }, p.imgUrl, false,
      { tags: cfg.tags, header: cfg.header }));
  } else {
    const rows = picks.map(p => {
      const now = formatEur(p.price);
      return {
        ...p, affUrl: withClickref(p.url, `tg-${key}-grelha`),
        imageLabel: `${now}  -${p.pct}%`, buttonLabel: `${now} (-${p.pct}%)`,
        line: `PVP <s>${formatEur(p.oldPrice)}</s> ✅ <b>${now}</b> (-${p.pct}%)`
      };
    });
    let caption = seasonHeader() + `${cfg.header}\n\n`;
    rows.forEach((r, i) => { caption += `${NUMBERS[i]} <a href="${r.affUrl}">${escapeHtml(r.title)}</a>\n      ${r.line}\n`; });
    caption += `\n🛒 <a href="${withClickref(brandStoreLink(brand), `tg-${key}-loja`)}">Ver toda a loja ${escapeHtml(brand.name)}</a>\n` +
      `⚡ <i>Preços da loja oficial para Portugal, podem mudar | Stock limitado</i>\n${cfg.tags}` + seasonFooter();
    ok = await sendGrid(rows, caption, cfg.collageTitle, cfg.collageSubtitle);
  }

  if (ok) {
    st.checkedDate = todayStr;
    st.postedDate = todayStr;
    const bf = (history._meta.brandFeatured ||= {});
    for (const p of picks) bf[p.id] = todayStr;
    for (const [id, d] of Object.entries(bf)) if (daysBetween(d, todayStr) > 14) delete bf[id];
    for (const p of picks) {
      dailyData.deals.push({ asin: p.id, store: brand.name, title: p.title, currentPrice: formatEur(p.price),
        oldPrice: formatEur(p.oldPrice), discountPct: p.pct, affUrl: p.url, imgUrl: p.imgUrl });
    }
    console.log(`Especial ${brand.name} publicado: ${picks.map(p => `${p.id} ${formatEur(p.price)} (-${p.pct}%)`).join(" | ")}`);
  }
  return ok;
}

// Especiais por ordem de prioridade (1 por ciclo)
async function publishDueBrandSpecial() {
  for (const key of ["quatroelementos", "allpowers", "jimmy", "tenways"]) {
    if (await publishBrandSpecial(key)) return true;
  }
  return false;
}

// Grelha de mais vendidos (preço atual)
// "Mais vendidos" (sem desconto) só de hora a hora; descontos reais e especiais saem sempre que aparecem
const BESTSELLER_EVERY_MIN = 55;
let bestsellerPaced = false; // ciclo sem post só por esperar a hora → não é problema, não avisa no privado

async function publishBestsellerGrid({ forceCats = null } = {}) {
  const lastBs = history._meta.lastBestsellerAt ? (Date.now() - Date.parse(history._meta.lastBestsellerAt)) / 60000 : Infinity;
  if (!forceCats && lastBs < BESTSELLER_EVERY_MIN) {
    console.log(`Mais vendidos: última grelha há ${Math.round(lastBs)} min — próxima daqui a ${Math.ceil(BESTSELLER_EVERY_MIN - lastBs)} min.`);
    bestsellerPaced = true;
    return false;
  }
  // Às 12h e às 20h (1x cada) a grelha é de achados baratos; se não houver pelo menos 2, segue a normal
  const cheapSlot = [...CHEAP_HOURS].reverse().find(h => lisbonHour >= h && lisbonHour < h + 2);
  const cheapDue = !forceCats && cheapSlot !== undefined && !(dailyData.cheapSlots || []).includes(cheapSlot);
  let { picks, theme } = forceCats ? pickGrid({ cats: forceCats }) : cheapDue ? pickGrid({ cheap: true }) : pickGrid();
  let cheap = cheapDue && picks.length >= 2;
  if (cheapDue && !cheap) {
    console.log(`Achados até ${CHEAP_MAX}€: só ${picks.length} produto(s) — grelha normal.`);
    ({ picks, theme } = pickGrid());
  }
  if (picks.length < 2) {
    console.log(`Grelha: só ${picks.length} produto(s) elegíveis.`);
    runNotes.push(`só ${picks.length} produto(s) elegíveis para a grelha`);
    return false;
  }
  const rows = picks.map(it => {
    const price = (it.from ? "desde " : "") + formatEur(it.price * VAT_ES_TO_PT);
    return {
      ...it, title: shortenTitle(cleanAndTranslateTitle(it.title), 60),
      imageLabel: price, buttonLabel: price,
      affUrl: `https://www.amazon.es/dp/${it.asin}?tag=${TAG}`
    };
  });
  const head = forceCats ? (forceCats.length === 1 && CAT_TITLES[forceCats[0]]) || "📱 TECNOLOGIA & GADGETS" : cheap ? `💸 ACHADOS ATÉ ${CHEAP_MAX}€` : theme ? CAT_TITLES[theme] || "🔥 MAIS VENDIDOS" : "🔥 MAIS VENDIDOS";
  const sub = cheap ? "Coisas úteis e baratas, das mais vendidas · preços com IVA PT incluído" : "Os mais vendidos agora · preços com IVA PT incluído";
  let caption = seasonHeader() + `<b>${head} — AMAZON ES</b>\n<i>${sub}</i>\n\n`;
  rows.forEach((r, i) => {
    caption += `${NUMBERS[i]} <a href="${r.affUrl}">${escapeHtml(r.title)}</a> — <b>${r.imageLabel}</b>` +
      (r.rating ? ` · ⭐${String(r.rating).replace(".", ",")}` : "") + `\n`;
  });
  const tags = [...new Set((cheap ? ["#achados", "#barato"] : []).concat(rows.flatMap(r => tagsFor({ cat: r.cat, store: "Amazon ES" }).split(" "))))].join(" ");
  caption += `\n⚡ <i>Envio para Portugal | Stock limitado</i>\n${PT_NOTE}\n${tags}` + seasonFooter();

  const collageTitle = SEASON?.label ? SEASON.label.replace(/^\S+\s/, "") : ((cheap || theme || forceCats) ? head.replace(/^\S+\s/, "") : "MAIS VENDIDOS HOJE");
  const ok = await sendGrid(rows, caption, collageTitle);
  if (ok) {
    history._meta.featuredAt = history._meta.featuredAt || {};
    for (const r of rows) { history._meta.featured[r.asin] = todayStr; history._meta.featuredAt[r.asin] = new Date().toISOString(); }
    if (cheap) dailyData.cheapSlots = [...(dailyData.cheapSlots || []), cheapSlot];
    else history._meta.lastGridCat = theme || "";
    if (!cheap) history._meta.gridsSinceFav = theme && theme === favCat() ? 0 : (history._meta.gridsSinceFav ?? 0) + 1;
    history._meta.lastBestsellerAt = new Date().toISOString();
    console.log(`Grelha publicada (${cheap ? `achados até ${CHEAP_MAX}€` : theme || "mista"}${rows.some(r => r.fromHistory) ? ", com reserva" : ""}): ${rows.map(r => `${r.asin} ${r.imageLabel}`).join(" | ")}`);
  }
  return ok;
}

// Grelha de ofertas com desconto real (ANTES/AGORA)
async function publishDealsGrid(deals) {
  const rows = deals.map(d => ({
    ...d,
    imageLabel: `${d.prices.currentPrice}  -${d.prices.discountPct}%`,
    buttonLabel: `${d.prices.currentPrice} (-${d.prices.discountPct}%)`,
    affUrl: d.url
  }));
  let caption = seasonHeader() + `🔥 <b>${rows.length} DESCIDAS DE PREÇO AGORA</b>\n\n`;
  rows.forEach((r, i) => {
    caption += `${NUMBERS[i]} <a href="${r.affUrl}">${escapeHtml(r.title)}</a>\n` +
      `      ❌ <s>${r.prices.oldPrice}</s> ✅ <b>${r.prices.currentPrice}</b> (-${r.prices.discountPct}%)\n`;
  });
  const tags = [...new Set(rows.flatMap(r => tagsFor({ cat: r.cat, store: r.store }).split(" ")))].join(" ");
  caption += `\n📉 <i>Preços abaixo do mais baixo que registámos</i>\n⚡ <i>Stock limitado</i>\n${PT_NOTE}\n${tags}` + seasonFooter();
  return sendGrid(rows, caption, SEASON?.label ? SEASON.label.replace(/^\S+\s/, "") : "DESCIDAS DE PREÇO");
}

// ---------------------------------------------------------------------------
// Oferta do dia — uma vez por dia, a partir das 12h (hora de almoço).
// Com desconto real: a melhor oferta ainda não publicada. Sem descontos ainda:
// "Destaque do dia" com o mais vendido mais bem avaliado (só preço atual).
// ---------------------------------------------------------------------------
const DEAL_OF_DAY_HOUR = 12;

async function publishDealOfDayIfDue(candidates) {
  if (!inPostHours() || lisbonHour < DEAL_OF_DAY_HOUR || history._meta.dealOfDayDate === todayStr) return false;

  let ok = false;
  const best = candidates.find(c =>
    !wasSent(String(c.id)) && !isUsedOrRefurbished(c.title) && !isLowValue(c.title) &&
    !isBlockedSource(c.imgUrl, c.url) && computePrices(c.currentPrice, c.oldPrice, c.pricesIncludeEsVat !== false)
  );
  if (best) {
    const prices = computePrices(best.currentPrice, best.oldPrice, best.pricesIncludeEsVat !== false);
    const title = shortenTitle(cleanAndTranslateTitle(best.title), 90);
    const affUrl = await publishDeal(best.url, best.store, title, prices, best.imgUrl || null, best.pricesIncludeEsVat !== false,
      { tags: tagsFor({ cat: best.cat, store: best.store }), refDays: best.refDays || 0, header: "⭐ <b>OFERTA DO DIA</b> ⭐" });
    if (affUrl) {
      ok = true;
      sent[String(best.id)] = todayStr;
      dailyData.deals.push({ asin: String(best.id), store: best.store, title, ...prices, affUrl, imgUrl: best.imgUrl || null });
      console.log(`Oferta do dia: ${best.store} | ${best.id} | ${title} (-${prices.discountPct}%)`);
    }
  } else {
    // Ainda sem descontos: destaque do mais vendido mais bem avaliado (≥25€)
    const pick = productPool()
      .filter(it => it.imgUrl && !it.from && it.price >= 25 && (it.rating || 0) >= MIN_RATING && hoursSinceFeatured(it.asin) >= GRID_MIN_REPEAT_HOURS &&
        !wasSent(it.asin) && !isLowValue(it.title) && !isUsedOrRefurbished(it.title))
      .sort((a, b) => (b.rating || 0) - (a.rating || 0))[0];
    if (!pick) return false;
    const title = shortenTitle(cleanAndTranslateTitle(pick.title), 90);
    const affUrl = `https://www.amazon.es/dp/${pick.asin}?tag=${TAG}`;
    const caption = seasonHeader() + `⭐ <b>DESTAQUE DO DIA</b> ⭐\n\n📦 <b>${escapeHtml(title)}</b>\n\n` +
      `⭐ ${String(pick.rating).replace(".", ",")} de 5 · um dos mais vendidos da Amazon ES\n` +
      `💶 <b>PREÇO ATUAL: ${formatEur(pick.price * VAT_ES_TO_PT)}</b>\n\n` +
      `👉 <a href="${affUrl}">Ver na Amazon ES</a>\n\n⚡ <i>Envio para Portugal (IVA PT incluído)</i>\n${PT_NOTE}\n` +
      tagsFor({ cat: pick.cat, store: "Amazon ES" }) + seasonFooter();
    ok = (await telegram("sendPhoto", { photo: pick.imgUrl, caption, parse_mode: "HTML",
      reply_markup: { inline_keyboard: [[{ text: "🛒 Ver na Amazon", url: affUrl }]] } })).ok;
    if (ok) {
      history._meta.featured[pick.asin] = todayStr;
      console.log(`Destaque do dia: ${pick.asin} | ${title}`);
    }
  }
  if (ok) { history._meta.dealOfDayDate = todayStr; markPosted(); }
  return ok;
}

// ---------------------------------------------------------------------------
// Interação com o canal (para dar movimento sem encher de grelhas):
//  1) Sondagem do dia (13h): dia sim "Qual destes compravas?", dia não "Que categoria queres ver mais?"
//     → a categoria mais votada aparece mais vezes nas grelhas durante 7 dias.
//  2) Caça-pedidos (domingo, 11h): os seguidores dizem o que procuram (privado do bot ou comentários);
//     quando um produto pedido aparecer abaixo do preço registado, sai um post 🎯.
//  3) As melhores da semana (sexta, 19h): maiores descontos publicados nos últimos 7 dias + mais votado.
//  4) Alerta "mínimo do Radar": desconto real grande com histórico longo → post sozinho com 🚨.
// ---------------------------------------------------------------------------
const POLL_HOUR = 13;
const PEDIDOS_WEEKDAY = 0, PEDIDOS_HOUR = 10;  // domingo
const WEEKLY_WEEKDAY = 5, WEEKLY_HOUR = 19;    // sexta-feira
const RECORD_MIN_DAYS = 14, RECORD_MIN_PCT = 25, RECORD_MAX_PER_DAY = 3;
const PEDIDO_DAYS = 30, PEDIDOS_MAX = 200;
const FAV_CAT_DAYS = 7;
const weekdayLisbon = new Date(todayStr + "T12:00:00Z").getUTCDay();
const addDays = (d, n) => new Date(Date.parse(d + "T12:00:00Z") + n * 86400000).toISOString().slice(0, 10);
const norm = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const cutText = (s, max) => (s.length > max ? s.slice(0, max - 1).trimEnd() + "…" : s);

// Chamadas ao Telegram que não são publicações no canal (não contam para o estado do ciclo)
async function tgRaw(method, payload = {}) {
  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(20000)
    });
    return await res.json().catch(() => ({ ok: false }));
  } catch (e) {
    return { ok: false, description: e.message };
  }
}

// Categoria preferida pelos seguidores (última sondagem de categorias), válida durante 7 dias
function favCat() {
  const f = history._meta.favCat;
  return f && f.until >= todayStr && CATEGORIES.includes(f.cat) ? f.cat : null;
}

// Fecha a sondagem anterior e guarda o resultado
async function closePreviousPoll() {
  const p = history._meta.poll;
  if (!p?.messageId || p.closed) return;
  p.closed = true;
  if (DRY_RUN) return;
  const r = await tgRaw("stopPoll", { chat_id: CHAT_ID, message_id: p.messageId });
  const opts = r.result?.options;
  if (!r.ok || !opts) { console.log(`Sondagem anterior: não deu para fechar (${r.description || "sem resposta"}).`); return; }
  const total = opts.reduce((s, o) => s + o.voter_count, 0);
  if (!total) { console.log("Sondagem anterior fechada sem votos."); return; }
  const best = opts.reduce((bi, o, i) => (o.voter_count > opts[bi].voter_count ? i : bi), 0);
  if (p.type === "cat") {
    history._meta.favCat = { cat: p.keys[best], until: addDays(todayStr, FAV_CAT_DAYS) };
    console.log(`Sondagem de categorias: ganhou "${p.keys[best]}" (${opts[best].voter_count}/${total} votos).`);
  } else {
    history._meta.pollWinners = [...(history._meta.pollWinners || []),
      { date: p.date, title: p.titles[best], url: p.urls[best], votes: opts[best].voter_count, total }].slice(-14);
    console.log(`Sondagem de produtos: ganhou "${p.titles[best]}" (${opts[best].voter_count}/${total} votos).`);
  }
}

async function publishPollIfDue() {
  if (!inPostHours() || lisbonHour < POLL_HOUR || history._meta.pollDate === todayStr) return false;
  await closePreviousPoll();

  let poll = null;
  // Dias pares: produtos (dos que já saíram hoje nas grelhas, de categorias diferentes)
  if (daysBetween("2026-01-01", todayStr) % 2 === 0) {
    const featuredToday = new Set(Object.entries(history._meta.featured || {}).filter(([, d]) => d === todayStr).map(([a]) => a));
    const pool = productPool()
      .filter(it => it.title && it.price >= GRID_MIN_PRICE && !isLowValue(it.title) && !isUsedOrRefurbished(it.title) && !wasSent(it.asin))
      .sort((a, b) => (featuredToday.has(b.asin) - featuredToday.has(a.asin)) || (b.rating || 0) - (a.rating || 0));
    const picks = [], cats = new Set();
    for (const it of pool) if (!cats.has(it.cat) && picks.length < 4) { picks.push(it); cats.add(it.cat); }
    if (picks.length >= 3) {
      const titles = picks.map(it => shortenTitle(cleanAndTranslateTitle(it.title), 60));
      poll = {
        type: "prod",
        question: "🗳️ SONDAGEM DO DIA — Qual destes compravas?",
        options: picks.map((it, i) => cutText(`${titles[i]} — ${it.from ? "desde " : ""}${formatEur(it.price * VAT_ES_TO_PT)}`, 100)),
        keys: picks.map(it => it.asin), titles,
        urls: picks.map(it => `https://www.amazon.es/dp/${it.asin}?tag=${TAG}`)
      };
    }
  }
  // Dias ímpares (ou sem produtos suficientes): categorias
  if (!poll) {
    const all = CATEGORIES.filter(c => CAT_TITLES[c]);
    const off = daysBetween("2026-01-01", todayStr) % all.length;
    const keys = all.slice(off).concat(all.slice(0, off)).slice(0, 10);
    poll = {
      type: "cat",
      question: "🗳️ SONDAGEM DO DIA — Que categoria queres ver mais no Radar? (a mais votada aparece mais vezes esta semana)",
      options: keys.map(c => CAT_TITLES[c].replace(" TOP ", " ")), keys
    };
  }

  const r = await telegram("sendPoll", {
    question: poll.question, options: poll.options.map(text => ({ text })), is_anonymous: true
  });
  if (!r.ok) return false;
  history._meta.poll = { messageId: r.result?.message_id || null, date: todayStr, type: poll.type, keys: poll.keys, titles: poll.titles || [], urls: poll.urls || [] };
  history._meta.pollDate = todayStr;
  console.log(`Sondagem do dia publicada (${poll.type === "cat" ? "categorias" : "produtos"}).`);
  return true;
}

// Palavras-chave de um pedido ("quero uma airfryer xiaomi barata" → ["airfryer", "xiaomi"])
const PEDIDO_STOP = new Set(("de da do das dos para com sem um uma uns umas o a os as e ou em no na nos nas que " +
  "mais menos barato barata baratos baratas preco precos promo promocao promocoes desconto descontos quero queria " +
  "procuro procura alguem algum alguma bom boa boas bons melhor ola obrigado por favor pf tipo coisa algo " +
  "el la los las un una con y por").split(" "));
function pedidoKeywords(text) {
  return [...new Set(norm(text).split(" ").filter(w => (w.length >= 3 || /\d/.test(w)) && !PEDIDO_STOP.has(w)))].slice(0, 4);
}
function matchesPedido(p, title) {
  const t = " " + norm(title) + " " + norm(cleanAndTranslateTitle(title)) + " ";
  return p.kw.length > 0 && p.kw.every(k => t.includes(" " + k));
}
const activePedidos = () => (history._meta.pedidos || []).filter(p => !p.done && daysBetween(p.date, todayStr) <= PEDIDO_DAYS);

let botUsername = null;
async function getBotUsername() {
  if (botUsername) return botUsername;
  if (DRY_RUN) return (botUsername = "o_bot_do_radar");
  const r = await tgRaw("getMe");
  botUsername = r.result?.username || null;
  return botUsername;
}

// Lê as mensagens novas enviadas ao bot (privado) ou no grupo de comentários do canal
async function collectPedidos() {
  if (DRY_RUN || !BOT_TOKEN) return;
  const r = await tgRaw("getUpdates", { offset: history._meta.updOffset || 0, timeout: 0, allowed_updates: ["message"] });
  if (!r.ok) { console.log(`Pedidos: não deu para ler mensagens (${r.description || "sem resposta"}).`); return; }
  // Grupo de comentários ligado ao canal (pergunta ao Telegram uma vez; depois atualiza ao domingo)
  if (history._meta.linkedChatId === undefined) {
    const chat = await tgRaw("getChat", { chat_id: CHAT_ID });
    if (chat.ok) history._meta.linkedChatId = chat.result?.linked_chat_id || null;
  }
  const linked = history._meta.linkedChatId || null;
  const fresh = [];
  for (const u of Array.isArray(r.result) ? r.result : []) {
    history._meta.updOffset = u.update_id + 1;
    const m = u.message;
    if (!m?.text || m.from?.is_bot) continue;
    const isPrivate = m.chat?.type === "private";
    if (!isPrivate && !(linked && m.chat?.id === linked)) continue;
    const text = m.text.trim();
    if (text.startsWith("/")) {
      if (isPrivate) await tgRaw("sendMessage", { chat_id: m.chat.id, parse_mode: "HTML",
        text: "👋 Olá! Escreve aqui o produto que procuras (ex.: <i>airfryer xiaomi</i>, <i>ps5</i>, <i>berbequim bosch</i>).\n\nSe aparecer abaixo do preço mais baixo que registámos, publicamos no canal @radardescontos_pt com 🎯." });
      continue;
    }
    const kw = pedidoKeywords(text);
    if (text.length < 3 || text.length > 120 || !kw.length) continue;
    const pedidos = (history._meta.pedidos ||= []);
    if (pedidos.some(p => !p.done && p.kw.join(" ") === kw.join(" "))) continue; // já pedido
    // Quem pediu: para o identificar no post 🎯 e o avisar diretamente quando baixar
    pedidos.push({ q: cutText(text.replace(/\s+/g, " "), 60), kw, date: todayStr,
      uid: m.from?.id || null, name: cutText(m.from?.first_name || "um seguidor", 30), user: m.from?.username || null,
      chat: m.chat.id, msg: m.message_id, priv: isPrivate });
    fresh.push(text);
    if (isPrivate) await tgRaw("sendMessage", { chat_id: m.chat.id, parse_mode: "HTML",
      text: `✅ Anotado: «${escapeHtml(cutText(text, 60))}»\n\nFicamos de olho durante 30 dias. Se baixar de preço, avisamos-te aqui e publicamos no canal @radardescontos_pt com 🎯 e o teu nome.\n<i>Vigiamos os mais vendidos da Amazon ES e as lojas parceiras — não conseguimos garantir todos os produtos.</i>` });
  }
  history._meta.pedidos = (history._meta.pedidos || [])
    .filter(p => daysBetween(p.date, todayStr) <= PEDIDO_DAYS).slice(-PEDIDOS_MAX);
  if (fresh.length) {
    console.log(`Pedidos novos: ${fresh.length}.`);
    await sendAdmin(`🎯 <b>Radar — ${fresh.length} pedido(s) novo(s)</b>\n\n` + fresh.map(t => `• ${escapeHtml(cutText(t, 80))}`).join("\n"));
  }
}

async function publishPedidosIfDue() {
  if (weekdayLisbon !== PEDIDOS_WEEKDAY || !inPostHours() || lisbonHour < PEDIDOS_HOUR || history._meta.pedidosPostDate === todayStr) return false;
  const bot = await getBotUsername();
  if (!bot) return false;
  // Grupo de comentários ligado ao canal (se houver, também aceitamos pedidos lá)
  if (!DRY_RUN) {
    const chat = await tgRaw("getChat", { chat_id: CHAT_ID });
    history._meta.linkedChatId = chat.result?.linked_chat_id || null;
  }
  const comments = !!history._meta.linkedChatId;
  const text =
    `🎯 <b>CAÇA-PEDIDOS DE DOMINGO</b>\n\n` +
    `Andas de olho nalguma coisa? Diz-nos o que procuras e o Radar fica atento ao preço durante 30 dias.\n\n` +
    `✍️ Envia o nome do produto ao @${bot}${comments ? " ou escreve aqui nos comentários" : ""}\n` +
    `<i>Ex.: airfryer xiaomi · ps5 · berbequim bosch · robot aspirador</i>\n\n` +
    `🔔 Se aparecer abaixo do preço mais baixo que registámos, publicamos aqui com 🎯.\n` +
    `<i>Vigiamos os mais vendidos da Amazon ES e as lojas parceiras — não conseguimos garantir todos os produtos.</i>`;
  const r = await telegram("sendMessage", { text, parse_mode: "HTML", disable_web_page_preview: true,
    reply_markup: { inline_keyboard: [[{ text: "✍️ Fazer um pedido", url: `https://t.me/${bot}?start=pedido` }]] } });
  if (!r.ok) return false;
  history._meta.pedidosPostDate = todayStr;
  console.log("Caça-pedidos publicado.");
  return true;
}

// Nome de quem pediu: @utilizador, ou o primeiro nome com ligação ao perfil
function whoAsked(p) {
  if (p.user) return `@${escapeHtml(p.user)}`;
  if (p.uid) return `<a href="tg://user?id=${p.uid}">${escapeHtml(p.name)}</a>`;
  return escapeHtml(p.name || "um seguidor");
}

// Avisa quem pediu: em privado (se pediu ao bot) ou em resposta ao comentário no grupo
async function notifyRequester(p, d) {
  if (DRY_RUN || !p.chat) return;
  const text = `🎯 <b>Encontrámos o teu pedido!</b>\n«${escapeHtml(p.q)}»\n\n📦 ${escapeHtml(d.title)}\n` +
    `❌ <s>${d.prices.oldPrice}</s> ✅ <b>${d.prices.currentPrice}</b> (-${d.prices.discountPct}%)\n\n👉 <a href="${d.url}">Ver oferta na ${escapeHtml(d.store)}</a>`;
  const r = await tgRaw("sendMessage", { chat_id: p.chat, text, parse_mode: "HTML",
    ...(p.priv ? {} : { reply_to_message_id: p.msg, allow_sending_without_reply: true }) });
  console.log(r.ok ? `Pedido: avisei quem pediu («${p.q}»).` : `Pedido: não deu para avisar quem pediu (${r.description}).`);
}

// Desconto especial para sair sozinho: primeiro um pedido de seguidor, depois um "mínimo do Radar"
function pickSpecialDeal(deals) {
  for (const p of activePedidos()) {
    const d = deals.find(x => matchesPedido(p, x.title));
    if (d) return { deal: d, pedido: p,
      header: `🎯 <b>PEDIDO ENCONTRADO!</b>\nPedido de ${whoAsked(p)}: «${escapeHtml(p.q)}» — baixou de preço 👇` };
  }
  if ((dailyData.recordAlerts || 0) < RECORD_MAX_PER_DAY) {
    const d = deals.find(x => (x.refDays || 0) >= RECORD_MIN_DAYS && x.prices.discountPct >= RECORD_MIN_PCT);
    if (d) return { deal: d, record: true,
      header: `🚨 <b>MÍNIMO DO RADAR!</b> 🚨\n<i>O preço mais baixo que registámos para este produto</i>` };
  }
  return null;
}

// Guarda as ofertas publicadas (7 dias) para "As melhores da semana"
function updateWeekLog() {
  const week = (history._meta.week ||= {});
  for (const d of dailyData.deals) {
    if (d.asin && !week[d.asin]) week[d.asin] = { date: todayStr, title: d.title, oldPrice: d.oldPrice, currentPrice: d.currentPrice, discountPct: d.discountPct, affUrl: d.affUrl, imgUrl: d.imgUrl || null };
  }
  for (const [k, v] of Object.entries(week)) if (daysBetween(v.date, todayStr) > 7) delete week[k];
}

async function publishWeeklyIfDue() {
  if (weekdayLisbon !== WEEKLY_WEEKDAY || !inPostHours() || lisbonHour < WEEKLY_HOUR || history._meta.weeklyDate === todayStr) return false;
  const top = Object.values(history._meta.week || {}).sort((a, b) => b.discountPct - a.discountPct).slice(0, 5);
  const voted = (history._meta.pollWinners || []).filter(w => daysBetween(w.date, todayStr) <= 7).sort((a, b) => b.votes - a.votes)[0];
  if (top.length < 3 && !voted) {
    console.log(`Melhores da semana: só ${top.length} oferta(s) registada(s) — fica para a próxima semana.`);
    if (lisbonHour >= 21) history._meta.weeklyDate = todayStr;
    return false;
  }
  const build = len => {
    let c = `🏆 <b>AS MELHORES DA SEMANA — RADAR PT</b>\n`;
    if (top.length) {
      c += `<i>Os maiores descontos que publicámos nos últimos 7 dias:</i>\n\n`;
      top.forEach((d, i) => {
        c += `${MEDALS[i]} <a href="${withClickref(d.affUrl, "semana")}">${escapeHtml(cutText(d.title, len))}</a>\n<s>${d.oldPrice}</s> ➡️ <b>${d.currentPrice}</b> (-${d.discountPct}%)\n\n`;
      });
    }
    if (voted) c += `🗳️ <b>O mais votado nas sondagens:</b> <a href="${voted.url}">${escapeHtml(cutText(voted.title, len))}</a> (${voted.votes} de ${voted.total} votos)\n\n`;
    return c + `⚠️ <i>Preços de quando publicámos — alguns podem já ter mudado. Confirma no link.</i>`;
  };
  let caption = build(60);
  for (const len of [45, 32]) if (visibleLength(caption) > 1024) caption = build(len);
  const photo = top[0]?.imgUrl;
  let ok = false;
  if (photo && visibleLength(caption) <= 1024) ok = (await telegram("sendPhoto", { photo, caption, parse_mode: "HTML" })).ok;
  if (!ok) ok = (await telegram("sendMessage", { text: caption, parse_mode: "HTML", disable_web_page_preview: true })).ok;
  if (ok) { history._meta.weeklyDate = todayStr; console.log("Melhores da semana publicadas."); }
  return ok;
}

// Montra: lê a 1.ª lista de cada categoria nova e publica uma grelha de cada, com intervalo
async function publishShowcase() {
  let done = 0;
  const cats = SHOWCASE_ONLY.length ? SHOWCASE_ONLY : SHOWCASE_CATS;
  for (const [i, cat] of cats.entries()) {
    const src = nextSource(cat);
    let res;
    try { res = await fetchCategory(src.path); } catch (e) { console.error(`Montra ${cat}: ${e.message}`); continue; }
    if (res.blocked) { console.warn(`Montra: a Amazon pediu captcha em ${cat} — paro aqui.`); runNotes.push(`montra parou em ${cat} (captcha)`); break; }
    const items = src.only ? res.items.filter(it => src.only(it.title)) : res.items;
    const asins = new Set(items.map(it => it.asin));
    lastSeenItems = lastSeenItems.filter(x => !asins.has(x.asin)).concat(items.map(it => ({ ...it, cat })));
    for (const it of items) recordPrice({ ...it, cat });
    if (await publishBestsellerGrid({ forceCats: [cat] })) { done++; markPosted(); console.log(`Montra: ${cat} publicada.`); }
    else console.log(`Montra: ${cat} sem produtos suficientes.`);
    if (i < cats.length - 1) await sleep(SHOWCASE_GAP_SEC * 1000);
  }
  return done;
}

// Mensagem de boas-vindas: publicada e fixada no canal só quando pedido (workflow manual)
const WELCOME_TEXT =
  `👋 <b>Bem-vindo ao Radar Descontos & Tech PT!</b>\n\n` +
  `Aqui encontras as melhores promoções de <b>tecnologia, gaming, casa e desporto</b> com envio para Portugal — escolhidas automaticamente, todos os dias.\n\n` +
  `📌 <b>Como funciona</b>\n` +
  `• ❌ ANTES / ✅ AGORA — só publicamos descontos reais, com preços já com IVA português\n` +
  `• 🔥 Novas ofertas e mais vendidos a cada 20 minutos\n` +
  `• ⭐ Oferta do dia, por volta do almoço\n` +
  `• 🏆 Top 5 do dia, às 21h\n` +
  `• 🗳️ Sondagem do dia, às 13h\n` +
  `• 🎯 Caça-pedidos ao domingo — diz-nos o que procuras\n` +
  `• 🚨 Mínimo do Radar — quando um produto chega ao preço mais baixo que registámos\n` +
  `• 🕘 Publicações entre as 9h e as 22h — nada de madrugada\n\n` +
  `🏷️ Toca numa etiqueta (#tech, #gaming, #casa, #auto…) para ver só essa categoria.\n\n` +
  `🔔 <b>Ativa as notificações</b> para não perderes as ofertas relâmpago — o stock esgota depressa!\n\n` +
  `📣 Conheces alguém que gosta de poupar? Partilha: t.me/radardescontos_pt\n\n` +
  `<i>Como Afiliado da Amazon e de outras lojas, obtemos uma comissão por compras qualificadas, sem custo extra para ti.</i>`;

async function publishWelcome() {
  const r = await telegram("sendMessage", { text: WELCOME_TEXT, parse_mode: "HTML", disable_web_page_preview: true });
  if (!r.ok) return;
  const messageId = r.result?.message_id;
  if (messageId) {
    const pin = await telegram("pinChatMessage", { message_id: messageId, disable_notification: true });
    console.log(pin.ok ? "Boas-vindas publicada e fixada." : "Boas-vindas publicada (não deu para fixar).");
  } else console.log("Boas-vindas publicada.");
}

// ---------------------------------------------------------------------------
// Ciclo principal
// ---------------------------------------------------------------------------
async function run() {
  console.log(`A iniciar varrimento do Radar (${todayStr}, ${lisbonHour}h Lisboa)${DRY_RUN ? " [DRY_RUN]" : ""}...`);

  const amazon = (await fetchCandidateDeals()).map(c => ({
    ...c, id: c.asin, store: "Amazon ES", url: `https://www.amazon.es/dp/${c.asin}?tag=${TAG}`
  }));
  let awin = [];
  try {
    awin = await fetchAwinCandidates({
      feedUrl: AWIN_FEED_URL, exclude: AWIN_EXCLUDE, isUsed: isUsedOrRefurbished, isBlocked: isBlockedSource
    });
  } catch (e) {
    console.error(`Feed Awin falhou: ${e.message}`);
  }

  // Alterna Amazon e Awin para o canal não ficar só com uma loja
  const candidates = [];
  for (let i = 0; i < Math.max(amazon.length, awin.length); i++) {
    if (amazon[i]) candidates.push(amazon[i]);
    if (awin[i]) candidates.push(awin[i]);
  }

  const stats = { bloqueada: 0, usado: 0, semStock: 0, repetido: 0, semDesconto: 0, poucoInteresse: 0 };
  let published = 0;

  if (PUBLISH_WELCOME) await publishWelcome();
  try { await collectPedidos(); } catch (e) { console.error(`Pedidos falharam: ${e.message}`); }

  // Ofertas com desconto real, já filtradas
  const deals = [];
  for (const c of candidates) {
    const id = String(c.id || "");
    if (!id || !c.url) continue;
    if (isBlockedSource(c.imgUrl, c.url)) { stats.bloqueada++; continue; }
    if (wasSent(id)) { stats.repetido++; continue; }
    if (c.available === false) { stats.semStock++; continue; }
    if ((c.condition && !/^(new|nuevo|novo)$/i.test(c.condition)) || isUsedOrRefurbished(c.title)) { stats.usado++; continue; }
    if (isLowValue(c.title)) { stats.poucoInteresse++; continue; }
    const prices = computePrices(c.currentPrice, c.oldPrice, c.pricesIncludeEsVat !== false);
    if (!prices) { stats.semDesconto++; continue; }
    deals.push({ ...c, id, prices, title: shortenTitle(cleanAndTranslateTitle(c.title), 90) });
  }

  const gap = minutesSinceLastPost();
  if (FORCE_OTTOCAST) {
    // Pedido manual: publica já a grelha Ottocast (mesmo fora de horas) e não publica mais nada neste ciclo
    if (await publishOttocastGrid({ force: true })) { published++; markPosted(); }
  } else if (BRAND_SPECIALS[FORCE_BRAND]) {
    // Pedido manual: publica já o especial da marca escolhida (mesmo fora de horas)
    if (await publishBrandSpecial(FORCE_BRAND, { force: true })) { published++; markPosted(); }
  } else if (FORCE_SHOWCASE) {
    published += await publishShowcase();
  } else if (FORCE_GRID) {
    // Pedido manual: grelha temática já (mesmo fora de horas, sem esperar pela próxima)
    if (await publishBestsellerGrid({ forceCats: FORCE_GRID })) { published++; markPosted(); }
  } else if (!inPostHours()) {
    console.log(`Fora do horário de publicação (${POST_HOURS[0]}h–${POST_HOURS[1]}h): só registo preços.`);
  } else if (gap < MIN_GAP_MIN) {
    console.log(`Última publicação há ${Math.round(gap)} min — espero pelo próximo ciclo.`);
    runNotes.push(`última publicação há ${Math.round(gap)} min`);
  } else if (await publishOttocastGrid()) {
    published++;
    markPosted();
  } else if (await publishDueBrandSpecial()) {
    published++;
    markPosted();
  } else if (await publishDealOfDayIfDue(candidates)) {
    published++;
  } else if (deals.length) {
    // Com descontos: 1 oferta sozinha ou grelha com até 4
    const special = pickSpecialDeal(deals);
    const batch = special ? [special.deal] : deals.slice(0, GRID_SIZE);
    let ok;
    if (special) {
      const d = special.deal;
      ok = !!(await publishDeal(d.url, d.store, d.title, d.prices, d.imgUrl || null, d.pricesIncludeEsVat !== false,
        { tags: tagsFor({ cat: d.cat, store: d.store }), refDays: d.refDays || 0, header: special.header }));
      if (ok && special.pedido) { special.pedido.done = todayStr; await notifyRequester(special.pedido, d); }
      if (ok && special.record) dailyData.recordAlerts = (dailyData.recordAlerts || 0) + 1;
      if (ok) console.log(special.pedido ? `Pedido encontrado: «${special.pedido.q}» → ${d.id}` : `Mínimo do Radar: ${d.id}`);
    } else if (batch.length === 1) {
      const d = batch[0];
      ok = !!(await publishDeal(d.url, d.store, d.title, d.prices, d.imgUrl || null, d.pricesIncludeEsVat !== false,
        { tags: tagsFor({ cat: d.cat, store: d.store }), refDays: d.refDays || 0 }));
    } else {
      ok = await publishDealsGrid(batch);
    }
    if (ok) {
      for (const d of batch) {
        sent[d.id] = todayStr;
        dailyData.deals.push({ asin: d.id, store: d.store, title: d.title, ...d.prices, affUrl: d.url, imgUrl: d.imgUrl || null });
        console.log(`Publicado: ${d.store} | ${d.id} | ${d.title} | ${d.prices.oldPrice} → ${d.prices.currentPrice} (-${d.prices.discountPct}%)`);
      }
      published += batch.length;
      markPosted();
    }
  } else if (await publishBestsellerGrid()) {
    published++;
    markPosted();
  }

  console.log(`Publicadas: ${published}. Ignoradas →`, JSON.stringify(stats));
  const topPosted = await publishDailyTopIfDue();

  // Interação: sondagem (13h), caça-pedidos (domingo), melhores da semana (sexta) — além do post normal
  updateWeekLog();
  let extras = 0;
  if (!FORCE_OTTOCAST && !BRAND_SPECIALS[FORCE_BRAND] && !FORCE_GRID && !FORCE_SHOWCASE) {
    for (const fn of [publishPollIfDue, publishPedidosIfDue, publishWeeklyIfDue]) {
      try { if (await fn()) extras++; } catch (e) { console.error(`${fn.name} falhou: ${e.message}`); }
    }
  }

  // Resumo privado para o dono quando nada foi publicado no canal
  if (ADMIN_CHAT_ID && published === 0 && !topPosted && !extras && !bestsellerPaced) {
    const reasons = [];
    if (!inPostHours()) reasons.push(`fora do horário de publicação (${POST_HOURS[0]}h–${POST_HOURS[1]}h)`);
    reasons.push(`${lastSeenItems.length} produtos lidos, ${candidates.length} abaixo do preço do histórico`);
    if (stats.semDesconto) reasons.push(`${stats.semDesconto} com desconto abaixo de ${MIN_DISCOUNT_PCT}%`);
    if (stats.repetido) reasons.push(`${stats.repetido} já publicadas`);
    reasons.push(...runNotes);
    const text = `🤖 <b>Radar PT — ${String(lisbonHour).padStart(2, "0")}h</b>\nNenhuma promoção publicada neste ciclo.\n\n` +
      reasons.map(r => `• ${escapeHtml(r)}`).join("\n");
    await sendAdmin(text);
  }
}

// Mensagem privada (não conta para o estado do ciclo; se falhar, só fica no log)
async function sendAdmin(text) {
  if (DRY_RUN) { console.log(`\n[DRY_RUN] privado para ${ADMIN_CHAT_ID}:\n${text}\n`); return; }
  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: ADMIN_CHAT_ID, text, parse_mode: "HTML", disable_notification: true }),
      signal: AbortSignal.timeout(20000)
    });
    const data = await res.json().catch(() => ({}));
    if (data.ok) console.log("Resumo privado enviado ao dono.");
    else console.error(`Resumo privado falhou: ${data.description || res.status} (o dono já carregou em Iniciar no bot?)`);
  } catch (e) {
    console.error(`Resumo privado erro: ${e.message}`);
  }
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
