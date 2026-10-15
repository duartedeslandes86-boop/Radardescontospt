import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { XMLParser } from 'fast-xml-parser';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isProduction = process.env.NODE_ENV === 'production';
const PORT = process.env.PORT || 3000;

// Configurações do Telegram e Amazon
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8933540772:AAFP2_IKfYKLADfcv5rn7Miq_MuFnPEy1p4';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '-1003846917730';
const AMAZON_TAG = 'radardescontospt-21';

// Ficheiro de persistência de ofertas enviadas
const DATA_FILE = path.resolve(__dirname, 'sent_deals.json');

export interface SentDealRecord {
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

// =========================================================================
// TRADUTOR DE ESPANHOL PARA PORTUGUÊS EUROPEU (PT-PT)
// =========================================================================
function translateSpanishToPortuguese(rawTitle: string): string {
  if (!rawTitle || typeof rawTitle !== 'string') return '';

  let t = rawTitle;

  const replacements: Array<[RegExp, string]> = [
    // Expressões completas e hardware
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

  // Limpeza de preço residual solto no fim do título
  t = t.replace(/\s*-\s*\d+[.,]?\d*\s*€.*$/, '').trim();
  t = t.replace(/^\[.*?\]\s*/, '').trim();

  // Garantir primeira letra maiúscula
  if (t.length > 0) {
    t = t.charAt(0).toUpperCase() + t.slice(1);
  }

  return t;
}

// =========================================================================
// SISTEMA DE EXTRAÇÃO DE ASIN E RESOLUÇÃO DIRETA PARA AMAZON.ES
// =========================================================================

// Extrator de ASIN de 10 carateres da Amazon
function extractAsin(url: string): string | null {
  if (!url || typeof url !== 'string') return null;
  const match =
    url.match(/(?:dp|gp\/product|exec\/obidos\/asin|gp\/aw\/d)\/([A-Z0-9]{10})/i) ||
    url.match(/[?&]asin=([A-Z0-9]{10})/i) ||
    url.match(/\/([B0-9][A-Z0-9]{9})(?:[/?#]|$)/i);
  return match ? match[1].toUpperCase() : null;
}

// Construtor direto de Link Afiliado da Amazon ES
function buildAmazonAffiliateUrl(rawUrl: string): {
  affiliateUrl: string;
  asin: string | null;
  isAmazon: boolean;
} {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return { affiliateUrl: '', asin: null, isAmazon: false };
  }

  const cleanUrl = rawUrl.trim();
  const isAmazon = /amazon\.(es|com|de|fr|it|co\.uk)/i.test(cleanUrl) || /amzn\.to/i.test(cleanUrl);
  const asin = extractAsin(cleanUrl);

  if (asin) {
    return {
      affiliateUrl: `https://www.amazon.es/dp/${asin}?tag=${AMAZON_TAG}`,
      asin,
      isAmazon: true,
    };
  }

  if (isAmazon) {
    try {
      const parsed = new URL(cleanUrl);
      parsed.hostname = 'www.amazon.es';
      parsed.searchParams.set('tag', AMAZON_TAG);
      return {
        affiliateUrl: parsed.toString(),
        asin: null,
        isAmazon: true,
      };
    } catch {
      const base = cleanUrl.split('?')[0];
      return {
        affiliateUrl: `${base}?tag=${AMAZON_TAG}`,
        asin: null,
        isAmazon: true,
      };
    }
  }

  return { affiliateUrl: cleanUrl, asin: null, isAmazon: false };
}

// Cache em memória de threads do Chollometro já resolvidos para Amazon
const resolvedThreadsCache = new Map<
  string,
  {
    affiliateUrl: string;
    asin: string | null;
    isAmazon: boolean;
  }
>();

// Resolução obrigatória de links chollometro.com -> destino real Amazon.es
async function resolveChollometroToAmazon(rawUrl: string): Promise<{
  affiliateUrl: string;
  asin: string | null;
  isAmazon: boolean;
}> {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return { affiliateUrl: '', asin: null, isAmazon: false };
  }

  // 1. Se já contiver ASIN direto
  const directAsin = extractAsin(rawUrl);
  if (directAsin) {
    return {
      affiliateUrl: `https://www.amazon.es/dp/${directAsin}?tag=${AMAZON_TAG}`,
      asin: directAsin,
      isAmazon: true,
    };
  }

  // 2. Se for link do Chollometro, extrair threadId e resolver redirecionamento
  if (rawUrl.includes('chollometro.com')) {
    const threadMatch = rawUrl.match(/-(\d+)(?:[/?#]|$)/) || rawUrl.match(/\/thread\/(\d+)/);
    const threadId = threadMatch ? threadMatch[1] : null;

    if (threadId) {
      if (resolvedThreadsCache.has(threadId)) {
        return resolvedThreadsCache.get(threadId)!;
      }

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

        // Extrair parâmetro ?url= codificado dentro do redirecionamento
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
          const result = {
            affiliateUrl: `https://www.amazon.es/dp/${resolvedAsin}?tag=${AMAZON_TAG}`,
            asin: resolvedAsin,
            isAmazon: true,
          };
          resolvedThreadsCache.set(threadId, result);
          return result;
        }

        // Verificar se é link Amazon mesmo sem padrão de ASIN
        const amznMatch = candidateTarget.match(/https?:\/\/(?:www\.)?amazon\.(?:es|com|de|fr|it|co\.uk)[^\s"'<>]+/i);
        if (amznMatch) {
          const amznUrl = amznMatch[0];
          const aAsin = extractAsin(amznUrl);
          if (aAsin) {
            const result = {
              affiliateUrl: `https://www.amazon.es/dp/${aAsin}?tag=${AMAZON_TAG}`,
              asin: aAsin,
              isAmazon: true,
            };
            resolvedThreadsCache.set(threadId, result);
            return result;
          }
          const result = {
            affiliateUrl: `${amznUrl.split('?')[0]}?tag=${AMAZON_TAG}`,
            asin: null,
            isAmazon: true,
          };
          resolvedThreadsCache.set(threadId, result);
          return result;
        }
      } catch (err: any) {
        // Ignora silenciosamente timeouts de rede sem poluir a consola
        if (err?.name !== 'AbortError') {
          console.warn(`Tentativa de resolução do thread ${threadId} do Chollometro falhou:`, err?.message || err);
        }
      }
    }
  }

  // 3. Fallback normal
  return buildAmazonAffiliateUrl(rawUrl);
}

// =========================================================================
// SISTEMA ANTI-DUPLICAÇÃO 100% BLINDADO (ASIN + URL LIMPO + SLUG DE TÍTULO)
// =========================================================================

// Normalizador de URL sem parâmetros de consulta nem âncoras (clean URL)
function normalizeUrl(rawUrl: string): string {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  try {
    const u = new URL(rawUrl.trim());
    return `${u.protocol}//${u.host}${u.pathname}`.toLowerCase().replace(/\/+$/, '');
  } catch {
    return rawUrl.trim().split('?')[0].split('#')[0].toLowerCase().replace(/\/+$/, '');
  }
}

// Slug normalizado dos primeiros 30 carateres do título (apenas minúsculas e alfanuméricos)
function normalizeTitleSlug(title: string): string {
  if (!title || typeof title !== 'string') return '';
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove acentos
    .replace(/[^a-z0-9]/g, '')      // apenas caracteres alfanuméricos
    .slice(0, 30);
}

// Conjuntos em memória para verificação ultrarrápida O(1)
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
    console.error('Erro ao ler sent_deals.json, inicializando vazio:', err);
  }
  return { sentIds: [], history: [] };
}

function saveStoredData(data: StoredData): void {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('Erro ao guardar sent_deals.json:', err);
  }
}

let storedData: StoredData = loadStoredData();

function syncDeduplicationSets(): void {
  sentIdsSet.clear();
  sentAsinsSet.clear();
  sentCleanUrlsSet.clear();
  sentTitleSlugsSet.clear();

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
}

syncDeduplicationSets();

// Verificação estrita anti-duplicação
function isDealAlreadySent(deal: {
  id?: string;
  asin?: string | null;
  originalLink?: string;
  affiliateUrl?: string;
  title: string;
}): { alreadySent: boolean; matchedBy?: string } {
  if (deal.id && sentIdsSet.has(deal.id)) {
    return { alreadySent: true, matchedBy: `ID: ${deal.id}` };
  }

  const asin = deal.asin || extractAsin(deal.originalLink || '') || extractAsin(deal.affiliateUrl || '');
  if (asin && sentAsinsSet.has(asin.toUpperCase())) {
    return { alreadySent: true, matchedBy: `ASIN: ${asin.toUpperCase()}` };
  }

  const cleanOrig = deal.originalLink ? normalizeUrl(deal.originalLink) : '';
  const cleanAff = deal.affiliateUrl ? normalizeUrl(deal.affiliateUrl) : '';

  if (cleanOrig && sentCleanUrlsSet.has(cleanOrig)) {
    return { alreadySent: true, matchedBy: `URL Original Limpo: ${cleanOrig}` };
  }
  if (cleanAff && sentCleanUrlsSet.has(cleanAff)) {
    return { alreadySent: true, matchedBy: `URL Afiliado Limpo: ${cleanAff}` };
  }

  const titleSlug = normalizeTitleSlug(deal.title);
  if (titleSlug && titleSlug.length >= 5 && sentTitleSlugsSet.has(titleSlug)) {
    return { alreadySent: true, matchedBy: `Slug do Título (30 chars): ${titleSlug}` };
  }

  for (const item of storedData.history) {
    if (asin && item.asin && item.asin.toUpperCase() === asin.toUpperCase()) {
      return { alreadySent: true, matchedBy: `Histórico ASIN: ${item.asin}` };
    }
    if (cleanOrig && item.originalUrl && normalizeUrl(item.originalUrl) === cleanOrig) {
      return { alreadySent: true, matchedBy: `Histórico URL: ${cleanOrig}` };
    }
    if (cleanAff && item.affiliateUrl && normalizeUrl(item.affiliateUrl) === cleanAff) {
      return { alreadySent: true, matchedBy: `Histórico Afiliado: ${cleanAff}` };
    }
    const itemSlug = normalizeTitleSlug(item.title);
    if (titleSlug && itemSlug && titleSlug === itemSlug) {
      return { alreadySent: true, matchedBy: `Histórico Slug: ${titleSlug}` };
    }
  }

  return { alreadySent: false };
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

// Formatação de Preço para padrão PT
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

// Formatação de mensagem HTML para o Telegram
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

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Despacho para a API do Telegram com BOTÃO INLINE "🛒 Comprar na Amazon ES"
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
      const photoRes = await fetch(
        `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: TELEGRAM_CHAT_ID,
            photo: imageUrl,
            caption: caption,
            parse_mode: 'HTML',
            reply_markup: replyMarkup,
          }),
        }
      );

      const photoData = (await photoRes.json()) as {
        ok: boolean;
        result?: { message_id: number };
        description?: string;
      };

      if (photoData.ok && photoData.result) {
        return { ok: true, messageId: photoData.result.message_id };
      }
      console.warn('sendPhoto falhou, tentando fallback com sendMessage:', photoData.description);
    } catch (err) {
      console.warn('Erro ao chamar sendPhoto, avançando para fallback:', err);
    }
  }

  try {
    const msgRes = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: TELEGRAM_CHAT_ID,
          text: caption,
          parse_mode: 'HTML',
          disable_web_page_preview: false,
          reply_markup: replyMarkup,
        }),
      }
    );

    const msgData = (await msgRes.json()) as {
      ok: boolean;
      result?: { message_id: number };
      description?: string;
    };

    if (msgData.ok && msgData.result) {
      return { ok: true, messageId: msgData.result.message_id };
    }
    return { ok: false, error: msgData.description || 'Falha desconhecida no Telegram' };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Falha na comunicação de rede com o Telegram' };
  }
}

// Interface da Oferta do Radar
export interface DealItem {
  id: string;
  title: string;
  descriptionHtml?: string;
  originalLink: string;
  affiliateUrl: string;
  asin: string | null;
  isAmazon: boolean;
  newPrice: number | null;
  oldPrice: number | null;
  discountPercent: number | null;
  imageUrl: string | null;
  pubDate: string;
  alreadySent: boolean;
  category?: string;
  merchant?: string;
}

// Pipeline de Obtenção com Bypass de Cloudflare
async function fetchRssContent(): Promise<{ content: string; isJson: boolean; source: string } | null> {
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

  const sources: Array<{ url: string; isJson: boolean; headers: Record<string, string> }> = [
    { url: 'https://www.chollometro.com/rss', isJson: false, headers: defaultHeaders },
    { url: 'https://www.chollometro.com/rss/todo', isJson: false, headers: defaultHeaders },
    {
      url: `https://api.allorigins.win/raw?url=${encodeURIComponent('https://www.chollometro.com/rss')}`,
      isJson: false,
      headers: defaultHeaders,
    },
    {
      url: `https://api.allorigins.win/raw?url=${encodeURIComponent('https://www.chollometro.com/rss/todo')}`,
      isJson: false,
      headers: defaultHeaders,
    },
    {
      url: `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent('https://www.chollometro.com/rss')}`,
      isJson: true,
      headers: jsonHeaders,
    },
    {
      url: `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent('https://www.chollometro.com/rss/todo')}`,
      isJson: true,
      headers: jsonHeaders,
    },
    { url: 'https://www.chollometro.com/rss/categoria/electronica', isJson: false, headers: defaultHeaders },
  ];

  for (const src of sources) {
    try {
      const res = await fetch(src.url, {
        headers: src.headers,
        signal: AbortSignal.timeout(5000),
      });

      if (!res.ok) continue;

      const text = await res.text();
      if (src.isJson) {
        try {
          const json = JSON.parse(text);
          if (json.status === 'ok' && Array.isArray(json.items) && json.items.length > 0) {
            return { content: text, isJson: true, source: src.url };
          }
        } catch {}
      } else {
        if (text.includes('<rss') || text.includes('<item') || text.includes('<channel')) {
          return { content: text, isJson: false, source: src.url };
        }
      }
    } catch {}
  }

  return null;
}

// Extração de preço exato da descrição HTML ou tags Pepper
function extractExactPrices(
  title: string,
  descHtml: string
): { newPrice: number | null; oldPrice: number | null } {
  let newPrice: number | null = null;
  let oldPrice: number | null = null;

  // 1. O Chollometro coloca quase sempre: <strong>XX,XX€ - Loja</strong>
  const strongMatch = descHtml.match(/<strong>\s*(\d+(?:[.,]\d{1,2})?)\s*€/i);
  if (strongMatch) {
    newPrice = parsePrice(strongMatch[1]);
  }

  // 2. Extração de preço antigo da descrição
  const oldMatch =
    descHtml.match(/<del[^>]*>\s*(\d+(?:[.,]\d{1,2})?)\s*€/i) ||
    descHtml.match(/<strike[^>]*>\s*(\d+(?:[.,]\d{1,2})?)\s*€/i) ||
    descHtml.match(/(?:antes|pvp|antigo|original|t[ií]pico)[:\s]*(\d+(?:[.,]\d{1,2})?)\s*€/i);

  if (oldMatch) {
    oldPrice = parsePrice(oldMatch[1]);
  }

  // 3. Se newPrice ainda não foi extraído, pesquisar no título
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

  // Se grátis
  if (newPrice === null && /gratis|gratuito|free/i.test(title)) {
    newPrice = 0;
  }

  return { newPrice, oldPrice };
}

// Processador 100% LIVE de Ofertas:
// - Traduz espanhol para português europeu
// - Extrai preços numéricos exatos
// - Resolve OBRIGATORIAMENTE URLs chollometro.com para links diretos Amazon.es
// - Filtro Estrito: inclui APENAS ofertas com link direto Amazon.es / ASIN válido (NUNCA envia links chollometro.com)
async function scanDealsFromRss(): Promise<DealItem[]> {
  const deals: DealItem[] = [];
  const fetched = await fetchRssContent();

  if (!fetched) {
    console.warn('Nenhuma fonte de feed RSS respondeu. Retornando array vazio [] sem dados fictícios.');
    return [];
  }

  try {
    interface RawItem {
      title: string;
      link: string;
      description: string;
      pubDate: string;
      thumbnail?: string | null;
      guid?: string;
      merchantName?: string;
    }

    const rawItems: RawItem[] = [];

    if (fetched.isJson) {
      const json = JSON.parse(fetched.content);
      const items = json.items || [];
      for (const item of items) {
        rawItems.push({
          title: typeof item.title === 'string' ? item.title : '',
          link: typeof item.link === 'string' ? item.link : '',
          description: typeof item.description === 'string' ? item.description : '',
          pubDate: typeof item.pubDate === 'string' ? item.pubDate : new Date().toUTCString(),
          thumbnail: typeof item.thumbnail === 'string' ? item.thumbnail : null,
          guid: item.guid,
          merchantName: '',
        });
      }
    } else {
      const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: '@_',
      });
      const parsed = parser.parse(fetched.content);
      const items = parsed?.rss?.channel?.item;
      const itemList = Array.isArray(items) ? items : items ? [items] : [];

      for (const item of itemList) {
        rawItems.push({
          title: typeof item.title === 'string' ? item.title : '',
          link: typeof item.link === 'string' ? item.link : '',
          description: typeof item.description === 'string' ? item.description : '',
          pubDate: typeof item.pubDate === 'string' ? item.pubDate : new Date().toUTCString(),
          guid: item.guid?.['#text'] || item.guid,
          merchantName: item['pepper:merchant']?.['@_name'] || '',
        });
      }
    }

    // Filtrar candidatos da Amazon antes de efetuar pedidos de rede
    const isAmazonCandidate = (item: RawItem): boolean => {
      const m = (item.merchantName || '').toLowerCase();
      if (m.includes('amazon')) return true;
      const d = (item.description || '').toLowerCase();
      if (d.includes('amazon') || d.includes('amzn.to')) return true;
      if (item.link.toLowerCase().includes('amazon')) return true;
      return false;
    };

    const amazonCandidates = rawItems.filter(isAmazonCandidate);

    // Processar em lotes controlados de 3 para não congestionar a ligação
    for (let i = 0; i < amazonCandidates.length; i += 3) {
      const batch = amazonCandidates.slice(i, i + 3);
      const batchResults = await Promise.all(
        batch.map(async (rawItem) => {
          const rawTitle = rawItem.title;
          const rawLink = rawItem.link;
          const rawDesc = rawItem.description;
          const pubDate = rawItem.pubDate;

          // 1. Extração exata dos preços (novo e antigo)
          const { newPrice, oldPrice } = extractExactPrices(rawTitle, rawDesc);

          // 2. Tradução de Espanhol para Português Europeu
          const translatedTitle = translateSpanishToPortuguese(rawTitle);

          // 3. Extração da Imagem do produto
          const imgMatch =
            rawItem.thumbnail ||
            rawDesc.match(/<img[^>]+src=["']([^"']+)["']/i)?.[1] ||
            rawDesc.match(/src=["'](https?:\/\/[^"']+\.(?:jpg|jpeg|png|webp|gif))["']/i)?.[1] ||
            null;

          // 4. Resolução do link do Chollometro para Amazon.es com tag
          const resolved = await resolveChollometroToAmazon(rawLink);

          // FILTRO ESTRITO: Apenas aceita produtos resolvidos para Amazon com ASIN
          if (
            !resolved.isAmazon ||
            !resolved.asin ||
            resolved.affiliateUrl.includes('chollometro.com')
          ) {
            return null;
          }

          const dealId = resolved.asin;

          let discountPercent: number | null = null;
          if (oldPrice && newPrice && oldPrice > newPrice) {
            discountPercent = Math.round(((oldPrice - newPrice) / oldPrice) * 100);
          }

          // 5. Verificação estrita anti-duplicação (ASIN, URL Limpo, Slug)
          const check = isDealAlreadySent({
            id: dealId,
            asin: resolved.asin,
            originalLink: resolved.affiliateUrl,
            affiliateUrl: resolved.affiliateUrl,
            title: translatedTitle,
          });

          const dealItem: DealItem = {
            id: dealId,
            title: translatedTitle,
            descriptionHtml: rawDesc,
            originalLink: resolved.affiliateUrl,
            affiliateUrl: resolved.affiliateUrl,
            asin: resolved.asin,
            isAmazon: true,
            newPrice: newPrice !== null ? newPrice : 0,
            oldPrice: oldPrice,
            discountPercent: discountPercent,
            imageUrl: imgMatch,
            pubDate: pubDate,
            alreadySent: check.alreadySent,
            merchant: 'Amazon.es',
          };

          return dealItem;
        })
      );

      for (const r of batchResults) {
        if (r !== null) {
          deals.push(r);
        }
      }
    }
  } catch (err) {
    console.error('Erro ao processar conteúdo das ofertas ao vivo:', err);
    return [];
  }

