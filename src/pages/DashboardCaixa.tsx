/**
 * VYN CRM - Dashboard do Caixa v2.1
 * Corrigido: abertura/fechamento com relatório imprimível, suprimento/sangria,
 * navegação direta para PDV, relógio em tempo real
 */
import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { caixaAPI, configAPI } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  ShoppingCart, DollarSign, LogOut, Unlock, Lock, TrendingUp,
  Clock, Plus, Minus, Printer, RefreshCw, CreditCard, Smartphone,
  AlertCircle, CheckCircle2
} from "lucide-react";

// ── Formatação ────────────────────────────────────────────────
const fmt = (v: number) => `R$ ${Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;

// ── Relatório de fechamento imprimível ────────────────────────
function RelatorioCaixa({ caixa, totais, resultado, onClose }: any) {
  const printRef = useRef<HTMLDivElement>(null);
  const imprimir = () => {
    const win = window.open("", "_blank", "width=600,height=800");
    if (!win || !printRef.current) return;
    win.document.write(`<html><head><title>Fechamento de Caixa</title>
      <style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Courier New',monospace;font-size:12px;padding:10px}
      h1{font-size:14px;text-align:center;margin-bottom:8px}.linha{display:flex;justify-content:space-between;padding:2px 0}
      .sep{border-top:1px dashed #000;margin:6px 0}.bold{font-weight:bold}.center{text-align:center}</style>
      </head><body>${printRef.current.innerHTML}</body></html>`);
    win.document.close();
    setTimeout(() => { win.print(); win.close(); }, 400);
  };

  const now = new Date().toLocaleString("pt-BR");
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-green-600" />
            Caixa Fechado com Sucesso
          </DialogTitle>
        </DialogHeader>
        <div ref={printRef} className="font-mono text-xs space-y-1 bg-white p-4 rounded border">
          <div className="text-center font-bold text-sm mb-2">RELATÓRIO DE FECHAMENTO DE CAIXA</div>
          <div className="text-center text-xs text-gray-500 mb-3">{now}</div>
          <div className="border-t border-dashed my-2" />
          <div className="flex justify-between"><span>Caixa</span><span>#{caixa?.id}</span></div>
          <div className="flex justify-between"><span>Operador</span><span>{caixa?.usuario_nome}</span></div>
          <div className="flex justify-between"><span>Abertura</span><span>{caixa?.data_abertura ? new Date(caixa.data_abertura).toLocaleString("pt-BR") : "-"}</span></div>
          <div className="border-t border-dashed my-2" />
          <div className="font-bold text-sm mb-1">VENDAS POR FORMA DE PAGAMENTO</div>
          {[
            { label: "Dinheiro",  val: totais?.por_forma?.dinheiro?.total, qtd: totais?.por_forma?.dinheiro?.qtd },
            { label: "Crédito",   val: totais?.por_forma?.credito?.total,  qtd: totais?.por_forma?.credito?.qtd },
            { label: "Débito",    val: totais?.por_forma?.debito?.total,   qtd: totais?.por_forma?.debito?.qtd },
            { label: "PIX",       val: totais?.por_forma?.pix?.total,      qtd: totais?.por_forma?.pix?.qtd },
          ].map(f => (
            <div key={f.label} className="flex justify-between">
              <span>{f.label} ({f.qtd || 0}x)</span>
              <span>{fmt(f.val || 0)}</span>
            </div>
          ))}
          <div className="border-t border-dashed my-2" />
          <div className="flex justify-between"><span>Total Vendas</span><span className="font-bold">{fmt(totais?.total_vendas || 0)}</span></div>
          <div className="flex justify-between"><span>Qtd. Vendas</span><span>{totais?.qtd_vendas || 0}</span></div>
          <div className="border-t border-dashed my-2" />
          <div className="font-bold text-sm mb-1">MOVIMENTAÇÕES DE CAIXA</div>
          <div className="flex justify-between"><span>Abertura</span><span>{fmt(totais?.abertura || 0)}</span></div>
          <div className="flex justify-between"><span>Suprimentos</span><span>+{fmt(totais?.suprimentos || 0)}</span></div>
          <div className="flex justify-between"><span>Sangrias</span><span>-{fmt(totais?.sangrias || 0)}</span></div>
          <div className="border-t border-dashed my-2" />
          <div className="flex justify-between font-bold"><span>Esperado em Caixa</span><span>{fmt(resultado?.saldo_esperado || 0)}</span></div>
          <div className="flex justify-between"><span>Informado</span><span>{fmt(resultado?.saldo_informado || 0)}</span></div>
          <div className={`flex justify-between font-bold ${(resultado?.diferenca || 0) < 0 ? "text-red-600" : "text-green-600"}`}>
            <span>Diferença</span>
            <span>{fmt(resultado?.diferenca || 0)}</span>
          </div>
          <div className="border-t border-dashed my-2" />
          <div className="text-center text-xs mt-2">VYN CRM — Relatório gerado automaticamente</div>
        </div>
        <div className="flex gap-2">
          <Button onClick={imprimir} className="flex-1">
            <Printer className="w-4 h-4 mr-2" />Imprimir Relatório
          </Button>
          <Button variant="outline" onClick={onClose} className="flex-1">Fechar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Componente de Suprimento/Sangria ─────────────────────────
function imprimirComprovante(tipo: string, valor: number, motivo: string, nomeLoja: string) {
  const win = window.open("", "_blank", "width=340,height=420");
  if (!win) return;
  const label = tipo === "sangria" ? "SANGRIA DE CAIXA" : "SUPRIMENTO DE CAIXA";
  win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Comprovante</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Courier New',monospace;font-size:12px;padding:16px;max-width:300px;margin:0 auto}
  .c{text-align:center}.b{font-weight:bold}.sep{border-top:1px dashed #000;margin:8px 0}.big{font-size:15px}
  @media print{@page{margin:5mm}}
</style></head><body>
<div class="c b">${nomeLoja || "ASTIA PDV"}</div>
<div class="sep"></div>
<div class="c b big">${label}</div>
<div class="sep"></div>
<div><b>Data:</b> ${new Date().toLocaleString("pt-BR")}</div>
<div><b>Valor:</b> R$ ${valor.toFixed(2)}</div>
${motivo ? `<div><b>Motivo:</b> ${motivo}</div>` : ""}
<div class="sep"></div>
<div class="c" style="margin-top:30px">_________________________</div>
<div class="c" style="font-size:10px">Assinatura do Operador</div>
<div class="sep"></div>
<div class="c" style="font-size:9px">ASTIA PDV by VYN Developer</div>
<script>window.onload=()=>setTimeout(()=>window.print(),300)</script>
</body></html>`);
  win.document.close();
}

