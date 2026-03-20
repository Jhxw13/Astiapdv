/**
 * VYN CRM - Financeiro v2.2
 * Contas a pagar/receber + Lucro Real Mensal (receita - CMV - despesas)
 * Exportação CSV e impressão
 */
import { useState, useEffect } from "react";
import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { financeiroAPI, despesasAPI, relatoriosAvancadosAPI, conferenciaAPI } from "@/lib/api";
import {
  Wallet, Plus, Search, TrendingUp, TrendingDown, Download,
  Trash2, Edit, DollarSign, BarChart3, RefreshCw, Printer,
  ClipboardCheck, CheckCircle, AlertTriangle, Clock, FileCode
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";

const fmt = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);
const fmtN = (v: number, dec = 2) => Number(v || 0).toFixed(dec);

function exportCSV(data: any[], filename: string) {
  if (!data?.length) return;
  const keys = Object.keys(data[0]);
  const csv = [keys.join(";"), ...data.map(r => keys.map(k => JSON.stringify(r[k] ?? "")).join(";"))].join("\n");
  const a = document.createElement("a");
  a.href = "data:text/csv;charset=utf-8,\uFEFF" + encodeURIComponent(csv);
  a.download = filename + ".csv"; a.click();
}

const CATEGORIAS_DESPESA = [
  "Aluguel","Água","Energia Elétrica","Internet","Telefone",
  "Salários","Pró-labore","Fornecedores","Marketing","Manutenção",
  "Impostos","Contabilidade","Embalagens","Frete","Outros"
];

const mesesNomes = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

