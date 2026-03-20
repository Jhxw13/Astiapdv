/**
 * ASTIA PDV — Notificação de atualização silenciosa
 * Baixa e instala automaticamente. Só aparece para avisar o cliente.
 */
import { useState, useEffect } from "react";
import { Download, CheckCircle2, RefreshCw, ArrowUpCircle } from "lucide-react";

type UpdateState =
  | { status: "idle" }
  | { status: "disponivel"; versao: string }
  | { status: "baixando"; percent: number }
  | { status: "instalando"; versao: string; countdown: number };

export function UpdateNotification() {
  const [state, setState] = useState<UpdateState>({ status: "idle" });
  const [countdown, setCountdown] = useState(5);

  useEffect(() => {
    if (!window.vyn?.onUpdate) return;

    window.vyn.onUpdate("update:disponivel", (data: any) => {
      setState({ status: "disponivel", versao: data.versao });
    });

    window.vyn.onUpdate("update:progresso", (data: any) => {
      setState({ status: "baixando", percent: Math.round(data.percent) });
    });

    window.vyn.onUpdate("update:baixado", (data: any) => {
      setState({ status: "instalando", versao: data.versao, countdown: 5 });
      setCountdown(5);
    });

    return () => {
      window.vyn?.offUpdate?.("update:disponivel");
      window.vyn?.offUpdate?.("update:progresso");
      window.vyn?.offUpdate?.("update:baixado");
    };
  }, []);

  // Contador regressivo ao instalar
  useEffect(() => {
    if (state.status !== "instalando") return;
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [state.status, countdown]);

  if (state.status === "idle") return null;

  const configs = {
    disponivel: {
      bg: "bg-blue-600",
      icon: <Download className="w-4 h-4" />,
      titulo: `Nova versão disponível`,
      msg: state.status === "disponivel" ? `v${state.versao} — baixando em segundo plano...` : "",
    },
    baixando: {
      bg: "bg-blue-600",
      icon: <RefreshCw className="w-4 h-4 animate-spin" />,
      titulo: "Baixando atualização",
      msg: "",
    },
    instalando: {
      bg: "bg-green-600",
      icon: <ArrowUpCircle className="w-4 h-4" />,
      titulo: `Reiniciando em ${countdown}s...`,
      msg: state.status === "instalando" ? `v${state.versao} instalando automaticamente` : "",
    },
  };

  const cfg = configs[state.status];

  return (
    <div className="fixed bottom-4 right-4 z-[200] w-72 rounded-2xl shadow-2xl overflow-hidden border">
      {/* Header colorido */}
      <div className={`${cfg.bg} text-white px-4 py-2.5 flex items-center gap-2`}>
        {cfg.icon}
        <span className="text-sm font-bold">{cfg.titulo}</span>
      </div>

      {/* Corpo */}
      <div className="bg-card px-4 py-3 space-y-2">
        {state.status === "disponivel" && (
          <p className="text-xs text-muted-foreground">
            ASTIA PDV v{state.versao} será instalado automaticamente após o download.
            O sistema continuará funcionando normalmente.
          </p>
        )}

        {state.status === "baixando" && (
          <>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Baixando...</span>
              <span className="font-mono font-bold">{state.percent}%</span>
            </div>
            <div className="w-full bg-muted rounded-full h-2">
              <div className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${state.percent}%` }} />
            </div>
            <p className="text-xs text-muted-foreground">
              O sistema continuará funcionando normalmente.
            </p>
          </>
        )}

        {state.status === "instalando" && (
          <>
            <p className="text-xs text-muted-foreground">{cfg.msg}</p>
            {/* Barra de contagem regressiva */}
            <div className="w-full bg-muted rounded-full h-2">
              <div className="bg-green-500 h-2 rounded-full transition-all duration-1000"
                style={{ width: `${(countdown / 5) * 100}%` }} />
            </div>
            <p className="text-xs text-muted-foreground font-medium text-center">
              ⚠️ Salve o que estiver fazendo antes do reinício
            </p>
          </>
        )}
      </div>
    </div>
  );
}
