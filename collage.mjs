// Monta uma imagem em grelha (até 6 produtos) com número e preço em cada um.
// Usa a biblioteca "sharp", instalada pelo workflow (não faz parte do package.json).
import { createRequire } from "module";

const require = createRequire(import.meta.url);

const W = 1280;
const HEADER = 140;
const MARGIN = 32;
const GAP = 24;
const NAVY = "#0d1626";
const YELLOW = "#f5b301";

function esc(s = "") {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

async function download(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36" },
    signal: AbortSignal.timeout(20000)
  });
  if (!res.ok) throw new Error(`imagem HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/**
 * items: [{ imgUrl, priceLabel }]  (2 a 6 itens)
 * Devolve um Buffer JPEG.
 */
export async function buildCollage(items, { title = "MAIS VENDIDOS HOJE", subtitle = "Amazon ES · preços confirmados no checkout" } = {}) {
  const sharp = require("sharp"); // lança erro se não estiver instalada → quem chama usa o plano B
  const n = Math.min(items.length, 6);
  const cols = n <= 4 && n !== 3 ? 2 : 3;
  const rows = Math.ceil(n / cols);
  const tileW = Math.floor((W - 2 * MARGIN - (cols - 1) * GAP) / cols);
  const tileH = cols === 3 ? 420 : 470;
  const H = HEADER + rows * tileH + (rows - 1) * GAP + MARGIN;
  const imgBoxW = tileW - 40;
  const imgBoxH = tileH - 120;

  const pos = i => ({
    x: MARGIN + (i % cols) * (tileW + GAP),
    y: HEADER + Math.floor(i / cols) * (tileH + GAP)
  });

  // Fundo: cabeçalho + cartões brancos
  let bg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${W}" height="${H}" fill="${NAVY}"/>
    <rect x="${MARGIN}" y="40" width="10" height="66" rx="5" fill="${YELLOW}"/>
    <text x="${MARGIN + 28}" y="88" font-family="DejaVu Sans, Arial, sans-serif" font-size="52" font-weight="bold" fill="${YELLOW}">${esc(title)}</text>
    <text x="${MARGIN + 30}" y="124" font-family="DejaVu Sans, Arial, sans-serif" font-size="24" fill="#9fb0c8">${esc(subtitle)}</text>
    <text x="${W - MARGIN}" y="88" text-anchor="end" font-family="DejaVu Sans, Arial, sans-serif" font-size="30" font-weight="bold" fill="#ffffff">RADAR PT</text>`;
  for (let i = 0; i < n; i++) {
    const { x, y } = pos(i);
    bg += `<rect x="${x}" y="${y}" width="${tileW}" height="${tileH}" rx="22" fill="#ffffff"/>`;
  }
  bg += `</svg>`;

  // Imagens dos produtos (cada uma encaixada no seu cartão)
  const layers = [{ input: Buffer.from(bg), top: 0, left: 0 }];
  await Promise.all(items.slice(0, n).map(async (it, i) => {
    try {
      const raw = await download(it.imgUrl);
      const img = await sharp(raw)
        .resize(imgBoxW, imgBoxH, { fit: "contain", background: "#ffffff" })
        .flatten({ background: "#ffffff" })
        .png()
        .toBuffer();
      const { x, y } = pos(i);
      layers.push({ input: img, left: x + 20, top: y + 20 });
    } catch (e) {
      console.error(`Grelha: imagem ${i + 1} falhou (${e.message})`);
    }
  }));

  // Por cima: número e preço de cada produto
  let fg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">`;
  for (let i = 0; i < n; i++) {
    const { x, y } = pos(i);
    fg += `<circle cx="${x + 38}" cy="${y + 38}" r="30" fill="${YELLOW}" stroke="${NAVY}" stroke-width="4"/>
      <text x="${x + 38}" y="${y + 50}" text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif" font-size="34" font-weight="bold" fill="${NAVY}">${i + 1}</text>
      <rect x="${x + 20}" y="${y + tileH - 84}" width="${tileW - 40}" height="64" rx="14" fill="${NAVY}"/>
      <text x="${x + tileW / 2}" y="${y + tileH - 38}" text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif" font-size="38" font-weight="bold" fill="${YELLOW}">${esc(items[i].priceLabel)}</text>`;
  }
  fg += `</svg>`;
  layers.push({ input: Buffer.from(fg), top: 0, left: 0 });

  return sharp({ create: { width: W, height: H, channels: 3, background: NAVY } })
    .composite(layers)
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer();
}
