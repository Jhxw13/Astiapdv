/**
 * VYN CRM - Relatórios v2.2
 * Vendas por período, por PDV, top produtos, curva ABC,
 * ranking clientes, lucro, estoque crítico — com exportação CSV
 */
import React, { useState, useEffect, useRef } from "react";
import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { relatoriosAPI, relatoriosAvancadosAPI, sistemaAPI } from "@/lib/api";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, Legend,
} from "recharts";
import {
  BarChart3, TrendingUp, Package, Download, Users,
  DollarSign, ShoppingCart, Printer, RefreshCw, AlertTriangle,
  CalendarDays, CalendarRange, Monitor, UserCheck, PackageSearch,
  BarChart2, CreditCard, UserRound, AlertCircle, User,
} from "lucide-react";

const fmt = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);
const fmtN = (v: number, dec = 2) => Number(v || 0).toFixed(dec);
const COLORS = ["#3B82F6","#10B981","#F59E0B","#EF4444","#8B5CF6","#06B6D4","#F97316","#84CC16"];

type ExportFormat = "pdf" | "xml" | "txt";

function exportar(data: any[], filename: string, format: ExportFormat = "txt") {
  if (!data?.length) return;
  const keys = Object.keys(data[0]);
  const label = filename.replace(/_/g, " ").toUpperCase();
  const now = new Date().toLocaleString("pt-BR");
  let content = "";
  let mime = "";
  let ext = "";

  if (format === "xml") {
    const rows = data.map(r =>
      `  <item>\n${keys.map(k => `    <${k}>${String(r[k] ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;")}</${k}>`).join("\n")}\n  </item>`
    ).join("\n");
    content = `<?xml version="1.0" encoding="UTF-8"?>\n<relatorio nome="${label}" gerado="${now}">\n${rows}\n</relatorio>`;
    mime = "application/xml"; ext = "xml";

  } else if (format === "txt") {
    const col = (v: any, w: number) => String(v ?? "").slice(0, w).padEnd(w);
    const widths = keys.map(k => Math.max(k.length, ...data.map(r => String(r[k] ?? "").length), 8));
    const sep = widths.map(w => "-".repeat(w)).join("-+-");
    const header = widths.map((w, i) => keys[i].toUpperCase().padEnd(w)).join(" | ");
    const rows = data.map(r => widths.map((w, i) => col(r[keys[i]], w)).join(" | "));
    content = [`ASTIA PDV — ${label}`, `Gerado: ${now}`, "", header, sep, ...rows, sep, `Total: ${data.length} registros`].join("\n");
    mime = "text/plain"; ext = "txt";

  } else {
    // PDF via print window
    const rows = data.map(r =>
      `<tr>${keys.map(k => `<td>${r[k] ?? ""}</td>`).join("")}</tr>`
    ).join("");
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${label}</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,sans-serif;font-size:11px;padding:15px}
h2{margin-bottom:4px;font-size:14px}p{color:#666;font-size:10px;margin-bottom:12px}
table{width:100%;border-collapse:collapse}th,td{border:1px solid #ddd;padding:4px 8px;text-align:left}
th{background:#1a1a2e;color:#fff;font-weight:600}tr:nth-child(even){background:#f9f9f9}
footer{margin-top:12px;font-size:9px;color:#999;text-align:center}
@media print{@page{margin:10mm}button{display:none}}</style></head><body>
<h2>${label}</h2><p>ASTIA PDV — Gerado em ${now}</p>
<table><thead><tr>${keys.map(k=>`<th>${k}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table>
<footer>ASTIA PDV by VYN Developer — vynmkt.com.br</footer>
<script>window.onload=()=>setTimeout(()=>window.print(),400)</script></body></html>`;
    const win = window.open("", "_blank", "width=900,height=700");
    if (win) { win.document.write(html); win.document.close(); }
    return;
  }

  const a = document.createElement("a");
  a.href = `data:${mime};charset=utf-8,${encodeURIComponent(content)}`;
  a.download = `${filename}.${ext}`;
  a.click();
}

function ExportMenu({ data, filename }: { data: any[]; filename: string }) {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="relative inline-block">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1 px-3 py-1.5 text-xs border rounded-md bg-background hover:bg-muted font-medium"
      >
        <Download className="w-3 h-3" /> Exportar ▾
      </button>
      {open && (
        <div className="absolute right-0 top-8 z-50 bg-white dark:bg-slate-900 border rounded-xl shadow-xl w-40 py-1 text-sm">
          {(["pdf","xml","txt"] as const).map(fmt => (
            <button key={fmt}
              onClick={() => { exportar(data, filename, fmt); setOpen(false); }}
              className="w-full px-4 py-2 text-left hover:bg-muted flex items-center gap-2 capitalize"
            >
              {fmt === "pdf" ? "📄" : fmt === "xml" ? "🗂" : "📝"} {fmt.toUpperCase()}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function imprimirTabela(id: string, titulo: string) {
  const el = document.getElementById(id);
  if (!el) return;
  const win = window.open("", "_blank", "width=900,height=700");
  if (!win) return;
  win.document.write(`<!DOCTYPE html><html><head><title>${titulo}</title>
    <style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,sans-serif;font-size:11px;padding:15px}
    h2{margin-bottom:10px}table{width:100%;border-collapse:collapse}
    th,td{border:1px solid #ccc;padding:4px 8px;text-align:left}th{background:#f0f0f0;font-weight:bold}
    tr:nth-child(even){background:#f9f9f9}@media print{@page{margin:10mm}}</style></head>
    <body><h2>${titulo}</h2>${el.innerHTML}</body></html>`);
  win.document.close();
  setTimeout(() => { win.print(); win.close(); }, 500);
}

// Período padrão: mês atual
const hoje = new Date();
const iniMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().split("T")[0];
const fimMes = hoje.toISOString().split("T")[0];

export default function Relatorios() {
  const { usuario } = useAuth();
  const { toast } = useToast();
  const [ini, setIni] = useState(iniMes);
  const [fim, setFim] = useState(fimMes);
  const [loading, setLoading] = useState(false);
  const [aba, setAba] = useState("vendas");
  const [relVendedor, setRelVendedor] = useState<any[]>([]);
  const [loadingVendedor, setLoadingVendedor] = useState(false);

  // Dados
  const [resumo, setResumo] = useState<any>(null);
  const [vendasDia, setVendasDia] = useState<any[]>([]);
  const [vendasMes, setVendasMes] = useState<any[]>([]);
  const [topProdutos, setTopProdutos] = useState<any[]>([]);
  const [curvaABC, setCurvaABC] = useState<any[]>([]);
  const [formaPag, setFormaPag] = useState<any[]>([]);
  const [porPDV, setPorPDV] = useState<any[]>([]);
  const [rankClientes, setRankClientes] = useState<any[]>([]);
  const [lucro, setLucro] = useState<any>(null);
  const [estoqueCrit, setEstoqueCrit] = useState<any[]>([]);

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [r, vd, vm, tp, abc, fp, pdv, rc, l, ec] = await Promise.all([
        relatoriosAPI.resumo(ini, fim),
        relatoriosAPI.vendasPorDia(ini, fim),
        relatoriosAPI.vendasPorMes(new Date().getFullYear()),
        relatoriosAPI.topProdutos(ini, fim, 20),
        relatoriosAvancadosAPI.curvaABC(ini, fim),
        relatoriosAPI.formaPagamento(ini, fim),
        relatoriosAvancadosAPI.vendasPorPDV(ini, fim),
        relatoriosAvancadosAPI.rankingClientes(ini, fim, 30),
        relatoriosAvancadosAPI.lucroPeriodo(ini, fim),
        relatoriosAPI.estoqueCritico(),
      ]);
      setResumo(r); setVendasDia(vd || []); setVendasMes(vm || []);
      setTopProdutos(tp || []); setCurvaABC(abc || []);
      setFormaPag((fp || []).map((f: any, i: number) => ({ ...f, color: COLORS[i % COLORS.length] })));
      setPorPDV(pdv || []); setRankClientes(rc || []);
      setLucro(l); setEstoqueCrit(ec || []);
    } catch (e: any) {
      toast({ title: "Erro ao carregar relatórios", description: e.message, variant: "destructive" });
    } finally { setLoading(false); }
  };

  const nomeMes: Record<string,string> = { "01":"Jan","02":"Fev","03":"Mar","04":"Abr","05":"Mai","06":"Jun","07":"Jul","08":"Ago","09":"Set","10":"Out","11":"Nov","12":"Dez" };

  return (
    <Layout title="Relatórios">
      <div className="space-y-4">
        {/* Header + filtros */}
        <div className="flex flex-wrap items-end gap-3 justify-between">
          <div>
            <h1 className="text-2xl font-bold">Relatórios</h1>
            <p className="text-muted-foreground text-sm">Análise completa do negócio</p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1"><Label className="text-xs">Data Início</Label><Input type="date" value={ini} onChange={e => setIni(e.target.value)} className="h-8 w-36" /></div>
            <div className="space-y-1"><Label className="text-xs">Data Fim</Label><Input type="date" value={fim} onChange={e => setFim(e.target.value)} className="h-8 w-36" /></div>
            <Button onClick={fetchAll} disabled={loading} className="h-8">
              <RefreshCw className={`w-4 h-4 mr-1 ${loading ? "animate-spin" : ""}`} />
              {loading ? "Carregando..." : "Gerar"}
            </Button>
          </div>
        </div>

        {/* Cards resumo */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Vendas",        val: String(resumo?.total_vendas ?? "—"),    icon: ShoppingCart, color: "text-blue-600" },
            { label: "Receita Total", val: resumo ? fmt(resumo.receita_total) : "—", icon: TrendingUp, color: "text-green-600" },
            { label: "Ticket Médio",  val: resumo ? fmt(resumo.ticket_medio)  : "—", icon: DollarSign, color: "text-purple-600" },
            { label: "Lucro Bruto",   val: lucro  ? fmt(lucro.lucro_bruto)    : "—", icon: BarChart3,  color: "text-amber-600" },
          ].map(m => (
            <Card key={m.label}>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-2 mb-1">
                  <m.icon className={`w-4 h-4 ${m.color}`} />
                  <span className="text-xs text-muted-foreground">{m.label}</span>
                </div>
                <div className={`text-xl font-bold ${m.color}`}>{m.val}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Tabs de relatórios */}
        <Tabs value={aba} onValueChange={setAba}>
          <TabsList className="flex flex-wrap h-auto gap-1">
            <TabsTrigger value="vendas"     className="text-xs flex items-center gap-1"><CalendarDays className="w-3 h-3" />Vendas/Dia</TabsTrigger>
            <TabsTrigger value="mensal"     className="text-xs flex items-center gap-1"><CalendarRange className="w-3 h-3" />Anual/Mês</TabsTrigger>
            <TabsTrigger value="pdv"        className="text-xs flex items-center gap-1"><Monitor className="w-3 h-3" />Por PDV</TabsTrigger>
            <TabsTrigger value="vendedor"   className="text-xs flex items-center gap-1"><UserCheck className="w-3 h-3" />Por Vendedor</TabsTrigger>
            <TabsTrigger value="produtos"   className="text-xs flex items-center gap-1"><PackageSearch className="w-3 h-3" />Produtos</TabsTrigger>
            <TabsTrigger value="abc"        className="text-xs flex items-center gap-1"><BarChart2 className="w-3 h-3" />Curva ABC</TabsTrigger>
            <TabsTrigger value="pagamentos" className="text-xs flex items-center gap-1"><CreditCard className="w-3 h-3" />Pagamentos</TabsTrigger>
            <TabsTrigger value="clientes"   className="text-xs flex items-center gap-1"><UserRound className="w-3 h-3" />Clientes</TabsTrigger>
            <TabsTrigger value="lucro"      className="text-xs flex items-center gap-1"><TrendingUp className="w-3 h-3" />Lucro</TabsTrigger>
            <TabsTrigger value="estoque"    className="text-xs flex items-center gap-1"><AlertCircle className="w-3 h-3" />Estoque Crítico</TabsTrigger>
          </TabsList>

          {/* ── VENDAS POR DIA ── */}
          <TabsContent value="vendas">
            <Card>
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base">Vendas por Dia</CardTitle>
                  <CardDescription>{ini} a {fim}</CardDescription>
                </div>
                <div className="flex gap-2">
                  <ExportMenu data={vendasDia} filename="vendas_dia" />
                  <Button size="sm" variant="outline" onClick={() => imprimirTabela("tbl-vendas-dia","Vendas por Dia")}>
                    <Printer className="w-3 h-3 mr-1" />Imprimir
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={vendasDia}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="data" tickFormatter={d => d?.slice(5) || d} tick={{ fontSize: 11 }} />
                    <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v: any, n: string) => [n === "qtd_vendas" ? `${v} vendas` : fmt(v), n === "qtd_vendas" ? "Qtd." : "Total"]} />
                    <Legend />
                    <Bar yAxisId="left" dataKey="qtd_vendas" name="Qtd. Vendas" fill="#3B82F6" />
                    <Bar yAxisId="right" dataKey="total" name="Total R$" fill="#10B981" />
                  </BarChart>
                </ResponsiveContainer>
                <div className="mt-4 overflow-x-auto">
                  <div id="tbl-vendas-dia">
                    <table className="w-full text-xs border-collapse">
                      <thead><tr className="border-b">{["Data","Qtd.","Total","Dinheiro","Crédito","Débito","PIX"].map(h=><th key={h} className="text-left p-2 font-medium text-muted-foreground">{h}</th>)}</tr></thead>
                      <tbody>
                        {vendasDia.map((r,i) => (
                          <tr key={i} className="border-b hover:bg-muted/40">
                            <td className="p-2 font-mono">{r.data}</td>
                            <td className="p-2">{r.qtd_vendas}</td>
                            <td className="p-2 font-medium">{fmt(r.total)}</td>
                            <td className="p-2">{fmt(r.dinheiro)}</td>
                            <td className="p-2">{fmt(r.credito)}</td>
                            <td className="p-2">{fmt(r.debito)}</td>
                            <td className="p-2">{fmt(r.pix)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── ANUAL POR MÊS ── */}
          <TabsContent value="mensal">
            <Card>
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <CardTitle className="text-base">Vendas Mensais — {new Date().getFullYear()}</CardTitle>
                <ExportMenu data={vendasMes} filename="vendas_mensal" />
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={vendasMes.map(m => ({ ...m, mes: nomeMes[m.mes] || m.mes }))}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v: any) => fmt(v)} />
                    <Legend />
                    <Line type="monotone" dataKey="total" name="Receita" stroke="#3B82F6" strokeWidth={2} dot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── POR PDV ── */}
          <TabsContent value="pdv">
            <Card>
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <div><CardTitle className="text-base">Vendas por PDV</CardTitle><CardDescription>{ini} a {fim}</CardDescription></div>
                <ExportMenu data={porPDV} filename="vendas_pdv" />
              </CardHeader>
              <CardContent>
                {porPDV.length === 0 ? <p className="text-center text-muted-foreground py-8">Nenhum dado</p> : (
                  <div className="space-y-3">
                    {porPDV.map(p => (
                      <Card key={p.numero_pdv} className="border">
                        <CardContent className="pt-4 pb-4">
                          <div className="flex items-center justify-between mb-3">
                            <h3 className="font-bold text-base">PDV #{p.numero_pdv || "—"}</h3>
                            <Badge variant="secondary">{p.qtd_vendas} vendas</Badge>
                          </div>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                            {[
                              { label: "Total", val: fmt(p.total), color: "text-green-600" },
                              { label: "Ticket Médio", val: fmt(p.ticket_medio), color: "" },
                              { label: "Dinheiro", val: fmt(p.dinheiro), color: "" },
                              { label: "PIX", val: fmt(p.pix), color: "" },
                            ].map(c => (
                              <div key={c.label}>
                                <p className="text-xs text-muted-foreground">{c.label}</p>
                                <p className={`font-semibold ${c.color}`}>{c.val}</p>
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── TOP PRODUTOS ── */}
          <TabsContent value="produtos">
            <Card>
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <div><CardTitle className="text-base">Top Produtos</CardTitle><CardDescription>Ordenado por receita</CardDescription></div>
                <div className="flex gap-2">
                  <ExportMenu data={topProdutos} filename="top_produtos" />
                  <Button size="sm" variant="outline" onClick={() => imprimirTabela("tbl-produtos","Top Produtos")}><Printer className="w-3 h-3 mr-1" />Imprimir</Button>
                </div>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={topProdutos.slice(0,10)} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} tick={{ fontSize: 10 }} />
                    <YAxis type="category" dataKey="nome" width={140} tick={{ fontSize: 10 }} />
                    <Tooltip formatter={(v: any) => fmt(v)} />
                    <Bar dataKey="receita" fill="#3B82F6" name="Receita" />
                  </BarChart>
                </ResponsiveContainer>
                <div className="mt-4 overflow-x-auto" id="tbl-produtos">
                  <table className="w-full text-xs border-collapse">
                    <thead><tr className="border-b">{["Produto","Código","Qtd.","Receita","Lucro","Margem"].map(h=><th key={h} className="text-left p-2 font-medium text-muted-foreground">{h}</th>)}</tr></thead>
                    <tbody>
                      {topProdutos.map((p,i) => (
                        <tr key={i} className="border-b hover:bg-muted/40">
                          <td className="p-2 font-medium">{p.nome}</td>
                          <td className="p-2 font-mono text-muted-foreground">{p.codigo_barras || "—"}</td>
                          <td className="p-2">{fmtN(p.qtd_vendida,0)} {p.unidade_medida}</td>
                          <td className="p-2 text-green-600 font-medium">{fmt(p.receita)}</td>
                          <td className="p-2 text-blue-600">{fmt(p.lucro)}</td>
                          <td className="p-2">{p.receita > 0 ? fmtN((p.lucro/p.receita)*100) : "0.00"}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── CURVA ABC ── */}
          <TabsContent value="abc">
            <Card>
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base">Curva ABC de Produtos</CardTitle>
                  <CardDescription>A = 0–70% receita · B = 70–90% · C = 90–100%</CardDescription>
                </div>
                <ExportMenu data={curvaABC} filename="curva_abc" />
              </CardHeader>
              <CardContent>
                <div className="flex gap-4 mb-4">
                  {[
                    { curva: "A", color: "bg-green-100 text-green-800 border-green-300", desc: "Alta rotatividade — críticos para manter em estoque" },
                    { curva: "B", color: "bg-yellow-100 text-yellow-800 border-yellow-300", desc: "Rotatividade média" },
                    { curva: "C", color: "bg-red-100 text-red-800 border-red-300", desc: "Baixa rotatividade — revisar estoque" },
                  ].map(c => (
                    <div key={c.curva} className={`flex-1 p-3 rounded-lg border text-xs ${c.color}`}>
                      <p className="font-bold text-base">{c.curva}</p>
                      <p className="mt-1">{c.desc}</p>
                      <p className="font-medium mt-1">{curvaABC.filter(x => x.curva === c.curva).length} produtos</p>
                    </div>
                  ))}
                </div>
                <div className="overflow-x-auto max-h-80 overflow-y-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead className="sticky top-0 bg-background">
                      <tr className="border-b">{["Curva","Produto","Qtd.","Receita","% Receita","% Acum."].map(h=><th key={h} className="text-left p-2 font-medium text-muted-foreground">{h}</th>)}</tr>
                    </thead>
                    <tbody>
                      {curvaABC.map((p,i) => (
                        <tr key={i} className="border-b hover:bg-muted/40">
                          <td className="p-2">
                            <Badge className={p.curva === "A" ? "bg-green-100 text-green-800" : p.curva === "B" ? "bg-yellow-100 text-yellow-800" : "bg-red-100 text-red-800"}>
                              {p.curva}
                            </Badge>
                          </td>
                          <td className="p-2 font-medium">{p.nome}</td>
                          <td className="p-2">{fmtN(p.qtd_vendida,0)}</td>
                          <td className="p-2 text-green-600">{fmt(p.receita)}</td>
                          <td className="p-2">{fmtN(p.pct_receita)}%</td>
                          <td className="p-2 text-muted-foreground">{fmtN(p.pct_acumulado)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── FORMAS DE PAGAMENTO ── */}
          <TabsContent value="pagamentos">
            <Card>
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <CardTitle className="text-base">Formas de Pagamento</CardTitle>
                <ExportMenu data={formaPag} filename="formas_pag" />
              </CardHeader>
              <CardContent>
                <div className="grid md:grid-cols-2 gap-4">
                  <ResponsiveContainer width="100%" height={260}>
                    <PieChart>
                      <Pie data={formaPag} dataKey="total" nameKey="forma" cx="50%" cy="50%" outerRadius={100} label={({ forma, percent }) => `${forma} ${(percent*100).toFixed(0)}%`}>
                        {formaPag.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v: any) => fmt(v)} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-3">
                    {formaPag.map((f, i) => (
                      <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-muted/40">
                        <div className="w-3 h-3 rounded-full shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                        <div className="flex-1">
                          <p className="font-medium text-sm capitalize">{f.forma}</p>
                          <p className="text-xs text-muted-foreground">{f.qtd} transações</p>
                        </div>
                        <span className="font-bold text-sm">{fmt(f.total)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── RANKING CLIENTES ── */}
          <TabsContent value="clientes">
            <Card>
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <div><CardTitle className="text-base">Ranking de Clientes</CardTitle><CardDescription>Ordenado por total gasto</CardDescription></div>
                <ExportMenu data={rankClientes} filename="ranking_clientes" />
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead><tr className="border-b">{["#","Cliente","Compras","Total Gasto","Ticket Médio","Última Compra"].map(h=><th key={h} className="text-left p-2 font-medium text-muted-foreground">{h}</th>)}</tr></thead>
                    <tbody>
                      {rankClientes.map((c,i) => (
                        <tr key={i} className={`border-b hover:bg-muted/40 ${i < 3 ? "font-medium" : ""}`}>
                          <td className="p-2">
                            <Badge variant={i===0?"default":i===1?"secondary":"outline"}>{i+1}º</Badge>
                          </td>
                          <td className="p-2">{c.nome}</td>
                          <td className="p-2">{c.qtd_compras}x</td>
                          <td className="p-2 text-green-600 font-medium">{fmt(c.total_gasto)}</td>
                          <td className="p-2">{fmt(c.ticket_medio)}</td>
                          <td className="p-2 text-muted-foreground font-mono">{c.ultima_compra?.slice(0,10)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {rankClientes.length === 0 && <p className="text-center py-8 text-muted-foreground">Nenhum cliente identificado nas vendas</p>}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── LUCRO ── */}
          <TabsContent value="lucro">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Demonstrativo de Lucro</CardTitle>
                <CardDescription>{ini} a {fim} — baseado no CMV (custo × qtd vendida)</CardDescription>
              </CardHeader>
              <CardContent>
                {lucro ? (
                  <div className="grid md:grid-cols-2 gap-6">
                    <div className="space-y-3">
                      {[
                        { label: "Receita Bruta",   val: lucro.receita_bruta,  color: "text-green-600", border: "" },
                        { label: "(-) Descontos",    val: -lucro.descontos,     color: "text-red-600",   border: "" },
                        { label: "(-) CMV (custo dos produtos)", val: -lucro.cmv, color: "text-orange-600", border: "" },
                        { label: "= Lucro Bruto",   val: lucro.lucro_bruto,    color: "text-blue-600",  border: "border-t-2 border-blue-200 pt-2 mt-2 font-bold" },
                      ].map(r => (
                        <div key={r.label} className={`flex justify-between items-center ${r.border}`}>
                          <span className="text-sm">{r.label}</span>
                          <span className={`font-semibold ${r.color}`}>{fmt(Math.abs(r.val || 0))}</span>
                        </div>
                      ))}
                      <div className="bg-muted rounded-lg p-3 mt-2">
                        <div className="flex justify-between text-sm"><span className="text-muted-foreground">Margem Bruta</span>
                          <span className="font-bold">{lucro.receita_bruta > 0 ? fmtN((lucro.lucro_bruto/lucro.receita_bruta)*100) : "0.00"}%</span>
                        </div>
                        <div className="flex justify-between text-sm mt-1"><span className="text-muted-foreground">Ticket Médio</span><span className="font-medium">{fmt(lucro.ticket_medio)}</span></div>
                        <div className="flex justify-between text-sm mt-1"><span className="text-muted-foreground">Qtd. Vendas</span><span className="font-medium">{lucro.qtd_vendas}</span></div>
                      </div>
                    </div>
                    <div>
                      <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={[
                          { name: "Receita", val: lucro.receita_bruta },
                          { name: "CMV", val: lucro.cmv },
                          { name: "Lucro Bruto", val: lucro.lucro_bruto },
                        ]}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                          <YAxis tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                          <Tooltip formatter={(v: any) => fmt(v)} />
                          <Bar dataKey="val" fill="#3B82F6">
                            {[{ fill:"#10B981"},{fill:"#EF4444"},{fill:"#3B82F6"}].map((c,i) => <Cell key={i} {...c} />)}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                      <p className="text-xs text-muted-foreground mt-2 text-center">
                        Para ver o Lucro Real (descontando despesas), acesse a aba <strong>Financeiro → Lucro Real</strong>
                      </p>
                    </div>
                  </div>
                ) : <p className="text-center py-8 text-muted-foreground">Nenhum dado disponível</p>}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── ESTOQUE CRÍTICO ── */}
          <TabsContent value="vendedor">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold flex items-center gap-2"><UserCheck className="w-4 h-4 text-violet-500" />Vendas por Vendedor</h3>
              <ExportMenu data={relVendedor} filename="vendas_por_vendedor" />
            </div>
            {loadingVendedor ? (
              <div className="text-center py-8 text-muted-foreground">Carregando...</div>
            ) : relVendedor.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">Nenhum dado no período</div>
            ) : (
              <div className="space-y-3">
                {/* Chart */}
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={relVendedor}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="nome" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(v: any) => `R$ ${Number(v).toFixed(2)}`} />
                      <Bar dataKey="total" fill="#7c3aed" radius={[4,4,0,0]} name="Total" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                {/* Table */}
                <table className="w-full text-sm">
                  <thead><tr className="border-b">
                    <th className="text-left py-2 font-semibold">Vendedor</th>
                    <th className="text-right py-2 font-semibold">Qtd. Vendas</th>
                    <th className="text-right py-2 font-semibold">Total</th>
                    <th className="text-right py-2 font-semibold">Ticket Médio</th>
                  </tr></thead>
                  <tbody>
                    {relVendedor.map((v, i) => (
                      <tr key={i} className="border-b hover:bg-muted/40">
                        <td className="py-2 flex items-center gap-2"><User className="w-4 h-4 text-violet-400" />{v.nome}</td>
                        <td className="text-right py-2">{v.qtd}</td>
                        <td className="text-right py-2 font-semibold text-green-600">R$ {Number(v.total).toFixed(2)}</td>
                        <td className="text-right py-2 text-muted-foreground">R$ {v.qtd > 0 ? (v.total/v.qtd).toFixed(2) : "0.00"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </TabsContent>

          <TabsContent value="estoque">
            <Card>
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                    Estoque Crítico ({estoqueCrit.length} produtos)
                  </CardTitle>
                </div>
                <ExportMenu data={estoqueCrit} filename="estoque_critico" />
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead><tr className="border-b">{["Produto","Categoria","Estoque Atual","Estoque Mínimo","Situação"].map(h=><th key={h} className="text-left p-2 font-medium text-muted-foreground">{h}</th>)}</tr></thead>
                    <tbody>
                      {estoqueCrit.map((p,i) => (
                        <tr key={i} className="border-b hover:bg-muted/40">
                          <td className="p-2 font-medium">{p.nome}</td>
                          <td className="p-2 text-muted-foreground">{p.categoria_nome || "—"}</td>
                          <td className={`p-2 font-mono font-bold ${p.estoque_atual <= 0 ? "text-red-600" : "text-amber-600"}`}>{fmtN(p.estoque_atual,0)}</td>
                          <td className="p-2 font-mono text-muted-foreground">{fmtN(p.estoque_minimo,0)}</td>
                          <td className="p-2">
                            <Badge variant={p.estoque_atual <= 0 ? "destructive" : "secondary"}>
                              {p.estoque_atual <= 0 ? "Sem estoque" : "Estoque baixo"}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                      {estoqueCrit.length === 0 && (
                        <tr><td colSpan={5} className="text-center py-8 text-muted-foreground">Todos os produtos com estoque adequado ✓</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
