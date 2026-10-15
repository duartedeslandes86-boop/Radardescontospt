/**
 * Radar Descontos & Tech PT - Runner Autónomo para GitHub Actions / Cron
 * Executa um ciclo único de varrimento 100% Live, deduplicação e publicação no Telegram.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { XMLParser } from 'fast-xml-parser';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Credenciais de Produção
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8933540772:AAFP2_IKfYKLADfcv5rn7Miq_MuFnPEy1p4';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '-1003846917730';
const AMAZON_TAG = 'radardescontospt-21';

const DATA_FILE = path.resolve(__dirname, 'sent_deals.json');

interface SentDealRecord {
  id: string;
  asin?: string | null;
  cleanUrl?: string;
  titleSlug?: string;
  title: string;
  oldPrice?: number | null;
  newPrice?: number | null;
  discountPercent?: number | null;
  affiliateUrl: string;
  originalUrl?: string;
  imageUrl?: string | null;
  publishedAt: string;
  telegramMessageId?: number | null;
  dispatchType: 'manual' | 'radar_1click' | 'autopilot';
}

interface StoredData {
  sentIds: string[];
  history: SentDealRecord[];
}

// ---------------------------------------------------------------------------
// 1. Dicionário de Tradução Espanhol -> Português Europeu
// ---------------------------------------------------------------------------
function translateSpanishToPortuguese(rawTitle: string): string {
  if (!rawTitle || typeof rawTitle !== 'string') return '';

  let t = rawTitle;

  const replacements: Array<[RegExp, string]> = [
    [/\btres ventiladores en marco [uú]nico\b/gi, '3 ventoinhas em estrutura única'],
    [/\bventiladores en marco [uú]nico\b/gi, 'ventoinhas em estrutura única'],
    [/\ben marco [uú]nico\b/gi, 'em estrutura única'],
    [/\bauriculares inal[aá]mbricos\b/gi, 'auscultadores sem fios'],
    [/\bauriculares bluetooth\b/gi, 'auscultadores Bluetooth'],
    [/\bauriculares\b/gi, 'auscultadores'],
    [/\bcascos inal[aá]mbricos\b/gi, 'auscultadores sem fios'],
    [/\bcascos\b/gi, 'auscultadores'],
    [/\binal[aá]mbricos?\b/gi, 'sem fios'],
    [/\binal[aá]mbricas?\b/gi, 'sem fios'],
    [/\benv[ií]o gratis\b/gi, 'envio grátis'],
    [/\benv[ií]o gratuito\b/gi, 'envio grátis'],
    [/\benv[ií]o\b/gi, 'envio'],
    [/\bgratis\b/gi, 'grátis'],
    [/\bgratuito\b/gi, 'grátis'],
    [/\brat[oó]n inal[aá]mbrico\b/gi, 'rato sem fios'],
    [/\brat[oó]n gaming\b/gi, 'rato gaming'],
    [/\brat[oó]n\b/gi, 'rato'],
    [/\bratones\b/gi, 'ratos'],
    [/\bpulgadas\b/gi, 'polegadas'],
    [/\bpulgada\b/gi, 'polegada'],
    [/\bpantalla t[aá]ctil\b/gi, 'ecrã tátil'],
    [/\bpantalla\b/gi, 'ecrã'],
    [/\bpantallas\b/gi, 'ecrãs'],
    [/\bteclado mec[aá]nico\b/gi, 'teclado mecânico'],
    [/\btarjeta gr[aá]fica\b/gi, 'placa gráfica'],
    [/\btarjeta de sonido\b/gi, 'placa de som'],
    [/\btarjeta de memoria\b/gi, 'cartão de memória'],
    [/\btarjetas\b/gi, 'placas'],
    [/\bdisco duro sdd\b/gi, 'disco SSD'],
    [/\bdisco duro\b/gi, 'disco rígido'],
    [/\bm[oó]vil\b/gi, 'telemóvel'],
    [/\bm[oó]viles\b/gi, 'telemóveis'],
    [/\btel[eé]fono inteligente\b/gi, 'smartphone'],
    [/\breloj inteligente\b/gi, 'smartwatch'],
    [/\bpulsera de actividad\b/gi, 'pulseira desportiva'],
    [/\bpulsera inteligente\b/gi, 'smartband'],
    [/\bpulsera\b/gi, 'pulseira'],
    [/\baltavoz inal[aá]mbrico\b/gi, 'coluna sem fios'],
    [/\baltavoz bluetooth\b/gi, 'coluna Bluetooth'],
    [/\baltavoz inteligente\b/gi, 'coluna inteligente'],
    [/\baltavoz\b/gi, 'coluna'],
    [/\baltavoces\b/gi, 'colunas'],
    [/\bventilador de pie\b/gi, 'ventoinha de pé'],
    [/\bventilador\b/gi, 'ventoinha'],
    [/\bventiladores\b/gi, 'ventoinhas'],
    [/\bport[aá]til gaming\b/gi, 'portátil gaming'],
    [/\bport[aá]til\b/gi, 'portátil'],
    [/\bport[aá]tiles\b/gi, 'portáteis'],
    [/\bordenador de sobremesa\b/gi, 'computador de secretária'],
    [/\bordenador\b/gi, 'computador'],
    [/\bordenadores\b/gi, 'computadores'],
    [/\bcargador r[aá]pido\b/gi, 'carregador rápido'],
    [/\bcargador inal[aá]mbrico\b/gi, 'carregador sem fios'],
    [/\bcargador\b/gi, 'carregador'],
    [/\bcargadores\b/gi, 'carregadores'],
    [/\bbater[ií]a externa\b/gi, 'powerbank'],
    [/\bfunda protectora\b/gi, 'capa de proteção'],
    [/\bfunda\b/gi, 'capa'],
    [/\bcorrea deportiva\b/gi, 'bracelete desportiva'],
    [/\bcorrea\b/gi, 'bracelete'],
    [/\bcable de carga\b/gi, 'cabo de carregamento'],
    [/\bcable\b/gi, 'cabo'],
    [/\brobot aspirador\b/gi, 'robot aspirador'],
    [/\baspiradora sin cable\b/gi, 'aspirador sem fios'],
    [/\baspiradora vertical\b/gi, 'aspirador vertical'],
    [/\baspiradora\b/gi, 'aspirador'],
    [/\baspirador\b/gi, 'aspirador'],
    [/\bfreidora de aire\b/gi, 'fritadeira sem óleo'],
    [/\bfreidora sin aceite\b/gi, 'fritadeira sem óleo'],
    [/\bcafetera de c[aá]psulas\b/gi, 'máquina de café de cápsulas'],
    [/\bcafetera express\b/gi, 'máquina de café expresso'],
    [/\bcafetera superautom[aá]tica\b/gi, 'máquina de café superautomática'],
    [/\bcafetera\b/gi, 'máquina de café'],
    [/\bmando inal[aá]mbrico\b/gi, 'comando sem fios'],
    [/\bmando para\b/gi, 'comando para'],
    [/\bmando\b/gi, 'comando'],
    [/\bmandos\b/gi, 'comandos'],
    [/\bjuego de mesa\b/gi, 'jogo de tabuleiro'],
    [/\bjuegos\b/gi, 'jogos'],
    [/\bjuego\b/gi, 'jogo'],
    [/\bdescuento\b/gi, 'desconto'],
    [/\bdescuentos\b/gi, 'descontos'],
    [/\bcup[oó]n de descuento\b/gi, 'cupão de desconto'],
    [/\bcup[oó]n\b/gi, 'cupão'],
    [/\bcupones\b/gi, 'cupões'],
    [/\bc[oó]digo de descuento\b/gi, 'código de desconto'],
    [/\bc[oó]digo\b/gi, 'código'],
    [/\bprecio m[ií]nimo hist[oó]rico\b/gi, 'preço mínimo histórico'],
    [/\bprecio m[ií]nimo\b/gi, 'preço mínimo'],
    [/\bprecio m[aá]s bajo\b/gi, 'preço mais baixo'],
    [/\bchollazo\b/gi, 'super promoção'],
    [/\bchollo\b/gi, 'promoção'],
    [/\bl[aá]mpara uv u[nñ]as\b/gi, 'candeeiro UV para unhas'],
    [/\bl[aá]mpara\b/gi, 'candeeiro'],
    [/\bu[nñ]as\b/gi, 'unhas'],
    [/\bregleta enchufes\b/gi, 'régua de tomadas'],
    [/\bregleta\b/gi, 'régua de tomadas'],
    [/\btomas de corriente\b/gi, 'tomadas elétricas'],
    [/\bcarcasa\b/gi, 'estrutura'],
    [/\bpantal[oó]n de trabajo\b/gi, 'calças de trabalho'],
    [/\bpantal[oó]n\b/gi, 'calças'],
    [/\bvino blanco\b/gi, 'vinho branco'],
    [/\bnegro\b/gi, 'preto'],
    [/\bnegra\b/gi, 'preta'],
    [/\bblanco\b/gi, 'branco'],
    [/\bblanca\b/gi, 'branca'],
    [/\bazul marino\b/gi, 'azul escuro'],
    [/\brojo\b/gi, 'vermelho'],
    [/\broja\b/gi, 'vermelha'],
    [/\bgris espacial\b/gi, 'cinzento sideral'],
    [/\bgris\b/gi, 'cinzento'],
    [/\bverde\b/gi, 'verde'],
    [/\bamarillo\b/gi, 'amarelo'],
    [/\bplata\b/gi, 'prateado'],
    [/\boro\b/gi, 'dourado'],
    [/\btaladro percutor\b/gi, 'berbequim percutor'],
    [/\btaladro\b/gi, 'berbequim'],
    [/\bdestornillador\b/gi, 'aparafusadora'],
    [/\bpara hombre\b/gi, 'para homem'],
    [/\bpara mujer\b/gi, 'para mulher'],
    [/\bhombre\b/gi, 'homem'],
    [/\bmujer\b/gi, 'mulher'],
    [/\bprofesional\b/gi, 'profissional'],
    [/\breforzadas con\b/gi, 'reforçadas com'],
    [/\breforzado con\b/gi, 'reforçado com'],
    [/\breforzadas\b/gi, 'reforçadas'],
    [/\breforzado\b/gi, 'reforçado'],
    [/\bel[aá]stico\b/gi, 'elástico'],
    [/\bestable\b/gi, 'estável'],
    [/\bsuscripciones activas\b/gi, 'subscrições ativas'],
    [/\bsuscripci[oó]n\b/gi, 'subscrição'],
    [/\bcon\b/gi, 'com'],
    [/\bpiezas\b/gi, 'peças'],
    [/\bunidades\b/gi, 'unidades'],
    [/\s+y\s+/gi, ' e '],
  ];

  for (const [regex, replacement] of replacements) {
    t = t.replace(regex, replacement);
  }

  t = t.replace(/\s*-\s*\d+[.,]?\d*\s*€.*$/, '').trim();
  t = t.replace(/^\[.*?\]\s*/, '').trim();

  if (t.length > 0) {
    t = t.charAt(0).toUpperCase() + t.slice(1);
  }

  return t;
}

