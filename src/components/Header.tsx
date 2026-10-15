import React from 'react';
import {
  Zap,
  Radio,
  Tag,
  Search,
  Power,
  RefreshCw,
  Send,
  ExternalLink,
  ShieldCheck,
  Download,
} from 'lucide-react';
import { AutopilotState, SystemStatus } from '../types';
import { downloadChannelLogo } from '../utils/generateLogo';

interface HeaderProps {
  status: SystemStatus | null;
  autopilot: AutopilotState | null;
  isScanning: boolean;
  onScanNow: () => void;
  onToggleAutopilot: () => void;
  onOpenTelegram: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  status,
  autopilot,
  isScanning,
  onScanNow,
  onToggleAutopilot,
  onOpenTelegram,
}) => {
  const isAutopilotOn = autopilot?.active ?? false;
  const channelHandle = status?.telegram?.channel?.username || '@radardescontos_pt';
  const amazonTag = status?.amazonTag || 'radardescontospt-21';

  return (
    <header className="border-b border-slate-800 bg-slate-900/95 backdrop-blur-md sticky top-0 z-40 shadow-xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
        {/* Linha Superior: Marca e Ações Principais */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          {/* Título e Identidade */}
          <div className="flex items-start sm:items-center gap-3">
            <div className="h-11 w-11 rounded-xl bg-gradient-to-tr from-amber-500 to-yellow-300 flex items-center justify-center shadow-lg shadow-amber-500/20 text-slate-950 flex-shrink-0">
              <Zap className="h-6 w-6 fill-current stroke-[2.5]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white flex items-center gap-2">
                  <span>Radar Descontos & Tech PT</span>
                  <span className="text-xs uppercase px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/30 font-semibold tracking-wider">
                    Motor Automático
                  </span>
                </h1>
              </div>
              <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1.5 flex-wrap">
                <span>Deteção contínua de tecnologia</span>
                <span className="text-slate-600">•</span>
                <span>Links afiliados automáticos</span>
                <span className="text-slate-600">•</span>
                <span className="text-emerald-400 font-medium">Disparo Telegram PT</span>
              </p>
            </div>
          </div>

          {/* Badges de Estado Ativo */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Badge Canal Telegram */}
            <a
              href="https://t.me/radardescontos_pt"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-sky-950/80 border border-sky-600/40 text-sky-200 text-xs font-medium hover:bg-sky-900/60 transition group cursor-pointer"
              title="Abrir canal oficial no Telegram"
            >
              <div className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-sky-500"></span>
              </div>
              <Send className="h-3.5 w-3.5 text-sky-400" />
              <span>Canal: <strong className="text-sky-100 font-bold">{channelHandle}</strong></span>
              <ExternalLink className="h-3 w-3 opacity-60 group-hover:opacity-100 transition" />
            </a>

            {/* Badge Tag Amazon */}
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-950/60 border border-amber-600/40 text-amber-200 text-xs font-medium">
              <Tag className="h-3.5 w-3.5 text-amber-400" />
              <span>Tag Amazon: <strong className="text-amber-100 font-mono font-bold">{amazonTag}</strong></span>
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
            </div>

            {/* Botão Baixar Logo do Canal (PNG) */}
            <button
              onClick={downloadChannelLogo}
              type="button"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 hover:border-slate-600 transition shadow-sm cursor-pointer"
              title="Descarregar logótipo oficial do canal em alta resolução (1000x1000 PNG)"
            >
              <Download className="h-3.5 w-3.5 text-amber-400" />
              <span>📥 Baixar Logo do Canal (PNG)</span>
            </button>

            {/* Botão de Piloto Automático */}
            <button
              onClick={onToggleAutopilot}
              type="button"
              className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all shadow-md ${
                isAutopilotOn
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-900/30 ring-2 ring-emerald-400/50'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
              }`}
            >
              <Power className={`h-3.5 w-3.5 ${isAutopilotOn ? 'text-emerald-200 animate-pulse' : 'text-slate-400'}`} />
              <span>
                Piloto Automático (15 min):{' '}
                <span className={isAutopilotOn ? 'text-emerald-100 uppercase' : 'text-slate-400 uppercase'}>
                  {isAutopilotOn ? 'ON' : 'OFF'}
                </span>
              </span>
            </button>

            {/* Botão Varrer Ofertas Agora */}
            <button
              onClick={onScanNow}
              disabled={isScanning}
              type="button"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-xs sm:text-sm shadow-lg shadow-amber-500/20 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RefreshCw className={`h-4 w-4 ${isScanning ? 'animate-spin' : ''}`} />
              <span>{isScanning ? 'A varrer ofertas...' : '🔎 Varrer Ofertas Agora'}</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
