import React, { useState, useEffect, useCallback } from 'react';
import { Header } from './components/Header';
import { ManualPublisherCard } from './components/ManualPublisherCard';
import { RadarDealsGrid } from './components/RadarDealsGrid';
import { HistoryLog } from './components/HistoryLog';
import { AutopilotConsole } from './components/AutopilotConsole';
import {
  DealItem,
  SentDealRecord,
  AutopilotState,
  SystemStatus,
  QuickPublishFormState,
} from './types';
import {
  Zap,
  CheckCircle,
  AlertCircle,
  Send,
  ExternalLink,
  Layers,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react';

export default function App() {
  const [deals, setDeals] = useState<DealItem[]>([]);
  const [history, setHistory] = useState<SentDealRecord[]>([]);
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [autopilot, setAutopilot] = useState<AutopilotState | null>(null);

  const [isScanning, setIsScanning] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishingDealId, setPublishingDealId] = useState<string | null>(null);
  const [isTriggeringAutopilot, setIsTriggeringAutopilot] = useState(false);

  // Formulário do Disparo Rápido
  const [formData, setFormData] = useState<QuickPublishFormState>({
    title: '',
    oldPrice: '',
    newPrice: '',
    url: '',
    imageUrl: '',
  });

  // Notificação Toast
  const [toast, setToast] = useState<{
    show: boolean;
    type: 'success' | 'error' | 'info';
    message: string;
    actionUrl?: string;
  }>({
    show: false,
    type: 'info',
    message: '',
  });

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success', actionUrl?: string) => {
    setToast({ show: true, type, message, actionUrl });
    setTimeout(() => {
      setToast((prev) => ({ ...prev, show: false }));
    }, 6000);
  };

  // Carregar status geral do sistema
  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/status');
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      }
    } catch (e) {
      console.warn('Erro ao carregar /api/status', e);
    }
  }, []);

  // Carregar histórico de envios
  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch('/api/history');
      if (res.ok) {
        const data = await res.json();
        setHistory(data.history || []);
      }
    } catch (e) {
      console.warn('Erro ao carregar /api/history', e);
    }
  }, []);

  // Carregar estado do piloto automático
  const fetchAutopilot = useCallback(async () => {
    try {
      const res = await fetch('/api/autopilot');
      if (res.ok) {
        const data = await res.json();
        setAutopilot(data.autopilot);
      }
    } catch (e) {
      console.warn('Erro ao carregar /api/autopilot', e);
    }
  }, []);

  // Varrer ofertas (Endpoint /api/scan)
  const handleScan = useCallback(async () => {
    setIsScanning(true);
    try {
      const res = await fetch('/api/scan');
      const data = await res.json();
      if (data.success && Array.isArray(data.deals)) {
        setDeals(data.deals);
        showToast(`Radar atualizado! ${data.deals.length} promoções detetadas.`, 'info');
      } else {
        showToast('Não foi possível obter o feed de ofertas.', 'error');
      }
    } catch (err: any) {
      showToast(`Erro ao varrer ofertas: ${err.message}`, 'error');
    } finally {
      setIsScanning(false);
    }
  }, []);

  // Ciclo inicial de arranque
  useEffect(() => {
    fetchStatus();
    fetchHistory();
    fetchAutopilot();
    handleScan();

    // Polling a cada 10 segundos para sincronização dos logs e status do piloto
    const timer = setInterval(() => {
      fetchAutopilot();
      fetchHistory();
    }, 10000);

    return () => clearInterval(timer);
  }, [fetchStatus, fetchHistory, fetchAutopilot, handleScan]);

  // Ativar/Desativar Piloto Automático
  const handleToggleAutopilot = async () => {
    const nextState = !autopilot?.active;
    try {
      const res = await fetch('/api/autopilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: nextState ? 'start' : 'stop' }),
      });
      const data = await res.json();
      if (data.success) {
        setAutopilot(data.autopilot);
        showToast(
          nextState
            ? 'Piloto Automático ativado! Varrimento a cada 15 min.'
            : 'Piloto Automático desligado.',
          nextState ? 'success' : 'info'
        );
      }
    } catch (err: any) {
      showToast(`Erro ao alterar piloto automático: ${err.message}`, 'error');
    }
  };

  // Forçar execução imediata do ciclo de piloto automático
  const handleTriggerAutopilotNow = async () => {
    setIsTriggeringAutopilot(true);
    try {
      const res = await fetch('/api/autopilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'trigger_now' }),
      });
      const data = await res.json();
      if (data.success) {
        setAutopilot(data.autopilot);
        await fetchHistory();
        await handleScan();
        showToast('Ciclo executado com sucesso!', 'success');
      }
    } catch (err: any) {
      showToast(`Erro ao forçar ciclo: ${err.message}`, 'error');
    } finally {
      setIsTriggeringAutopilot(false);
    }
  };

  // Publicar manual
  const handleManualPublish = async (form: QuickPublishFormState): Promise<boolean> => {
    setIsPublishing(true);
    try {
      const res = await fetch('/api/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title,
          oldPrice: form.oldPrice,
          newPrice: form.newPrice,
          url: form.url,
          imageUrl: form.imageUrl,
          dispatchType: 'manual',
        }),
      });

      const data = await res.json();
      if (data.success) {
        showToast('Oferta publicada no Telegram @radardescontos_pt!', 'success', 'https://t.me/radardescontos_pt');
        await fetchHistory();
        // Atualizar lista de ofertas locais se corresponder a alguma
        setDeals((prev) =>
          prev.map((d) =>
            d.originalLink === form.url || d.affiliateUrl === form.url
              ? { ...d, alreadySent: true }
              : d
          )
        );
        return true;
      } else {
        showToast(`Erro ao publicar: ${data.error}`, 'error');
        return false;
      }
    } catch (err: any) {
      showToast(`Erro de rede: ${err.message}`, 'error');
      return false;
    } finally {
      setIsPublishing(false);
    }
  };

  // Publicar em 1-Clique na Grelha do Radar
  const handleOneClickPublish = async (deal: DealItem) => {
    setPublishingDealId(deal.id);
    try {
      const res = await fetch('/api/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: deal.id,
          title: deal.title,
          oldPrice: deal.oldPrice,
          newPrice: deal.newPrice,
          url: deal.affiliateUrl || deal.originalLink,
          imageUrl: deal.imageUrl,
          dispatchType: 'radar_1click',
        }),
      });

      const data = await res.json();
      if (data.success) {
        showToast(`Oferta "${deal.title.slice(0, 30)}..." enviada para o Telegram!`, 'success', 'https://t.me/radardescontos_pt');
        // Marcar visualmente como enviado
        setDeals((prev) =>
          prev.map((d) => (d.id === deal.id ? { ...d, alreadySent: true } : d))
        );
        await fetchHistory();
      } else {
        showToast(`Falha ao despachar: ${data.error}`, 'error');
      }
    } catch (err: any) {
      showToast(`Erro ao despachar: ${err.message}`, 'error');
    } finally {
      setPublishingDealId(null);
    }
  };

  // Preencher formulário manual a partir da oferta do radar
  const handleEditBeforePublish = (deal: DealItem) => {
    setFormData({
      title: deal.title,
      oldPrice: deal.oldPrice ? deal.oldPrice.toString() : '',
      newPrice: deal.newPrice ? deal.newPrice.toString() : '',
      url: deal.originalLink || deal.affiliateUrl,
      imageUrl: deal.imageUrl || '',
    });

    const el = document.getElementById('manual-publisher');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
      el.classList.add('ring-2', 'ring-amber-400');
      setTimeout(() => el.classList.remove('ring-2', 'ring-amber-400'), 1500);
    }
    showToast('Dados da oferta preenchidos no formulário de Disparo Rápido!', 'info');
  };

  // Eliminar do histórico
  const handleDeleteHistoryItem = async (id: string) => {
    try {
      const res = await fetch('/api/history/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (data.success) {
        setHistory((prev) => prev.filter((h) => h.id !== id && h.asin !== id));
        // Se a oferta estiver na grelha, podemos desmarcar alreadySent
        setDeals((prev) =>
          prev.map((d) => (d.id === id || d.asin === id ? { ...d, alreadySent: false } : d))
        );
        showToast('Item removido do registo.', 'info');
      }
    } catch (err: any) {
      showToast(`Erro ao remover: ${err.message}`, 'error');
    }
  };

  const activeTag = status?.amazonTag || 'radardescon08-21';
  const channelHandle = status?.telegram?.channel?.username || '@radardescontos_pt';

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Toast Flutuante de Feedback */}
      {toast.show && (
        <div className="fixed bottom-6 right-6 z-50 max-w-md animate-bounce duration-300">
          <div
            className={`p-4 rounded-2xl shadow-2xl border flex items-center justify-between gap-3 text-xs sm:text-sm font-medium ${
              toast.type === 'success'
                ? 'bg-slate-900 border-emerald-500/50 text-emerald-200 shadow-emerald-950/40'
                : toast.type === 'error'
                ? 'bg-slate-900 border-rose-500/50 text-rose-200 shadow-rose-950/40'
                : 'bg-slate-900 border-amber-500/50 text-amber-200 shadow-amber-950/40'
            }`}
          >
            <div className="flex items-center gap-2.5">
              {toast.type === 'success' && <CheckCircle className="h-5 w-5 text-emerald-400 flex-shrink-0" />}
              {toast.type === 'error' && <AlertCircle className="h-5 w-5 text-rose-400 flex-shrink-0" />}
              {toast.type === 'info' && <Zap className="h-5 w-5 text-amber-400 flex-shrink-0" />}
              <span>{toast.message}</span>
            </div>

            {toast.actionUrl && (
              <a
                href={toast.actionUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-2.5 py-1 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold flex items-center gap-1 flex-shrink-0 transition"
              >
                <span>Ver Canal</span>
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        </div>
      )}

      {/* Top Header & Control Bar */}
      <Header
        status={status}
        autopilot={autopilot}
        isScanning={isScanning}
        onScanNow={handleScan}
        onToggleAutopilot={handleToggleAutopilot}
        onOpenTelegram={() => window.open('https://t.me/radardescontos_pt', '_blank')}
      />

      {/* Painel de Métricas Rápidas & Banner de Estado */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-6 pb-2 w-full">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400">
              <Zap className="h-4 w-4" />
            </div>
            <div>
              <div className="text-[11px] text-slate-400 uppercase font-bold">Ofertas no Radar</div>
              <div className="text-base font-black text-white">{deals.length} detetadas</div>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
              <CheckCircle className="h-4 w-4" />
            </div>
            <div>
              <div className="text-[11px] text-slate-400 uppercase font-bold">Publicadas no Canal</div>
              <div className="text-base font-black text-emerald-400">{history.length} enviadas</div>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-sky-500/10 text-sky-400">
              <Send className="h-4 w-4" />
            </div>
            <div>
              <div className="text-[11px] text-slate-400 uppercase font-bold">Canal Ativo</div>
              <div className="text-xs font-black text-sky-300 truncate">{channelHandle}</div>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400">
              <ShieldCheck className="h-4 w-4" />
            </div>
            <div>
              <div className="text-[11px] text-slate-400 uppercase font-bold">Tag Associada</div>
              <div className="text-xs font-mono font-bold text-amber-300 truncate">{activeTag}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Conteúdo Principal */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 w-full space-y-6 flex-1">
        {/* Consola do Piloto Automático */}
        <AutopilotConsole
          autopilot={autopilot}
          onToggleAutopilot={handleToggleAutopilot}
          onTriggerNow={handleTriggerAutopilotNow}
          isTriggering={isTriggeringAutopilot}
        />

        {/* Card de Disparo Rápido (Publicador Manual) */}
        <ManualPublisherCard
          formData={formData}
          onChange={(patch) => setFormData((prev) => ({ ...prev, ...patch }))}
          onPublish={handleManualPublish}
          isPublishing={isPublishing}
          activeAmazonTag={activeTag}
        />

        {/* Grelha de Ofertas Detetadas pelo Radar */}
        <RadarDealsGrid
          deals={deals}
          onOneClickPublish={handleOneClickPublish}
          onEditBeforePublish={handleEditBeforePublish}
          publishingDealId={publishingDealId}
          activeAmazonTag={activeTag}
        />

        {/* Histórico de Disparos */}
        <HistoryLog
          history={history}
          onDeleteItem={handleDeleteHistoryItem}
          channelHandle={channelHandle}
        />
      </main>

      {/* Rodapé */}
      <footer className="border-t border-slate-900 bg-slate-950 py-6 mt-12 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-400">Radar Descontos &amp; Tech PT</span>
            <span>—</span>
            <span>Motor de Deteção e Afiliados Amazon ES</span>
          </div>
          <div className="flex items-center gap-3 text-slate-400">
            <span>Tag: <code className="text-amber-400 font-mono">{activeTag}</code></span>
            <span>•</span>
            <a
              href="https://t.me/radardescontos_pt"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sky-400 hover:underline flex items-center gap-1"
            >
              <span>{channelHandle}</span>
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