// ---------------------------------------------------------------------------
// 2. Extração de ASIN e Deduplicação Blindada (3 Chaves)
// ---------------------------------------------------------------------------
function extractAsin(url: string): string | null {
  if (!url || typeof url !== 'string') return null;
  const match =
    url.match(/(?:dp|gp\/product|exec\/obidos\/asin|gp\/aw\/d)\/([A-Z0-9]{10})/i) ||
    url.match(/[?&]asin=([A-Z0-9]{10})/i) ||
    url.match(/\/([B0-9][A-Z0-9]{9})(?:[/?#]|$)/i);
  return match ? match[1].toUpperCase() : null;
}

function normalizeUrl(rawUrl: string): string {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  try {
    const u = new URL(rawUrl.trim());
    return `${u.protocol}//${u.host}${u.pathname}`.toLowerCase().replace(/\/+$/, '');
  } catch {
    return rawUrl.trim().split('?')[0].split('#')[0].toLowerCase().replace(/\/+$/, '');
  }
}

function normalizeTitleSlug(title: string): string {
  if (!title || typeof title !== 'string') return '';
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 30);
}

const sentIdsSet = new Set<string>();
const sentAsinsSet = new Set<string>();
const sentCleanUrlsSet = new Set<string>();
const sentTitleSlugsSet = new Set<string>();

function loadStoredData(): StoredData {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const content = fs.readFileSync(DATA_FILE, 'utf-8');
      const parsed = JSON.parse(content);
      return {
        sentIds: Array.isArray(parsed.sentIds) ? parsed.sentIds : [],
        history: Array.isArray(parsed.history) ? parsed.history : [],
      };
    }
  } catch (err) {
    console.warn('[Runner] sent_deals.json não encontrado ou inválido, inicializando vazio.');
  }
  return { sentIds: [], history: [] };
}