function ModalMovimento({ tipo, caixaId, usuarioId, onDone, onClose, nomeLoja = "ASTIA PDV" }: any) {
  const { toast } = useToast();
  const [valor, setValor] = useState("");
  const [motivo, setMotivo] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valor || parseFloat(valor) <= 0) { toast({ title: "Informe um valor válido", variant: "destructive" }); return; }
    setLoading(true);
    try {
      if (tipo === "suprimento") {
        await caixaAPI.suprimento({ caixa_id: caixaId, valor: parseFloat(valor), motivo, usuario_id: usuarioId });
      } else {
        await caixaAPI.sangria({ caixa_id: caixaId, valor: parseFloat(valor), motivo, usuario_id: usuarioId });
      }
      toast({ title: `${tipo === "suprimento" ? "Suprimento" : "Sangria"} registrado!` });
      // Imprime comprovante
      imprimirComprovante(tipo, parseFloat(valor), motivo, nomeLoja);
      onDone();
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally { setLoading(false); }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className={`flex items-center gap-2 ${tipo === "suprimento" ? "text-green-600" : "text-orange-600"}`}>
            {tipo === "suprimento" ? <Plus className="w-5 h-5" /> : <Minus className="w-5 h-5" />}
            {tipo === "suprimento" ? "Suprimento de Caixa" : "Sangria de Caixa"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Valor (R$) *</Label>
            <Input type="number" step="0.01" min="0.01" value={valor}
              onChange={e => setValor(e.target.value)} placeholder="0,00" autoFocus required />
          </div>
          <div>
            <Label>Motivo</Label>
            <Input value={motivo} onChange={e => setMotivo(e.target.value)}
              placeholder={tipo === "suprimento" ? "Ex: Troco adicional" : "Ex: Depósito banco"} />
          </div>
          <div className="flex gap-2">
            <Button type="submit" className="flex-1" disabled={loading}>
              {loading ? "Registrando..." : "Confirmar"}
            </Button>
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Componente principal ──────────────────────────────────────
export default function DashboardCaixa() {
  const { usuario, logout } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [caixa, setCaixa] = useState<any>(null);
  const [totais, setTotais] = useState<any>(null);
  const [movimentacoes, setMovimentacoes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [abrindo, setAbrindo] = useState(false);
  const [fechando, setFechando] = useState(false);
  const [saldoAbertura, setSaldoAbertura] = useState("0");
  const [saldoFechamento, setSaldoFechamento] = useState("");
  const [obsAbertura, setObsAbertura] = useState("");
  const [obsFechamento, setObsFechamento] = useState("");
  const [hora, setHora] = useState(new Date().toLocaleTimeString("pt-BR"));
  const [config, setConfig] = useState<any>({});
  const [modalMovimento, setModalMovimento] = useState<"suprimento" | "sangria" | null>(null);
  const [relatório, setRelatorio] = useState<any>(null);

  useEffect(() => {
    verificarCaixa();
    const t = setInterval(() => setHora(new Date().toLocaleTimeString("pt-BR")), 1000);
    return () => clearInterval(t);
  }, []);

  const verificarCaixa = async () => {
    setLoading(true);
    try {
      const cx = await caixaAPI.buscarAberto(1);
      setCaixa(cx);
      if (cx) {
        const [t, movs] = await Promise.all([
          caixaAPI.calcularTotais(cx.id),
          caixaAPI.movimentacoes(cx.id),
        ]);
        setTotais(t);
        setMovimentacoes(movs || []);
      } else {
        setTotais(null);
        setMovimentacoes([]);
      }
    } catch (e: any) {
      toast({ title: "Erro ao verificar caixa", description: e.message, variant: "destructive" });
    } finally { setLoading(false); }
  };

  const handleAbrirCaixa = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!usuario) return;
    setAbrindo(true);
    try {
      await caixaAPI.abrir({
        usuario_id: usuario.id,
        saldo_abertura: parseFloat(saldoAbertura) || 0,
        observacao: obsAbertura,
        numero_pdv: 1,
      });
      toast({ title: "✅ Caixa aberto!", description: `Saldo inicial: ${fmt(parseFloat(saldoAbertura) || 0)}` });
      setSaldoAbertura("0"); setObsAbertura("");
      await verificarCaixa();
    } catch (e: any) {
      toast({ title: "Erro ao abrir caixa", description: e.message, variant: "destructive" });
    } finally { setAbrindo(false); }
  };

  const handleFecharCaixa = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!caixa || !usuario) return;
    if (!saldoFechamento) { toast({ title: "Informe o saldo contado", variant: "destructive" }); return; }
    setFechando(true);
    try {
      const resultado = await caixaAPI.fechar({
        caixa_id: caixa.id,
        saldo_informado: parseFloat(saldoFechamento) || 0,
        observacao: obsFechamento,
        usuario_id: usuario.id,
      });
      setRelatorio({ caixa, totais, resultado });
      setCaixa(null); setTotais(null); setMovimentacoes([]);
      setSaldoFechamento(""); setObsFechamento("");
    } catch (e: any) {
      toast({ title: "Erro ao fechar caixa", description: e.message, variant: "destructive" });
    } finally { setFechando(false); }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-3">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mx-auto" />
          <p className="text-muted-foreground">Verificando caixa...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted">
      {/* ── Header ── */}
      <div className="bg-card border-b px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-primary" />
            VYN CRM — Caixa
          </h1>
          <p className="text-sm text-muted-foreground">Operador: <strong>{usuario?.nome}</strong></p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-muted px-3 py-1 rounded-full">
            <Clock className="w-4 h-4 text-muted-foreground" />
            <span className="font-mono text-lg tabular-nums">{hora}</span>
          </div>
          <Badge variant={caixa ? "default" : "secondary"} className="px-3 py-1">
            {caixa ? "🟢 ABERTO" : "🔴 FECHADO"}
          </Badge>
          <Button variant="ghost" size="sm" onClick={() => verificarCaixa()}>
            <RefreshCw className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => { logout(); navigate("/auth"); }}>
            <LogOut className="w-4 h-4 mr-1" />Sair
          </Button>
        </div>
      </div>

      <div className="p-6 max-w-5xl mx-auto">
        {!caixa ? (
          /* ── CAIXA FECHADO ── */
          <div className="max-w-md mx-auto mt-8">
            <Card className="border-green-500/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-green-700 dark:text-green-400">
                  <Unlock className="w-5 h-5" />Abrir Caixa
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleAbrirCaixa} className="space-y-4">
                  <div>
                    <Label>Troco / Saldo de Abertura (R$)</Label>
                    <Input type="number" step="0.01" min="0" value={saldoAbertura}
                      onChange={e => setSaldoAbertura(e.target.value)}
                      placeholder="0,00" className="text-lg font-mono" autoFocus />
                    <p className="text-xs text-muted-foreground mt-1">Valor em dinheiro disponível ao abrir o caixa</p>
                  </div>
                  <div>
                    <Label>Observação (opcional)</Label>
                    <Input value={obsAbertura} onChange={e => setObsAbertura(e.target.value)}
                      placeholder="Ex: Troco separado, turno da tarde..." />
                  </div>
                  <Button type="submit" className="w-full h-12 text-base" disabled={abrindo}>
                    <Unlock className="w-5 h-5 mr-2" />
                    {abrindo ? "Abrindo caixa..." : "Abrir Caixa e Iniciar Atendimento"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>
        ) : (
          /* ── CAIXA ABERTO ── */
          <div className="space-y-4">
            {/* Botão principal — PDV */}
            <Card className="border-primary border-2 bg-primary/5">
              <CardContent className="pt-5 pb-5 flex items-center justify-between">
                <div>
                  <p className="font-semibold text-lg">Caixa #{caixa.id} aberto</p>
                  <p className="text-sm text-muted-foreground">desde {new Date(caixa.data_abertura).toLocaleString("pt-BR")}</p>
                </div>
                <Button size="lg" className="h-14 px-8 text-base" onClick={() => navigate("/pdv")}>
                  <ShoppingCart className="w-5 h-5 mr-2" />
                  Registrar Venda (PDV)
                </Button>
              </CardContent>
            </Card>

            {/* Totais */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: "Total Vendas", val: totais?.total_vendas, icon: TrendingUp, color: "text-green-600" },
                { label: "Qtd. Vendas",  val: totais?.qtd_vendas,  icon: ShoppingCart, color: "text-blue-600", isQtd: true },
                { label: "Dinheiro",     val: (totais?.por_forma?.dinheiro?.total || 0) + (totais?.abertura || 0) + (totais?.suprimentos || 0) - (totais?.sangrias || 0), icon: DollarSign, color: "text-primary" },
                { label: "PIX",          val: totais?.por_forma?.pix?.total, icon: Smartphone, color: "text-purple-600" },
              ].map(c => (
                <Card key={c.label}>
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-center gap-2 mb-1">
                      <c.icon className={`w-4 h-4 ${c.color}`} />
                      <span className="text-xs text-muted-foreground">{c.label}</span>
                    </div>
                    <div className={`text-2xl font-bold ${c.color}`}>
                      {c.isQtd ? (c.val || 0) : fmt(c.val || 0)}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Formas de pagamento + movimentações */}
            <div className="grid md:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <CreditCard className="w-4 h-4" />Vendas por Forma
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {[
                    { label: "Dinheiro", val: totais?.por_forma?.dinheiro?.total, qtd: totais?.por_forma?.dinheiro?.qtd },
                    { label: "Crédito",  val: totais?.por_forma?.credito?.total,  qtd: totais?.por_forma?.credito?.qtd },
                    { label: "Débito",   val: totais?.por_forma?.debito?.total,   qtd: totais?.por_forma?.debito?.qtd },
                    { label: "PIX",      val: totais?.por_forma?.pix?.total,      qtd: totais?.por_forma?.pix?.qtd },
                    { label: "Voucher",  val: totais?.por_forma?.voucher?.total,  qtd: totais?.por_forma?.voucher?.qtd },
                  ].filter(f => (f.val || 0) > 0).map(f => (
                    <div key={f.label} className="flex items-center justify-between py-1 border-b last:border-0">
                      <span className="text-sm">{f.label} <span className="text-muted-foreground text-xs">({f.qtd || 0}x)</span></span>
                      <span className="font-medium">{fmt(f.val || 0)}</span>
                    </div>
                  ))}
                  {!totais?.total_vendas && <p className="text-muted-foreground text-sm text-center py-2">Nenhuma venda ainda</p>}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center justify-between">
                    <span className="flex items-center gap-2"><DollarSign className="w-4 h-4" />Movimentações</span>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" className="h-7 text-xs text-green-600 border-green-300"
                        onClick={() => setModalMovimento("suprimento")}>
                        <Plus className="w-3 h-3 mr-1" />Suprimento
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 text-xs text-orange-600 border-orange-300"
                        onClick={() => setModalMovimento("sangria")}>
                        <Minus className="w-3 h-3 mr-1" />Sangria
                      </Button>
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-1 max-h-36 overflow-y-auto">
                  {movimentacoes.length === 0
                    ? <p className="text-muted-foreground text-sm text-center py-2">Nenhuma movimentação</p>
                    : movimentacoes.map((m, i) => (
                      <div key={i} className="flex justify-between text-sm py-0.5">
                        <span className="text-muted-foreground capitalize">{m.tipo}</span>
                        <span className={m.tipo === "sangria" ? "text-red-600" : "text-green-600"}>
                          {m.tipo === "sangria" ? "-" : "+"}{fmt(m.valor)}
                        </span>
                      </div>
                    ))
                  }
                </CardContent>
              </Card>
            </div>

            {/* Fechar caixa */}
            <Card className="border-orange-400/50">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-orange-600">
                  <Lock className="w-4 h-4" />Fechar Caixa
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleFecharCaixa} className="grid md:grid-cols-3 gap-4 items-end">
                  <div className="md:col-span-1">
                    <Label>Dinheiro Contado (R$) *</Label>
                    <Input type="number" step="0.01" min="0" value={saldoFechamento}
                      onChange={e => setSaldoFechamento(e.target.value)}
                      placeholder="0,00" required className="font-mono" />
                    <p className="text-xs text-muted-foreground mt-1">Conte o caixa físico</p>
                  </div>
                  <div className="md:col-span-1">
                    <Label>Observação</Label>
                    <Input value={obsFechamento} onChange={e => setObsFechamento(e.target.value)} placeholder="Opcional" />
                  </div>
                  <Button type="submit" variant="outline"
                    className="border-orange-400 text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950"
                    disabled={fechando}>
                    <Lock className="w-4 h-4 mr-2" />
                    {fechando ? "Fechando..." : "Fechar Caixa e Gerar Relatório"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* Modais */}
      {modalMovimento && (
        <ModalMovimento
                  nomeLoja={config?.nome || "ASTIA PDV"}
          tipo={modalMovimento}
          caixaId={caixa?.id}
          usuarioId={usuario?.id}
          onDone={() => { setModalMovimento(null); verificarCaixa(); }}
          onClose={() => setModalMovimento(null)}
        />
      )}

      {relatório && (
        <RelatorioCaixa
          {...relatório}
          onClose={() => setRelatorio(null)}
        />
      )}
    </div>
  );
}
