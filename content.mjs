// Regras de conteúdo do canal: categorias, etiquetas, títulos curtos, produtos a evitar
// e datas especiais (Black Friday, 11.11…).

// Rotação de categorias da Amazon (3 por ciclo). Tech e gaming aparecem 2x por volta.
// Sem higiene/bebé/animais/beleza: o canal é Tech, Gaming, Casa e Desporto.
// (slugs confirmados na Amazon.es: "home" e "diy" não existem → "appliances" e "tools")
export const CATEGORIES = [
  "electronics", "kitchen", "videogames",
  "tools", "computers", "sports",
  "appliances", "toys", "automotive", "lighting"
];

// Etiquetas por categoria da Amazon (no Telegram, tocar numa etiqueta filtra o canal)
const CAT_TAGS = {
  electronics: ["#tech"], computers: ["#informatica", "#tech"], videogames: ["#gaming"],
  kitchen: ["#cozinha", "#casa"], home: ["#casa"], toys: ["#brinquedos"], sports: ["#desporto"],
  tools: ["#bricolage", "#casa"], appliances: ["#eletrodomesticos", "#casa"],
  automotive: ["#auto"], lighting: ["#casa"]
};
// Etiquetas por loja Awin
const STORE_TAGS = [
  [/ottocast/i, ["#auto", "#tech"]], [/wondershare/i, ["#software", "#tech"]],
  [/colamy/i, ["#casa"]], [/emoko/i, ["#desporto"]],
  [/allpowers/i, ["#energia", "#casa", "#tech"]], [/jimmy/i, ["#casa", "#tech"]], [/tenways/i, ["#desporto", "#ebike"]]
];

export function tagsFor({ cat, store } = {}) {
  const tags = new Set(CAT_TAGS[cat] || []);
  for (const [re, t] of STORE_TAGS) if (re.test(store || "")) t.forEach(x => tags.add(x));
  if (!tags.size) tags.add("#ofertas");
  tags.add(/amazon/i.test(store || "Amazon") ? "#amazon" : "#" + String(store).toLowerCase().replace(/[^a-z0-9]/g, ""));
  return [...tags].join(" ");
}

// Consumíveis e produtos de baixo interesse para o canal (pilhas, detergente, comida…)
const LOW_VALUE = new RegExp([
  "pil[ha]s", "bater[ií]as? alcalinas", "alcalin[ao]s?", "detergente", "suavizante", "lavavajillas",
  "papel higi[eé]nico", "papel de cocina", "toallitas", "toalhitas", "pa[ñn]ales", "fraldas",
  "c[aá]psulas", "bolsas de basura", "sacos do lixo", "recambios?", "recargas?",
  "gel de (ducha|ba[ñn]o|banho)", "champ[uú]", "champ[oô]", "desodorante", "pasta de dientes",
  "golosinas", "caf[eé] en grano", "caf[eé] molido", "chocolate", "galletas", "aceite de oliva",
  "comida para", "pienso", "arena para gatos", "cerveza", "vino"
].join("|"), "i");

export function isLowValue(title = "") {
  return LOW_VALUE.test(title);
}

// Título curto: corta descrições compridas da Amazon ("Produto X, com Y, Z | ...")
export function shortenTitle(title = "", max = 70) {
  let t = title.replace(/\s+/g, " ").trim();
  for (const sep of [" | ", " – ", " - ", ", ", " (", ": "]) {
    const i = t.indexOf(sep);
    if (i >= 18 && i <= max) { t = t.slice(0, i); break; }
  }
  if (t.length > max) {
    t = t.slice(0, max);
    const sp = t.lastIndexOf(" ");
    if (sp > max * 0.6) t = t.slice(0, sp);
    t = t.replace(/[\s,;:–(-]+$/, "") + "…";
  }
  return t.replace(/[\s,;:–(-]+$/, "").trim();
}

// Datas especiais. Black Friday = sexta-feira a seguir à 4.ª quinta-feira de novembro.
function blackFriday(year) {
  const nov1 = new Date(Date.UTC(year, 10, 1));
  const firstThu = 1 + ((4 - nov1.getUTCDay() + 7) % 7);
  return new Date(Date.UTC(year, 10, firstThu + 21 + 1)); // 4.ª quinta + 1 dia
}
const iso = d => d.toISOString().slice(0, 10);
const addDays = (d, n) => new Date(d.getTime() + n * 86400000);

/**
 * Devolve o modo do dia (date = "AAAA-MM-DD", hora de Lisboa) ou null:
 * { name, label, boost } — boost = mais publicações e grelhas mais frequentes.
 */
export function seasonFor(date) {
  const year = Number(date.slice(0, 4));
  const bf = blackFriday(year);
  const md = date.slice(5);
  if (md === "11-11") return { name: "singles", label: "🛍️ 11.11 SINGLES DAY", boost: true };
  if (date >= iso(addDays(bf, -4)) && date <= iso(addDays(bf, 2))) {
    return { name: "blackfriday", label: "🖤 BLACK FRIDAY", boost: true };
  }
  if (date === iso(addDays(bf, 3))) return { name: "cybermonday", label: "💻 CYBER MONDAY", boost: true };
  const daysToBf = Math.round((bf - new Date(date + "T00:00:00Z")) / 86400000);
  if (daysToBf > 4 && daysToBf <= 10) {
    return { name: "countdown", label: null, boost: false, note: `⏳ Faltam ${daysToBf} dias para a Black Friday — ativa as notificações!` };
  }
  return null;
}