function saveStoredData(data: StoredData): void {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
    console.log(`[Runner] sent_deals.json guardado com sucesso (${data.history.length} itens).`);
  } catch (err) {
    console.error('[Runner] Erro ao guardar sent_deals.json:', err);
  }
}

const storedData = loadStoredData();

// Preencher conjuntos de deduplicação
for (const id of storedData.sentIds) {
  if (id) sentIdsSet.add(id);
}

for (const item of storedData.history) {
  if (item.id) sentIdsSet.add(item.id);

  const asin = item.asin || extractAsin(item.originalUrl || '') || extractAsin(item.affiliateUrl || '');
  if (asin) sentAsinsSet.add(asin.toUpperCase());

  if (item.originalUrl) {
    const cleanOrig = normalizeUrl(item.originalUrl);
    if (cleanOrig) sentCleanUrlsSet.add(cleanOrig);
  }
  if (item.affiliateUrl) {
    const cleanAff = normalizeUrl(item.affiliateUrl);
    if (cleanAff) sentCleanUrlsSet.add(cleanAff);
  }

  const titleSlug = normalizeTitleSlug(item.title);
  if (titleSlug && titleSlug.length >= 4) {
    sentTitleSlugsSet.add(titleSlug);
  }
}

function isDealAlreadySent(deal: {
  id?: string;
  asin?: string | null;
  originalLink?: string;
  affiliateUrl?: string;
  title: string;
}): boolean {
  if (deal.id && sentIdsSet.has(deal.id)) return true;

  const asin = deal.asin || extractAsin(deal.originalLink || '') || extractAsin(deal.affiliateUrl || '');
  if (asin && sentAsinsSet.has(asin.toUpperCase())) return true;

  const cleanOrig = deal.originalLink ? normalizeUrl(deal.originalLink) : '';
  const cleanAff = deal.affiliateUrl ? normalizeUrl(deal.affiliateUrl) : '';

  if (cleanOrig && sentCleanUrlsSet.has(cleanOrig)) return true;
  if (cleanAff && sentCleanUrlsSet.has(cleanAff)) return true;

  const titleSlug = normalizeTitleSlug(deal.title);
  if (titleSlug && titleSlug.length >= 5 && sentTitleSlugsSet.has(titleSlug)) return true;

  return false;
}

