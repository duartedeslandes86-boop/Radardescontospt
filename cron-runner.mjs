import fs from "fs";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "8933540772:AAFP2_IKfYKLADfcv5rn7Miq_MuFnPEy1p4";
const CHAT_ID = process.env.TELEGRAM_CHAT_ID || "-1003846917730";
const TAG = process.env.AMAZON_PARTNER_TAG || "radardescontospt-21";
const DB_FILE = "sent_deals.json";

let sent = [];
if (fs.existsSync(DB_FILE)) {
  try {
    sent = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
    if (!Array.isArray(sent)) sent = [];
  } catch (e) {
    sent = [];
  }
}

async function fetchWithTimeout(url, timeoutMs = 6000) {
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

function extractValidPrice(itemXml, rawTitle, desc, pageHtml = "") {
  // 1. Tenta extrair da tag oficial <pepper:merchant price="XX.XX€"> do RSS
  const pepperMatch = itemXml.match(/price=["']\s*([0-9]+[.,]?[0-9]*)\s*€?\s*["']/i);
  if (pepperMatch) {
    const val = parseFloat(pepperMatch[1].replace(",", "."));
    if (val > 0) return `${pepperMatch[1].replace(".", ",")}€`;
  }

  // 2. Tenta extrair do Título ou Descrição (ex: 13,61€ ou 29.99€)
  const textToSearch = `${rawTitle} ${desc}`;
  const priceMatches = [...textToSearch.matchAll(/([0-9]{1,4}(?:[.,][0-9]{1,2})?)\s*€/g)];
  for (const m of priceMatches) {
    const num = parseFloat(m[1].replace(",", "."));
    if (num > 0.5) {
      return `${m[1].replace(".", ",")}€`;
    }
  }

  // 3. Tenta extrair da página HTML do Chollometro se foi carregada
  if (pageHtml) {
    const htmlMatch = pageHtml.match(/"price"\s*:\s*"?([0-9]{1,4}(?:[.,][0-9]{1,2})?)"?/i);
    if (htmlMatch) {
      const num = parseFloat(htmlMatch[1].replace(",", "."));
      if (num > 0.5) return `${htmlMatch[1].replace(".", ",")}€`;
    }
  }

  return null;
}

function cleanAndTranslateTitle(title) {
  return title
    // Remove preços que já estejam repetidos no título
    .replace(/\s*[-–|]?\s*\d+[.,]?\d*\s*€/g, "")
    .replace(/Envío gratis/gi, "Envio grátis")
    .replace(/Auriculares inalámbricos/gi, "Auscultadores sem fios")
    .replace(/Auriculares/gi, "Auscultadores")
    .replace(/Tres Ventiladores en marco único/gi, "3 Ventoinhas em estrutura única")
    .replace(/Ratón/gi, "Rato")
    .replace(/Pulgadas/gi, "Polegadas")
    .replace(/Niño/gi, "Criança")
    .replace(/Videollamada/gi, "Videochamada")
    .replace(/Regalo/gi, "Presente")
    .replace(/Champú/gi, "Champô")
    .replace(/Crema de Noche/gi, "Creme de Noite")
    .replace(/negro/gi, "preto")
    .replace(/blanco/gi, "branco")
    .trim();
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

    if (!asin && dealLink) {
      try {
        const page = await fetchWithTimeout(dealLink);
        pageHtml = page.text;
        const m = (page.finalUrl + " " + page.text).match(/amazon\.es\/(?:[^"'\s<>]*\/)?(?:dp|gp\/product)\/([A-Z0-9]{10})/i);
        if (m) asin = m[1].toUpperCase();
      } catch (e) {}
    }

    if (!asin || sent.includes(asin)) continue;

    // Extrai preço real (> 0.50€); se ainda não tiver lido a página e faltar o preço, lê agora
    let price = extractValidPrice(item, rawTitle, desc, pageHtml);
    if (!price && dealLink && !pageHtml) {
      try {
        const page = await fetchWithTimeout(dealLink);
        pageHtml = page.text;
        price = extractValidPrice(item, rawTitle, desc, pageHtml);
      } catch (e) {}
    }

    // Se mesmo assim o preço não for encontrado ou for 0,00€, mostra indicação limpa em vez de 0,00€
    const priceLine = price ? `✅ <b>AGORA: ${price}</b>` : `🔥 <b>OFERTA FLASH / CUPÃO ATIVO</b>`;

    const imgMatch = item.match(/url="([^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/i) || desc.match(/<img[^>]+src="([^">]+)"/i);
    const imgUrl = imgMatch ? imgMatch[1] : null;

    const cleanTitle = cleanAndTranslateTitle(rawTitle);
    const affUrl = `https://www.amazon.es/dp/${asin}?tag=${TAG}`;

    const caption = `🔥 <b>ALERTA DE PREÇO DETETADO!</b>\n\n📦 <b>${cleanTitle}</b>\n\n${priceLine}\n\n👉 <b>Ver Oferta na Amazon ES:</b>\n${affUrl}\n\n⚡ <i>Envio rápido para Portugal | Stock limitado</i>`;
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
      console.log("Publicado com sucesso:", asin, cleanTitle, price || "Flash");
      sent.push(asin);
      publishedCount++;
    }
  }

  fs.writeFileSync(DB_FILE, JSON.stringify(sent.slice(-500), null, 2));
}

run()
  .catch(e => console.error("Erro controlado:", e.message))
  .finally(() => process.exit(0));
