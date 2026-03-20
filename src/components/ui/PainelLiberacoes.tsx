/**
 * ASTIA PDV — Painel de Liberações Pendentes
 * 
 * Fluxo:
 *   1. Operador no PDV solicita desconto/cancelamento
 *   2. Cria token no servidor via /api/liberacao/criar
 *   3. Badge aparece no sino do gerente (polling a cada 4s)
 *   4. Gerente clica → vê a lista → aprova com 1 clique
 *   5. PDV detecta aprovação e destrava automaticamente
 */
import { useState, useEffect, useRef } from "react";
import { Shield, Check, X, Clock, CheckCircle2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { sistemaAPI } from "@/lib/api";

interface Pendente {
  token: string;
  descricao: string;
  status: "pendente" | "aprovado";
  usuario: string | null;
  criadoEm: number;
}

interface PainelLiberacoesProps {
  onClose: () => void;
}

export function PainelLiberacoes({ onClose }: PainelLiberacoesProps) {
  const { usuario } = useAuth();
  const [pendentes, setPendentes] = useState<Pendente[]>([]);
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [aprovados, setAprovados] = useState<Set<string>>(new Set());

  const serverURL = sistemaAPI.getServerURL();

  const carregar = async () => {
    try {
      const r = await fetch(`${serverURL}/api/liberacao/pendentes`).then(r => r.json());
      if (r.ok) setPendentes(r.result.filter((p: Pendente) => p.status === "pendente"));
    } catch {}
  };

  useEffect(() => {
    carregar();
    const t = setInterval(carregar, 3000);
    return () => clearInterval(t);
  }, []);

  const aprovar = async (token: string) => {
    setLoading(l => ({ ...l, [token]: true }));
    try {
      const r = await fetch(`${serverURL}/api/liberacao/aprovar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, nomeGerente: usuario?.nome || "Gerente" }),
      }).then(r => r.json());

      if (r.ok) {
        setAprovados(s => new Set([...s, token]));
        setTimeout(() => {
          setPendentes(p => p.filter(x => x.token !== token));
          setAprovados(s => { const n = new Set(s); n.delete(token); return n; });
        }, 1500);
      }
    } finally {
      setLoading(l => ({ ...l, [token]: false }));
    }
  };

  const tempoRelativo = (ts: number) => {
    const diff = Math.floor((Date.now() - ts) / 1000);
    if (diff < 60) return `${diff}s atrás`;
    return `${Math.floor(diff / 60)}min atrás`;
  };

  const podeAprovar = usuario?.cargo === "admin" || usuario?.cargo === "gerente";

  return (
    <div className="absolute right-0 top-12 z-50 w-80 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-amber-500" />
          <span className="font-semibold text-sm">Liberações pendentes</span>
          {pendentes.length > 0 && (
            <span className="bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5 font-bold leading-none">
              {pendentes.length}
            </span>
          )}
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* List */}
      <div className="max-h-96 overflow-y-auto">
        {pendentes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-slate-400 gap-2">
            <Shield className="w-8 h-8 opacity-30" />
            <p className="text-sm">Nenhuma liberação pendente</p>
          </div>
        ) : (
          pendentes.map(p => (
            <div key={p.token} className="px-4 py-3 border-b border-slate-50 dark:border-slate-800 last:border-0">
              <div className="flex items-start gap-3">
                {/* Ícone de status */}
                <div className={`mt-0.5 w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                  aprovados.has(p.token)
                    ? "bg-green-100 dark:bg-green-900/30"
                    : "bg-amber-100 dark:bg-amber-900/30"
                }`}>
                  {aprovados.has(p.token)
                    ? <Check className="w-4 h-4 text-green-600" />
                    : <Clock className="w-4 h-4 text-amber-600 animate-pulse" />
                  }
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-100 leading-tight">
                    {p.descricao}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">{tempoRelativo(p.criadoEm)}</p>

                  {aprovados.has(p.token) ? (
                    <p className="text-xs text-green-600 font-semibold mt-1.5">✅ Aprovado!</p>
                  ) : podeAprovar ? (
                    <button
                      onClick={() => aprovar(p.token)}
                      disabled={loading[p.token]}
                      className="mt-2 w-full py-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5"
                    >
                      {loading[p.token] ? "Aprovando..." : "✅ Aprovar liberação"}
                    </button>
                  ) : (
                    <p className="text-xs text-slate-400 mt-1">Aguardando aprovação do gerente</p>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {!podeAprovar && pendentes.length > 0 && (
        <div className="px-4 py-2 bg-amber-50 dark:bg-amber-950/30 border-t border-amber-100 dark:border-amber-900/30">
          <p className="text-xs text-amber-700 dark:text-amber-400">
            Apenas gerentes e admins podem aprovar liberações.
          </p>
        </div>
      )}
    </div>
  );
}

// Hook para contar pendentes (usado no TopBar para o badge)
export function usePendenteCount() {
  const [count, setCount] = useState(0);
  const serverURL = sistemaAPI.getServerURL();

  useEffect(() => {
    const checar = async () => {
      try {
        const r = await fetch(`${serverURL}/api/liberacao/pendentes`).then(r => r.json());
        if (r.ok) setCount(r.result.filter((p: Pendente) => p.status === "pendente").length);
      } catch {}
    };
    checar();
    const t = setInterval(checar, 4000);
    return () => clearInterval(t);
  }, []);

  return count;
}