function recordDealAsSent(record: SentDealRecord): void {
  if (record.id) sentIdsSet.add(record.id);

  const asin = record.asin || extractAsin(record.originalUrl || '') || extractAsin(record.affiliateUrl || '');
  if (asin) sentAsinsSet.add(asin.toUpperCase());

  const cleanUrl = normalizeUrl(record.originalUrl || record.affiliateUrl);
  if (cleanUrl) sentCleanUrlsSet.add(cleanUrl);

  const titleSlug = normalizeTitleSlug(record.title);
  if (titleSlug) sentTitleSlugsSet.add(titleSlug);

  record.cleanUrl = cleanUrl;
  record.titleSlug = titleSlug;

  storedData.sentIds = Array.from(sentIdsSet);
  storedData.history = storedData.history.filter((h) => h.id !== record.id);
  storedData.history.unshift(record);
  saveStoredData(storedData);
}

// ---------------------------------------------------------------------------
// 3. Resolução de Redirecionamento Chollometro -> Amazon.es
// ---------------------------------------------------------------------------
async function resolveChollometroToAmazon(rawUrl: string): Promise<{
  affiliateUrl: string;
  asin: string | null;
  isAmazon: boolean;
}> {
  if (!rawUrl) return { affiliateUrl: '', asin: null, isAmazon: false };

  const directAsin = extractAsin(rawUrl);
  if (directAsin) {
    return {
      affiliateUrl: `https://www.amazon.es/dp/${directAsin}?tag=${AMAZON_TAG}`,
      asin: directAsin,
      isAmazon: true,
    };
  }

  if (rawUrl.includes('chollometro.com')) {
    const threadMatch = rawUrl.match(/-(\d+)(?:[/?#]|$)/) || rawUrl.match(/\/thread\/(\d+)/);
    const threadId = threadMatch ? threadMatch[1] : null;

    if (threadId) {
      try {
        const visitUrl = `https://www.chollometro.com/visit/thread/${threadId}`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 6000);

        const res = await fetch(visitUrl, {
          method: 'GET',
          redirect: 'manual',
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
            Referer: rawUrl,
          },
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        const location = res.headers.get('location') || '';
        const bodyText = res.status !== 302 ? await res.text() : '';
        const combined = `${location} ${bodyText}`;

        let decodedUrl = '';
        const urlMatch = combined.match(/[?&]url=([^&"'\s<>]+)/i);
        if (urlMatch) {
          try {
            decodedUrl = decodeURIComponent(urlMatch[1]);
          } catch {}
        }

        const candidateTarget = decodedUrl || location || combined;
        const resolvedAsin = extractAsin(candidateTarget);

        if (resolvedAsin) {
          return {
            affiliateUrl: `https://www.amazon.es/dp/${resolvedAsin}?tag=${AMAZON_TAG}`,
            asin: resolvedAsin,
            isAmazon: true,
          };
        }
      } catch (err: any) {
        if (err?.name !== 'AbortError') {
          console.warn(`[Runner] Resolução thread ${threadId} falhou:`, err?.message || err);
        }
      }
    }
  }

  return { affiliateUrl: rawUrl, asin: null, isAmazon: false };
}

// ---------------------------------------------------------------------------
// 4. Formatação e Despacho para Telegram
// ---------------------------------------------------------------------------
function parsePrice(val: unknown): number | null {
  if (typeof val === 'number' && !isNaN(val)) return val;
  if (!val || typeof val !== 'string') return null;
  const cleaned = val.replace(/[^\d,.-]/g, '').replace(',', '.');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

function formatPricePt(num: number): string {
  return num.toFixed(2).replace('.', ',');
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatTelegramMessage(params: {
  title: string;
  oldPrice?: number | null;
  newPrice?: number | null;
  affiliateUrl: string;
}): string {
  const { title, oldPrice, newPrice, affiliateUrl } = params;

  let discountBadge = '';
  if (oldPrice && newPrice && oldPrice > newPrice) {
    const pct = Math.round(((oldPrice - newPrice) / oldPrice) * 100);
    if (pct > 0) {
      discountBadge = ` 🔥 <b>-${pct}%</b>`;
    }
  }

  let priceSection = '';
  if (oldPrice && oldPrice > (newPrice || 0)) {
    priceSection += `❌ Antes: <del>${formatPricePt(oldPrice)}€</del>\n`;
  }
  if (newPrice !== null && newPrice !== undefined) {
    priceSection += `✅ <b>AGORA: ${formatPricePt(newPrice)}€</b>${discountBadge}\n`;
  } else {
    priceSection += `✅ <b>SUPER PREÇO DISPONÍVEL!</b>\n`;
  }

  return (
    `🔥 <b>ALERTA DE PREÇO DETETADO!</b>\n\n` +
    `📦 <b>${escapeHtml(title)}</b>\n\n` +
    priceSection +
    `\n👉 <b>Ver Oferta na Amazon ES:</b>\n` +
    `${affiliateUrl}\n\n` +
    `⚡ <i>Envio rápido para Portugal | Stock limitado</i>`
  );
}

async function sendToTelegram(params: {
  caption: string;
  imageUrl?: string | null;
  affiliateUrl: string;
}): Promise<{ ok: boolean; messageId?: number; error?: string }> {
  const { caption, imageUrl, affiliateUrl } = params;

  const replyMarkup = {
    inline_keyboard: [
      [
        {
          text: '🛒 Comprar na Amazon ES',
          url: affiliateUrl,
        },
      ],
    ],
  };

  if (imageUrl && imageUrl.startsWith('http')) {
    try {
      const photoRes = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: TELEGRAM_CHAT_ID,
          photo: imageUrl,
          caption: caption,
          parse_mode: 'HTML',
          reply_markup: replyMarkup,
        }),
      });

      const photoData = (await photoRes.json()) as any;
      if (photoData.ok && photoData.result) {
        return { ok: true, messageId: photoData.result.message_id };
      }
    } catch {}
  }

  try {
    const msgRes = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: caption,
        parse_mode: 'HTML',
        disable_web_page_preview: false,
        reply_markup: replyMarkup,
      }),
    });

    const msgData = (await msgRes.json()) as any;
    if (msgData.ok && msgData.result) {
      return { ok: true, messageId: msgData.result.message_id };
    }
    return { ok: false, error: msgData.description || 'Falha desconhecida no Telegram' };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Falha de ligação ao Telegram' };
  }
}