export default function Financeiro() {
  const { toast } = useToast();
  const { usuario } = useAuth();
  const hoje = new Date();

  // ── Contas ────────────────────────────────────────────────
  const [movs, setMovs] = useState<any[]>([]);
  const [loadingMovs, setLoadingMovs] = useState(true);
  const [busca, setBusca] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const emptyForm = { tipo: "pagar" as "receber"|"pagar", categoria: "Outros", descricao: "", valor: "", data_vencimento: hoje.toISOString().split("T")[0], status: "aberta" as string, observacoes: "" };
  const [form, setForm] = useState(emptyForm);

  // ── Despesas mensais ──────────────────────────────────────
  const [mesSel, setMesSel] = useState(hoje.getMonth() + 1);
  const [anoSel, setAnoSel] = useState(hoje.getFullYear());
  const [despesas, setDespesas] = useState<any[]>([]);
  const [lucroReal, setLucroReal] = useState<any>(null);
  const [loadingLucro, setLoadingLucro] = useState(false);
  const [despDialogOpen, setDespDialogOpen] = useState(false);
  const [editDespId, setEditDespId] = useState<number|null>(null);
  const emptyDesp = { descricao: "", categoria: "Outros", valor: "", data: `${hoje.getFullYear()}-${String(hoje.getMonth()+1).padStart(2,"0")}-01`, recorrente: 0, observacoes: "" };
  const [despForm, setDespForm] = useState<any>(emptyDesp);

  // ── Fechamento de Caixa ───────────────────────────────────
  const [fcData, setFcData] = useState(hoje.toISOString().split("T")[0]);
  const [fcPdv, setFcPdv] = useState(1);
  const [fcMaxPdv, setFcMaxPdv] = useState(1);
  const [fcSistema, setFcSistema] = useState<any>(null);
  const [fcConferido, setFcConferido] = useState({ dinheiro: "", debito: "", credito: "", pix: "" });
  const [fcObs, setFcObs] = useState("");
  const [fcLoading, setFcLoading] = useState(false);
  const [fcSaving, setFcSaving] = useState(false);
  const [fcHistorico, setFcHistorico] = useState<any[]>([]);
  const [fcHistInicio, setFcHistInicio] = useState("");
  const [fcHistFim, setFcHistFim] = useState("");
  const [fcHistPdv, setFcHistPdv] = useState<string>("");
  const [fcLoadingHist, setFcLoadingHist] = useState(false);

  useEffect(() => { fetchMovs(); }, []);
  useEffect(() => { fetchDespesas(); }, [mesSel, anoSel]);

  const fetchMovs = async () => {
    setLoadingMovs(true);
    try { setMovs(await financeiroAPI.listar() || []); }
    catch { toast({ title: "Erro ao carregar contas", variant: "destructive" }); }
    finally { setLoadingMovs(false); }
  };

  const fetchDespesas = async () => {
    setLoadingLucro(true);
    try {
      const [d, lr] = await Promise.all([
        despesasAPI.listar(mesSel, anoSel),
        relatoriosAvancadosAPI.lucroRealMes(mesSel, anoSel),
      ]);
      setDespesas(d || []);
      setLucroReal(lr);
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally { setLoadingLucro(false); }
  };

  const salvarConta = async () => {
    if (!form.descricao || !form.valor || !form.data_vencimento) {
      toast({ title: "Preencha os campos obrigatórios", variant: "destructive" }); return;
    }
    try {
      await financeiroAPI.criar({ ...form, valor: parseFloat(form.valor), usuario_id: usuario?.id });
      toast({ title: "Conta cadastrada!" });
      setDialogOpen(false); setForm(emptyForm); fetchMovs();
    } catch { toast({ title: "Erro ao salvar", variant: "destructive" }); }
  };

  const baixarConta = async (id: number) => {
    const forma = prompt("Forma de pagamento (dinheiro/pix/credito/debito):", "dinheiro");
    if (!forma) return;
    const valorStr = prompt("Valor pago:");
    if (!valorStr) return;
    try {
      const valorNormalizado = Number(
        String(valorStr)
          .replace(/[^\d,.-]/g, "")
          .replace(",", ".")
      );
      if (!Number.isFinite(valorNormalizado) || valorNormalizado <= 0) {
        toast({ title: "Valor inválido", description: "Digite um valor numérico maior que zero.", variant: "destructive" });
        return;
      }
      await financeiroAPI.baixar(id, valorNormalizado, forma.trim().toLowerCase(), new Date().toISOString().split("T")[0]);
      toast({ title: "Baixa realizada!" }); fetchMovs();
    } catch (e: any) { toast({ title: "Erro", description: e.message, variant: "destructive" }); }
  };

  const salvarDespesa = async () => {
    if (!despForm.descricao || !despForm.valor || !despForm.data) {
      toast({ title: "Preencha os campos obrigatórios", variant: "destructive" }); return;
    }
    try {
      if (editDespId) {
        await despesasAPI.atualizar(editDespId, { ...despForm, valor: parseFloat(despForm.valor) });
        toast({ title: "Despesa atualizada!" });
      } else {
        await despesasAPI.criar({ ...despForm, valor: parseFloat(despForm.valor), usuario_id: usuario?.id });
        toast({ title: "Despesa adicionada!" });
      }
      setDespDialogOpen(false); setDespForm(emptyDesp); setEditDespId(null);
      fetchDespesas();
    } catch { toast({ title: "Erro ao salvar despesa", variant: "destructive" }); }
  };

  const deletarDespesa = async (id: number) => {
    if (!confirm("Remover esta despesa?")) return;
    try { await despesasAPI.deletar(id); toast({ title: "Removida!" }); fetchDespesas(); }
    catch { toast({ title: "Erro", variant: "destructive" }); }
  };

  const filtered = movs.filter(m =>
    (m.descricao || "").toLowerCase().includes(busca.toLowerCase()) ||
    (m.categoria || "").toLowerCase().includes(busca.toLowerCase())
  );

  const totalPagar  = movs.filter(m => m.tipo === "pagar"   && m.status !== "paga").reduce((s,m) => s + Number(m.valor), 0);
  const totalReceber= movs.filter(m => m.tipo === "receber" && m.status !== "paga").reduce((s,m) => s + Number(m.valor), 0);
  const statusBadge = (s: string) => s === "paga" ? "default" : s === "parcial" ? "secondary" : s === "vencida" ? "destructive" : "outline";

  const lucroChartData = lucroReal ? [
    { name: "Receita Bruta",  val: lucroReal.receita,         fill: "#10B981" },
    { name: "CMV",            val: lucroReal.cmv,             fill: "#F59E0B" },
    { name: "Lucro Bruto",    val: lucroReal.lucro_bruto,     fill: "#3B82F6" },
    { name: "Despesas",       val: lucroReal.total_despesas,  fill: "#EF4444" },
    { name: "Lucro Real",     val: Math.max(0,lucroReal.lucro_real), fill: lucroReal.lucro_real >= 0 ? "#6366F1" : "#EF4444" },
  ] : [];

  return (
    <Layout title="Financeiro">
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Financeiro</h1>

        <Tabs defaultValue="contas">
          <TabsList>
            <TabsTrigger value="contas"><Wallet className="w-4 h-4 mr-2" />Contas</TabsTrigger>
            <TabsTrigger value="lucro"><BarChart3 className="w-4 h-4 mr-2" />Lucro Real Mensal</TabsTrigger>
          </TabsList>

          {/* ══ ABA CONTAS ══ */}
          <TabsContent value="contas" className="space-y-4">
            {/* Resumo */}
            <div className="grid grid-cols-2 gap-3">
              <Card className="border-red-200 bg-red-50 dark:bg-red-950">
                <CardContent className="pt-4 pb-4 flex items-center gap-3">
                  <TrendingDown className="w-6 h-6 text-red-600" />
                  <div>
                    <p className="text-xs text-muted-foreground">A Pagar (em aberto)</p>
                    <p className="text-xl font-bold text-red-600">{fmt(totalPagar)}</p>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-green-200 bg-green-50 dark:bg-green-950">
                <CardContent className="pt-4 pb-4 flex items-center gap-3">
                  <TrendingUp className="w-6 h-6 text-green-600" />
                  <div>
                    <p className="text-xs text-muted-foreground">A Receber (em aberto)</p>
                    <p className="text-xl font-bold text-green-600">{fmt(totalReceber)}</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Barra de ações */}
            <div className="flex gap-2 flex-wrap">
              <div className="relative flex-1 min-w-40">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input placeholder="Buscar..." value={busca} onChange={e => setBusca(e.target.value)} className="pl-9 h-8" />
              </div>
              <Button size="sm" variant="outline" onClick={() => exportCSV(filtered, "contas")}>
                <Download className="w-3 h-3 mr-1" />CSV
              </Button>
              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="sm"><Plus className="w-4 h-4 mr-1" />Nova Conta</Button>
                </DialogTrigger>
                <DialogContent className="max-w-md">
                  <DialogHeader><DialogTitle>Nova Conta</DialogTitle></DialogHeader>
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label>Tipo *</Label>
                        <Select value={form.tipo} onValueChange={v => setForm({...form, tipo: v as any})}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pagar">A Pagar</SelectItem>
                            <SelectItem value="receber">A Receber</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Categoria</Label>
                        <Input value={form.categoria} onChange={e => setForm({...form, categoria: e.target.value})} />
                      </div>
                    </div>
                    <div><Label>Descrição *</Label><Input value={form.descricao} onChange={e => setForm({...form, descricao: e.target.value})} required /></div>
                    <div className="grid grid-cols-2 gap-3">
                      <div><Label>Valor *</Label><Input type="number" step="0.01" min="0" value={form.valor} onChange={e => setForm({...form, valor: e.target.value})} required /></div>
                      <div><Label>Vencimento *</Label><Input type="date" value={form.data_vencimento} onChange={e => setForm({...form, data_vencimento: e.target.value})} required /></div>
                    </div>
                    <div><Label>Observações</Label><Input value={form.observacoes} onChange={e => setForm({...form, observacoes: e.target.value})} /></div>
                    <Button className="w-full" onClick={salvarConta}>Salvar</Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            {/* Tabela */}
            <Card>
              <CardContent className="pt-3 overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead><tr className="border-b">{["Tipo","Descrição","Categoria","Valor","Vencimento","Status","Ações"].map(h=><th key={h} className="text-left p-2 font-medium text-muted-foreground">{h}</th>)}</tr></thead>
                  <tbody>
                    {filtered.map(m => (
                      <tr key={m.id} className="border-b hover:bg-muted/40">
                        <td className="p-2">
                          <Badge variant={m.tipo==="receber"?"default":"destructive"} className="text-xs">
                            {m.tipo==="receber"?"Receber":"Pagar"}
                          </Badge>
                        </td>
                        <td className="p-2 font-medium max-w-40 truncate">{m.descricao}</td>
                        <td className="p-2 text-muted-foreground">{m.categoria}</td>
                        <td className={`p-2 font-medium ${m.tipo==="receber"?"text-green-600":"text-red-600"}`}>{fmt(m.valor)}</td>
                        <td className="p-2 font-mono">{m.data_vencimento}</td>
                        <td className="p-2"><Badge variant={statusBadge(m.status)} className="text-xs capitalize">{m.status}</Badge></td>
                        <td className="p-2">
                          {m.status !== "paga" && (
                            <Button size="sm" variant="outline" className="h-6 text-xs" onClick={() => baixarConta(m.id)}>Baixar</Button>
                          )}
                        </td>
                      </tr>
                    ))}
                    {filtered.length === 0 && (
                      <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">Nenhuma conta encontrada</td></tr>
                    )}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ══ ABA LUCRO REAL ══ */}
          <TabsContent value="lucro" className="space-y-4">
            {/* Seletor mês/ano */}
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <Label className="text-sm">Mês:</Label>
                <Select value={String(mesSel)} onValueChange={v => setMesSel(parseInt(v))}>
                  <SelectTrigger className="w-32 h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {mesesNomes.map((m,i) => <SelectItem key={i+1} value={String(i+1)}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-sm">Ano:</Label>
                <Input type="number" value={anoSel} onChange={e => setAnoSel(parseInt(e.target.value))} className="w-24 h-8" />
              </div>
              <Button size="sm" variant="outline" onClick={fetchDespesas} disabled={loadingLucro}>
                <RefreshCw className={`w-3 h-3 mr-1 ${loadingLucro?"animate-spin":""}`} />Atualizar
              </Button>
              <Dialog open={despDialogOpen} onOpenChange={v => { setDespDialogOpen(v); if(!v){setEditDespId(null);setDespForm(emptyDesp);} }}>
                <DialogTrigger asChild>
                  <Button size="sm"><Plus className="w-4 h-4 mr-1" />Adicionar Despesa</Button>
                </DialogTrigger>
                <DialogContent className="max-w-md">
                  <DialogHeader><DialogTitle>{editDespId ? "Editar" : "Nova"} Despesa</DialogTitle></DialogHeader>
                  <div className="space-y-3">
                    <div><Label>Descrição *</Label><Input value={despForm.descricao} onChange={e => setDespForm({...despForm, descricao: e.target.value})} required autoFocus /></div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label>Categoria</Label>
                        <Select value={despForm.categoria} onValueChange={v => setDespForm({...despForm, categoria: v})}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>{CATEGORIAS_DESPESA.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div><Label>Valor (R$) *</Label><Input type="number" step="0.01" min="0" value={despForm.valor} onChange={e => setDespForm({...despForm, valor: e.target.value})} required /></div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div><Label>Data *</Label><Input type="date" value={despForm.data} onChange={e => setDespForm({...despForm, data: e.target.value})} required /></div>
                      <div className="flex items-center gap-2 mt-6">
                        <input type="checkbox" id="recorrente" checked={!!despForm.recorrente} onChange={e => setDespForm({...despForm, recorrente: e.target.checked ? 1 : 0})} />
                        <Label htmlFor="recorrente" className="cursor-pointer text-sm">Recorrente</Label>
                      </div>
                    </div>
                    <div><Label>Observações</Label><Input value={despForm.observacoes} onChange={e => setDespForm({...despForm, observacoes: e.target.value})} /></div>
                    <Button className="w-full" onClick={salvarDespesa}>{editDespId ? "Atualizar" : "Adicionar"} Despesa</Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            <div className="grid lg:grid-cols-2 gap-4">
              {/* Demonstrativo */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Demonstrativo — {mesesNomes[mesSel-1]}/{anoSel}</CardTitle>
                  <CardDescription>Lucro real = vendas − custo dos produtos − despesas do mês</CardDescription>
                </CardHeader>
                <CardContent>
                  {lucroReal ? (
                    <div className="space-y-2">
                      {[
                        { label: "Receita de Vendas",     val: lucroReal.receita,        color: "text-green-600", prefix: "" },
                        { label: "(-) Custo dos Produtos (CMV)", val: lucroReal.cmv,     color: "text-orange-600", prefix: "-" },
                        { label: "= Lucro Bruto",         val: lucroReal.lucro_bruto,    color: "text-blue-600",  prefix: "", border: true, bold: true },
                        { label: "(-) Despesas do Mês",   val: lucroReal.total_despesas, color: "text-red-600",   prefix: "-" },
                        { label: "= LUCRO REAL",          val: lucroReal.lucro_real,     color: lucroReal.lucro_real >= 0 ? "text-green-700" : "text-red-700", prefix: "", border: true, bold: true, big: true },
                      ].map((r, i) => (
                        <div key={i} className={`flex justify-between items-center py-1.5 ${r.border ? "border-t-2 pt-2 mt-1" : ""}`}>
                          <span className={`text-sm ${r.bold ? "font-bold" : ""}`}>{r.label}</span>
                          <span className={`font-semibold ${r.color} ${r.big ? "text-xl" : "text-sm"}`}>
                            {r.prefix}{fmt(Math.abs(r.val || 0))}
                          </span>
                        </div>
                      ))}
                      <div className="bg-muted rounded-lg p-3 mt-3 grid grid-cols-2 gap-2 text-xs">
                        <div><p className="text-muted-foreground">Margem Real</p><p className="font-bold">{fmtN(lucroReal.margem_real)}%</p></div>
                        <div><p className="text-muted-foreground">Margem Bruta</p><p className="font-bold">{lucroReal.receita > 0 ? fmtN((lucroReal.lucro_bruto/lucroReal.receita)*100) : "0.00"}%</p></div>
                      </div>
                    </div>
                  ) : <p className="text-center py-6 text-muted-foreground">Nenhum dado</p>}
                </CardContent>
              </Card>

              {/* Gráfico */}
              <Card>
                <CardHeader className="pb-3"><CardTitle className="text-base">Visão Gráfica</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={lucroChartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                      <YAxis tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} tick={{ fontSize: 10 }} />
                      <Tooltip formatter={(v: any) => fmt(v)} />
                      <Bar dataKey="val" radius={[4,4,0,0]}>
                        {lucroChartData.map((c, i) => <Cell key={i} fill={c.fill} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            {/* Lista de despesas */}
            <Card>
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base">Despesas — {mesesNomes[mesSel-1]}/{anoSel}</CardTitle>
                  <CardDescription>Total: {fmt(lucroReal?.total_despesas || 0)}</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => exportCSV(despesas, `despesas_${mesSel}_${anoSel}`)}>
                    <Download className="w-3 h-3 mr-1" />CSV
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead><tr className="border-b">{["Data","Descrição","Categoria","Valor","Recorrente","Ações"].map(h=><th key={h} className="text-left p-2 font-medium text-muted-foreground">{h}</th>)}</tr></thead>
                    <tbody>
                      {despesas.map((d) => (
                        <tr key={d.id} className="border-b hover:bg-muted/40">
                          <td className="p-2 font-mono">{d.data}</td>
                          <td className="p-2 font-medium">{d.descricao}</td>
                          <td className="p-2 text-muted-foreground">{d.categoria}</td>
                          <td className="p-2 text-red-600 font-medium">{fmt(d.valor)}</td>
                          <td className="p-2">{d.recorrente ? <Badge variant="secondary" className="text-xs">Sim</Badge> : "—"}</td>
                          <td className="p-2 flex gap-1">
                            <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => {
                              setEditDespId(d.id);
                              setDespForm({ descricao: d.descricao, categoria: d.categoria, valor: String(d.valor), data: d.data, recorrente: d.recorrente, observacoes: d.observacoes || "" });
                              setDespDialogOpen(true);
                            }}><Edit className="w-3 h-3" /></Button>
                            <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-destructive" onClick={() => deletarDespesa(d.id)}><Trash2 className="w-3 h-3" /></Button>
                          </td>
                        </tr>
                      ))}
                      {despesas.length === 0 && (
                        <tr><td colSpan={6} className="text-center py-6 text-muted-foreground">Nenhuma despesa cadastrada para este mês.<br/>Clique em "Adicionar Despesa" para começar.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Despesas por categoria */}
                {lucroReal?.despesas_por_categoria?.length > 0 && (
                  <div className="mt-4 pt-4 border-t">
                    <p className="text-xs font-medium text-muted-foreground mb-2">Por categoria:</p>
                    <div className="flex flex-wrap gap-2">
                      {lucroReal.despesas_por_categoria.map((c: any) => (
                        <div key={c.categoria} className="bg-muted rounded px-2 py-1 text-xs">
                          <span className="text-muted-foreground">{c.categoria}:</span>
                          <span className="font-medium ml-1 text-red-600">{fmt(c.valor || c.total_despesas)}</span>
                        </div>
                      ))}
                    </div>
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
