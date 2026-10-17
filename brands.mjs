// Lojas Awin lidas diretamente da loja oficial (Shopify), com o deep link de afiliado Awin.
// Os feeds Awin destas lojas não trazem o preço anterior, por isso não servem para ANTES/AGORA.
//  - ALLPOWERS PT (Awin 125820): grelha especial diária
//  - jimmy.eu     (Awin 128677): grelha só quando há pelo menos 2 produtos em promoção
//  - Tenways EU   (Awin 72399):  1 e-bike sozinha, no máximo 1x por semana
import { awinDeepLink } from "./awin.mjs";
import { shortenTitle } from "./content.mjs";

export const BRANDS = {
  allpowers: {
    key: "allpowers", name: "ALLPOWERS", domain: "allpowers-pt.com", mid: "125820",
    minPct: 15, maxPct: 80, minPrice: 50,
    accept: p => !/acess[oó]ri|cabo|cable|bolsa|saco|adaptador/i.test(`${p.product_type} ${p.title}`),
    // Um produto por modelo (R1500, S2000, P1800…), para a grelha não ter 4 kits iguais
    model: t => (t.match(/\b(R\d{3,4}|S\d{3,4}|P\d{3,4}|B\d{3,4}|BS\d{3,4}|SP\d{3}|SF\d{3})\b/i) || [t])[0].toUpperCase()
  },
  jimmy: {
    key: "jimmy", name: "JIMMY", domain: "jimmy.eu", mid: "128677",
    minPct: 10, maxPct: 80, minPrice: 50,
    accept: p => !/parts|accessor|filter|battery|brush/i.test(`${p.product_type} ${p.title}`),
    model: t => t.split(/\s+/)[0].toUpperCase()
  },
  quatroelementos: {
    key: "quatroelementos", name: "4 Elementos", domain: "4elementos.com.pt", mid: "124836",
    minPct: 20, maxPct: 70, minPrice: 40, maxPages: 8,
    // Só ténis, botas e casacos/camisolas de marca (sem meias, gorros, acessórios ou limpeza)
    accept: p => /^(t[eé]nis|zapatillas|sapatilhas|botas|moletons|sudaderas|jaquetas|chaquetas|casacos|abrigos)$/i.test(p.product_type || "") &&
      // ténis/botas: só com tamanho de adulto (39–48) disponível — os de criança têm tamanhos 16–38
      (!/^(t[eé]nis|zapatillas|sapatilhas|botas)$/i.test(p.product_type || "") ||
        (p.variants || []).some(v => v.available && (n => n >= 39 && n <= 48)(parseFloat(String(v.title).replace(",", "."))))) &&
      // sem tamanhos de criança/bebé (J, GS, PS, TD, IV, Kids, Baby…)
      !/\b(J|GS|PS|TD|IV|PV|BG|BP|TDE|KIDS?|BABY|INFANT|JUNIOR|CRIAN[CÇ]A|NI[ÑN]O|BEB[EÉ])\b/i.test(`${p.title} ${(p.tags || []).join(" ")}`),
    // Um por modelo: marca + 2 palavras seguintes ("Nike Air Max", "adidas Campus 00S")
    model: t => t.toUpperCase().split(/\s+/).slice(0, 3).join(" ")
  },
  tenways: {
    key: "tenways", name: "Tenways", domain: "www.tenways.com", mid: "72399",
    minPct: 10, maxPct: 50, minPrice: 500,
    // Só e-bikes à venda (sem aluguer/leasing, packs ou subscrições)
    accept: p => /^electric bikes$/i.test(p.product_type || "") && !/lease|package|subscri/i.test(`${p.title} ${p.handle}`),
    model: t => t.toUpperCase()
  }
};