// ---------------------------------------------------------------------------
// 5. Obtenção do Feed RSS com Bypass Cloudflare
// ---------------------------------------------------------------------------
async function fetchRssContent(): Promise<{ content: string; isJson: boolean } | null> {
  const defaultHeaders: Record<string, string> = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    Accept: 'application/rss+xml, application/xml, text/xml',
  };

  const jsonHeaders: Record<string, string> = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    Accept: 'application/json',
  };

  const sources = [
    { url: 'https://www.chollometro.com/rss', isJson: false, headers: defaultHeaders },
    { url: 'https://www.chollometro.com/rss/todo', isJson: false, headers: defaultHeaders },
    {
      url: `https://api.allorigins.win/raw?url=${encodeURIComponent('https://www.chollometro.com/rss')}`,
      isJson: false,
      headers: defaultHeaders,
    },
    {
      url: `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent('https://www.chollometro.com/rss')}`,
      isJson: true,
      headers: jsonHeaders,
    },
  ];

  for (const src of sources) {
    try {
      const res = await fetch(src.url, { headers: src.headers, signal: AbortSignal.timeout(5000) });
      if (!res.ok) continue;

      const text = await res.text();
      if (src.isJson) {
        const json = JSON.parse(text);
        if (json.status === 'ok' && Array.isArray(json.items) && json.items.length > 0) {
          return { content: text, isJson: true };
        }
      } else {
        if (text.includes('<rss') || text.includes('<item') || text.includes('<channel')) {
          return { content: text, isJson: false };
        }
      }
    } catch {}
  }

  return null;
}

