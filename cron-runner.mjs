import fs from "fs";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "8933540772:AAFP2_IKfYKLADfcv5rn7Miq_MuFnPEy1p4";
const CHAT_ID = process.env.TELEGRAM_CHAT_ID || "-1003846917730";
const TAG = process.env.AMAZON_PARTNER_TAG || "radardescontospt-21";
const DB_FILE = "sent_deals.json";
const DAILY_FILE = "daily_deals.json";

let sent = [];
if (fs.existsSync(DB_FILE)) {
  try {
    sent = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
    if (!Array.isArray(sent)) sent = [];
  } catch (e) {
    sent = [];
  }
}

let dailyData = { date: "", lastSummaryDate: "", deals: [] };
if (fs.existsSync(DAILY_FILE)) {
  try {
    dailyData = JSON.parse(fs.readFileSync(DAILY_FILE, "utf8"));
    if (!dailyData || !Array.isArray(dailyData.deals)) {
      dailyData = { date: "", lastSummaryDate: "", deals: [] };
    }
  } catch (e) {
    dailyData = { date: "", lastSummaryDate: "", deals: [] };
  }
}

const todayStr = new Date().toISOString().slice(0, 10);
if (dailyData.date !== todayStr) {
  dailyData.date = todayStr;
  dailyData.deals = [];
}

async function fetchWithTimeout(url, timeoutMs = 6500) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept-Language": "pt-PT,pt;q=0.9,es;q=0.8"
      },
      redirect: "follow",
      signal: controller.signal
    });
    const text = await res.text();
    return { text, finalUrl: res.url };
  } finally {
    clearTimeout(id);
  }
}

function parseNum(str) {
  if (!str) return 0;
  return parseFloat(String(str).replace(",", "."));
}

function formatEur(num) {
  return num.toFixed(2).replace(".", ",") + "€";
}