  return deals;
}

// Estado do Piloto Automático (Auto-Pilot Worker)
interface AutopilotState {
  active: boolean;
  intervalMinutes: number;
  lastRun: string | null;
  nextRun: string | null;
  totalAutoPublished: number;
  logs: Array<{ time: string; message: string; type: 'info' | 'success' | 'warn' | 'error' }>;
}

const autopilotState: AutopilotState = {
  active: false,
  intervalMinutes: 15,
  lastRun: null,
  nextRun: null,
  totalAutoPublished: 0,
  logs: [
    {
      time: new Date().toLocaleTimeString('pt-PT'),
      message: 'Motor Automático iniciado em modo 100% Amazon.es direto e tradução PT-PT.',
      type: 'info',
    },
  ],
};

let autopilotTimer: NodeJS.Timeout | null = null;

function addAutopilotLog(message: string, type: 'info' | 'success' | 'warn' | 'error' = 'info') {
  const time = new Date().toLocaleTimeString('pt-PT');
  autopilotState.logs.unshift({ time, message, type });
  if (autopilotState.logs.length > 50) {
    autopilotState.logs.pop();
  }
}

// Ciclo do Piloto Automático: estritamente silencioso quando não houver ofertas novas
async function runAutopilotCycle(): Promise<void> {
  const now = new Date();
  autopilotState.lastRun = now.toISOString();
  autopilotState.nextRun = new Date(now.getTime() + autopilotState.intervalMinutes * 60 * 1000).toISOString();

  addAutopilotLog('Iniciando ciclo automático de varrimento do radar...', 'info');

  try {
    const scannedDeals = await scanDealsFromRss();

    // Filtrar estritamente apenas ofertas novas (que NÃO contenham links chollometro.com e não repetidas)
    const eligibleDeals = scannedDeals.filter((d) => {
      if (d.affiliateUrl.includes('chollometro.com') || !d.asin) return false;
      const check = isDealAlreadySent({
        id: d.id,
        asin: d.asin,
        originalLink: d.originalLink,
        affiliateUrl: d.affiliateUrl,
        title: d.title,
      });
      return !check.alreadySent;
    });

    // Se todas as ofertas já foram enviadas, NÃO enviar nada e registar o log estrito solicitado
    if (eligibleDeals.length === 0) {
      addAutopilotLog('Nenhuma oferta nova neste ciclo — aguardar 15 min', 'info');
      return;
    }

    // Selecionar as 1 ou 2 melhores ofertas novas da Amazon
    const dealsToPublish = eligibleDeals.slice(0, 2);

    for (const deal of dealsToPublish) {
      // Re-verificar no momento do envio por segurança
      const doubleCheck = isDealAlreadySent(deal);
      if (doubleCheck.alreadySent) {
        continue;
      }

      const caption = formatTelegramMessage({
        title: deal.title,
        oldPrice: deal.oldPrice,
        newPrice: deal.newPrice,
        affiliateUrl: deal.affiliateUrl,
      });

      const sendResult = await sendToTelegram({
        caption,
        imageUrl: deal.imageUrl,
        affiliateUrl: deal.affiliateUrl,
      });

      if (sendResult.ok) {
        const record: SentDealRecord = {
          id: deal.id,
          asin: deal.asin || null,
          title: deal.title,
          oldPrice: deal.oldPrice,
          newPrice: deal.newPrice,
          discountPercent: deal.discountPercent,
          affiliateUrl: deal.affiliateUrl,
          originalUrl: deal.originalLink,
          imageUrl: deal.imageUrl,
          publishedAt: new Date().toISOString(),
          telegramMessageId: sendResult.messageId || null,
          dispatchType: 'autopilot',
        };

        recordDealAsSent(record);

        autopilotState.totalAutoPublished++;
        addAutopilotLog(`Oferta Amazon publicada automaticamente no Telegram: "${deal.title.slice(0, 50)}..."`, 'success');
      } else {
        addAutopilotLog(`Falha ao despachar oferta "${deal.title.slice(0, 30)}": ${sendResult.error}`, 'error');
      }
    }
  } catch (err: any) {
    addAutopilotLog(`Erro no ciclo automático: ${err?.message || err}`, 'error');
  }
}