function extractExactPrices(title: string, descHtml: string): { newPrice: number | null; oldPrice: number | null } {
  let newPrice: number | null = null;
  let oldPrice: number | null = null;

  const strongMatch = descHtml.match(/<strong>\s*(\d+(?:[.,]\d{1,2})?)\s*€/i);
  if (strongMatch) {
    newPrice = parsePrice(strongMatch[1]);
  }

  const oldMatch =
    descHtml.match(/<del[^>]*>\s*(\d+(?:[.,]\d{1,2})?)\s*€/i) ||
    descHtml.match(/<strike[^>]*>\s*(\d+(?:[.,]\d{1,2})?)\s*€/i) ||
    descHtml.match(/(?:antes|pvp|antigo|original|t[ií]pico)[:\s]*(\d+(?:[.,]\d{1,2})?)\s*€/i);

  if (oldMatch) {
    oldPrice = parsePrice(oldMatch[1]);
  }

  if (newPrice === null) {
    const priceMatches = [...title.matchAll(/(\d+(?:[.,]\d{1,2})?)\s*€/g)];
    if (priceMatches.length >= 2) {
      const p1 = parsePrice(priceMatches[0][1]);
      const p2 = parsePrice(priceMatches[1][1]);
      if (p1 && p2) {
        newPrice = Math.min(p1, p2);
        if (!oldPrice) oldPrice = Math.max(p1, p2);
      }
    } else if (priceMatches.length === 1) {
      newPrice = parsePrice(priceMatches[0][1]);
    }
  }

  return { newPrice, oldPrice };
}