function extractPrices(itemXml, rawTitle, desc, pageHtml = "") {
  let currentVal = 0;
  let oldVal = 0;

  // 1. Preço atual da tag oficial <pepper:merchant price="XX.XX€">
  const pepperMatch = itemXml.match(/price=["']\s*([0-9]+[.,]?[0-9]*)\s*€?\s*["']/i);
  if (pepperMatch) {
    const v = parseNum(pepperMatch[1]);
    if (v > 0.5) currentVal = v;
  }

  // 2. Preços no Título e Descrição
  const textToSearch = `${rawTitle} ${desc}`;
  const priceMatches = [...textToSearch.matchAll(/([0-9]{1,4}(?:[.,][0-9]{1,2})?)\s*€/g)]
    .map(m => parseNum(m[1]))
    .filter(n => n > 0.5);

  if (!currentVal && priceMatches.length > 0) {
    currentVal = priceMatches[0];
  }

  for (const p of priceMatches) {
    if (currentVal > 0 && p > currentVal * 1.05) {
      oldVal = p;
      break;
    }
  }

  // 3. Preço Antes/Original no HTML (nextBestPrice / PVP / Antes)
  if (pageHtml) {
    if (!currentVal) {
      const htmlPrice = pageHtml.match(/"price"\s*:\s*"?([0-9]{1,4}(?:[.,][0-9]{1,2})?)"?/i);
      if (htmlPrice && parseNum(htmlPrice[1]) > 0.5) {
        currentVal = parseNum(htmlPrice[1]);
      }
    }
    if (!oldVal) {
      const nextBest =
        pageHtml.match(/"nextBestPrice"\s*:\s*"?([0-9]{1,4}(?:[.,][0-9]{1,2})?)"?/i) ||
        pageHtml.match(/(?:PVP|Antes|habitual|original)[:\s]*([0-9]{1,4}(?:[.,][0-9]{1,2})?)\s*€/i);
      if (nextBest) {
        const candidate = parseNum(nextBest[1]);
        if (currentVal > 0 && candidate > currentVal * 1.05) {
          oldVal = candidate;
        }
      }
    }
  }

  return {
    currentPrice: currentVal > 0.5 ? formatEur(currentVal) : null,
    oldPrice: oldVal > currentVal ? formatEur(oldVal) : null,
    discountPct: oldVal > currentVal ? Math.round(((oldVal - currentVal) / oldVal) * 100) : 0
  };
}

function cleanAndTranslateTitle(title) {
  return title
    .replace(/\s*[-–|]?\s*\d+[.,]?\d*\s*€/g, "")
    .replace(/Envío gratis/gi, "Envio grátis")
    .replace(/Auriculares inalámbricos/gi, "Auscultadores sem fios")
    .replace(/Auriculares/gi, "Auscultadores")
    .replace(/Barra de Sonido/gi, "Barra de Som")
    .replace(/Mascarilla/gi, "Máscara Capilar")
    .replace(/Cabello Teñido/gi, "Cabelo Pintado")
    .replace(/Cabello/gi, "Cabelo")
    .replace(/Champú/gi, "Champô")
    .replace(/Crema de Noche/gi, "Creme de Noite")
    .replace(/Ratón/gi, "Rato")
    .replace(/Pulgadas/gi, "Polegadas")
    .replace(/negro/gi, "preto")
    .replace(/blanco/gi, "branco")
    .trim();
}

async function publishDailyTopIfDue() {
  const currentHourUtc = new Date().getUTCHours();
  const forceTop = process.env.FORCE_TOP_DAY === "true";

  // Dispara automaticamente a partir das 20h UTC (21h de Lisboa) uma vez por dia
  if (!forceTop && (currentHourUtc < 20 || dailyData.lastSummaryDate === todayStr)) {
    return;
  }
  if (dailyData.deals.length < 2) return;

  // Ordena pelas maiores percentagens de desconto do dia (Top 5)
  const topDeals = [...dailyData.deals]
    .sort((a, b) => (b.discountPct || 0) - (a.discountPct || 0))
    .slice(0, 5);

  const medals = ["🥇", "🥈", "🥉", "4️⃣", "5️⃣"];
  let summaryCaption = `🏆 <b>TOP ${topDeals.length} OFERTAS DO DIA — RADAR PT</b> 🔥\n<i>Resumo das melhores oportunidades detetadas hoje na Amazon ES:</i>\n\n`;

  topDeals.forEach((d, idx) => {
    const shortTitle = d.title.length > 52 ? d.title.slice(0, 49) + "..." : d.title;
    const priceInfo = d.oldPrice
      ? `<s>${d.oldPrice}</s> ➡️ <b>${d.currentPrice}</b> (-${d.discountPct}%)`
      : `<b>${d.currentPrice || "Oferta Flash"}</b>`;
    summaryCaption += `${medals[idx]} <b>${shortTitle}</b>\n💰 ${priceInfo}\n👉 <a href="${d.affUrl}">Ver oferta na Amazon ES</a>\n\n`;
  });

  summaryCaption += `⚡ <i>Ativa as notificações do canal para não perderes as quedas de preço de amanhã!</i>`;

  const dealsWithImg = topDeals.filter(d => d.imgUrl);

  let sentOk = false;
  // Se houver pelo menos 2 imagens, envia como Álbum de Fotos (MediaGroup) com o Top na legenda
  if (dealsWithImg.length >= 2) {
    const media = dealsWithImg.map((d, i) => ({
      type: "photo",
      media: d.imgUrl,
      ...(i === 0 ? { caption: summaryCaption, parse_mode: "HTML" } : {})
    }));

    try {
      const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMediaGroup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: CHAT_ID, media })
      }).then(res => res.json());
      sentOk = r.ok;
    } catch (e) {}
  }

  // Fallback caso alguma imagem falhe no álbum: envia post único com botões para cada oferta do Top
  if (!sentOk) {
    const buttons = topDeals.map((d, idx) => [{
      text: `${medals[idx]} ${d.currentPrice || "Ver"} - ${d.title.slice(0, 28)}...`,
      url: d.affUrl
    }]);

    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text: summaryCaption,
        parse_mode: "HTML",
        disable_web_page_preview: false,
        reply_markup: { inline_keyboard: buttons }
      })
    });
  }

  dailyData.lastSummaryDate = todayStr;
  console.log("Top do Dia publicado com sucesso!");
}

