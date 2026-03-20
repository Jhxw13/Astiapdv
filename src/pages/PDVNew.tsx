/**
 * VYN CRM — PDV v6.0 — REESCRITA TOTAL
 * 
 * Arquitetura: página única, zero dialogs, zero Select, zero overflow clipping
 * - Produtos: grade clicável + scanner
 * - Checkout: painel slide-over full-screen (sem Layout, sem stacking issues)
 * - Liberação: overlay simples sobre o checkout
 * - Cupom: tela de sucesso full-screen
 * - Pagamento: botões grandes, sem dropdown (evita todos os problemas de z-index)
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { visualizarXML, visualizarDANFE, montarDadosNFe } from "@/lib/fiscal/nfe";
import { emitirNota, focusStatus } from "@/lib/fiscal/focus";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import {
  produtosAPI, clientesAPI, caixaAPI,
  vendasAPI, authAPI, configAPI, sistemaAPI, fiadosAPI,
  representantesAPI, comissoesAPI
} from "@/lib/api";
import { enfileirarVenda, getStatusConexao } from "@/lib/offline";
import {
  ShoppingCart, Plus, Minus, Trash2, CreditCard,
  Search, Package, AlertCircle, Barcode, X,
  ArrowRight, CheckCircle2, User, Percent,
  FileText, Shield, Printer, RotateCcw,
  Clock, Check, DollarSign, ChevronLeft,
  Smartphone, Receipt, Banknote, QrCode, Ticket, Wallet,
  Keyboard, UserCheck
} from "lucide-react";

// ─────────────────────────────────
// Tipos
// ─────────────────────────────────
interface CartItem {
  id: number;
  nome: string;
  preco: number;
  preco_custo: number;
  quantidade: number;
  estoque: number;
  permitir_venda_sem_estoque?: boolean;
  codigo_barras?: string;
  total: number;
}

type Fase = "pdv" | "checkout" | "liberacao" | "cupom";

// ─────────────────────────────────
// TELA DE LIBERAÇÃO (full overlay)
// ─────────────────────────────────
function TelaLiberacao({
  titulo, descricao, serverIP,
  onAutorizado, onCancelar,
}: {
  titulo: string; descricao: string; serverIP: string;
  onAutorizado: () => void; onCancelar: () => void;
}) {
  const { toast } = useToast();
  const [modo, setModo] = useState<"senha" | "aguardar">("senha");
  const [senha, setSenha] = useState("");
  const [loading, setLoading] = useState(false);
  const [aprovStatus, setAprovStatus] = useState<"aguardando" | "aprovado">("aguardando");
  const [token, setToken] = useState("");
  const [tempoRestante, setTempoRestante] = useState(300); // 5 min
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Quando muda para modo "aguardar": cria a solicitação no servidor
  useEffect(() => {
    if (modo !== "aguardar") return;
    let ativo = true;
    setAprovStatus("aguardando");
    setTempoRestante(300);

    (async () => {
      try {
        const base = serverIP.startsWith("http") ? serverIP : `http://${serverIP}:3567`;
        const r = await fetch(`${base}/api/liberacao/criar`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ descricao }),
        }).then(r => r.json());
        if (!ativo || !r.ok) return;

        setToken(r.token);

        // Conta regressiva
        timerRef.current = setInterval(() => {
          setTempoRestante(t => { if (t <= 1) { clearInterval(timerRef.current!); return 0; } return t - 1; });
        }, 1000);

        // Poll: verifica se gerente aprovou
        pollRef.current = setInterval(async () => {
          try {
            const s = await fetch(`${base}/api/liberacao/${r.token}`).then(x => x.json());
            if (s.status === "aprovado" && ativo) {
              clearInterval(pollRef.current!);
              clearInterval(timerRef.current!);
              setAprovStatus("aprovado");
              toast({ title: `✅ Aprovado por ${s.usuario || "gerente"}` });
              setTimeout(onAutorizado, 800);
            }
          } catch {}
        }, 2000);
      } catch {
        toast({ title: "Erro ao criar solicitação", variant: "destructive" });
      }
    })();

    return () => {
      ativo = false;
      if (pollRef.current) clearInterval(pollRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [modo]);

  const autorizarSenha = async () => {
    if (!senha) { toast({ title: "Digite a senha", variant: "destructive" }); return; }
    setLoading(true);
    try {
      const lista = await authAPI.listarUsuarios();
      let ok = false;
      for (const u of (lista || [])) {
        if (!u.ativo || !["admin", "gerente"].includes(u.cargo)) continue;
        try { const r = await authAPI.login(u.email, senha); if (r) { ok = true; break; } } catch {}
      }
      if (ok) onAutorizado();
      else { toast({ title: "Senha incorreta", variant: "destructive" }); setSenha(""); }
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally { setLoading(false); }
  };

  const minutos = Math.floor(tempoRestante / 60);
  const segundos = tempoRestante % 60;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">

        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
            <Shield className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <h2 className="font-bold text-base leading-tight">{titulo}</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{descricao}</p>
          </div>
        </div>

        {/* 2 tabs */}
        <div className="grid grid-cols-2 gap-2">
          {[
            { id: "senha",    label: "🔑 Senha local" },
            { id: "aguardar", label: "🛡 Solicitar ao gerente" },
          ].map(t => (
            <button key={t.id} onClick={() => setModo(t.id as any)}
              className={`py-2.5 rounded-xl text-xs font-semibold border transition-all ${
                modo === t.id
                  ? "bg-violet-600 text-white border-violet-600"
                  : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300"
              }`}
            >{t.label}</button>
          ))}
        </div>

        {/* Senha local */}
        {modo === "senha" && (
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium mb-1.5 text-slate-700 dark:text-slate-200">
                Senha do Gerente / Admin
              </label>
              <input
                type="password" value={senha} autoFocus
                onChange={e => setSenha(e.target.value)}
                onKeyDown={e => e.key === "Enter" && autorizarSenha()}
                placeholder="••••••••"
                className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-base text-slate-900 dark:text-white outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={autorizarSenha} disabled={loading}
                className="py-3 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white font-bold rounded-xl text-sm transition-all">
                {loading ? "Verificando..." : "✅ Autorizar"}
              </button>
              <button onClick={onCancelar}
                className="py-3 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition-all text-slate-700 dark:text-slate-300">
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* Aguardar gerente aprovar no sistema dele */}
        {modo === "aguardar" && (
          <div className="space-y-3">
            {aprovStatus === "aprovado" ? (
              <div className="py-6 text-center space-y-3">
                <div className="w-14 h-14 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto">
                  <Check className="w-7 h-7 text-green-600" />
                </div>
                <p className="font-bold text-green-600">Aprovado pelo gerente!</p>
              </div>
            ) : (
              <div className="rounded-xl bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-800 p-4 space-y-3">
                <div className="flex items-center gap-2 text-violet-700 dark:text-violet-300">
                  <Shield className="w-4 h-4 shrink-0" />
                  <p className="text-sm font-semibold">Solicitação enviada ao gerente</p>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  O gerente verá esta solicitação no ícone 🛡 da barra superior do sistema.
                  Quando ele aprovar, a operação será liberada automaticamente.
                </p>
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                    <Clock className="w-3 h-3 animate-pulse" />
                    Aguardando aprovação...
                  </span>
                  <span className={`font-mono font-bold ${tempoRestante < 60 ? "text-red-500" : "text-slate-500 dark:text-slate-400"}`}>
                    {minutos}:{String(segundos).padStart(2, "0")}
                  </span>
                </div>
                {tempoRestante === 0 && (
                  <p className="text-xs text-red-500 font-medium">⏰ Solicitação expirada. Tente novamente.</p>
                )}
              </div>
            )}
            <button onClick={onCancelar}
              className="w-full py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition-all text-slate-700 dark:text-slate-300">
              Cancelar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────
// TELA DE CHECKOUT (full-screen, sem Layout)
// ─────────────────────────────────
interface CheckoutProps {
  cart: CartItem[];
  clientes: any[];
  representantes: any[];
  loja: any;
  serverIP: string;
  onConfirmar: (dados: {
    paymentMethod: string; valorRecebido: number;
    descontoAprovado: number; descontoValor: number;
    clienteId: string; cpfNota: string;
    tipoCupom: "nao_fiscal" | "nfce" | "nfe";
    representanteId?: number;
  }) => Promise<void>;
  onVoltar: () => void;
  loading: boolean;
}

function TelaCheckout({ cart, clientes, representantes, loja, serverIP, onConfirmar, onVoltar, loading }: CheckoutProps) {
  const [paymentMethod, setPaymentMethod] = useState("dinheiro");
  const [valorRecebido, setValorRecebido] = useState("");
  const [representanteId, setRepresentanteId] = useState<string>("");

  // Atalhos de teclado no checkout
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      const key = e.key.toUpperCase();
      const formaMap: Record<string, string> = { N: "dinheiro", C: "credito", D: "debito", P: "pix", V: "voucher", F: "fiado" };
      if (formaMap[key]) { e.preventDefault(); setPaymentMethod(formaMap[key]); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  const [clienteId, setClienteId] = useState("");
  const [clienteBusca, setClienteBusca] = useState("");
  const [cpfNota, setCpfNota] = useState("");
  const [tipoCupom, setTipoCupom] = useState<"nao_fiscal" | "nfce" | "nfe">("nao_fiscal");
  const [descontoPct, setDescontoPct] = useState("");
  const [descontoValorInput, setDescontoValorInput] = useState("");
  const [descontoAprovado, setDescontoAprovado] = useState(0);
  const [liberacao, setLiberacao] = useState<null | { titulo: string; descricao: string; cb: () => void }>(null);

  useEffect(() => {
    if (paymentMethod === "fiado") {
      setTipoCupom("nao_fiscal");
      setValorRecebido("");
    }
  }, [paymentMethod]);

  const subtotal = cart.reduce((s, i) => s + i.total, 0);
  const descontoFinal = descontoAprovado > 0 ? (subtotal * descontoAprovado) / 100 : 0;
  const total = subtotal - descontoFinal;
  const troco = paymentMethod === "dinheiro" ? Math.max(0, parseFloat(valorRecebido || "0") - total) : 0;
  const fiadoSemCliente = paymentMethod === "fiado" && !clienteId;
  const dinheiroInsuficiente = paymentMethod === "dinheiro" && parseFloat(valorRecebido || "0") < total;

  const handleDescontoPct = (v: string) => {
    setDescontoPct(v);
    const n = parseFloat(v);
    if (!isNaN(n) && subtotal > 0) setDescontoValorInput(((subtotal * n) / 100).toFixed(2));
    else setDescontoValorInput("");
  };

  const handleDescontoValor = (v: string) => {
    setDescontoValorInput(v);
    const n = parseFloat(v);
    if (!isNaN(n) && subtotal > 0) setDescontoPct(((n / subtotal) * 100).toFixed(1));
    else setDescontoPct("");
  };

  const solicitarDesconto = () => {
    const pct = parseFloat(descontoPct);
    if (!pct || pct <= 0 || pct > 100) return;
    setLiberacao({
      titulo: "Autorizar Desconto",
      descricao: `Desconto de ${pct.toFixed(1)}% (R$ ${((subtotal * pct) / 100).toFixed(2)}) sobre R$ ${subtotal.toFixed(2)}`,
      cb: () => { setDescontoAprovado(pct); setLiberacao(null); },
    });
  };

  const FORMAS = [
    { value: "dinheiro", label: "Dinheiro",  icon: Banknote,    key: "N" },
    { value: "credito",  label: "Crédito",   icon: CreditCard,  key: "C" },
    { value: "debito",   label: "Débito",    icon: CreditCard,  key: "D" },
    { value: "pix",      label: "PIX",       icon: QrCode,      key: "P" },
    { value: "voucher",  label: "Voucher",   icon: Ticket,      key: "V" },
    { value: "fiado",    label: "Fiado",     icon: Wallet,      key: "F" },
  ];

  const clientesFiltrados = clientes.filter(c =>
    !clienteBusca || c.nome.toLowerCase().includes(clienteBusca.toLowerCase())
  );
  const clienteSelecionado = clientes.find(c => c.id.toString() === clienteId);

  return (
    <div className="fixed inset-0 z-[100] bg-background flex flex-col">
      {/* Overlay de liberação */}
      {liberacao && (
        <TelaLiberacao
          titulo={liberacao.titulo}
          descricao={liberacao.descricao}
          serverIP={serverIP}
          onAutorizado={liberacao.cb}
          onCancelar={() => setLiberacao(null)}
        />
      )}

      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b bg-background shrink-0">
        <button
          onClick={onVoltar}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="w-4 h-4" /> Voltar ao PDV
        </button>
        <div className="flex-1" />
        <h1 className="font-bold text-lg">Finalizar Venda</h1>
        <div className="flex-1" />
        <div className="text-right">
          <div className="text-2xl font-black text-primary">R$ {total.toFixed(2)}</div>
          <div className="text-xs text-muted-foreground">{cart.reduce((s,i) => s+i.quantidade,0)} itens</div>
        </div>
      </div>

      {/* Corpo com scroll */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto p-4 space-y-5 pb-32">

          {/* Resumo dos itens */}
          <div className="rounded-xl bg-muted/40 border p-3 space-y-1">
            {cart.map(i => (
              <div key={i.id} className="flex justify-between text-sm">
                <span className="flex-1 truncate text-muted-foreground">{i.nome}</span>
                <span className="ml-4 font-mono text-xs text-muted-foreground">×{i.quantidade}</span>
                <span className="ml-4 font-mono font-medium w-20 text-right">R$ {i.total.toFixed(2)}</span>
              </div>
            ))}
          </div>

          {/* Cliente */}
          <div className="space-y-2">
            <label className="text-sm font-semibold flex items-center gap-1">
              <User className="w-3.5 h-3.5" /> Cliente <span className="text-muted-foreground font-normal">(opcional)</span>
            </label>
            {clienteSelecionado ? (
              <div className="flex items-center gap-3 p-3 rounded-xl bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800">
                <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold text-sm shrink-0">
                  {clienteSelecionado.nome[0].toUpperCase()}
                </div>
                <span className="font-medium text-sm flex-1">{clienteSelecionado.nome}</span>
                <button onClick={() => { setClienteId(""); setClienteBusca(""); }} className="text-muted-foreground hover:text-foreground">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Buscar cliente pelo nome..."
                  value={clienteBusca}
                  onChange={e => setClienteBusca(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm outline-none focus:border-blue-500"
                />
                {clienteBusca && clientesFiltrados.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg z-10 max-h-40 overflow-y-auto">
                    {clientesFiltrados.slice(0, 8).map(c => (
                      <button
                        key={c.id}
                        onClick={() => { setClienteId(c.id.toString()); setClienteBusca(""); }}
                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-700 first:rounded-t-xl last:rounded-b-xl"
                      >
                        {c.nome}
                        {c.cpf && <span className="text-muted-foreground ml-2 text-xs">{c.cpf}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* CPF na nota */}
          <div className="space-y-2">
            <label className="text-sm font-semibold flex items-center gap-1">
              <FileText className="w-3.5 h-3.5" /> CPF na nota <span className="text-muted-foreground font-normal">(opcional)</span>
            </label>
            <input
              type="text"
              placeholder="000.000.000-00"
              value={cpfNota}
              onChange={e => setCpfNota(e.target.value)}
              maxLength={14}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono text-sm outline-none focus:border-blue-500"
            />
          </div>

          {/* Representante */}
          {representantes.length > 0 && (
            <div className="space-y-2">
              <label className="text-sm font-semibold flex items-center gap-1">
                <UserCheck className="w-3.5 h-3.5" /> Representante <span className="text-muted-foreground font-normal">(opcional)</span>
              </label>
              <div className="grid grid-cols-1 gap-1.5">
                <button
                  type="button"
                  onClick={() => setRepresentanteId("")}
                  className={`px-3 py-2 rounded-xl border text-sm text-left transition-colors ${
                    !representanteId
                      ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30 text-blue-700 font-medium"
                      : "border-slate-200 dark:border-slate-700 text-muted-foreground hover:bg-muted/50"
                  }`}
                >
                  Nenhum
                </button>
                {representantes.map(r => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setRepresentanteId(String(r.id))}
                    className={`px-3 py-2 rounded-xl border text-sm text-left transition-colors ${
                      representanteId === String(r.id)
                        ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30 font-medium"
                        : "border-slate-200 dark:border-slate-700 hover:bg-muted/50"
                    }`}
                  >
                    <span className="font-medium">{r.nome}</span>
                    <span className="text-muted-foreground ml-2 text-xs">{Number(r.perc_comissao).toFixed(1)}% comissão</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <hr className="border-slate-200 dark:border-slate-700" />

          {/* Desconto bidirecional */}
          <div className="space-y-3">
            <label className="text-sm font-semibold flex items-center gap-2">
              <Percent className="w-3.5 h-3.5" /> Desconto
              {descontoAprovado > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-xs rounded-full font-semibold">
                  ✅ {descontoAprovado.toFixed(1)}% aprovado
                </span>
              )}
            </label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Percentual (%)</label>
                <input
                  type="number" min="0" max="100" step="0.1"
                  value={descontoPct}
                  onChange={e => handleDescontoPct(e.target.value)}
                  placeholder="0"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono text-sm outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Valor (R$)</label>
                <input
                  type="number" min="0" step="0.01"
                  value={descontoValorInput}
                  onChange={e => handleDescontoValor(e.target.value)}
                  placeholder="0,00"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono text-sm outline-none focus:border-blue-500"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={solicitarDesconto}
                disabled={!descontoPct || parseFloat(descontoPct) <= 0}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 text-sm font-semibold hover:bg-amber-100 dark:hover:bg-amber-900/40 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                <Shield className="w-3.5 h-3.5" /> Solicitar aprovação
              </button>
              {descontoAprovado > 0 && (
                <button
                  onClick={() => { setDescontoAprovado(0); setDescontoPct(""); setDescontoValorInput(""); }}
                  className="px-4 py-2.5 rounded-xl border border-red-200 dark:border-red-800 text-red-500 text-sm hover:bg-red-50 dark:hover:bg-red-900/20 transition-all"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            {descontoPct && parseFloat(descontoPct) > 0 && descontoAprovado === 0 && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                ⚠ Desconto aguardando aprovação do gerente
              </p>
            )}
          </div>

          <hr className="border-slate-200 dark:border-slate-700" />

          {/* Forma de pagamento — botões grandes, SEM Select */}
          <div className="space-y-3">
            <label className="text-sm font-semibold">Forma de Pagamento</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {FORMAS.map(f => (
                <button
                  key={f.value}
                  onClick={() => setPaymentMethod(f.value)}
                  className={`flex items-center justify-center gap-2 py-3 px-4 rounded-xl border-2 text-sm font-semibold transition-all ${
                    paymentMethod === f.value
                      ? "border-blue-500 bg-blue-500 text-white shadow-lg shadow-blue-500/20"
                      : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-blue-300 dark:hover:border-blue-700"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            {paymentMethod === "fiado" && (
              <div className={`px-3 py-2 rounded-lg text-xs border ${
                fiadoSemCliente
                  ? "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300"
                  : "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300"
              }`}>
                {fiadoSemCliente
                  ? "Selecione um cliente para finalizar em fiado."
                  : "Venda será lançada automaticamente na conta de fiado do cliente."}
              </div>
            )}
          </div>

          {/* Valor recebido — só para dinheiro */}
          {paymentMethod === "dinheiro" && (
            <div className="space-y-2">
              <label className="text-sm font-semibold flex items-center gap-1">
                <DollarSign className="w-3.5 h-3.5" /> Valor recebido
              </label>
              <input
                type="number" step="0.01" min="0"
                value={valorRecebido}
                onChange={e => setValorRecebido(e.target.value)}
                placeholder="0,00"
                className="w-full px-4 py-4 rounded-xl border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono text-2xl font-bold outline-none focus:border-blue-500 text-center"
              />
              {parseFloat(valorRecebido) > 0 && (
                <div className={`flex items-center justify-between px-4 py-3 rounded-xl font-bold text-lg ${
                  troco >= 0
                    ? "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400"
                    : "bg-red-50 dark:bg-red-900/20 text-red-600"
                }`}>
                  <span>Troco</span>
                  <span>R$ {troco.toFixed(2)}</span>
                </div>
              )}
            </div>
          )}

          {/* Resumo financeiro */}
          <div className="rounded-xl bg-muted/40 border p-4 space-y-2">
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Subtotal</span>
              <span>R$ {subtotal.toFixed(2)}</span>
            </div>
            {descontoAprovado > 0 && (
              <div className="flex justify-between text-sm text-red-500 font-medium">
                <span>Desconto ({descontoAprovado.toFixed(1)}%)</span>
                <span>- R$ {descontoFinal.toFixed(2)}</span>
              </div>
            )}
            <hr className="border-slate-200 dark:border-slate-700" />
            <div className="flex justify-between items-center">
              <span className="text-base font-bold">TOTAL</span>
              <span className="text-2xl font-black text-primary">R$ {total.toFixed(2)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Rodapé — tipo de cupom + botão confirmar */}
      <div className="fixed bottom-0 left-0 right-0 bg-background border-t z-[110]">
        <div className="max-w-2xl mx-auto px-4 pt-3 pb-4 space-y-3">

          {/* Seletor de tipo de documento fiscal */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              Tipo de documento
            </p>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: "nao_fiscal" as const, label: "Cupom", sub: "Não fiscal", icon: "🧾", color: "blue" },
                { id: "nfce"       as const, label: "NFC-e",  sub: "Cupom fiscal", icon: "📄", color: "green" },
                { id: "nfe"        as const, label: "NF-e",   sub: "Nota fiscal", icon: "🗒️", color: "violet" },
              ].map(opt => (
                <button key={opt.id} onClick={() => { if (paymentMethod !== "fiado") setTipoCupom(opt.id); }}
                  disabled={paymentMethod === "fiado" && opt.id !== "nao_fiscal"}
                  className={`py-2.5 px-2 rounded-xl border-2 text-center transition-all ${
                    tipoCupom === opt.id
                      ? opt.color === "blue"   ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30"
                      : opt.color === "green"  ? "border-green-500 bg-green-50 dark:bg-green-950/30"
                                               : "border-violet-500 bg-violet-50 dark:bg-violet-950/30"
                      : "border-border hover:border-muted-foreground"
                  }`}>
                  <div className="text-base leading-none mb-0.5">{opt.icon}</div>
                  <div className={`text-xs font-black ${tipoCupom === opt.id ? (opt.color === "blue" ? "text-blue-700 dark:text-blue-300" : opt.color === "green" ? "text-green-700 dark:text-green-300" : "text-violet-700 dark:text-violet-300") : ""}`}>{opt.label}</div>
                  <div className="text-[10px] text-muted-foreground leading-tight">{opt.sub}</div>
                </button>
              ))}
            </div>
            {paymentMethod === "fiado" && (
              <div className="mt-2 px-3 py-2 rounded-lg text-xs bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300">
                Em venda no fiado, o documento fica como cupom não fiscal e a cobrança vai para a conta do cliente.
              </div>
            )}
            {paymentMethod !== "fiado" && tipoCupom !== "nao_fiscal" && (
              <div className={`mt-2 px-3 py-2 rounded-lg text-xs ${tipoCupom === "nfce" ? "bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-300" : "bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-800 text-violet-700 dark:text-violet-300"}`}>
                {tipoCupom === "nfce"
                  ? "⚡ NFC-e será emitida via Focus NF-e. Certificado digital necessário."
                  : "📋 NF-e (para empresas). CPF/CNPJ do destinatário obrigatório. Certificado necessário."}
                {!loja?.certificado_digital_path && (
                  <span className="block mt-1 font-semibold text-amber-600">
                    ⚠️ Nenhum certificado configurado. Acesse Configurações → Fiscal.
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Botão confirmar */}
          {dinheiroInsuficiente && (
            <div className="text-xs text-red-600 dark:text-red-400 font-semibold">
              Valor recebido Ã© menor que o total da venda.
            </div>
          )}
          <button
            type="button"
            onClick={() => {
              if (fiadoSemCliente) {
                toast({ title: "Selecione um cliente para lançar no fiado", variant: "destructive" });
                return;
              }
              if (dinheiroInsuficiente) {
                toast({ title: "Valor recebido menor que o total", variant: "destructive" });
                return;
              }
              onConfirmar({
                paymentMethod, valorRecebido: parseFloat(valorRecebido || "0"),
                descontoAprovado, descontoValor: descontoFinal,
                clienteId, cpfNota, tipoCupom,
                representanteId: representanteId ? parseInt(representanteId) : undefined,
              });
            }}
            disabled={loading}
            className={`w-full py-4 rounded-2xl text-white font-black text-lg shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-3 ${
              tipoCupom === "nfce"
                ? "bg-gradient-to-r from-green-600 to-emerald-600 shadow-green-500/30 hover:shadow-green-500/50"
                : tipoCupom === "nfe"
                  ? "bg-gradient-to-r from-violet-600 to-purple-700 shadow-violet-500/30 hover:shadow-violet-500/50"
                  : "bg-gradient-to-r from-blue-600 to-purple-600 shadow-blue-500/30 hover:shadow-blue-500/50"
            }`}
          >
            {loading ? (
              <><span className="animate-pulse">Registrando...</span></>
            ) : (
              <>
                <CheckCircle2 className="w-6 h-6" />
                {paymentMethod === "fiado"
                  ? "Confirmar e Lançar no Fiado"
                  : (tipoCupom === "nfce" ? "Confirmar + Emitir NFC-e" : tipoCupom === "nfe" ? "Confirmar + Emitir NF-e" : "Confirmar Venda")}
                {" — R$ "}{total.toFixed(2)}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────
// TELA DE CUPOM (full-screen)
// ─────────────────────────────────
function TelaCupom({ venda, loja, onNova }: { venda: any; loja: any; onNova: () => void }) {
  const FORMA: Record<string, string> = {
    dinheiro: "Dinheiro", credito: "Cartão de Crédito",
    debito: "Cartão de Débito", pix: "PIX", voucher: "Voucher",
    crediario: "Fiado", fiado: "Fiado",
  };

  const imprimirCupomNaoFiscal = (autoprint = false) => {
    // Auto-print só se impressora configurada
    if (autoprint && !loja?.pdv_impressora && !(window as any)._imprimirSempre) return;
    const win = window.open("", "_blank", "width=420,height=750");
    if (!win) {
      if (!autoprint) toast({ title: "Popup bloqueado", description: "Permita popups para imprimir", variant: "destructive" });
      return;
    }
    const rows = (venda.itens || []).map((i: any) =>
      `<tr><td>${i.nome_produto}</td><td style="text-align:center">${i.quantidade}</td><td style="text-align:right">R$ ${Number(i.total).toFixed(2)}</td></tr>`
    ).join("");
    win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>Cupom ${venda.numero}</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Courier New',monospace;font-size:12px;padding:12px;max-width:320px;margin:0 auto}
.c{text-align:center}.b{font-weight:bold}.big{font-size:15px}.sep{border-top:1px dashed #000;margin:6px 0}
table{width:100%;border-collapse:collapse}td{padding:2px 0;vertical-align:top}th{text-align:left}</style>
</head><body>
<div class="c b" style="font-size:16px">${loja?.nome || "ASTIA PDV"}</div>
${loja?.cnpj ? `<div class="c">CNPJ: ${loja.cnpj}</div>` : ""}
${loja?.logradouro ? `<div class="c">${loja.logradouro}${loja.numero ? `, ${loja.numero}` : ""}</div>` : ""}
<div class="sep"></div>
<div><b>Venda:</b> ${venda.numero}</div>
<div><b>Data:</b> ${new Date().toLocaleString("pt-BR")}</div>
${venda.cliente_nome ? `<div><b>Cliente:</b> ${venda.cliente_nome}</div>` : ""}
${venda.cpf_nota ? `<div><b>CPF:</b> ${venda.cpf_nota}</div>` : ""}
<div class="sep"></div>
<table><tr class="b"><th>Item</th><th style="text-align:center">Qtd</th><th style="text-align:right">Total</th></tr>${rows}</table>
<div class="sep"></div>
${venda.desconto_valor > 0 ? `<div style="display:flex;justify-content:space-between"><span>Desconto (${Number(venda.desconto_percentual||0).toFixed(1)}%)</span><span>- R$ ${Number(venda.desconto_valor).toFixed(2)}</span></div>` : ""}
<div style="display:flex;justify-content:space-between" class="b big"><span>TOTAL</span><span>R$ ${Number(venda.total).toFixed(2)}</span></div>
<div><b>Pagamento:</b> ${FORMA[venda.forma_pagamento] || venda.forma_pagamento}</div>
${venda.troco > 0 ? `<div><b>Troco:</b> R$ ${Number(venda.troco).toFixed(2)}</div>` : ""}
<div class="sep"></div>
<div class="c">Obrigado pela preferência!</div>
<div class="c" style="font-size:10px;margin-top:4px">ASTIA PDV — Documento não fiscal</div>
</body></html>`);
    win.document.close();
    setTimeout(() => win.print(), 300);
  };

  // Função unificada: chama cupom ou DANFE conforme o tipo
  const imprimir = (autoprint = false) => {
    const tipoFiscal = venda.tipo_cupom && venda.tipo_cupom !== "nao_fiscal";
    if (tipoFiscal) {
      // NFC-e ou NF-e → abre DANFE (sempre, mesmo em simulação)
      visualizarDANFE(montarDadosNFe(venda, loja, venda.tipo_cupom as "nfe" | "nfce"));
    } else {
      // Cupom não fiscal normal
      imprimirCupomNaoFiscal(autoprint);
    }
  };

  // Auto-print on mount (only for online sales, not offline)
  useEffect(() => {
    if (!venda.offline) {
      const timer = setTimeout(() => imprimir(true), 800);
      return () => clearTimeout(timer);
    }
  }, []);

  return (
    <div className="fixed inset-0 z-[100] bg-background flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md space-y-6">
        {/* Ícone de sucesso / offline */}
        <div className="text-center space-y-3">
          <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto ${
            venda.offline
              ? "bg-amber-100 dark:bg-amber-900/30"
              : "bg-green-100 dark:bg-green-900/30"
          }`}>
            <CheckCircle2 className={`w-10 h-10 ${venda.offline ? "text-amber-600" : "text-green-600"}`} />
          </div>
          <div>
            <h2 className={`text-2xl font-black ${venda.offline ? "text-amber-600" : "text-green-600"}`}>
              {venda.offline ? "Venda Salva Offline" : "Venda Registrada!"}
            </h2>
            <p className="text-muted-foreground mt-1">Nº {venda.numero}</p>
            {venda.offline && (
              <p className="text-xs text-amber-600 mt-2 bg-amber-50 dark:bg-amber-950/30 rounded-lg px-3 py-1.5">
                📴 Será sincronizada quando o servidor voltar
              </p>
            )}
          </div>
        </div>

        {/* Resumo */}
        <div className="rounded-2xl border-2 border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/20 p-4 space-y-2">
          {(venda.itens || []).map((i: any, idx: number) => (
            <div key={idx} className="flex justify-between text-sm">
              <span className="text-muted-foreground truncate flex-1">{i.nome_produto} × {i.quantidade}</span>
              <span className="font-mono font-medium ml-3">R$ {Number(i.total).toFixed(2)}</span>
            </div>
          ))}
          <hr className="border-green-200 dark:border-green-800" />
          {venda.desconto_valor > 0 && (
            <div className="flex justify-between text-sm text-red-500">
              <span>Desconto</span>
              <span>- R$ {Number(venda.desconto_valor).toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between font-black text-xl">
            <span>Total</span>
            <span className="text-green-700 dark:text-green-400">R$ {Number(venda.total).toFixed(2)}</span>
          </div>
          {venda.troco > 0 && (
            <div className="flex justify-between text-sm font-semibold text-blue-600">
              <span>Troco</span>
              <span>R$ {Number(venda.troco).toFixed(2)}</span>
            </div>
          )}
          <div className="text-xs text-muted-foreground pt-1">
            {FORMA[venda.forma_pagamento] || venda.forma_pagamento}
            {venda.cliente_nome && ` · ${venda.cliente_nome}`}
          </div>
        </div>

        {/* Status NF-e / NFC-e */}
        {venda.tipo_cupom && venda.tipo_cupom !== "nao_fiscal" && (
          <div className={`rounded-xl border p-3 text-sm space-y-1.5 ${
            venda.chave_nfe ? "bg-green-50 dark:bg-green-950/30 border-green-300 dark:border-green-700"
                           : "bg-amber-50 dark:bg-amber-950/30 border-amber-300 dark:border-amber-700"
          }`}>
            <div className="flex items-center gap-2 font-semibold">
              {venda.chave_nfe
                ? <><CheckCircle2 className="w-4 h-4 text-green-600" /> {venda.tipo_cupom === "nfce" ? "NFC-e autorizada!" : "NF-e autorizada!"}</>
                : <><FileText className="w-4 h-4 text-amber-600" /> {venda.tipo_cupom === "nfce" ? "NFC-e pendente" : "NF-e pendente"} — Focus NF-e não configurado</>
              }
            </div>
            {venda.chave_nfe && (
              <p className="font-mono text-xs text-muted-foreground break-all">{venda.chave_nfe}</p>
            )}
            {!venda.chave_nfe && (
              <p className="text-xs text-muted-foreground">
                Configure a API Focus NF-e em Configurações → Fiscal para emitir {venda.tipo_cupom === "nfce" ? "NFC-e" : "NF-e"}.
              </p>
            )}
          </div>
        )}

        {/* Botões */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={imprimir}
            className="flex items-center justify-center gap-2 py-4 rounded-2xl border-2 border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/20 text-blue-700 dark:text-blue-400 font-bold text-sm hover:bg-blue-100 transition-all"
          >
            <Printer className="w-4 h-4" /> {venda.tipo_cupom === "nao_fiscal" || !venda.tipo_cupom ? "Imprimir cupom" : "Imprimir DANFE"}
          </button>
          <button
            onClick={onNova}
            className="flex items-center justify-center gap-2 py-4 rounded-2xl bg-gradient-to-r from-blue-600 to-purple-600 text-white font-bold text-sm shadow-lg hover:shadow-blue-500/30 transition-all"
          >
            <RotateCcw className="w-4 h-4" /> Nova Venda
          </button>
        </div>

        {/* Botões NF-e / DANFE */}
        {venda.tipo_cupom && venda.tipo_cupom !== "nao_fiscal" && (
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => visualizarDANFE(montarDadosNFe(venda, loja, venda.tipo_cupom as "nfe" | "nfce"))}
              className="flex items-center justify-center gap-2 py-3 rounded-2xl border-2 border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-950/20 text-green-700 dark:text-green-300 font-bold text-sm hover:bg-green-100 transition-all"
            >
              <Printer className="w-4 h-4" /> Abrir DANFE
            </button>
            <button
              onClick={() => visualizarXML(montarDadosNFe(venda, loja, venda.tipo_cupom as "nfe" | "nfce"))}
              className="flex items-center justify-center gap-2 py-3 rounded-2xl border-2 border-violet-300 dark:border-violet-700 bg-violet-50 dark:bg-violet-950/20 text-violet-700 dark:text-violet-300 font-bold text-sm hover:bg-violet-100 transition-all"
            >
              <FileText className="w-4 h-4" /> Ver XML
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════
// PDV PRINCIPAL
// ═══════════════════════════════════════════════
export default function PDVNew() {
  const { usuario } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [fase, setFase] = useState<Fase>("pdv");
  const [fontSize, setFontSize] = useState<number>(() => {
    const saved = localStorage.getItem("astia_pdv_fontsize");
    return saved ? parseInt(saved) : 14;
  });
  const saveFontSize = (n: number) => { setFontSize(n); localStorage.setItem("astia_pdv_fontsize", String(n)); };
  const [produtos, setProdutos] = useState<any[]>([]);
  const [clientes, setClientes] = useState<any[]>([]);
  const [representantes, setRepresentantes] = useState<any[]>([]);
  const [loja, setLoja] = useState<any>({});
  const [serverIP, setServerIP] = useState("localhost");
  const [caixaAberto, setCaixaAberto] = useState<any>(null);
  const [caixaCarregado, setCaixaCarregado] = useState(false);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [codigoBarras, setCodigoBarras] = useState("");
  const [scanStatus, setScanStatus] = useState<"idle" | "found" | "notfound">("idle");
  const [loading, setLoading] = useState(false);
  const [vendaFinalizada, setVendaFinalizada] = useState<any>(null);

  const barcodeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    carregarTudo();
    sistemaAPI.getServerIP().then(ip => { if (ip) setServerIP(ip); }).catch(() => {});
    setTimeout(() => barcodeRef.current?.focus(), 200);

    // ── Listener do Scanner Mobile (recebe código via Electron IPC) ──────────
    let unsubScanner: (() => void) | null = null;
    if (window.vyn?.on) {
      unsubScanner = window.vyn.on('scanner:codigo', (payload: { codigo: string; produto_id?: number }) => {
        if (!payload?.codigo) return;
        // Simula digitação do código como se fosse um leitor físico
        setCodigoBarras(payload.codigo);
        toast({ title: `📱 Scanner mobile: ${payload.codigo}` });
        // Processa após breve delay para o estado ser atualizado
        setTimeout(async () => {
          try {
            const produto = await produtosAPI.buscarPorCodigo(payload.codigo);
            if (produto) {
              addToCart(produto);
              toast({ title: `✅ ${produto.nome} adicionado`, description: `R$ ${Number(produto.preco_venda).toFixed(2)}` });
            } else {
              toast({ title: "Produto não encontrado", description: payload.codigo, variant: "destructive" });
            }
          } catch {}
          setCodigoBarras('');
          barcodeRef.current?.focus();
        }, 100);
      });
    }
    return () => { unsubScanner?.(); };
  }, []);

  // ── Atalhos de teclado ─────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Não interfere quando está digitando em inputs normais
      const tag = (e.target as HTMLElement)?.tagName;
      const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

      // F2 → foca no scanner de código de barras
      if (e.key === 'F2') {
        e.preventDefault();
        setFase('pdv');
        setTimeout(() => barcodeRef.current?.focus(), 50);
      }
      // F4 → vai para checkout (finalizar venda)
      if (e.key === 'F4' && cart.length > 0 && caixaAberto) {
        e.preventDefault();
        setFase('checkout');
      }
      // F6 → limpa o carrinho
      if (e.key === 'F6' && !isInput) {
        e.preventDefault();
        if (cart.length > 0 && confirm('Limpar carrinho?')) setCart([]);
      }
      // ESC → volta para PDV / fecha checkout
      if (e.key === 'Escape' && fase !== 'pdv') {
        e.preventDefault();
        setFase('pdv');
        setTimeout(() => barcodeRef.current?.focus(), 50);
      }
      // F9 → abre caixa (atalho rápido para ir para /caixa)
      if (e.key === 'F9') {
        e.preventDefault();
        window.location.href = '/caixa';
      }
      // F8 → atalho para fiados
      if (e.key === 'F8') {
        e.preventDefault();
        navigate('/fiados');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [fase, cart, caixaAberto, navigate]);

  const carregarTudo = async () => {
    try {
      const [prods, clts, cx, cfg, reps] = await Promise.all([
        produtosAPI.listar({ ativo: 1 }),
        clientesAPI.listar({ ativo: 1 }),
        caixaAPI.buscarAberto(1),
        configAPI.get(),
        representantesAPI.listar({ ativo: 1 }),
      ]);
      setProdutos(prods || []);
      setClientes(clts || []);
      setCaixaAberto(cx || null);
      if (cfg) setLoja(cfg);
      setRepresentantes(reps || []);
    } catch (e: any) {
      toast({ title: "Erro ao carregar PDV", description: e.message, variant: "destructive" });
    } finally {
      setCaixaCarregado(true);
    }
  };

  const addToCart = useCallback((produto: any, opts?: { quantidade?: number; total?: number }) => {
    const quantidadeEntrada = Number(opts?.quantidade || 1);
    const totalEntrada = Number(opts?.total || 0);
    const quantidadeFinal = Number.isFinite(quantidadeEntrada) && quantidadeEntrada > 0 ? quantidadeEntrada : 1;
    const precoCalculado = Number(produto.preco_venda || 0);
    const totalCalculado = totalEntrada > 0 ? totalEntrada : (precoCalculado * quantidadeFinal);
    const estoqueAtual = Number(produto.estoque_atual || 0);
    const permiteSemEstoque = Number(produto.permitir_venda_sem_estoque || 0) === 1;

    if (!permiteSemEstoque && estoqueAtual <= 0) {
      toast({ title: "Sem estoque", description: produto.nome, variant: "destructive" }); return;
    }
    setCart(prev => {
      const ex = prev.find(i => i.id === produto.id);
      if (ex) {
        if (!permiteSemEstoque && (ex.quantidade + quantidadeFinal) > estoqueAtual) {
          toast({ title: "Estoque insuficiente", variant: "destructive" }); return prev;
        }
        return prev.map(i => i.id === produto.id
          ? { ...i, quantidade: Number((i.quantidade + quantidadeFinal).toFixed(3)), total: Number((i.total + totalCalculado).toFixed(2)) }
          : i);
      }
      return [...prev, {
        id: produto.id, nome: produto.nome,
        preco: precoCalculado, preco_custo: produto.preco_custo || 0,
        quantidade: Number(quantidadeFinal.toFixed(3)), estoque: estoqueAtual,
        permitir_venda_sem_estoque: permiteSemEstoque,
        codigo_barras: produto.codigo_barras, total: Number(totalCalculado.toFixed(2)),
      }];
    });
  }, [toast]);

  const updateQty = (id: number, qty: number) => {
    if (qty <= 0) { setCart(prev => prev.filter(i => i.id !== id)); return; }
    setCart(prev => prev.map(i => {
      if (i.id !== id) return i;
      if (!i.permitir_venda_sem_estoque && qty > i.estoque) { toast({ title: "Estoque insuficiente", variant: "destructive" }); return i; }
      return { ...i, quantidade: qty, total: i.preco * qty };
    }));
  };

  const buscarPorCodigo = async (codigo: string) => {
    try {
      const res = await produtosAPI.buscarPorCodigoInteligente(codigo);
      if (res?.produto) {
        addToCart(res.produto, { quantidade: res.quantidade, total: res.total });
        if (res.origem === "balanca") {
          toast({
            title: "Etiqueta de balança lida",
            description: `${res.produto.nome} • ${Number(res.quantidade || 0).toFixed(3)} ${res.produto.unidade_medida || "UN"} • R$ ${Number(res.total || 0).toFixed(2)}`,
          });
        }
        setScanStatus("found");
        setTimeout(() => setScanStatus("idle"), 1000);
      } else {
        setScanStatus("notfound");
        setTimeout(() => setScanStatus("idle"), 1500);
        toast({ title: "Produto não encontrado", description: codigo, variant: "destructive" });
      }
    } catch { setScanStatus("notfound"); }
    finally { setCodigoBarras(""); barcodeRef.current?.focus(); }
  };

  const confirmarVenda = async (dados: {
    paymentMethod: string; valorRecebido: number;
    descontoAprovado: number; descontoValor: number;
    clienteId: string; cpfNota: string;
    tipoCupom: "nao_fiscal" | "nfce" | "nfe";
    representanteId?: number;
  }) => {
    if (!caixaAberto || !usuario) return;
    if (dados.paymentMethod === "fiado" && !dados.clienteId) {
      toast({ title: "Selecione um cliente para venda no fiado", variant: "destructive" });
      return;
    }
    const paymentDbMethod = dados.paymentMethod === "fiado" ? "crediario" : dados.paymentMethod;
    setLoading(true);
    try {
      const subtotal = cart.reduce((s, i) => s + i.total, 0);
      const total = subtotal - dados.descontoValor;
      const troco = dados.paymentMethod === "dinheiro"
        ? Math.max(0, dados.valorRecebido - total) : 0;

      const resultado = await vendasAPI.criar({
        caixa_id: caixaAberto.id,
        usuario_id: usuario.id,
        cliente_id: dados.clienteId ? parseInt(dados.clienteId) : undefined,
        representante_id: dados.representanteId || undefined,
        itens: cart.map(i => ({
          produto_id: i.id, nome_produto: i.nome,
          codigo_barras: i.codigo_barras, quantidade: i.quantidade,
          preco_unitario: i.preco, preco_custo: i.preco_custo, total: i.total,
        })),
        pagamentos: [{ forma: paymentDbMethod, valor: total }],
        desconto_valor: dados.descontoValor,
        desconto_percentual: dados.descontoAprovado,
        cpf_nota: dados.cpfNota || undefined,
        tipo_cupom: dados.tipoCupom || "nao_fiscal",
      });

      // Gera comissão automaticamente se há representante
      if (dados.representanteId && resultado?.id) {
        try {
          await comissoesAPI.gerar(resultado.id, dados.representanteId);
        } catch { /* silencioso — não bloqueia a venda */ }
      }

      const repNome = dados.representanteId
        ? representantes.find(r => r.id === dados.representanteId)?.nome || null
        : null;

      const vendaParaFinalizar = {
        ...resultado,
        itens: cart.map(i => ({ nome_produto: i.nome, quantidade: i.quantidade, total: i.total,
          produto_id: i.id, preco_unitario: i.preco, codigo_barras: i.codigo_barras,
          ncm: i.ncm, cfop: i.cfop, cst_icms: i.cst_icms, aliquota_icms: i.aliquota_icms,
          aliquota_pis: i.aliquota_pis, aliquota_cofins: i.aliquota_cofins,
        })),
        total, subtotal, troco,
        desconto_valor: dados.descontoValor,
        desconto_percentual: dados.descontoAprovado,
        forma_pagamento: paymentDbMethod,
        cpf_nota: dados.cpfNota || null,
        cliente_nome: clientes.find(c => c.id.toString() === dados.clienteId)?.nome || null,
        representante_nome: repNome,
        tipo_cupom: dados.tipoCupom || "nao_fiscal",
      };

      // Fiado: lança automaticamente os itens da venda na conta do cliente.
      // Se o canal novo não existir (ex.: cliente/servidor em versões diferentes),
      // cai para um fallback que cria a conta de fiado pelo total para não travar o fechamento.
      if (dados.paymentMethod === "fiado") {
        const hoje = new Date();
        const fimMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).toISOString().slice(0, 10);
        try {
          await fiadosAPI.lancarVenda({
            cliente_id: parseInt(dados.clienteId),
            venda_id: resultado?.id,
            numero_venda: resultado?.numero,
            data_vencimento: fimMes,
            usuario_id: usuario.id,
            itens: cart.map(i => ({
              produto_id: i.id,
              nome_produto: i.nome,
              quantidade: i.quantidade,
              preco_unitario: i.preco,
              total: i.total,
            })),
          });
          toast({ title: "Venda lançada no fiado", description: "Conta do cliente atualizada com os itens da venda." });
        } catch (erroFiado: any) {
          try {
            const contaCriada = await fiadosAPI.criar({
              cliente_id: parseInt(dados.clienteId),
              valor: total,
              data_vencimento: fimMes,
              venda_id: resultado?.id,
              descricao: `Fiado da venda ${resultado?.numero || resultado?.id}`,
              observacoes: `Lançamento automático simplificado. Motivo: ${erroFiado?.message || "canal indisponível"}`,
            });

            const contaId = Number(contaCriada?.lastInsertRowid || contaCriada?.id || 0);
            if (contaId > 0) {
              for (const i of cart) {
                await fiadosAPI.adicionarItem({
                  conta_id: contaId,
                  produto_id: i.id,
                  nome_item: i.nome,
                  quantidade: i.quantidade,
                  valor_unitario: i.preco,
                  observacoes: `Venda ${resultado?.numero || resultado?.id}`,
                  usuario_id: usuario.id,
                });
              }
            }

            toast({
              title: "Venda concluída com fallback de fiado",
              description: "A conta foi criada no fiado e os itens da venda foram lançados automaticamente.",
            });
          } catch (erroFallback: any) {
            toast({
              title: "Venda concluída, mas fiado pendente",
              description: `Não foi possível lançar no fiado automaticamente: ${erroFallback?.message || erroFiado?.message || "erro desconhecido"}`,
              variant: "destructive",
            });
          }
        }
      }

      // Emissão fiscal (NFC-e ou NF-e)
      if (dados.paymentMethod !== "fiado" && dados.tipoCupom && dados.tipoCupom !== "nao_fiscal") {
        try {
          const tipoDoc = dados.tipoCupom as "nfe" | "nfce";
          const resultado_fiscal = await emitirNota(vendaParaFinalizar, loja, tipoDoc);
          if (resultado_fiscal.sucesso) {
            vendaParaFinalizar.chave_nfe = resultado_fiscal.chave_acesso;
            vendaParaFinalizar.modo_fiscal = resultado_fiscal.modo;
            if (resultado_fiscal.modo !== "simulado") {
              toast({ title: `✅ ${tipoDoc.toUpperCase()} autorizada!`, description: resultado_fiscal.chave_acesso?.slice(-6) });
            }
          } else {
            toast({ title: `⚠️ Venda salva, mas ${dados.tipoCupom.toUpperCase()} falhou`, description: resultado_fiscal.erro, variant: "destructive" });
          }
        } catch (e: any) {
          toast({ title: "Erro na emissão fiscal", description: e.message, variant: "destructive" });
        }
      }

      setVendaFinalizada(vendaParaFinalizar);

      toast({ title: `✅ Venda ${resultado.numero} registrada!` });
      setCart([]);
      setFase("cupom");
      await carregarTudo();
    } catch (e: any) {
      // Verifica se é erro de rede (servidor inacessível) → salva offline
      const isNetworkError = e.message?.includes("fetch") ||
        e.message?.includes("Failed to fetch") ||
        e.message?.includes("NetworkError") ||
        e.message?.includes("network") ||
        e.message?.includes("ECONNREFUSED") ||
        getStatusConexao() === "offline";

      if (isNetworkError) {
        if (dados.paymentMethod === "fiado") {
          toast({
            title: "Sem conexão para lançar fiado",
            description: "Conecte ao servidor para registrar a venda no fiado com os itens corretamente.",
            variant: "destructive",
          });
          return;
        }
        // Salva na fila offline
        const subtotal = cart.reduce((s, i) => s + i.total, 0);
        const total = subtotal - dados.descontoValor;
        const vendaOffline = await enfileirarVenda({
          caixa_id: caixaAberto?.id,
          usuario_id: usuario?.id,
          cliente_id: dados.clienteId ? parseInt(dados.clienteId) : undefined,
          itens: cart.map(i => ({
            produto_id: i.id, nome_produto: i.nome,
            codigo_barras: i.codigo_barras, quantidade: i.quantidade,
            preco_unitario: i.preco, preco_custo: i.preco_custo, total: i.total,
          })),
          pagamentos: [{ forma: paymentDbMethod, valor: total }],
          desconto_valor: dados.descontoValor,
          desconto_percentual: dados.descontoAprovado,
          cpf_nota: dados.cpfNota || undefined,
          tipo_cupom: "nao_fiscal",
        });

        // Mostra cupom de venda offline
        const troco = dados.paymentMethod === "dinheiro"
          ? Math.max(0, dados.valorRecebido - total) : 0;
        setVendaFinalizada({
          numero: `OFF-${vendaOffline.id.slice(-6).toUpperCase()}`,
          itens: cart.map(i => ({ nome_produto: i.nome, quantidade: i.quantidade, total: i.total })),
          total, subtotal,
          troco,
          desconto_valor: dados.descontoValor,
          desconto_percentual: dados.descontoAprovado,
          forma_pagamento: paymentDbMethod,
          cpf_nota: dados.cpfNota || null,
          cliente_nome: clientes.find(c => c.id.toString() === dados.clienteId)?.nome || null,
          offline: true,
        });

        toast({
          title: "📴 Venda salva offline",
          description: "Sem conexão com o servidor. A venda será sincronizada automaticamente quando a rede voltar.",
        });
        setCart([]);
        setFase("cupom");
      } else {
        toast({ title: "Erro ao registrar venda", description: e.message, variant: "destructive" });
      }
    } finally {
      setLoading(false);
    }
  };

  const filteredProdutos = produtos.filter(p =>
    p.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (p.codigo_barras || "").includes(searchTerm)
  );

  const subtotal = cart.reduce((s, i) => s + i.total, 0);
  const totalItens = cart.reduce((s, i) => s + i.quantidade, 0);

  const scanBg = scanStatus === "found"
    ? "border-green-500 bg-green-50 dark:bg-green-950/20"
    : scanStatus === "notfound"
    ? "border-red-500 bg-red-50 dark:bg-red-950/20"
    : "border-border";

  // ─── Overlays full-screen (checkout, cupom) ─────
  if (fase === "checkout") {
    return (
      <TelaCheckout
        cart={cart} clientes={clientes} representantes={representantes} loja={loja}
        serverIP={serverIP} loading={loading}
        onConfirmar={confirmarVenda}
        onVoltar={() => setFase("pdv")}
      />
    );
  }

  if (fase === "cupom" && vendaFinalizada) {
    return (
      <TelaCupom
        venda={vendaFinalizada} loja={loja}
        onNova={() => { setVendaFinalizada(null); setFase("pdv"); barcodeRef.current?.focus(); }}
      />
    );
  }

  // ─── PDV PRINCIPAL ──────────────────────────────
  return (
    <Layout title="PDV — Ponto de Venda">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 h-full" style={{ fontSize: `${fontSize}px` }}>

        {/* ═══ COLUNA ESQUERDA ═══ */}
        <div className="lg:col-span-2 space-y-3">

          {/* Status do caixa */}
          {caixaCarregado && !caixaAberto && (
            <Card className="border-yellow-500 bg-yellow-50 dark:bg-yellow-950/20">
              <CardContent className="pt-3 pb-3 flex items-center justify-between">
                <div className="flex items-center gap-2 text-yellow-700 dark:text-yellow-400">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span className="text-sm font-medium">Caixa fechado — abra o caixa para vender</span>
                </div>
                <Button size="sm" onClick={() => navigate("/caixa")}>
                  <ArrowRight className="w-4 h-4 mr-1" /> Ir para Caixa
                </Button>
              </CardContent>
            </Card>
          )}
          {caixaCarregado && caixaAberto && (
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400">
                <CheckCircle2 className="w-4 h-4" />
                Caixa #{caixaAberto.id} aberto — {caixaAberto.usuario_nome}
              </div>
              <div className="hidden lg:flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                {[["F2","Scanner"],["F4","Finalizar"],["F6","Limpar"],["F8","Fiados"],["ESC","Voltar"],["N","Dinheiro"],["C","Crédito"],["D","Débito"],["P","PIX"],["V","Voucher"],["F","Fiado"]].map(([k,l])=>(
                  <span key={k} className="flex items-center gap-1">
                    <kbd className="bg-muted border border-border px-1.5 py-0.5 rounded font-mono text-[10px] font-bold">{k}</kbd>
                    <span className="text-muted-foreground">{l}</span>
                  </span>
                ))}
              </div>
              {/* Controle de tamanho de fonte */}
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span>Fonte:</span>
                <button onClick={() => saveFontSize(Math.max(11, fontSize - 1))} className="w-5 h-5 rounded border bg-muted hover:bg-muted/80 font-bold flex items-center justify-center leading-none">−</button>
                <span className="font-mono w-6 text-center">{fontSize}</span>
                <button onClick={() => saveFontSize(Math.min(20, fontSize + 1))} className="w-5 h-5 rounded border bg-muted hover:bg-muted/80 font-bold flex items-center justify-center leading-none">+</button>
              </div>
            </div>
          )}

          {/* Scanner */}
          <Card className={`border-2 transition-colors ${scanBg}`}>
            <CardContent className="pt-3 pb-3">
              <div className="flex items-center gap-2">
                <Barcode className={`w-5 h-5 shrink-0 ${
                  scanStatus === "found" ? "text-green-600"
                  : scanStatus === "notfound" ? "text-red-600"
                  : "text-muted-foreground"
                }`} />
                <Input
                  ref={barcodeRef}
                  value={codigoBarras}
                  onChange={e => setCodigoBarras(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && codigoBarras.trim()) buscarPorCodigo(codigoBarras.trim()); }}
                  placeholder="Leitor de barras ou código + Enter..."
                  disabled={!caixaAberto}
                  autoComplete="off"
                  className="font-mono"
                />
                {codigoBarras && (
                  <button onClick={() => { setCodigoBarras(""); barcodeRef.current?.focus(); }}>
                    <X className="w-4 h-4 text-muted-foreground" />
                  </button>
                )}
                <Button size="sm" onClick={() => codigoBarras && buscarPorCodigo(codigoBarras)} disabled={!codigoBarras || !caixaAberto}>
                  <Search className="w-4 h-4" />
                </Button>
              </div>
              {scanStatus === "found" && <p className="text-xs text-green-600 mt-1 ml-7">✅ Produto adicionado!</p>}
              {scanStatus === "notfound" && <p className="text-xs text-red-600 mt-1 ml-7">❌ Não encontrado.</p>}
            </CardContent>
          </Card>

          {/* Busca por nome */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
            <Input
              placeholder="Buscar produto por nome..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Grade de produtos */}
          <Card>
            <CardHeader className="py-2 px-4">
              <CardTitle className="text-sm flex items-center gap-2">
                <Package className="w-4 h-4" /> Produtos
                <Badge variant="secondary" className="ml-auto">{filteredProdutos.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-3 px-3">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-[420px] overflow-y-auto pr-1">
                {filteredProdutos.map(p => (
                  <button
                    key={p.id}
                    onClick={() => { addToCart(p); barcodeRef.current?.focus(); }}
                    disabled={(!p.permitir_venda_sem_estoque && p.estoque_atual <= 0) || !caixaAberto}
                    className={`text-left p-3 border rounded-lg transition-all hover:shadow-md hover:border-primary/50 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed ${
                      p.estoque_atual <= 0 ? "bg-muted" : "bg-card hover:bg-accent/30"
                    }`}
                  >
                    <div className="flex justify-between items-start gap-1 mb-1">
                      <span className="font-medium text-xs leading-tight line-clamp-2">{p.nome}</span>
                      <Badge variant={p.estoque_atual > 5 ? "secondary" : p.estoque_atual > 0 ? "outline" : "destructive"} className="text-xs shrink-0">
                        {p.estoque_atual}
                      </Badge>
                    </div>
                    {p.codigo_barras && <p className="text-xs text-muted-foreground font-mono truncate">{p.codigo_barras}</p>}
                    <p className="text-sm font-bold text-primary mt-1">R$ {Number(p.preco_venda).toFixed(2)}</p>
                  </button>
                ))}
                {filteredProdutos.length === 0 && (
                  <div className="col-span-3 text-center py-10 text-muted-foreground">
                    <Package className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">Nenhum produto encontrado</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ═══ COLUNA DIREITA: CARRINHO ═══ */}
        <div>
          <Card className="sticky top-4">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center justify-between text-base">
                <span className="flex items-center gap-2">
                  <ShoppingCart className="w-5 h-5" /> Carrinho
                </span>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{totalItens} {totalItens === 1 ? "item" : "itens"}</Badge>
                  {cart.length > 0 && (
                    <button onClick={() => setCart([])} className="text-muted-foreground hover:text-destructive transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Itens */}
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {cart.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <ShoppingCart className="w-10 h-10 mx-auto mb-2 opacity-20" />
                    <p className="text-sm">Carrinho vazio</p>
                    <p className="text-xs mt-1">Clique nos produtos ou use o leitor</p>
                  </div>
                ) : (
                  cart.map(item => (
                    <div key={item.id} className="flex items-center gap-2 p-2 bg-muted/40 rounded-lg">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-xs truncate">{item.nome}</p>
                        <p className="text-xs text-muted-foreground">R$ {item.preco.toFixed(2)}</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button size="sm" variant="outline" className="h-6 w-6 p-0" onClick={() => updateQty(item.id, item.quantidade - 1)}>
                          <Minus className="h-3 w-3" />
                        </Button>
                        <span className="w-6 text-center text-xs font-bold">{item.quantidade}</span>
                        <Button size="sm" variant="outline" className="h-6 w-6 p-0" onClick={() => updateQty(item.id, item.quantidade + 1)}>
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                      <span className="text-xs font-semibold w-14 text-right tabular-nums">R$ {item.total.toFixed(2)}</span>
                      <button onClick={() => setCart(prev => prev.filter(i => i.id !== item.id))} className="text-muted-foreground hover:text-destructive shrink-0">
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))
                )}
              </div>

              {cart.length > 0 && (
                <>
                  <Separator />
                  <div className="flex justify-between font-bold text-base">
                    <span>Subtotal</span>
                    <span className="text-primary">R$ {subtotal.toFixed(2)}</span>
                  </div>
                  <button
                    onClick={() => { if (caixaAberto) setFase("checkout"); }}
                    disabled={!caixaAberto}
                    className="w-full h-12 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 text-white font-bold text-base shadow-lg shadow-blue-500/20 hover:shadow-blue-500/40 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
                  >
                    <CreditCard className="w-5 h-5" />
                    Ir para Pagamento →
                  </button>
                  <Button
                    variant="outline"
                    className="w-full h-10"
                    onClick={() => navigate("/fiados")}
                  >
                    <Wallet className="w-4 h-4 mr-2" />
                    Atalho Fiados (F8)
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