// ---------------------------------------------------------------------------
// 6. Ciclo Principal de Execução
// ---------------------------------------------------------------------------
async function main() {
  console.log('[Runner] A iniciar ciclo do Radar Descontos & Tech PT...');
  console.log(`[Runner] Canal: @radardescontos_pt | Tag Amazon: ${AMAZON_TAG}`);

  const fetched = await fetchRssContent();
  if (!fetched) {
    console.warn('[Runner] Nenhuma fonte RSS respondeu. A terminar ciclo de forma limpa.');
    process.exit(0);
  }

  interface RawItem {
    title: string;
    link: string;
    description: string;
    pubDate: string;
    thumbnail?: string | null;
    merchantName?: string;
  }

  const rawItems: RawItem[] = [];

  if (fetched.isJson) {
    const json = JSON.parse(fetched.content);
    for (const item of json.items || []) {
      rawItems.push({
        title: item.title || '',
        link: item.link || '',
        description: item.description || '',
        pubDate: item.pubDate || new Date().toUTCString(),
        thumbnail: item.thumbnail || null,
        merchantName: '',
      });
    }
  } else {
    const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
    const parsed = parser.parse(fetched.content);
    const items = parsed?.rss?.channel?.item;
    const itemList = Array.isArray(items) ? items : items ? [items] : [];

    for (const item of itemList) {
      rawItems.push({
        title: item.title || '',
        link: item.link || '',
        description: item.description || '',
        pubDate: item.pubDate || new Date().toUTCString(),
        merchantName: item['pepper:merchant']?.['@_name'] || '',
      });
    }
  }

  // Filtrar apenas candidatos da Amazon
  const amazonCandidates = rawItems.filter((item) => {
    const m = (item.merchantName || '').toLowerCase();
    const d = (item.description || '').toLowerCase();
    return m.includes('amazon') || d.includes('amazon') || d.includes('amzn.to') || item.link.includes('amazon');
  });

  console.log(`[Runner] Ofertas totais no feed: ${rawItems.length} | Candidatos Amazon: ${amazonCandidates.length}`);

  const eligibleDeals: Array<{
    id: string;
    asin: string;
    title: string;
    newPrice: number;
    oldPrice: number | null;
    discountPercent: number | null;
    affiliateUrl: string;
    originalUrl: string;
    imageUrl: string | null;
  }> = [];

  // Resolver em lotes de 3
  for (let i = 0; i < amazonCandidates.length; i += 3) {
    const batch = amazonCandidates.slice(i, i + 3);
    const batchResults = await Promise.all(
      batch.map(async (rawItem) => {
        const resolved = await resolveChollometroToAmazon(rawItem.link);
        if (!resolved.isAmazon || !resolved.asin || resolved.affiliateUrl.includes('chollometro.com')) {
          return null;
        }

        const { newPrice, oldPrice } = extractExactPrices(rawItem.title, rawItem.description);
        const translatedTitle = translateSpanishToPortuguese(rawItem.title);

        const imgMatch =
          rawItem.thumbnail ||
          rawItem.description.match(/<img[^>]+src=["']([^"']+)["']/i)?.[1] ||
          rawItem.description.match(/src=["'](https?:\/\/[^"']+\.(?:jpg|jpeg|png|webp|gif))["']/i)?.[1] ||
          null;

        const alreadySent = isDealAlreadySent({
          id: resolved.asin,
          asin: resolved.asin,
          originalLink: resolved.affiliateUrl,
          affiliateUrl: resolved.affiliateUrl,
          title: translatedTitle,
        });

        if (alreadySent) {
          return null;
        }

        let discountPercent: number | null = null;
        if (oldPrice && newPrice && oldPrice > newPrice) {
          discountPercent = Math.round(((oldPrice - newPrice) / oldPrice) * 100);
        }

        return {
          id: resolved.asin,
          asin: resolved.asin,
          title: translatedTitle,
          newPrice: newPrice !== null ? newPrice : 0,
          oldPrice,
          discountPercent,
          affiliateUrl: resolved.affiliateUrl,
          originalUrl: rawItem.link,
          imageUrl: imgMatch,
        };
      })
    );

    for (const r of batchResults) {
      if (r !== null) {
        eligibleDeals.push(r);
      }
    }

    if (eligibleDeals.length >= 2) break;
  }

  if (eligibleDeals.length === 0) {
    console.log('[Runner] Nenhuma oferta nova neste ciclo — aguardar 15/20 min. Ficheiro sent_deals.json inalterado.');
    process.exit(0);
  }

  const dealsToPublish = eligibleDeals.slice(0, 2);
  console.log(`[Runner] Encontradas ${dealsToPublish.length} ofertas novas para despachar para o Telegram!`);

  for (const deal of dealsToPublish) {
    const caption = formatTelegramMessage({
      title: deal.title,
      oldPrice: deal.oldPrice,
      newPrice: deal.newPrice,
      affiliateUrl: deal.affiliateUrl,
    });

    const sendRes = await sendToTelegram({
      caption,
      imageUrl: deal.imageUrl,
      affiliateUrl: deal.affiliateUrl,
    });

    if (sendRes.ok) {
      console.log(`[Runner] ✅ Publicado com sucesso no Telegram: "${deal.title}" (${deal.newPrice}€)`);
      const record: SentDealRecord = {
        id: deal.id,
        asin: deal.asin,
        title: deal.title,
        oldPrice: deal.oldPrice,
        newPrice: deal.newPrice,
        discountPercent: deal.discountPercent,
        affiliateUrl: deal.affiliateUrl,
        originalUrl: deal.originalUrl,
        imageUrl: deal.imageUrl,
        publishedAt: new Date().toISOString(),
        telegramMessageId: sendRes.messageId || null,
        dispatchType: 'autopilot',
      };
      recordDealAsSent(record);
    } else {
      console.error(`[Runner] ❌ Falha ao publicar "${deal.title}":`, sendRes.error);
    }
  }

  console.log('[Runner] Ciclo concluído com sucesso.');
  process.exit(0);
}

main().catch((err) => {
  console.warn('[Runner] Aviso: Erro capturado durante o ciclo (não crítico para cron):', err?.message || err);
  // Encerra de forma limpa (código 0) para não gerar falha no GitHub Actions
  process.exit(0);
});
