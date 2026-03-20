/**
 * VYN CRM — Banner de status offline
 * Aparece no topo quando o servidor está inacessível
 */
import { useEffect, useState } from 'react';
import { WifiOff, Wifi, RefreshCw, Clock } from 'lucide-react';
import {
  onStatusConexao, contarPendentes, sincronizarPendentes,
  StatusConexao, VendaOffline
} from '@/lib/offline';
import { sistemaAPI } from '@/lib/api';

export function OfflineBanner() {
  const [status, setStatus]     = useState<StatusConexao>('verificando');
  const [pendentes, setPendentes] = useState(0);
  const [sincronizando, setSincronizando] = useState(false);
  const [ultimoSync, setUltimoSync] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onStatusConexao(async (s) => {
      setStatus(s);
      if (s === 'online' || s === 'offline') {
        const n = await contarPendentes();
        setPendentes(n);
      }
    });
    contarPendentes().then(setPendentes);
    return unsub;
  }, []);

  const handleSincronizar = async () => {
    setSincronizando(true);
    try {
      const url = sistemaAPI.getServerURL();
      const result = await sincronizarPendentes(url);
      const n = await contarPendentes();
      setPendentes(n);
      if (result.ok > 0) {
        setUltimoSync(`${result.ok} venda${result.ok > 1 ? 's' : ''} sincronizada${result.ok > 1 ? 's' : ''}`);
        setTimeout(() => setUltimoSync(null), 4000);
      }
    } finally {
      setSincronizando(false);
    }
  };

  // Online sem pendentes → não mostra nada
  if (status === 'online' && pendentes === 0 && !ultimoSync) return null;

  // Online mas tem pendentes (acabou de voltar)
  if (status === 'online' && pendentes > 0) {
    return (
      <div className="bg-amber-500 text-white px-4 py-2 flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 shrink-0" />
          <span><strong>{pendentes}</strong> venda{pendentes > 1 ? 's' : ''} offline pendente{pendentes > 1 ? 's' : ''} — servidor reconectado</span>
        </div>
        <button
          onClick={handleSincronizar}
          disabled={sincronizando}
          className="flex items-center gap-1 bg-white/20 hover:bg-white/30 rounded px-3 py-1 font-medium transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3 h-3 ${sincronizando ? 'animate-spin' : ''}`} />
          {sincronizando ? 'Sincronizando...' : 'Sincronizar agora'}
        </button>
      </div>
    );
  }

  // Acaba de sincronizar com sucesso
  if (status === 'online' && ultimoSync) {
    return (
      <div className="bg-green-600 text-white px-4 py-2 flex items-center gap-2 text-sm">
        <Wifi className="w-4 h-4" />
        <span>✅ {ultimoSync} com o servidor</span>
      </div>
    );
  }

  // Offline
  if (status === 'offline') {
    return (
      <div className="bg-red-600 text-white px-4 py-2 flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          <WifiOff className="w-4 h-4 shrink-0 animate-pulse" />
          <span>
            Servidor offline — vendas serão salvas localmente
            {pendentes > 0 && <span className="ml-2 bg-white/20 rounded-full px-2 py-0.5 text-xs font-bold">{pendentes} pendente{pendentes > 1 ? 's' : ''}</span>}
          </span>
        </div>
        <button
          onClick={handleSincronizar}
          disabled={sincronizando}
          className="flex items-center gap-1 bg-white/20 hover:bg-white/30 rounded px-3 py-1 font-medium transition-colors disabled:opacity-50 text-xs"
        >
          <RefreshCw className={`w-3 h-3 ${sincronizando ? 'animate-spin' : ''}`} />
          Tentar reconectar
        </button>
      </div>
    );
  }

  return null;
}
