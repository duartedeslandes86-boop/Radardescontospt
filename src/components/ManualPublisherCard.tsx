import React, { useState, useEffect } from 'react';
import {
  Rocket,
  Link as LinkIcon,
  CheckCircle2,
  AlertCircle,
  Eye,
  Sparkles,
  ShoppingBag,
  Image as ImageIcon,
  Check,
  Copy,
  Zap,
  ExternalLink,
} from 'lucide-react';
import { QuickPublishFormState } from '../types';

interface ManualPublisherCardProps {
  formData: QuickPublishFormState;
  onChange: (data: Partial<QuickPublishFormState>) => void;
  onPublish: (data: QuickPublishFormState) => Promise<boolean>;
  isPublishing: boolean;
  activeAmazonTag: string;
}

export const ManualPublisherCard: React.FC<ManualPublisherCardProps> = ({
  formData,
  onChange,
  onPublish,
  isPublishing,
  activeAmazonTag,
}) => {
  const [convertedPreview, setConvertedPreview] = useState<string>('');
  const [detectedAsin, setDetectedAsin] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState<boolean>(false);
  const [showTelegramPreview, setShowTelegramPreview] = useState<boolean>(false);
  const [localFeedback, setLocalFeedback] = useState<{
    type: 'success' | 'error' | null;
    message: string;
  }>({ type: null, message: '' });

  // Calcular link convertido em tempo real
  useEffect(() => {
    if (!formData.url.trim()) {
      setConvertedPreview('');
      setDetectedAsin(null);
      return;
    }

    const raw = formData.url.trim();
    // Extração de ASIN
    const asinMatch =
      raw.match(/(?:dp|gp\/product|exec\/obidos\/asin|gp\/aw\/d)\/([A-Z0-9]{10})/i) ||
      raw.match(/[?&]asin=([A-Z0-9]{10})/i) ||
      raw.match(/\/([B0-9][A-Z0-9]{9})(?:[/?#]|$)/i);

    const asin = asinMatch ? asinMatch[1].toUpperCase() : null;
    setDetectedAsin(asin);

    if (asin) {
      setConvertedPreview(`https://www.amazon.es/dp/${asin}?tag=${activeAmazonTag}`);
    } else if (/amazon\./i.test(raw) || /amzn\.to/i.test(raw)) {
      try {
        const u = new URL(raw);
        u.hostname = 'www.amazon.es';
        u.searchParams.set('tag', activeAmazonTag);
        setConvertedPreview(u.toString());
      } catch {
        const base = raw.split('?')[0];
        setConvertedPreview(`${base}?tag=${activeAmazonTag}`);
      }
    } else {
      setConvertedPreview(raw);
    }
  }, [formData.url, activeAmazonTag]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalFeedback({ type: null, message: '' });

    if (!formData.title.trim()) {
      setLocalFeedback({ type: 'error', message: 'Por favor, insere o nome do produto.' });
      return;
    }
    if (!formData.newPrice.trim() || isNaN(parseFloat(formData.newPrice.replace(',', '.')))) {
      setLocalFeedback({ type: 'error', message: 'Por favor, insere um Preço Novo válido em Euros.' });
      return;
    }
    if (!formData.url.trim()) {
      setLocalFeedback({ type: 'error', message: 'Por favor, insere o link do produto.' });
      return;
    }

    const success = await onPublish(formData);
    if (success) {
      setLocalFeedback({
        type: 'success',
        message: 'Oferta enviada e publicada com sucesso no canal @radardescontos_pt!',
      });
    } else {
      setLocalFeedback({
        type: 'error',
        message: 'Erro ao despachar para o Telegram. Verifica a ligação ou tenta novamente.',
      });
    }
  };

  const copyConvertedLink = () => {
    if (!convertedPreview) return;
    navigator.clipboard.writeText(convertedPreview);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const fillExample = () => {
    onChange({
      title: 'Auscultadores Sem Fios Sony WH-1000XM4 com Cancelamento de Ruído',
      oldPrice: '380.00',
      newPrice: '219.00',
      url: 'https://www.amazon.es/dp/B098NS6PVG',
      imageUrl: 'https://m.media-amazon.com/images/I/71o8Or1Rw+L._AC_SL1500_.jpg',
    });
  };

  const clearForm = () => {
    onChange({
      title: '',
      oldPrice: '',
      newPrice: '',
      url: '',
      imageUrl: '',
    });
    setLocalFeedback({ type: null, message: '' });
  };

  const oldNum = parseFloat(formData.oldPrice.replace(',', '.'));
  const newNum = parseFloat(formData.newPrice.replace(',', '.'));
  const calculatedDiscount =
    !isNaN(oldNum) && !isNaN(newNum) && oldNum > newNum
      ? Math.round(((oldNum - newNum) / oldNum) * 100)
      : null;

  return (
    <div
      id="manual-publisher"
      className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl relative overflow-hidden"
    >
      {/* Decoração de fundo sutil */}
      <div className="absolute top-0 right-0 w-80 h-80 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />

      {/* Cabeçalho do Card */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 mb-5 border-b border-slate-800 gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400">
            <Rocket className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <span>Disparo Rápido / Publicador Manual</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                100% Automático na Conversão
              </span>
            </h2>
            <p className="text-xs text-slate-400">
              Converte automaticamente links da Amazon.es com a tag oficial e despacha para o canal Telegram.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fillExample}
            className="text-xs px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/20 font-medium transition flex items-center gap-1.5"
          >
            <Sparkles className="h-3 w-3" />
            <span>Exemplo</span>
          </button>
          <button
            type="button"
            onClick={clearForm}
            className="text-xs px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white border border-slate-700 font-medium transition"
          >
            Limpar
          </button>
        </div>
      </div>

      {/* Alertas de Feedback */}
      {localFeedback.type && (
        <div
          className={`mb-5 p-3.5 rounded-xl border text-xs sm:text-sm flex items-start gap-3 transition-all ${
            localFeedback.type === 'success'
              ? 'bg-emerald-950/80 border-emerald-500/40 text-emerald-200'
              : 'bg-rose-950/80 border-rose-500/40 text-rose-200'
          }`}
        >
          {localFeedback.type === 'success' ? (
            <CheckCircle2 className="h-5 w-5 text-emerald-400 flex-shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="h-5 w-5 text-rose-400 flex-shrink-0 mt-0.5" />
          )}
          <div className="flex-1 font-medium">{localFeedback.message}</div>
        </div>
      )}

      {/* Formulário Principal */}
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Linha 1: Nome do Produto */}
        <div>
          <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
            Nome do Produto <span className="text-amber-400">*</span>
          </label>
          <div className="relative">
            <input
              type="text"
              placeholder="Ex: Apple MacBook Air M1, Xiaomi Robot Vacuum, PlayStation 5..."
              value={formData.title}
              onChange={(e) => onChange({ title: e.target.value })}
              className="w-full px-4 py-2.5 rounded-xl bg-slate-950/80 border border-slate-700 focus:border-amber-400 focus:ring-1 focus:ring-amber-400 text-sm text-white placeholder-slate-500 outline-none transition"
              required
            />
            {formData.title && (
              <div className="absolute right-3 top-3 text-[11px] text-slate-500">
                {formData.title.length} carateres
              </div>
            )}
          </div>
        </div>

        {/* Linha 2: Preço Antigo e Preço Novo */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5 flex items-center justify-between">
              <span>Preço Antigo € (Opcional)</span>
              <span className="text-[11px] text-slate-500 font-normal">Preço riscado</span>
            </label>
            <div className="relative">
              <input
                type="text"
                placeholder="Ex: 349.99"
                value={formData.oldPrice}
                onChange={(e) => onChange({ oldPrice: e.target.value })}
                className="w-full px-4 py-2.5 rounded-xl bg-slate-950/80 border border-slate-700 focus:border-amber-400 focus:ring-1 focus:ring-amber-400 text-sm text-white placeholder-slate-500 outline-none transition pr-8"
              />
              <span className="absolute right-3 top-2.5 text-slate-400 font-bold text-sm">€</span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5 flex items-center justify-between">
              <span>Preço Novo € <span className="text-amber-400">*</span></span>
              {calculatedDiscount !== null && (
                <span className="text-xs px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">
                  Desconto: -{calculatedDiscount}%
                </span>
              )}
            </label>
            <div className="relative">
              <input
                type="text"
                placeholder="Ex: 199.00"
                value={formData.newPrice}
                onChange={(e) => onChange({ newPrice: e.target.value })}
                className="w-full px-4 py-2.5 rounded-xl bg-slate-950/80 border border-slate-700 focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400 text-sm text-emerald-300 font-bold placeholder-slate-500 outline-none transition pr-8"
                required
              />
              <span className="absolute right-3 top-2.5 text-emerald-400 font-bold text-sm">€</span>
            </div>
          </div>
        </div>

        {/* Linha 3: Link do Produto com Preview ao Vivo */}
        <div>
          <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <LinkIcon className="h-3.5 w-3.5 text-amber-400" />
              <span>Link do Produto (Amazon.es ou Loja Awin) <span className="text-amber-400">*</span></span>
            </span>
            {detectedAsin && (
              <span className="text-[11px] px-2 py-0.5 rounded bg-sky-950 text-sky-300 border border-sky-600/40 font-mono font-bold">
                ASIN Detetado: {detectedAsin}
              </span>
            )}
          </label>
          <input
            type="url"
            placeholder="Cole aqui o link original (ex: https://www.amazon.es/dp/B098NS6PVG ou amzn.to/...)"
            value={formData.url}
            onChange={(e) => onChange({ url: e.target.value })}
            className="w-full px-4 py-2.5 rounded-xl bg-slate-950/80 border border-slate-700 focus:border-amber-400 focus:ring-1 focus:ring-amber-400 text-sm text-white placeholder-slate-500 outline-none transition"
            required
          />

          {/* Live Preview do Link Convertido com Tag */}
          {convertedPreview && (
            <div className="mt-2 p-2.5 rounded-xl bg-slate-950 border border-amber-500/30 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-start sm:items-center gap-2 overflow-hidden">
                <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px] font-bold uppercase tracking-wider flex-shrink-0">
                  Link Afiliado Pronto
                </span>
                <span className="font-mono text-slate-300 truncate text-[11px]">
                  {convertedPreview}
                </span>
              </div>
              <button
                type="button"
                onClick={copyConvertedLink}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-medium transition flex-shrink-0 border border-slate-700"
              >
                {isCopied ? (
                  <>
                    <Check className="h-3 w-3 text-emerald-400" />
                    <span className="text-emerald-400">Copiado</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3 w-3" />
                    <span>Copiar</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Linha 4: URL da Imagem */}
        <div>
          <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <ImageIcon className="h-3.5 w-3.5 text-slate-400" />
              <span>URL da Imagem do Produto (Opcional)</span>
            </span>
            <span className="text-[11px] text-slate-500">Permite envio com Foto no Telegram</span>
          </label>
          <div className="flex gap-3 items-center">
            <input
              type="url"
              placeholder="Ex: https://m.media-amazon.com/images/I/..."
              value={formData.imageUrl}
              onChange={(e) => onChange({ imageUrl: e.target.value })}
              className="flex-1 px-4 py-2.5 rounded-xl bg-slate-950/80 border border-slate-700 focus:border-amber-400 focus:ring-1 focus:ring-amber-400 text-sm text-white placeholder-slate-500 outline-none transition"
            />
            {formData.imageUrl && (
              <div className="h-10 w-10 rounded-lg overflow-hidden border border-slate-700 bg-white/5 flex-shrink-0 flex items-center justify-center">
                <img
                  src={formData.imageUrl}
                  alt="Pré-visualização"
                  className="h-full w-full object-contain"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
              </div>
            )}
          </div>
        </div>

        {/* Linha 5: Botões de Ação e Pré-Visualização */}
        <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setShowTelegramPreview(!showTelegramPreview)}
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs font-semibold border border-slate-700 transition"
          >
            <Eye className="h-4 w-4 text-sky-400" />
            <span>{showTelegramPreview ? 'Ocultar Pré-visualização' : 'Simular Post Telegram'}</span>
          </button>

          <button
            type="submit"
            disabled={isPublishing}
            className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-black text-sm tracking-wide shadow-lg shadow-emerald-500/25 active:scale-[0.99] transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {isPublishing ? (
              <>
                <div className="h-4 w-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                <span>A despachar para o Telegram...</span>
              </>
            ) : (
              <>
                <Rocket className="h-4 w-4 fill-current" />
                <span>🚀 Converter Link & Publicar no Telegram</span>
              </>
            )}
          </button>
        </div>
      </form>

      {/* Caixa de Pré-Visualização do Post Telegram */}
      {showTelegramPreview && (
        <div className="mt-5 p-4 rounded-xl bg-slate-950/90 border border-sky-500/30 text-xs text-slate-300 space-y-2">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800">
            <span className="font-bold text-sky-300 flex items-center gap-1.5">
              <Zap className="h-3.5 w-3.5 text-sky-400" />
              Pré-visualização do Formato no Canal @radardescontos_pt:
            </span>
            <span className="text-[10px] text-slate-400 uppercase font-mono">HTML Format</span>
          </div>

          <div className="bg-slate-900 p-3 rounded-lg border border-slate-800 font-sans space-y-1.5 leading-relaxed">
            <div className="font-bold text-amber-400">🔥 ALERTA DE PREÇO DETETADO!</div>
            <div className="font-semibold text-white">📦 {formData.title || '[Nome do Produto]'}</div>

            {formData.oldPrice && (
              <div className="text-slate-400">
                ❌ Antes: <del>{formData.oldPrice}€</del>
              </div>
            )}
            <div className="font-bold text-emerald-400">
              ✅ AGORA: {formData.newPrice || '0.00'}€
              {calculatedDiscount !== null && ` 🔥 -${calculatedDiscount}%`}
            </div>

            <div className="pt-1 font-bold text-white">👉 Ver Oferta na Amazon ES:</div>
            <div className="text-sky-400 font-mono text-[11px] break-all underline">
              {convertedPreview || `https://www.amazon.es/dp/ASIN?tag=${activeAmazonTag}`}
            </div>

            <div className="text-[11px] text-slate-400 italic pt-1">
              ⚡ Envio rápido para Portugal | Stock limitado
            </div>

            {/* Botão Inline do Telegram */}
            <div className="pt-2 border-t border-slate-800">
              <div className="w-full py-2 px-3 rounded-lg bg-sky-600/25 border border-sky-500/40 text-center font-bold text-sky-200 text-xs flex items-center justify-center gap-1.5">
                <span>🛒 Comprar na Amazon ES</span>
                <ExternalLink className="h-3.5 w-3.5 text-sky-400" />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