function startAutopilot(): void {
  if (autopilotTimer) {
    clearInterval(autopilotTimer);
  }
  autopilotState.active = true;
  autopilotState.nextRun = new Date(Date.now() + autopilotState.intervalMinutes * 60 * 1000).toISOString();
  addAutopilotLog(`Piloto Automático ativado! Verificações configuradas a cada ${autopilotState.intervalMinutes} minutos.`, 'success');

  runAutopilotCycle();

  autopilotTimer = setInterval(() => {
    runAutopilotCycle();
  }, autopilotState.intervalMinutes * 60 * 1000);
}

function stopAutopilot(): void {
  if (autopilotTimer) {
    clearInterval(autopilotTimer);
    autopilotTimer = null;
  }
  autopilotState.active = false;
  autopilotState.nextRun = null;
  addAutopilotLog('Piloto Automático desativado pelo operador.', 'warn');
}

// Inicializar Servidor Express
async function startServer() {
  const app = express();
  app.use(express.json());

  // 1. Endpoint: Obter Ofertas do Radar (Apenas Amazon.es com ASIN real e tradução PT)
  app.get('/api/scan', async (_req, res) => {
    try {
      const deals = await scanDealsFromRss();
      const refreshed = deals.map((d) => {
        const check = isDealAlreadySent({
          id: d.id,
          asin: d.asin,
          originalLink: d.originalLink,
          affiliateUrl: d.affiliateUrl,
          title: d.title,
        });
        return {
          ...d,
          alreadySent: check.alreadySent,
        };
      });

      res.json({ success: true, count: refreshed.length, deals: refreshed });
    } catch (err: any) {
      console.error('Erro no endpoint /api/scan:', err);
      res.status(500).json({ success: false, error: err?.message || 'Erro ao varrer ofertas' });
    }
  });

  // 2. Endpoint: Publicar Oferta no Telegram (Garante link direto da Amazon e nunca chollometro)
  app.post('/api/publish', async (req, res) => {
    try {
      const { id, title, oldPrice, newPrice, url, imageUrl, dispatchType } = req.body;

      if (!title || !url) {
        return res.status(400).json({
          success: false,
          error: 'Título e URL do produto são obrigatórios.',
        });
      }

      const parsedOld = parsePrice(oldPrice);
      const parsedNew = parsePrice(newPrice);

      // Resolução obrigatória se vier URL do chollometro
      const resolved = await resolveChollometroToAmazon(url);
      const affiliateUrl = resolved.affiliateUrl;
      const asin = resolved.asin;
      const dealId = id || asin || Buffer.from(affiliateUrl).toString('base64').substring(0, 16);

      // Tradução do título para PT-PT caso ainda não esteja traduzido
      const finalTitle = translateSpanishToPortuguese(title);

      const caption = formatTelegramMessage({
        title: finalTitle,
        oldPrice: parsedOld,
        newPrice: parsedNew,
        affiliateUrl,
      });

      const telegramResult = await sendToTelegram({
        caption,
        imageUrl: imageUrl || null,
        affiliateUrl,
      });

      if (!telegramResult.ok) {
        return res.status(502).json({
          success: false,
          error: `Falha ao enviar para o Telegram: ${telegramResult.error}`,
        });
      }

      let discountPercent: number | null = null;
      if (parsedOld && parsedNew && parsedOld > parsedNew) {
        discountPercent = Math.round(((parsedOld - parsedNew) / parsedOld) * 100);
      }

      const record: SentDealRecord = {
        id: dealId,
        asin: asin || null,
        title: finalTitle,
        oldPrice: parsedOld,
        newPrice: parsedNew,
        discountPercent,
        affiliateUrl,
        originalUrl: url,
        imageUrl: imageUrl || null,
        publishedAt: new Date().toISOString(),
        telegramMessageId: telegramResult.messageId || null,
        dispatchType: dispatchType || 'manual',
      };

      recordDealAsSent(record);

      addAutopilotLog(`Oferta "${finalTitle.slice(0, 40)}" publicada com sucesso no Telegram.`, 'success');

      res.json({
        success: true,
        message: 'Oferta publicada com sucesso no canal @radardescontos_pt!',
        record,
      });
    } catch (err: any) {
      console.error('Erro no endpoint /api/publish:', err);
      res.status(500).json({ success: false, error: err?.message || 'Erro interno ao publicar' });
    }
  });

  // 3. Endpoint: Conversor de Link com Resolução Inteligente do Chollometro para Amazon
  app.post('/api/convert', async (req, res) => {
    const { url } = req.body;
    if (!url) {
      return res.status(400).json({ success: false, error: 'URL não fornecido.' });
    }
    const result = await resolveChollometroToAmazon(url);
    res.json({
      success: true,
      originalUrl: url,
      affiliateUrl: result.affiliateUrl,
      asin: result.asin,
      isAmazon: result.isAmazon,
      activeTag: AMAZON_TAG,
    });
  });

  // 4. Endpoint: Estado e Controlo do Piloto Automático
  app.get('/api/autopilot', (_req, res) => {
    res.json({
      success: true,
      autopilot: autopilotState,
    });
  });

  app.post('/api/autopilot', (req, res) => {
    const { action, intervalMinutes } = req.body;

    if (typeof intervalMinutes === 'number' && intervalMinutes >= 5 && intervalMinutes <= 120) {
      autopilotState.intervalMinutes = intervalMinutes;
    }

    if (action === 'start' || action === true) {
      startAutopilot();
    } else if (action === 'stop' || action === false) {
      stopAutopilot();
    } else if (action === 'trigger_now') {
      runAutopilotCycle();
    }

    res.json({
      success: true,
      autopilot: autopilotState,
    });
  });

  // 5. Endpoint: Histórico de Envios
  app.get('/api/history', (_req, res) => {
    res.json({
      success: true,
      count: storedData.history.length,
      history: storedData.history,
      sentIdsCount: sentIdsSet.size,
      sentAsinsCount: sentAsinsSet.size,
      sentCleanUrlsCount: sentCleanUrlsSet.size,
      sentTitleSlugsCount: sentTitleSlugsSet.size,
    });
  });

  // 6. Endpoint: Limpar Histórico ou Remover Item
  app.post('/api/history/delete', (req, res) => {
    const { id } = req.body;
    if (!id) return res.status(400).json({ success: false, error: 'ID não fornecido' });

    sentIdsSet.delete(id);
    storedData.sentIds = Array.from(sentIdsSet);
    storedData.history = storedData.history.filter((h) => h.id !== id && h.asin !== id);
    saveStoredData(storedData);
    syncDeduplicationSets();

    res.json({ success: true, message: 'Item removido do registo de envios.' });
  });

  // 7. Endpoint: Diagnóstico de Conexão e Estatísticas
  app.get('/api/status', async (_req, res) => {
    let telegramStatus = 'Desconhecido';
    let channelInfo = null;
    try {
      const getMe = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getMe`);
      const meData = await getMe.json();
      if (meData.ok) {
        telegramStatus = 'Bot Conectado (@' + meData.result.username + ')';
      } else {
        telegramStatus = 'Erro Token: ' + meData.description;
      }

      const getChat = await fetch(
        `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getChat?chat_id=${TELEGRAM_CHAT_ID}`
      );
      const chatData = await getChat.json();
      if (chatData.ok) {
        channelInfo = {
          title: chatData.result.title,
          username: chatData.result.username ? `@${chatData.result.username}` : '@radardescontos_pt',
          type: chatData.result.type,
        };
      }
    } catch (e: any) {
      telegramStatus = `Erro de rede: ${e.message}`;
    }

    res.json({
      success: true,
      amazonTag: AMAZON_TAG,
      telegram: {
        botTokenConfigured: Boolean(TELEGRAM_BOT_TOKEN),
        chatId: TELEGRAM_CHAT_ID,
        status: telegramStatus,
        channel: channelInfo || { username: '@radardescontos_pt', title: 'Radar Descontos & Tech PT' },
      },
      autopilot: {
        active: autopilotState.active,
        intervalMinutes: autopilotState.intervalMinutes,
      },
      stats: {
        totalSentDeals: storedData.history.length,
        uniqueIdsRecorded: sentIdsSet.size,
        asinsRecorded: sentAsinsSet.size,
        cleanUrlsRecorded: sentCleanUrlsSet.size,
        titleSlugsRecorded: sentTitleSlugsSet.size,
      },
    });
  });

  // Integração com Vite em desenvolvimento ou ficheiros estáticos em produção
  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`[Radar Descontos] Servidor 100% Amazon.es direto ativo em http://0.0.0.0:${PORT} (Modo: ${isProduction ? 'Produção' : 'Desenvolvimento'})`);
  });
}

startServer().catch((err) => {
  console.error('Falha fatal ao iniciar o servidor:', err);
  process.exit(1);
});