async function run() {
  console.log("A iniciar varrimento do Radar...");
  let xml = "";
  try {
    xml = (await fetchWithTimeout("https://www.chollometro.com/rss/todo")).text;
    if (!xml.includes("<item>")) throw new Error("Feed vazio");
  } catch (e) {
    xml = (await fetchWithTimeout("https://api.allorigins.win/raw?url=" + encodeURIComponent("https://www.chollometro.com/rss/todo"))).text;
  }

  const items = xml.split("<item>").slice(1, 20);
  let publishedCount = 0;

  for (const item of items) {
    if (publishedCount >= 2) break;

    const titleMatch = item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>(.*?)<\/title>/s);
    const linkMatch = item.match(/<link>(.*?)<\/link>/);
    const descMatch = item.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>|<description>(.*?)<\/description>/s);

    const rawTitle = (titleMatch ? (titleMatch[1] || titleMatch[2]) : "").trim();
    const dealLink = (linkMatch ? linkMatch[1] : "").trim();
    const desc = (descMatch ? (descMatch[1] || descMatch[2]) : "");

    if (!rawTitle.toLowerCase().includes("amazon") && !desc.toLowerCase().includes("amazon") && !item.toLowerCase().includes("amazon")) {
      continue;
    }

    let asin = null;
    let pageHtml = "";
    const directAsin = (desc + " " + dealLink + " " + item).match(/(?:dp|gp\/product)\/([A-Z0-9]{10})/i);
    if (directAsin) asin = directAsin[1].toUpperCase();

    if (dealLink) {
      try {
        const page = await fetchWithTimeout(dealLink);
        pageHtml = page.text;
        if (!asin) {
          const m = (page.finalUrl + " " + page.text).match(/amazon\.es\/(?:[^"'\s<>]*\/)?(?:dp|gp\/product)\/([A-Z0-9]{10})/i);
          if (m) asin = m[1].toUpperCase();
        }
      } catch (e) {}
    }

    if (!asin || sent.includes(asin)) continue;

    const { currentPrice, oldPrice, discountPct } = extractPrices(item, rawTitle, desc, pageHtml);

    let priceBlock = `🔥 <b>OFERTA FLASH / CUPÃO ATIVO</b>`;
    if (currentPrice && oldPrice) {
      priceBlock = `❌ ANTES: <s>${oldPrice}</s>\n✅ <b>AGORA: ${currentPrice}</b> <i>(-${discountPct}% DESCONTO!)</i>`;
    } else if (currentPrice) {
      priceBlock = `✅ <b>AGORA: ${currentPrice}</b> <i>(Preço Mínimo / Promoção)</i>`;
    }

    const imgMatch = item.match(/url="([^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/i) || desc.match(/<img[^>]+src="([^">]+)"/i);
    const imgUrl = imgMatch ? imgMatch[1] : null;

    const cleanTitle = cleanAndTranslateTitle(rawTitle);
    const affUrl = `https://www.amazon.es/dp/${asin}?tag=${TAG}`;

    const caption = `🔥 <b>ALERTA DE PREÇO DETETADO!</b>\n\n📦 <b>${cleanTitle}</b>\n\n${priceBlock}\n\n👉 <b>Ver Oferta na Amazon ES:</b>\n${affUrl}\n\n⚡ <i>Envio rápido para Portugal | Stock limitado</i>`;
    const reply_markup = { inline_keyboard: [[{ text: "🛒 Comprar na Amazon ES", url: affUrl }]] };

    let ok = false;
    if (imgUrl) {
      try {
        const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: CHAT_ID, photo: imgUrl, caption, parse_mode: "HTML", reply_markup })
        }).then(r => r.json());
        ok = r.ok;
      } catch (e) {}
    }
    if (!ok) {
      try {
        const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: CHAT_ID, text: caption, parse_mode: "HTML", reply_markup })
        }).then(r => r.json());
        ok = r.ok;
      } catch (e) {}
    }

    if (ok) {
      console.log("Publicado:", asin, cleanTitle, currentPrice, "Antes:", oldPrice);
      sent.push(asin);
      publishedCount++;

      // Regista a oferta na lista do Top do Dia
      dailyData.deals.push({
        asin,
        title: cleanTitle,
        currentPrice,
        oldPrice,
        discountPct,
        affUrl,
        imgUrl
      });
    }
  }

  // Verifica se já são 21h00 para lançar o Álbum do TOP DO DIA
  await publishDailyTopIfDue();

  fs.writeFileSync(DB_FILE, JSON.stringify(sent.slice(-500), null, 2));
  fs.writeFileSync(DAILY_FILE, JSON.stringify(dailyData, null, 2));
}

run()
  .catch(e => console.error("Erro controlado:", e.message))
  .finally(() => process.exit(0));
