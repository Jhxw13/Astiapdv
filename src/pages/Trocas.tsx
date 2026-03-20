/**
 * ASTIA PDV — Módulo de Trocas e Devoluções
 *
 * Fluxo:
 *   1. Busca cupom pelo número → mostra nota completa
 *   2. Operador seleciona itens a devolver e condição (funcionando/defeito)
 *   3. Informa motivo (obrigatório)
 *   4. Escolhe resolução: carta de crédito | extorno | troca direta
 *   5. Gerente aprova (liberação)
 *   6. Sistema executa: estoque, caixa, crédito do cliente
 *   7. Imprime documento (carta ou extorno)
 */
import { useState, useRef, useEffect } from "react";
import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { trocasAPI, caixaAPI, sistemaAPI, configAPI, authAPI } from "@/lib/api";
import {
  Search, ArrowLeftRight, Package, AlertTriangle, CheckCircle2,
  FileText, Printer, RefreshCw, Clock, Banknote, CreditCard,
  PackageX, RotateCcw, ShieldCheck, X, ChevronRight, History,
  BadgeAlert, Wrench,
} from "lucide-react";

// ── Tipos ─────────────────────────────────────────────────────────────────────
type Condicao = "funcionando" | "defeito";
type TipoResolucao = "carta_credito" | "extorno" | "troca_produto";

interface ItemDevolvido {
  produto_id: number;
  nome_produto: string;
  quantidade: number;
  preco_unitario: number;
  total: number;
  condicao: Condicao;
  max_quantidade: number;
}