// Títulos ingleses da jimmy.eu → PT-PT
const EN_PT = [
  [/Cordless Wet (&|and) Dry Vacuum Cleaner/i, "Aspirador e Lava-Chão sem fios"],
  [/Cordless (Stick |Handheld )?Vacuum Cleaner/i, "Aspirador sem fios"],
  [/Anti-?Mite Vacuum Cleaner|Bed Vacuum Cleaner/i, "Aspirador Anti-Ácaros"],
  [/Countertop Reverse Osmosis (Water )?Purifier/i, "Purificador de Água por Osmose"],
  [/High-?Speed Hair Dryer/i, "Secador de Cabelo"],
  [/Ice Maker (&|and) Crusher/i, "Máquina de Gelo"],
  [/Cold (&|and) Sparkling Water Maker/i, "Máquina de Água Fria e com Gás"],
  [/\bVacuum Cleaner\b/i, "Aspirador"], [/\bSmart\b/i, "Inteligente"]
];
export function brandTitle(brand, title) {
  let t = String(title || "").replace(/\s+/g, " ").trim();
  if (brand.key === "jimmy") { for (const [re, pt] of EN_PT) t = t.replace(re, pt); t = `JIMMY ${t}`; }
  if (brand.key === "tenways" && !/^tenways/i.test(t)) t = `Tenways ${t}`;
  t = t.replace(/^(\S+)\s+\1\b/i, "$1"); // "Jordan Jordan 3 Retro" → "Jordan 3 Retro"
  // "Kit Gerador Solar 2400W (S2000 Pro + Painel SE100)" → mantém o modelo que está entre parênteses
  if (brand.key === "allpowers") t = t.replace(/\s*\((.+?)\)/, " — $1");
  return shortenTitle(t, 70);
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function getJson(url) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json,*/*" }, // UA simples evita o 429
      signal: AbortSignal.timeout(25000)
    });
    if (res.ok) return res.json();
    if (res.status !== 429 || attempt === 3) throw new Error(`HTTP ${res.status}`);
    await sleep(attempt * 8000);
  }
}

const absImg = src => {
  if (!src) return null;
  const u = src.startsWith("//") ? "https:" + src : src;
  // Telegram não aceita bem .webp por link → a CDN da loja converte
  return u + (u.includes("?") ? "&" : "?") + "width=1200&format=pjpg";
};
const pctOf = (price, old) => (old > price ? Math.round(((old - price) / old) * 100) : 0);

/**
 * Promoções reais da loja (preço para Portugal), maiores descontos primeiro, um produto por modelo.
 * Devolve [{ id, handle, title, price, oldPrice, pct, imgUrl, url }].
 * `skip(id)` → true para produtos a evitar (ex.: já saíram nos últimos dias), usados só se faltarem.
 */
export async function fetchBrandDeals(brand, { max = 4, skip = () => false } = {}) {
  const base = `https://${brand.domain}`;
  const products = [];
  for (let page = 1; page <= (brand.maxPages || 2); page++) {
    const d = await getJson(`${base}/products.json?limit=250&page=${page}`);
    products.push(...(d.products || []));
    if ((d.products || []).length < 250) break;
    await sleep(1500);
  }

  // 1) Pré-seleção com a lista da loja (preço base)
  const pre = [];
  for (const p of products) {
    if (!brand.accept(p)) continue;
    const vs = (p.variants || []).filter(v => v.available);
    if (!vs.length) continue;
    const v = vs.reduce((a, b) => (Number(b.price) < Number(a.price) ? b : a));
    const price = Number(v.price), old = Number(v.compare_at_price || 0), pct = pctOf(price, old);
    if (price < brand.minPrice || pct < brand.minPct - 5 || pct > brand.maxPct) continue;
    pre.push({ p, pct });
  }
  pre.sort((a, b) => b.pct - a.pct);

  // 2) Confirma o preço para Portugal produto a produto (até encontrar `max` modelos diferentes)
  const fresh = [], reserve = [], models = new Set();
  let checked = 0;
  for (const { p } of pre) {
    if (fresh.length >= max || checked >= max * 3) break;
    const id = `${brand.key}:${p.handle}`;
    const model = brand.model(p.title);
    if (models.has(model)) continue;
    if (checked) await sleep(1500);
    checked++;
    let d;
    try { d = await getJson(`${base}/products/${p.handle}.js?country=PT`); }
    catch (e) { console.error(`${brand.name}: ${p.handle} falhou (${e.message}).`); continue; }
    const price = Number(d.price) / 100, old = Number(d.compare_at_price || 0) / 100, pct = pctOf(price, old);
    if (!d.available || price < brand.minPrice || pct < brand.minPct || pct > brand.maxPct) continue;
    const imgUrl = absImg(d.featured_image);
    if (!imgUrl) continue;
    const item = {
      id, handle: p.handle, title: brandTitle(brand, d.title || p.title), price, oldPrice: old, pct, imgUrl,
      url: awinDeepLink(`${base}/products/${p.handle}`, brand.mid)
    };
    models.add(model);
    (skip(id) ? reserve : fresh).push(item);
  }
  const out = fresh.concat(reserve).slice(0, max);
  console.log(`${brand.name}: ${products.length} produtos na loja, ${pre.length} pré-selecionados, ${out.length} promoções confirmadas para PT.`);
  return out;
}

export const brandStoreLink = brand => `https://www.awin1.com/cread.php?awinmid=${brand.mid}&awinaffid=3124493`;
