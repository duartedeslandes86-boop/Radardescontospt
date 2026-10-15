import React from 'react';
import {
  History,
  Send,
  ExternalLink,
  Trash2,
  Calendar,
  Sparkles,
  ShoppingBag,
  Cpu,
  Clock,
} from 'lucide-react';
import { SentDealRecord } from '../types';

interface HistoryLogProps {
  history: SentDealRecord[];
  onDeleteItem: (id: string) => Promise<void>;
  channelHandle: string;
}

export const HistoryLog: React.FC<HistoryLogProps> = ({
  history,
  onDeleteItem,
  channelHandle,
}) => {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 mb-4 border-b border-slate-800 gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
            <History className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-white">Histórico de Disparos</h2>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">
                {history.length} publicados
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Registo de ofertas publicadas diretamente no canal <strong className="text-sky-300">{channelHandle}</strong>.
            </p>
          </div>
        </div>
      </div>

      {/* Conteúdo */}
      {history.length === 0 ? (
        <div className="p-8 text-center text-slate-500 text-xs sm:text-sm">
          <Send className="h-8 w-8 mx-auto mb-2 text-slate-700" />
          Ainda não foram despachadas ofertas para o canal nesta sessão.
        </div>
      ) : (
        <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
          {history.map((item) => {
            const dateStr = new Date(item.publishedAt).toLocaleString('pt-PT', {
              day: '2-digit',
              month: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
            });

            return (
              <div
                key={item.id + item.publishedAt}
                className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 hover:border-slate-700 transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
              >
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  {/* Thumbnail se existir */}
                  <div className="h-12 w-12 rounded-lg bg-slate-900 border border-slate-800 p-0.5 flex-shrink-0 flex items-center justify-center overflow-hidden">
                    {item.imageUrl ? (
                      <img
                        src={item.imageUrl}
                        alt=""
                        className="h-full w-full object-contain"
                        onError={(e) => {
                          (e.target as HTMLElement).style.display = 'none';
                        }}
                      />
                    ) : (
                      <ShoppingBag className="h-5 w-5 text-slate-600" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5 mb-1">
                      <span className="font-semibold text-white text-xs sm:text-sm line-clamp-1">
                        {item.title}
                      </span>
                      {item.asin && (
                        <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-800 text-slate-300">
                          {item.asin}
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5 text-slate-400 text-[11px]">
                      {item.newPrice !== null && item.newPrice !== undefined && (
                        <span className="font-bold text-emerald-400">
                          {item.newPrice.toFixed(2).replace('.', ',')}€
                        </span>
                      )}
                      {item.oldPrice && item.oldPrice > (item.newPrice || 0) && (
                        <del className="text-slate-500">
                          {item.oldPrice.toFixed(2).replace('.', ',')}€
                        </del>
                      )}
                      {item.discountPercent && (
                        <span className="text-rose-400 font-bold">
                          -{item.discountPercent}%
                        </span>
                      )}
                      <span className="text-slate-600">•</span>
                      <span className="flex items-center gap-1 text-slate-400">
                        <Clock className="h-3 w-3 text-slate-500" />
                        {dateStr}
                      </span>
                      <span className="text-slate-600">•</span>
                      <span className="px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 text-[10px] capitalize">
                        {item.dispatchType === 'autopilot'
                          ? '🤖 Piloto Auto'
                          : item.dispatchType === 'radar_1click'
                          ? '⚡ 1-Clique'
                          : '✍️ Manual'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Ações */}
                <div className="flex items-center gap-2 self-end sm:self-center flex-shrink-0">
                  <a
                    href={item.affiliateUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 text-xs font-medium border border-slate-700 transition"
                  >
                    <span>Ver Link</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>

                  <button
                    onClick={() => onDeleteItem(item.id)}
                    type="button"
                    title="Remover do registo"
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-950/50 text-slate-400 hover:text-rose-300 border border-slate-700 transition"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
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
