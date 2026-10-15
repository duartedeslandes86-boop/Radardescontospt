import React, { useState, useEffect } from 'react';
import {
  Cpu,
  Power,
  Play,
  RotateCw,
  Terminal,
  Clock,
  CheckCircle,
  AlertTriangle,
  Info,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { AutopilotState } from '../types';

interface AutopilotConsoleProps {
  autopilot: AutopilotState | null;
  onToggleAutopilot: () => void;
  onTriggerNow: () => void;
  isTriggering: boolean;
}

export const AutopilotConsole: React.FC<AutopilotConsoleProps> = ({
  autopilot,
  onToggleAutopilot,
  onTriggerNow,
  isTriggering,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [timeLeft, setTimeLeft] = useState<string>('');

  const isActive = autopilot?.active ?? false;

  useEffect(() => {
    if (!isActive || !autopilot?.nextRun) {
      setTimeLeft('');
      return;
    }

    const interval = setInterval(() => {
      const diff = new Date(autopilot.nextRun!).getTime() - Date.now();
      if (diff <= 0) {
        setTimeLeft('A executar ciclo...');
      } else {
        const mins = Math.floor(diff / 60000);
        const secs = Math.floor((diff % 60000) / 1000);
        setTimeLeft(`${mins}m ${secs < 10 ? '0' : ''}${secs}s`);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isActive, autopilot?.nextRun]);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xl transition-all">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* Info do Piloto Automático */}
        <div className="flex items-center gap-3">
          <div
            className={`p-2.5 rounded-xl border flex items-center justify-center transition-all ${
              isActive
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                : 'bg-slate-800 border-slate-700 text-slate-400'
            }`}
          >
            <Cpu className={`h-5 w-5 ${isActive ? 'animate-pulse' : ''}`} />
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-white">
                Piloto Automático em Segundo Plano
              </h3>
              <span
                className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-md border ${
                  isActive
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                    : 'bg-slate-800 text-slate-400 border-slate-700'
                }`}
              >
                {isActive ? 'Ativo (15 min)' : 'Pausado'}
              </span>
            </div>

            <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-2 flex-wrap">
              <span>Varre o radar a cada 15 min, filtra tech &amp; Amazon e publica 1-2 novas ofertas.</span>
              {isActive && timeLeft && (
                <span className="font-mono text-amber-300 font-semibold flex items-center gap-1">
                  <Clock className="h-3 w-3" /> Próximo ciclo em: {timeLeft}
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Controlos Rápidos */}
        <div className="flex items-center gap-2 self-start sm:self-center">
          <button
            onClick={onTriggerNow}
            disabled={isTriggering}
            type="button"
            className="text-xs px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 font-medium transition flex items-center gap-1.5 disabled:opacity-50"
            title="Executa a verificação e despacho imediatamente"
          >
            <RotateCw className={`h-3 w-3 ${isTriggering ? 'animate-spin text-amber-400' : ''}`} />
            <span>{isTriggering ? 'A executar...' : 'Forçar Ciclo Agora'}</span>
          </button>

          <button
            onClick={onToggleAutopilot}
            type="button"
            className={`text-xs px-3.5 py-1.5 rounded-lg font-bold transition flex items-center gap-1.5 shadow-md ${
              isActive
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
            }`}
          >
            <Power className="h-3 w-3" />
            <span>{isActive ? 'Desativar' : 'Ativar Piloto'}</span>
          </button>

          <button
            onClick={() => setIsExpanded(!isExpanded)}
            type="button"
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-400 hover:text-white border border-slate-700 transition"
            title="Ver registos do motor"
          >
            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Registo de Logs em Terminal (Acordeão) */}
      {isExpanded && (
        <div className="mt-4 pt-4 border-t border-slate-800/80">
          <div className="flex items-center justify-between mb-2 text-xs text-slate-400">
            <span className="font-semibold flex items-center gap-1.5 text-slate-300">
              <Terminal className="h-3.5 w-3.5 text-amber-400" />
              Consola de Eventos do Motor Automático
            </span>
            <span>Total de ofertas auto-publicadas: <strong className="text-emerald-400">{autopilot?.totalAutoPublished || 0}</strong></span>
          </div>

          <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 font-mono text-[11px] max-h-48 overflow-y-auto space-y-1.5">
            {autopilot?.logs && autopilot.logs.length > 0 ? (
              autopilot.logs.map((log, idx) => (
                <div key={idx} className="flex items-start gap-2 leading-relaxed">
                  <span className="text-slate-500 select-none">[{log.time}]</span>
                  {log.type === 'success' && <CheckCircle className="h-3 w-3 text-emerald-400 flex-shrink-0 mt-0.5" />}
                  {log.type === 'error' && <AlertTriangle className="h-3 w-3 text-rose-400 flex-shrink-0 mt-0.5" />}
                  {log.type === 'warn' && <AlertTriangle className="h-3 w-3 text-amber-400 flex-shrink-0 mt-0.5" />}
                  {log.type === 'info' && <Info className="h-3 w-3 text-sky-400 flex-shrink-0 mt-0.5" />}
                  <span
                    className={
                      log.type === 'success'
                        ? 'text-emerald-300'
                        : log.type === 'error'
                        ? 'text-rose-300'
                        : log.type === 'warn'
                        ? 'text-amber-300'
                        : 'text-slate-300'
                    }
                  >
                    {log.message}
                  </span>
                </div>
              ))
            ) : (
              <div className="text-slate-600">A aguardar eventos...</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
