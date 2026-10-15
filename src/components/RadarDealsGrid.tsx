import React, { useState, useMemo } from 'react';
import {
  Radar,
  Send,
  Edit3,
  CheckCircle,
  ExternalLink,
  Tag,
  Percent,
  Search,
  Filter,
  ArrowUpDown,
  ShoppingBag,
  Sparkles,
} from 'lucide-react';
import { DealItem } from '../types';

interface RadarDealsGridProps {
  deals: DealItem[];
  onOneClickPublish: (deal: DealItem) => Promise<void>;
  onEditBeforePublish: (deal: DealItem) => void;
  publishingDealId: string | null;
  activeAmazonTag: string;
}

export const RadarDealsGrid: React.FC<RadarDealsGridProps> = ({
  deals,
  onOneClickPublish,
  onEditBeforePublish,
  publishingDealId,
  activeAmazonTag,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'unsent' | 'amazon' | 'high_discount' | 'sent'>('all');
  const [sortBy, setSortBy] = useState<'latest' | 'discount' | 'price_asc'>('latest');

  // Filtragem e ordenação
  const filteredDeals = useMemo(() => {
    return deals
      .filter((deal) => {
        // Busca textual
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchTitle = deal.title.toLowerCase().includes(q);
          const matchAsin = deal.asin?.toLowerCase().includes(q);
          if (!matchTitle && !matchAsin) return false;
        }

        // Filtro de separador
        if (filterMode === 'unsent') return !deal.alreadySent;
        if (filterMode === 'sent') return deal.alreadySent;
        if (filterMode === 'amazon') return deal.isAmazon;
        if (filterMode === 'high_discount') return (deal.discountPercent || 0) >= 30;

        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'discount') {
          return (b.discountPercent || 0) - (a.discountPercent || 0);
        }
        if (sortBy === 'price_asc') {
          return (a.newPrice || 999999) - (b.newPrice || 999999);
        }
        // latest: unsent first, then default order
        if (a.alreadySent !== b.alreadySent) {
          return a.alreadySent ? 1 : -1;
        }
        return 0;
      });
  }, [deals, searchQuery, filterMode, sortBy]);

  const unsentCount = deals.filter((d) => !d.alreadySent).length;
  const sentCount = deals.filter((d) => d.alreadySent).length;

  return (
    <div className="space-y-4">
      {/* Barra de Filtros e Controlos do Radar */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-sky-500/10 border border-sky-500/20 text-sky-400">
              <Radar className="h-5 w-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white">Ofertas Detetadas no Radar</h2>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30">
                  {deals.length} detetadas ({unsentCount} novas)
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Selecione para despachar imediatamente em 1 clique ou editar antes do envio.
              </p>
            </div>
          </div>

          {/* Barra de Pesquisa Rápida */}
          <div className="relative w-full md:w-72">
            <Search className="h-4 w-4 text-slate-500 absolute left-3 top-3" />
            <input
              type="text"
              placeholder="Pesquisar por produto, marca ou ASIN..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white placeholder-slate-500 focus:border-amber-400 focus:outline-none transition"
            />
          </div>
        </div>

        {/* Separadores de Filtro e Ordenação */}
        <div className="flex flex-wrap items-center justify-between gap-3 mt-4 pt-3 border-t border-slate-800/80">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              onClick={() => setFilterMode('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                filterMode === 'all'
                  ? 'bg-amber-500 text-slate-950 font-bold'
                  : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              Todas ({deals.length})
            </button>
            <button
              onClick={() => setFilterMode('unsent')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1 ${
                filterMode === 'unsent'
                  ? 'bg-emerald-500 text-slate-950 font-bold'
                  : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              <Sparkles className="h-3 w-3" />
              <span>Por Publicar ({unsentCount})</span>
            </button>
            <button
              onClick={() => setFilterMode('amazon')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1 ${
                filterMode === 'amazon'
                  ? 'bg-sky-500 text-slate-950 font-bold'
                  : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              <ShoppingBag className="h-3 w-3" />
              <span>Apenas Amazon.es</span>
            </button>
            <button
              onClick={() => setFilterMode('high_discount')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1 ${
                filterMode === 'high_discount'
                  ? 'bg-rose-500 text-white font-bold'
                  : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              <Percent className="h-3 w-3" />
              <span>Desconto &gt; 30%</span>
            </button>
            <button
              onClick={() => setFilterMode('sent')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1 ${
                filterMode === 'sent'
                  ? 'bg-slate-700 text-slate-200 font-bold'
                  : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              <CheckCircle className="h-3 w-3 text-emerald-400" />
              <span>Já Enviadas ({sentCount})</span>
            </button>
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-400">
            <ArrowUpDown className="h-3.5 w-3.5" />
            <span>Ordenar por:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-200 outline-none focus:border-amber-400"
            >
              <option value="latest">Relevância / Recentes</option>
              <option value="discount">Maior Desconto %</option>
              <option value="price_asc">Preço Mais Baixo</option>
            </select>
          </div>
        </div>
      </div>

      {/* Grid de Cards de Ofertas */}
      {filteredDeals.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center text-slate-400">
          <Radar className="h-12 w-12 mx-auto text-slate-600 mb-3" />
          <p className="text-base font-semibold text-slate-300">Nenhuma oferta encontrada com os filtros selecionados.</p>
          <p className="text-xs text-slate-500 mt-1">Clica no botão "🔎 Varrer Ofertas Agora" acima para atualizar a grelha.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredDeals.map((deal) => {
            const isPublishingThis = publishingDealId === deal.id;

            return (
              <div
                key={deal.id}
                className={`flex flex-col justify-between rounded-2xl border transition-all duration-200 p-4 relative ${
                  deal.alreadySent
                    ? 'bg-slate-900/60 border-slate-800/60 opacity-80 hover:opacity-100'
                    : 'bg-slate-900 border-slate-800 hover:border-amber-500/40 hover:shadow-lg hover:shadow-amber-500/5'
                }`}
              >
                {/* Linha superior: Badges */}
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {deal.alreadySent ? (
                      <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-emerald-950/80 text-emerald-300 border border-emerald-500/30 font-semibold">
                        <CheckCircle className="h-3 w-3" />
                        ✅ Publicado
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-semibold">
                        <Sparkles className="h-3 w-3" />
                        Novo Radar
                      </span>
                    )}

                    {deal.isAmazon ? (
                      <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-sky-950/80 text-sky-300 border border-sky-600/30 font-medium">
                        Amazon.es
                      </span>
                    ) : (
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
                        {deal.merchant || 'Loja Web'}
                      </span>
                    )}

                    {deal.asin && (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-950 text-slate-400 border border-slate-800">
                        {deal.asin}
                      </span>
                    )}
                  </div>

                  {deal.discountPercent !== null && deal.discountPercent > 0 && (
                    <span className="text-xs px-2 py-0.5 rounded-md bg-rose-500/20 text-rose-300 font-extrabold border border-rose-500/30 flex-shrink-0">
                      -{deal.discountPercent}%
                    </span>
                  )}
                </div>

                {/* Conteúdo Central: Imagem e Título */}
                <div className="flex gap-3 mb-4">
                  {/* Thumbnail */}
                  <div className="h-20 w-20 rounded-xl bg-slate-950 border border-slate-800 p-1 flex-shrink-0 flex items-center justify-center overflow-hidden">
                    {deal.imageUrl ? (
                      <img
                        src={deal.imageUrl}
                        alt={deal.title}
                        className="h-full w-full object-contain"
                        onError={(e) => {
                          (e.target as HTMLElement).style.display = 'none';
                        }}
                      />
                    ) : (
                      <ShoppingBag className="h-8 w-8 text-slate-700" />
                    )}
                  </div>

                  {/* Título e Preços */}
                  <div className="flex-1 min-w-0">
                    <h3 className="text-xs sm:text-sm font-semibold text-white line-clamp-2 leading-snug hover:text-amber-300 transition">
                      {deal.title}
                    </h3>

                    {/* Preços */}
                    <div className="mt-2 flex items-baseline gap-2">
                      {deal.newPrice !== null ? (
                        <span className="text-base sm:text-lg font-black text-emerald-400">
                          {deal.newPrice.toFixed(2).replace('.', ',')}€
                        </span>
                      ) : (
                        <span className="text-xs font-bold text-amber-400">Ver Oferta</span>
                      )}

                      {deal.oldPrice !== null && deal.oldPrice > (deal.newPrice || 0) && (
                        <del className="text-xs text-slate-500">
                          {deal.oldPrice.toFixed(2).replace('.', ',')}€
                        </del>
                      )}
                    </div>
                  </div>
                </div>

                {/* Link afiliado pronto preview */}
                <div className="mb-3 px-2 py-1.5 rounded-lg bg-slate-950 border border-slate-800/80 text-[10px] text-slate-400 font-mono truncate flex items-center justify-between">
                  <span className="truncate">{deal.affiliateUrl}</span>
                  <a
                    href={deal.affiliateUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-amber-400 hover:text-amber-300 ml-1.5 flex-shrink-0"
                    title="Testar Link Afiliado"
                  >
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>

                {/* Botões de Ação na Base do Card */}
                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => onEditBeforePublish(deal)}
                    className="inline-flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs font-semibold border border-slate-700 transition"
                  >
                    <Edit3 className="h-3.5 w-3.5 text-amber-400" />
                    <span>Editar</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onOneClickPublish(deal)}
                    disabled={isPublishingThis}
                    className={`inline-flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-xl text-xs font-bold transition shadow-sm ${
                      deal.alreadySent
                        ? 'bg-slate-800 hover:bg-slate-750 text-slate-300 border border-slate-700'
                        : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-900/30'
                    }`}
                  >
                    {isPublishingThis ? (
                      <div className="h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : deal.alreadySent ? (
                      <>
                        <Send className="h-3.5 w-3.5 text-slate-400" />
                        <span>Reenviar</span>
                      </>
                    ) : (
                      <>
                        <Send className="h-3.5 w-3.5" />
                        <span>1-Clique</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