// ── Impressão carta de crédito ────────────────────────────────────────────────
function imprimirCartaCredito(troca: any, loja: any, validade: string, voucher?: string) {
  const win = window.open("", "_blank", "width=420,height=600");
  if (!win) return;
  win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>Carta de Crédito ${troca.numero}</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Courier New',monospace;font-size:12px;padding:20px;max-width:320px;margin:0 auto}
.c{text-align:center}.b{font-weight:bold}.big{font-size:18px;letter-spacing:2px}.sep{border-top:2px dashed #000;margin:10px 0}
.box{border:2px solid #000;padding:12px;margin:10px 0;border-radius:4px}.qr{text-align:center;margin:10px 0}</style>
</head><body>
<div class="c b" style="font-size:14px">${loja?.nome || "ASTIA PDV"}</div>
${loja?.cnpj ? `<div class="c">CNPJ: ${loja.cnpj}</div>` : ""}
<div class="sep"></div>
<div class="c b big">CARTA DE CRÉDITO</div>
<div class="sep"></div>
<div class="box">
  <div><b>Nº:</b> ${troca.numero}</div>
  <div><b>Cliente:</b> ${troca.cliente_nome || "Consumidor"}</div>
  <div><b>Data de emissão:</b> ${new Date().toLocaleDateString("pt-BR")}</div>
  <div><b>Validade:</b> ${validade ? new Date(validade).toLocaleDateString("pt-BR") : "Sem validade"}</div>
  <div style="margin-top:8px"><b>SALDO DISPONÍVEL:</b></div>
  <div class="c big b" style="font-size:22px;margin-top:4px">R$ ${Number(troca.valor_total).toFixed(2)}</div>
  ${voucher ? `<div style="margin-top:8px;padding:8px;background:#f3f0ff;border:1px solid #7c3aed;border-radius:4px;text-align:center">
    <div style="font-size:9px;font-weight:bold;color:#7c3aed;letter-spacing:1px">CODIGO DO VOUCHER (uso unico)</div>
    <div style="font-size:18px;font-weight:900;color:#7c3aed;letter-spacing:3px;margin-top:4px">${voucher}</div>
    <div style="font-size:9px;color:#666;margin-top:2px">Apresente na proxima compra para abater o valor</div>
  </div>` : ''}
</div>
<div class="sep"></div>
<div style="font-size:10px">
  <div><b>Motivo da troca:</b> ${troca.motivo}</div>
  <div><b>Venda original:</b> ${troca.numero_venda_original || troca.numero_venda || "—"}</div>
</div>
<div class="sep"></div>
<div class="c" style="font-size:10px">Este crédito pode ser utilizado em qualquer compra na loja.</div>
<div class="c" style="font-size:9px;margin-top:6px;color:#666">ASTIA PDV by VYN Developer</div>
<script>window.onload=()=>setTimeout(()=>window.print(),400)</script>
</body></html>`);
  win.document.close();
}

// ── Impressão documento de extorno ───────────────────────────────────────────
function imprimirExtorno(troca: any, loja: any) {
  const win = window.open("", "_blank", "width=500,height=700");
  if (!win) return;
  const itens = (troca.itens || []).map((i: any) =>
    `<tr><td>${i.nome_produto}</td><td style="text-align:center">${i.quantidade}</td><td style="text-align:right">R$ ${Number(i.total).toFixed(2)}</td><td style="text-align:center">${i.condicao === "funcionando" ? "OK" : "DEFEITO"}</td></tr>`
  ).join("");
  win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>Extorno ${troca.numero}</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,sans-serif;font-size:12px;padding:20px;max-width:500px;margin:0 auto}
h2{margin-bottom:4px;font-size:14px}p{margin-bottom:4px}.sep{border-top:1px dashed #000;margin:10px 0}
table{width:100%;border-collapse:collapse;margin:8px 0}th,td{border:1px solid #ccc;padding:4px 6px;font-size:11px}
th{background:#f0f0f0;font-weight:bold}.sign{margin-top:30px;border-top:1px solid #000;padding-top:4px;font-size:10px}
@media print{@page{margin:10mm}}</style>
</head><body>
<div style="text-align:center"><h2>${loja?.nome || "ASTIA PDV"}</h2>${loja?.cnpj ? `<p>CNPJ: ${loja.cnpj}</p>` : ""}</div>
<div class="sep"></div>
<h2>DOCUMENTO DE EXTORNO</h2>
<p><b>Nº:</b> ${troca.numero}</p>
<p><b>Data:</b> ${new Date().toLocaleString("pt-BR")}</p>
<p><b>Cliente:</b> ${troca.cliente_nome || "Consumidor"}</p>
<p><b>Venda original:</b> ${troca.numero_venda_original || "—"}</p>
<p><b>Motivo:</b> ${troca.motivo}</p>
<div class="sep"></div>
<table><thead><tr><th>Produto</th><th>Qtd</th><th>Valor</th><th>Condição</th></tr></thead>
<tbody>${itens}</tbody></table>
<div class="sep"></div>
<p style="font-size:13px;font-weight:bold">VALOR TOTAL DO EXTORNO: R$ ${Number(troca.valor_total).toFixed(2)}</p>
<p style="font-size:10px;margin-top:4px">Valor devolvido em dinheiro/forma original de pagamento.</p>
<div class="sep"></div>
<div class="sign">
  <p>Declaro que recebi o valor de R$ ${Number(troca.valor_total).toFixed(2)} referente ao extorno acima.</p>
  <div style="margin-top:40px;text-align:center">_____________________________________________</div>
  <div style="text-align:center;font-size:10px">${troca.cliente_nome || "Assinatura do Cliente"}</div>
</div>
<div style="margin-top:20px;text-align:center;font-size:9px;color:#999">ASTIA PDV by VYN Developer</div>
<script>window.onload=()=>setTimeout(()=>window.print(),400)</script>
</body></html>`);
  win.document.close();
}


// ── Tela de liberação simplificada (para trocas) ──────────────────────────────
function TelaLiberacaoTroca({ descricao, serverIP, onAutorizado, onCancelar }: {
  descricao: string; serverIP: string;
  onAutorizado: () => void; onCancelar: () => void;
}) {
  const { toast } = useToast();
  const [modo, setModo] = useState<"senha" | "aguardar">("senha");
  const [senha, setSenha] = useState("");
  const [loading, setLoading] = useState(false);
  const [aprovStatus, setAprovStatus] = useState<"aguardando" | "aprovado">("aguardando");
  const [tempoRestante, setTempoRestante] = useState(300);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const autorizarSenha = async () => {
    if (!senha) { toast({ title: "Digite a senha", variant: "destructive" }); return; }
    setLoading(true);
    try {
      const lista = await authAPI.listarUsuarios();
      let ok = false;
      for (const u of (lista || [])) {
        if (!u.ativo || !["admin","gerente"].includes(u.cargo)) continue;
        try { const r = await authAPI.login(u.email, senha); if (r) { ok = true; break; } } catch {}
      }
      if (ok) onAutorizado();
      else { toast({ title: "Senha incorreta", variant: "destructive" }); setSenha(""); }
    } catch (e: any) { toast({ title: "Erro", description: e.message, variant: "destructive" }); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    if (modo !== "aguardar") return;
    let ativo = true;
    setAprovStatus("aguardando"); setTempoRestante(300);
    (async () => {
      try {
        const base = serverIP.startsWith("http") ? serverIP : `http://${serverIP}:3567`;
        const r = await fetch(`${base}/api/liberacao/criar`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ descricao }),
        }).then(r => r.json());
        if (!ativo || !r.ok) return;
        timerRef.current = setInterval(() => setTempoRestante(t => t <= 1 ? (clearInterval(timerRef.current!), 0) : t - 1), 1000);
        pollRef.current = setInterval(async () => {
          try {
            const s = await fetch(`${base}/api/liberacao/${r.token}`).then(x => x.json());
            if (s.status === "aprovado" && ativo) { clearInterval(pollRef.current!); clearInterval(timerRef.current!); setAprovStatus("aprovado"); setTimeout(onAutorizado, 600); }
          } catch {}
        }, 2000);
      } catch {}
    })();
    return () => { ativo = false; if (pollRef.current) clearInterval(pollRef.current); if (timerRef.current) clearInterval(timerRef.current); };
  }, [modo]);

  const m = Math.floor(tempoRestante / 60), s = tempoRestante % 60;
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <h2 className="font-bold text-base leading-tight">Autorizar Troca</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{descricao}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {(["senha","aguardar"] as const).map(t => (
            <button key={t} onClick={() => setModo(t)} className={`py-2.5 rounded-xl text-xs font-semibold border transition-all ${modo===t?"bg-violet-600 text-white border-violet-600":"bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300"}`}>
              {t === "senha" ? "🔑 Senha local" : "🛡 Solicitar gerente"}
            </button>
          ))}
        </div>
        {modo === "senha" && (
          <div className="space-y-3">
            <input type="password" value={senha} autoFocus onChange={e => setSenha(e.target.value)} onKeyDown={e => e.key === "Enter" && autorizarSenha()} placeholder="••••••••"
              className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-base outline-none focus:border-violet-500" />
            <div className="grid grid-cols-2 gap-2">
              <button onClick={autorizarSenha} disabled={loading} className="py-3 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white font-bold rounded-xl text-sm">{loading ? "Verificando..." : "✅ Autorizar"}</button>
              <button onClick={onCancelar} className="py-3 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium text-slate-700 dark:text-slate-300">Cancelar</button>
            </div>
          </div>
        )}
        {modo === "aguardar" && (
          <div className="space-y-3">
            {aprovStatus === "aprovado" ? (
              <div className="py-4 text-center space-y-2">
                <CheckCircle2 className="w-10 h-10 text-green-600 mx-auto" />
                <p className="font-bold text-green-600">Aprovado!</p>
              </div>
            ) : (
              <div className="p-3 bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-800 rounded-xl space-y-2">
                <p className="text-xs font-semibold text-violet-700 dark:text-violet-300">Solicitação enviada ao gerente</p>
                <p className="text-xs text-slate-500">O gerente verá no ícone 🛡 da barra superior.</p>
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1 text-amber-600"><Clock className="w-3 h-3 animate-pulse" /> Aguardando...</span>
                  <span className={`font-mono font-bold ${tempoRestante < 60 ? "text-red-500" : "text-slate-500"}`}>{m}:{String(s).padStart(2,"0")}</span>
                </div>
              </div>
            )}
            <button onClick={onCancelar} className="w-full py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-700 dark:text-slate-300">Cancelar</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function Trocas() {
  const { toast } = useToast();
  const { usuario } = useAuth();
  const [aba, setAba] = useState("nova");

  // Estado do fluxo nova troca
  const [etapa, setEtapa] = useState<"buscar" | "selecionar" | "resolver" | "concluido">("buscar");
  const [numeroCupom, setNumeroCupom] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [vendaOriginal, setVendaOriginal] = useState<any>(null);
  const [itensDevolvidos, setItensDevolvidos] = useState<ItemDevolvido[]>([]);
  const [motivo, setMotivo] = useState("");
  const [tipoResolucao, setTipoResolucao] = useState<TipoResolucao>("carta_credito");
  const [validadeCredito, setValidadeCredito] = useState(
    new Date(Date.now() + 90*86400000).toISOString().slice(0,10)
  );
  const [salvando, setSalvando] = useState(false);
  const [trocaConcluida, setTrocaConcluida] = useState<any>(null);
  const [loja, setLoja] = useState<any>({});
  const [aguardandoLiberacao, setAguardandoLiberacao] = useState(false);
  const [serverIP, setServerIP] = useState("");
  const precisaLiberacao = usuario?.cargo === "vendedor" || usuario?.cargo === "caixa";

  // Histórico e defeitos
  const [historico, setHistorico] = useState<any[]>([]);
  const [defeitos, setDefeitos] = useState<any[]>([]);
  const [loadingHistorico, setLoadingHistorico] = useState(false);
  const [loadingDefeitos, setLoadingDefeitos] = useState(false);
  const [filtroInicio, setFiltroInicio] = useState("");
  const [filtroFim, setFiltroFim] = useState("");

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    configAPI.get().then(cfg => setLoja(cfg || {})).catch(() => {});
    sistemaAPI.getServerIP().then((ip: string) => setServerIP(ip || "")).catch(() => {});
  }, []);

  const fmt = (v: number) => `R$ ${Number(v||0).toFixed(2)}`;

  // Busca venda pelo número do cupom
  const buscarVenda = async () => {
    if (!numeroCupom.trim()) return;
    setBuscando(true);
    try {
      const venda = await trocasAPI.buscarVendaPorNumero(numeroCupom.trim().toUpperCase());
      if (!venda) {
        toast({ title: "Cupom não encontrado", description: "Verifique o número e tente novamente.", variant: "destructive" });
        return;
      }
      setVendaOriginal(venda);
      // Inicializa itens com quantidade 0 (operador escolhe o que devolver)
      setItensDevolvidos(venda.itens.map((i: any) => ({
        produto_id: i.produto_id, nome_produto: i.nome_produto,
        quantidade: 0, preco_unitario: i.preco_unitario, total: 0,
        condicao: "funcionando" as Condicao, max_quantidade: i.quantidade,
      })));
      setEtapa("selecionar");
    } catch (e: any) {
      toast({ title: "Erro ao buscar cupom", description: e.message, variant: "destructive" });
    } finally { setBuscando(false); }
  };

  const setQtd = (idx: number, qtd: number) => {
    setItensDevolvidos(prev => prev.map((i, j) => j !== idx ? i : {
      ...i, quantidade: Math.min(Math.max(0, qtd), i.max_quantidade),
      total: Math.min(Math.max(0, qtd), i.max_quantidade) * i.preco_unitario,
    }));
  };

  const setCondicao = (idx: number, condicao: Condicao) => {
    setItensDevolvidos(prev => prev.map((i, j) => j !== idx ? i : { ...i, condicao }));
  };

  const itensSelecionados = itensDevolvidos.filter(i => i.quantidade > 0);
  const valorTotal = itensSelecionados.reduce((s, i) => s + i.total, 0);

  const confirmarSelecao = () => {
    if (itensSelecionados.length === 0) {
      toast({ title: "Selecione ao menos um item", variant: "destructive" }); return;
    }
    if (!motivo.trim()) {
      toast({ title: "Informe o motivo da troca", variant: "destructive" }); return;
    }
    setEtapa("resolver");
  };

  const finalizarTroca = async () => {
    if (!motivo.trim()) { toast({ title: "Motivo obrigatório", variant: "destructive" }); return; }
    setSalvando(true);
    try {
      let caixaAberto = null;
      try { caixaAberto = await caixaAPI.buscarAberto(1); } catch { caixaAberto = null; }
      // Valida itens antes de enviar
      const itensValidos = itensSelecionados.map(i => ({
        produto_id: i.produto_id,
        nome_produto: i.nome_produto,
        quantidade: i.quantidade,
        preco_unitario: i.preco_unitario,
        total: i.total,
        condicao: i.condicao,
      }));
      const resultado = await trocasAPI.criar({
        venda_original_id: vendaOriginal.id,
        numero_venda_original: vendaOriginal.numero,
        cliente_id: vendaOriginal.cliente_id,
        usuario_id: usuario?.id,
        caixa_id: caixaAberto?.id,
        motivo: motivo.trim(),
        tipo_resolucao: tipoResolucao,
        itens: itensValidos,
        validade_credito: tipoResolucao === "carta_credito" ? validadeCredito : undefined,
      });

      // Busca troca completa para impressão
      const trocaCompleta = await trocasAPI.buscar(resultado.troca_id);
      setTrocaConcluida({ ...trocaCompleta, ...resultado });

      toast({ title: `✅ Troca ${resultado.numero} registrada!` });
      setEtapa("concluido");

      // Auto-imprime o documento
      setTimeout(() => {
        if (tipoResolucao === "carta_credito") {
          imprimirCartaCredito({ ...trocaCompleta, ...resultado }, loja, validadeCredito, trocaCompleta?.credito?.voucher_codigo);
        } else if (tipoResolucao === "extorno") {
          imprimirExtorno({ ...trocaCompleta, ...resultado }, loja);
        }
      }, 600);
    } catch (e: any) {
      toast({ title: "Erro ao registrar troca", description: e.message, variant: "destructive" });
    } finally { setSalvando(false); }
  };

  const resetar = () => {
    setEtapa("buscar"); setNumeroCupom(""); setVendaOriginal(null);
    setItensDevolvidos([]); setMotivo(""); setTipoResolucao("carta_credito");
    setTrocaConcluida(null);
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const carregarHistorico = async () => {
    setLoadingHistorico(true);
    try {
      const data = await trocasAPI.listar({
        data_inicio: filtroInicio || undefined,
        data_fim: filtroFim || undefined,
      });
      setHistorico(data || []);
    } finally { setLoadingHistorico(false); }
  };

  const carregarDefeitos = async () => {
    setLoadingDefeitos(true);
    try { setDefeitos(await trocasAPI.defeitosListar() || []); }
    finally { setLoadingDefeitos(false); }
  };

  const tipoLabel: Record<TipoResolucao, string> = {
    carta_credito: "Carta de Crédito", extorno: "Extorno", troca_produto: "Troca de Produto",
  };
  const tipoIcon: Record<TipoResolucao, any> = {
    carta_credito: CreditCard, extorno: Banknote, troca_produto: ArrowLeftRight,
  };

  return (
    <Layout title="Trocas e Devoluções">
      {aguardandoLiberacao && (
        <TelaLiberacaoTroca
          descricao={`Troca de ${itensSelecionados.length} item(s) — ${tipoLabel[tipoResolucao]} — R$ ${valorTotal.toFixed(2)}`}
          serverIP={serverIP}
          onAutorizado={() => { setAguardandoLiberacao(false); finalizarTroca(); }}
          onCancelar={() => setAguardandoLiberacao(false)}
        />
      )}
      <div className="space-y-4 max-w-4xl mx-auto">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ArrowLeftRight className="w-6 h-6 text-violet-600" /> Trocas e Devoluções
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Registre devoluções, troca de produto, carta de crédito ou extorno
          </p>
        </div>

        <Tabs value={aba} onValueChange={v => {
          setAba(v);
          if (v === "historico") carregarHistorico();
          if (v === "defeitos") carregarDefeitos();
        }}>
          <TabsList className="grid grid-cols-3 w-full max-w-md">
            <TabsTrigger value="nova" className="flex items-center gap-1.5">
              <RotateCcw className="w-3.5 h-3.5" /> Nova Troca
            </TabsTrigger>
            <TabsTrigger value="historico" className="flex items-center gap-1.5">
              <History className="w-3.5 h-3.5" /> Histórico
            </TabsTrigger>
            <TabsTrigger value="defeitos" className="flex items-center gap-1.5">
              <BadgeAlert className="w-3.5 h-3.5" /> Defeitos
            </TabsTrigger>
          </TabsList>

          {/* ════ ABA NOVA TROCA ════ */}
          <TabsContent value="nova" className="mt-4 space-y-4">

            {/* Progress steps */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {["buscar","selecionar","resolver","concluido"].map((s, i) => {
                const labels = ["Buscar cupom","Selecionar itens","Resolução","Concluído"];
                const atual = ["buscar","selecionar","resolver","concluido"].indexOf(etapa);
                return (
                  <div key={s} className="flex items-center gap-2">
                    {i > 0 && <ChevronRight className="w-3 h-3" />}
                    <span className={`font-medium ${i <= atual ? "text-violet-600" : ""}`}>
                      {i < atual ? "✓ " : ""}{labels[i]}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* ── ETAPA 1: Buscar cupom ── */}
            {etapa === "buscar" && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Search className="w-4 h-4 text-violet-600" /> Buscar pelo número do cupom
                  </CardTitle>
                  <CardDescription>
                    Digite o número da venda (ex: 20250315-0042) para carregar a nota
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex gap-3">
                    <Input
                      ref={inputRef}
                      value={numeroCupom}
                      onChange={e => setNumeroCupom(e.target.value.toUpperCase())}
                      onKeyDown={e => e.key === "Enter" && buscarVenda()}
                      placeholder="Nº do cupom (ex: 20250315-0042)"
                      className="font-mono text-base uppercase"
                      autoFocus
                    />
                    <Button onClick={buscarVenda} disabled={buscando || !numeroCupom.trim()}>
                      {buscando ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                      <span className="ml-2">{buscando ? "Buscando..." : "Buscar"}</span>
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    💡 O número está impresso no cupom. Caso o cliente não tenha o cupom,
                    o gerente pode consultar em <strong>Vendas → Filtro por data</strong>.
                  </p>
                </CardContent>
              </Card>
            )}

            {/* ── ETAPA 2: Selecionar itens ── */}
            {etapa === "selecionar" && vendaOriginal && (
              <div className="space-y-4">
                {/* Resumo da venda */}
                <Card className="border-violet-200 dark:border-violet-800 bg-violet-50/50 dark:bg-violet-950/20">
                  <CardContent className="pt-4 pb-3">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                      <div><p className="text-xs text-muted-foreground">Nº da venda</p><p className="font-mono font-bold">{vendaOriginal.numero}</p></div>
                      <div><p className="text-xs text-muted-foreground">Cliente</p><p className="font-medium">{vendaOriginal.cliente_nome || "Consumidor"}</p></div>
                      <div><p className="text-xs text-muted-foreground">Vendedor</p><p className="font-medium">{vendaOriginal.usuario_nome || "—"}</p></div>
                      <div><p className="text-xs text-muted-foreground">Data</p><p className="font-medium">{new Date(vendaOriginal.criado_em).toLocaleDateString("pt-BR")}</p></div>
                      <div><p className="text-xs text-muted-foreground">Total da nota</p><p className="font-bold text-green-600">{fmt(vendaOriginal.total)}</p></div>
                      <div><p className="text-xs text-muted-foreground">Pagamento</p><p className="font-medium capitalize">{vendaOriginal.forma_pagamento}</p></div>
                    </div>
                  </CardContent>
                </Card>

                {/* Seleção de itens */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Package className="w-4 h-4" /> Selecione os itens a devolver
                    </CardTitle>
                    <CardDescription>Informe a quantidade e condição de cada produto</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {itensDevolvidos.map((item, idx) => (
                      <div key={idx} className={`p-3 rounded-xl border-2 transition-all ${
                        item.quantidade > 0 ? "border-violet-300 dark:border-violet-700 bg-violet-50/50 dark:bg-violet-950/20" : "border-border"
                      }`}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1">
                            <p className="font-medium text-sm">{item.nome_produto}</p>
                            <p className="text-xs text-muted-foreground">
                              {fmt(item.preco_unitario)}/un · máx: {item.max_quantidade} un
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {/* Qtd +/- */}
                            <button onClick={() => setQtd(idx, item.quantidade - 1)}
                              className="w-8 h-8 rounded-lg border bg-background hover:bg-muted flex items-center justify-center font-bold text-red-500">−</button>
                            <span className="w-8 text-center font-mono font-bold text-sm">{item.quantidade}</span>
                            <button onClick={() => setQtd(idx, item.quantidade + 1)}
                              className="w-8 h-8 rounded-lg border bg-background hover:bg-muted flex items-center justify-center font-bold text-green-500">+</button>
                          </div>
                        </div>

                        {item.quantidade > 0 && (
                          <div className="mt-3 flex gap-2">
                            <button
                              onClick={() => setCondicao(idx, "funcionando")}
                              className={`flex-1 py-2 rounded-lg text-xs font-semibold border flex items-center justify-center gap-1.5 transition-all ${
                                item.condicao === "funcionando"
                                  ? "bg-green-600 text-white border-green-600"
                                  : "bg-background border-border hover:bg-muted text-muted-foreground"
                              }`}
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" /> Funcionando (volta ao estoque)
                            </button>
                            <button
                              onClick={() => setCondicao(idx, "defeito")}
                              className={`flex-1 py-2 rounded-lg text-xs font-semibold border flex items-center justify-center gap-1.5 transition-all ${
                                item.condicao === "defeito"
                                  ? "bg-red-600 text-white border-red-600"
                                  : "bg-background border-border hover:bg-muted text-muted-foreground"
                              }`}
                            >
                              <AlertTriangle className="w-3.5 h-3.5" /> Com defeito (aba de defeitos)
                            </button>
                          </div>
                        )}
                      </div>
                    ))}

                    {/* Motivo */}
                    <div className="pt-2 space-y-1.5">
                      <Label className="text-sm font-medium">Motivo da devolução <span className="text-red-500">*</span></Label>
                      <Input
                        value={motivo}
                        onChange={e => setMotivo(e.target.value)}
                        placeholder="Ex: produto com defeito, desistência da compra, tamanho errado..."
                        className="text-sm"
                      />
                    </div>

                    {/* Resumo selecionados */}
                    {itensSelecionados.length > 0 && (
                      <div className="flex items-center justify-between p-3 bg-violet-50 dark:bg-violet-950/30 rounded-lg border border-violet-200 dark:border-violet-800">
                        <span className="text-sm font-medium">{itensSelecionados.length} item(ns) · Valor total:</span>
                        <span className="font-bold text-violet-700 dark:text-violet-300 text-base">{fmt(valorTotal)}</span>
                      </div>
                    )}

                    <div className="flex gap-3 pt-2">
                      <Button variant="outline" onClick={() => setEtapa("buscar")} className="flex-1">
                        <X className="w-4 h-4 mr-2" /> Cancelar
                      </Button>
                      <Button onClick={confirmarSelecao} disabled={itensSelecionados.length === 0 || !motivo.trim()} className="flex-1">
                        Próximo <ChevronRight className="w-4 h-4 ml-2" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* ── ETAPA 3: Escolher resolução ── */}
            {etapa === "resolver" && (
              <div className="space-y-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-violet-600" /> Resolução financeira
                    </CardTitle>
                    <CardDescription>
                      {itensSelecionados.length} item(ns) · Valor: <strong>{fmt(valorTotal)}</strong>
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Escolha do tipo */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      {(["carta_credito","extorno","troca_produto"] as TipoResolucao[]).map(tipo => {
                        const Icon = tipoIcon[tipo];
                        const desc: Record<TipoResolucao, string> = {
                          carta_credito: "Saldo fica no cadastro do cliente para usar em nova compra",
                          extorno: "Dinheiro devolvido ao cliente, abate do caixa automaticamente",
                          troca_produto: "Cliente escolhe outro produto (sem dinheiro)",
                        };
                        return (
                          <button key={tipo} onClick={() => setTipoResolucao(tipo)}
                            className={`p-4 rounded-2xl border-2 text-left transition-all space-y-2 ${
                              tipoResolucao === tipo
                                ? "border-violet-600 bg-violet-50 dark:bg-violet-950/30"
                                : "border-border hover:border-violet-300 dark:hover:border-violet-700"
                            }`}>
                            <div className="flex items-center gap-2">
                              <Icon className={`w-5 h-5 ${tipoResolucao === tipo ? "text-violet-600" : "text-muted-foreground"}`} />
                              <span className={`font-semibold text-sm ${tipoResolucao === tipo ? "text-violet-700 dark:text-violet-300" : ""}`}>
                                {tipoLabel[tipo]}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground leading-relaxed">{desc[tipo]}</p>
                          </button>
                        );
                      })}
                    </div>

                    {/* Validade da carta de crédito */}
                    {tipoResolucao === "carta_credito" && (
                      <div className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded-xl border border-blue-200 dark:border-blue-800 space-y-2">
                        <p className="text-xs font-semibold text-blue-700 dark:text-blue-300">
                          💳 A carta de crédito será criada no cadastro do cliente
                        </p>
                        <div className="flex items-center gap-3">
                          <Label className="text-xs shrink-0">Validade (opcional)</Label>
                          <Input type="date" value={validadeCredito}
                            onChange={e => setValidadeCredito(e.target.value)}
                            className="h-8 text-xs w-40" />
                          <span className="text-xs text-muted-foreground">Padrão: 90 dias</span>
                        </div>
                      </div>
                    )}

                    {tipoResolucao === "extorno" && (
                      <div className="p-3 bg-amber-50 dark:bg-amber-950/30 rounded-xl border border-amber-200 dark:border-amber-800">
                        <p className="text-xs text-amber-700 dark:text-amber-300 font-medium">
                          💰 O valor de {fmt(valorTotal)} será abatido automaticamente do caixa.
                          Um documento de extorno será impresso para assinatura do cliente.
                        </p>
                      </div>
                    )}

                    {tipoResolucao === "troca_produto" && (
                      <div className="p-3 bg-green-50 dark:bg-green-950/30 rounded-xl border border-green-200 dark:border-green-800">
                        <p className="text-xs text-green-700 dark:text-green-300 font-medium">
                          🔄 O cliente escolhe um novo produto no PDV.
                          O crédito de {fmt(valorTotal)} será registrado para uso imediato.
                        </p>
                      </div>
                    )}

                    <div className="flex gap-3 pt-2">
                      <Button variant="outline" onClick={() => setEtapa("selecionar")} className="flex-1">
                        <X className="w-4 h-4 mr-2" /> Voltar
                      </Button>
                      <Button
                        onClick={() => precisaLiberacao ? setAguardandoLiberacao(true) : finalizarTroca()}
                        disabled={salvando}
                        className="flex-1 bg-violet-600 hover:bg-violet-700">
                        {salvando
                          ? <><RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Registrando...</>
                          : precisaLiberacao
                            ? <><ShieldCheck className="w-4 h-4 mr-2" /> Solicitar ao gerente</>
                            : <><CheckCircle2 className="w-4 h-4 mr-2" /> Confirmar troca</>
                        }
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* ── ETAPA 4: Concluído ── */}
            {etapa === "concluido" && trocaConcluida && (
              <Card className="border-green-200 dark:border-green-800">
                <CardContent className="pt-6 space-y-5">
                  <div className="text-center space-y-2">
                    <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto">
                      <CheckCircle2 className="w-9 h-9 text-green-600" />
                    </div>
                    <h2 className="text-xl font-bold text-green-700 dark:text-green-400">Troca registrada!</h2>
                    <p className="text-muted-foreground font-mono font-medium">{trocaConcluida.numero}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="p-3 bg-muted/50 rounded-xl">
                      <p className="text-xs text-muted-foreground mb-1">Resolução</p>
                      <p className="font-semibold">{tipoLabel[tipoResolucao]}</p>
                    </div>
                    <div className="p-3 bg-muted/50 rounded-xl">
                      <p className="text-xs text-muted-foreground mb-1">Valor</p>
                      <p className="font-bold text-green-600">{fmt(valorTotal)}</p>
                    </div>
                    <div className="p-3 bg-muted/50 rounded-xl col-span-2">
                      <p className="text-xs text-muted-foreground mb-1">Motivo</p>
                      <p className="font-medium">{motivo}</p>
                    </div>
                    {tipoResolucao === "carta_credito" && trocaConcluida?.credito?.voucher_codigo && (
                      <div className="p-3 bg-violet-50 dark:bg-violet-950/30 rounded-xl col-span-2 border border-violet-200 dark:border-violet-800">
                        <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                          <CreditCard className="w-3 h-3" /> Código do Voucher (uso único)
                        </p>
                        <p className="font-mono font-black text-lg text-violet-700 dark:text-violet-300 tracking-widest">
                          {trocaConcluida.credito.voucher_codigo}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          O cliente apresenta este código na próxima compra para abater o valor
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <Button variant="outline" onClick={() => {
                      if (tipoResolucao === "carta_credito") imprimirCartaCredito(trocaConcluida, loja, validadeCredito);
                      else imprimirExtorno(trocaConcluida, loja);
                    }}>
                      <Printer className="w-4 h-4 mr-2" />
                      {tipoResolucao === "carta_credito" ? "Carta de Crédito" : "Documento Extorno"}
                    </Button>
                    <Button onClick={resetar} className="bg-violet-600 hover:bg-violet-700">
                      <RotateCcw className="w-4 h-4 mr-2" /> Nova troca
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ════ ABA HISTÓRICO ════ */}
          <TabsContent value="historico" className="mt-4 space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <History className="w-4 h-4 text-violet-600" /> Histórico de Trocas
                  </CardTitle>
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <span>De</span>
                      <Input type="date" value={filtroInicio} onChange={e => setFiltroInicio(e.target.value)} className="h-7 w-36 text-xs" />
                      <span>até</span>
                      <Input type="date" value={filtroFim} onChange={e => setFiltroFim(e.target.value)} className="h-7 w-36 text-xs" />
                    </div>
                    <Button size="sm" variant="outline" onClick={carregarHistorico} disabled={loadingHistorico}>
                      <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loadingHistorico ? "animate-spin" : ""}`} />
                      Buscar
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {historico.length === 0 ? (
                  <div className="text-center py-10 text-muted-foreground">
                    <ArrowLeftRight className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">Nenhuma troca encontrada</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {historico.map(t => {
                      const Icon = tipoIcon[t.tipo_resolucao as TipoResolucao] || ArrowLeftRight;
                      return (
                        <div key={t.id} className="flex items-center gap-3 p-3 rounded-xl border hover:bg-muted/40 transition-all">
                          <div className="w-9 h-9 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center shrink-0">
                            <Icon className="w-4 h-4 text-violet-600" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-sm font-bold">{t.numero}</span>
                              <Badge variant="outline" className="text-xs">{tipoLabel[t.tipo_resolucao as TipoResolucao]}</Badge>
                            </div>
                            <p className="text-xs text-muted-foreground truncate">
                              {t.cliente_nome || "Consumidor"} · {t.motivo}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="font-bold text-sm text-violet-700 dark:text-violet-300">{fmt(t.valor_total)}</p>
                            <p className="text-xs text-muted-foreground">{new Date(t.criado_em).toLocaleDateString("pt-BR")}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ════ ABA DEFEITOS ════ */}
          <TabsContent value="defeitos" className="mt-4 space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <BadgeAlert className="w-4 h-4 text-red-500" /> Produtos com Defeito
                  </CardTitle>
                  <Button size="sm" variant="outline" onClick={carregarDefeitos} disabled={loadingDefeitos}>
                    <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loadingDefeitos ? "animate-spin" : ""}`} />
                    Atualizar
                  </Button>
                </div>
                <CardDescription>Produtos devolvidos com defeito aguardando análise ou devolução ao fornecedor</CardDescription>
              </CardHeader>
              <CardContent>
                {defeitos.length === 0 ? (
                  <div className="text-center py-10 text-muted-foreground">
                    <PackageX className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">Nenhum produto com defeito registrado</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {defeitos.map(d => {
                      const statusColors: Record<string, string> = {
                        pendente: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
                        analisando: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
                        devolvido_fornecedor: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
                        descartado: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
                        resolvido: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
                      };
                      const statusLabel: Record<string, string> = {
                        pendente: "Pendente", analisando: "Analisando",
                        devolvido_fornecedor: "Devolvido ao fornecedor",
                        descartado: "Descartado", resolvido: "Resolvido",
                      };
                      return (
                        <div key={d.id} className="flex items-center gap-3 p-3 rounded-xl border hover:bg-muted/40">
                          <div className="w-9 h-9 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center shrink-0">
                            <Wrench className="w-4 h-4 text-red-600" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm truncate">{d.nome_produto || d.produto_nome}</p>
                            <p className="text-xs text-muted-foreground">
                              {d.cliente_nome ? `Cliente: ${d.cliente_nome} · ` : ""}{d.quantidade} un · {d.motivo}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusColors[d.status] || ""}`}>
                              {statusLabel[d.status] || d.status}
                            </span>
                            {d.status === "pendente" && (usuario?.cargo === "admin" || usuario?.cargo === "gerente") && (
                              <select
                                defaultValue=""
                                onChange={async e => {
                                  if (!e.target.value) return;
                                  await trocasAPI.defeitoStatus(d.id, e.target.value);
                                  carregarDefeitos();
                                }}
                                className="text-xs border rounded px-1 py-0.5 bg-background"
                              >
                                <option value="">Alterar status</option>
                                <option value="analisando">Analisando</option>
                                <option value="devolvido_fornecedor">Devolvido ao fornecedor</option>
                                <option value="descartado">Descartado</option>
                                <option value="resolvido">Resolvido</option>
                              </select>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
