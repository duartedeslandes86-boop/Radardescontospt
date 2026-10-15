// Radar Descontos & Tech PT — motor automático (GitHub Actions, a cada 20 min)
// Publica no Telegram ofertas da Amazon ES: só produtos novos, com preço ANTES e AGORA
// ajustados ao IVA português. Às 21h (Lisboa) envia o Top 5 do dia em álbum.
//
// Fonte das ofertas: API oficial da Amazon (Creators API / PA-API) — por ligar.
// Enquanto a API não estiver configurada, o bot não publica ofertas novas.
// Fontes de terceiros (Chollometro e afins) estão bloqueadas.
import fs from "fs";

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

let sent = readJson(DB_FILE, []);
if (!Array.isArray(sent)) sent = [];

let dailyData = readJson(DAILY_FILE, null);
if (!dailyData || !Array.isArray(dailyData.deals)) dailyData = { date: "", lastSummaryDate: "", deals: [] };
if (dailyData.date !== todayStr) {
  dailyData.date = todayStr;
  dailyData.deals = [];
}

// ---------------------------------------------------------------------------
// Telegram
// ---------------------------------------------------------------------------
async function telegram(method, payload) {
  if (DRY_RUN) {
    console.log(`\n[DRY_RUN] ${method}:\n${JSON.stringify(payload, null, 2)}\n`);
    return { ok: true };
  }
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: CHAT_ID, ...payload })
  });
  const data = await res.json();
  if (!data.ok) console.error(`Telegram ${method} falhou: ${data.description}`);
  return data;
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

function formatEur(n) {
  return n.toFixed(2).replace(".", ",") + "€";
}

// Bloquear recondicionados, usados, caixa aberta, Amazon Warehouse, etc.
function isUsedOrRefurbished(text = "") {
  const t = text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  return /\b(reaco|reacondicionad[oa]s?|recondicionad[oa]s?|segunda mano|caja abierta|caixa aberta|usad[oa]s?|warehouse|como nuevo|como novo|refurbished|renewed|seminuev[oa]s?)\b/.test(t);
}

// Preço ANTES e AGORA, com ajuste IVA ES 21% → PT 23% (só se o preço vier com IVA espanhol)
function computePrices(currentRaw, oldRaw, pricesIncludeEsVat = true) {
  const factor = pricesIncludeEsVat ? VAT_ES_TO_PT : 1;
  const cur = parseEuro(currentRaw) * factor;
  const old = parseEuro(oldRaw) * factor;
  if (cur <= 0.5 || old <= cur) return null;
  const discountPct = Math.round(((old - cur) / old) * 100);
  if (discountPct < MIN_DISCOUNT_PCT) return null;
  return { currentPrice: formatEur(cur), oldPrice: formatEur(old), discountPct };
}

// Título em PT-PT: tirar preços e limpar palavras espanholas que sobrem
const TRANSLATIONS = [
  [/Auriculares inal[aá]mbricos/gi, "Auscultadores sem fios"],
  [/Auriculares/gi, "Auscultadores"],
  [/Barra de Sonido/gi, "Barra de Som"],
  [/Mascarilla/gi, "Máscara Capilar"],
  [/Cabello Te[ñn]ido/gi, "Cabelo Pintado"],
  [/Cabello/gi, "Cabelo"],
  [/Champ[uú]/gi, "Champô"],
  [/Crema de Noche/gi, "Creme de Noite"],
  [/Crema de D[ií]a/gi, "Creme de Dia"],
  [/Juego de/gi, "Conjunto de"],
  [/en trozos/gi, "em pedaços"],
  [/colores diferentes/gi, "cores diferentes"],
  [/Env[ií]o gratis/gi, "Envio grátis"],
  [/Rat[oó]n/gi, "Rato"],
  [/Pulgadas/gi, "Polegadas"],
  [/inal[aá]mbric[oa]s?/gi, "sem fios"],
  [/Gel de Ba[ñn]o/gi, "Gel de Banho"],
  [/Mu[ñn]ec([oa])/gi, "Bonec$1"],
  [/Zapatillas/gi, "Sapatilhas"],
  [/Calcetines/gi, "Meias"],
  [/Cargador/gi, "Carregador"],
  [/Altavoz/gi, "Coluna"],
  [/Reloj/gi, "Relógio"],
  [/Gafas/gi, "Óculos"],
  [/Funda/gi, "Capa"],
  [/Juguete/gi, "Brinquedo"],
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
// FONTE DAS OFERTAS — API oficial da Amazon (por ligar)
// Deve devolver: [{ asin, title, currentPrice, oldPrice, imgUrl, condition, available, pricesIncludeEsVat }]
// ---------------------------------------------------------------------------
async function fetchCandidateDeals() {
  console.log("Sem fonte de ofertas configurada (à espera das chaves da API oficial da Amazon). Nada a publicar.");
  return [];
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
    if (sent.includes(asin)) { stats.repetido++; continue; }
    if (c.available === false) { stats.semStock++; continue; }
    if ((c.condition && !/^(new|nuevo|novo)$/i.test(c.condition)) || isUsedOrRefurbished(c.title)) { stats.usado++; continue; }

    const prices = computePrices(c.currentPrice, c.oldPrice, c.pricesIncludeEsVat !== false);
    if (!prices) { stats.semDesconto++; continue; }

    const title = cleanAndTranslateTitle(c.title);
    const affUrl = await publishDeal(asin, title, prices, c.imgUrl || null);
    if (affUrl) {
      console.log(`Publicado: ${asin} | ${title} | ${prices.oldPrice} → ${prices.currentPrice} (-${prices.discountPct}%)`);
      sent.push(asin);
      published++;
      dailyData.deals.push({ asin, title, ...prices, affUrl, imgUrl: c.imgUrl || null });
    }
  }

  console.log(`Publicadas: ${published}. Ignoradas →`, JSON.stringify(stats));
  await publishDailyTopIfDue();
}

let exitCode = 0;
try {
  await run();
} catch (e) {
  console.error("Erro:", e.message);
  exitCode = 1;
} finally {
  // Remove do histórico do dia qualquer entrada de fontes bloqueadas
  dailyData.deals = dailyData.deals.filter(d => !isBlockedSource(d.affUrl, d.imgUrl));
  if (!DRY_RUN || process.env.SAVE_STATE === "true") {
    fs.writeFileSync(DB_FILE, JSON.stringify(sent.slice(-1000), null, 2));
    fs.writeFileSync(DAILY_FILE, JSON.stringify(dailyData, null, 2));
  }
}
process.exit(exitCode);
