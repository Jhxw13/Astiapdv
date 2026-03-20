/**
 * ASTIA PDV — Relatórios E-commerce v1.0
 * EXCLUSIVO para pedidos online — NUNCA mistura com vendas do PDV
 */
import { useState, useEffect } from "react";
import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { ecommerceAPI } from "@/lib/api";
import {
  Globe, TrendingUp, ShoppingBag, Users, Truck,
  RefreshCw, Download, Package, XCircle
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";

const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);

const STATUS_LABELS: Record<string, string> = {
  recebido: "Recebido", confirmado: "Confirmado", em_preparo: "Em Preparo",
  saiu: "Saiu", entregue: "Entregue", pronto_retirada: "Pronto Retirada",
  retirado: "Retirado", cancelado: "Cancelado",
};

const STATUS_CORES: Record<string, string> = {
  recebido: "#94a3b8", confirmado: "#3b82f6", em_preparo: "#f59e0b",
  saiu: "#8b5cf6", entregue: "#10b981", pronto_retirada: "#06b6d4",
  retirado: "#10b981", cancelado: "#ef4444",
};

export default function RelatoriosEcommerce() {
  const { toast } = useToast();

  const hoje     = new Date().toISOString().split("T")[0];
  const mesInicio = new Date(new Date().setDate(1)).toISOString().split("T")[0];

  const [inicio, setInicio] = useState(mesInicio);
  const [fim, setFim]       = useState(hoje);
  const [dados, setDados]   = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => { buscar(); }, []);

  const buscar = async () => {
    setLoading(true);
    try {
      const r = await ecommerceAPI.relatorio(inicio, fim);
      setDados(r);
    } catch (e: any) {
      toast({ title: "Erro ao carregar relatório", description: e.message, variant: "destructive" });
    } finally { setLoading(false); }
  };

  const exportarCSV = () => {
    if (!dados) return;
    const linhas = [
      ["Relatório E-commerce ASTIA PDV"],
      [`Período: ${inicio} a ${fim}`],
      [],
      ["RESUMO"],
      ["Total de Pedidos", dados.resumo?.total_pedidos],
      ["Pedidos Ativos", dados.resumo?.pedidos_ativos],
      ["Pedidos Cancelados", dados.resumo?.pedidos_cancelados],
      ["Retiradas", dados.resumo?.retiradas],
      ["Entregas", dados.resumo?.entregas],
      ["Receita Produtos", dados.resumo?.receita_produtos?.toFixed(2)],
      ["Receita Frete", dados.resumo?.receita_frete?.toFixed(2)],
      ["Receita Total", dados.resumo?.receita_total?.toFixed(2)],
      ["Clientes Únicos", dados.resumo?.clientes_unicos],
      [],
      ["VENDAS POR DIA"],
      ["Data", "Pedidos", "Receita"],
      ...(dados.por_dia || []).map((d: any) => [d.data, d.pedidos, Number(d.receita).toFixed(2)]),
      [],
      ["TOP PRODUTOS"],
      ["Produto", "Qtd Vendida", "Receita"],
      ...(dados.top_produtos || []).map((p: any) => [p.nome_produto, p.qtd_vendida, Number(p.receita).toFixed(2)]),
    ];
    const csv = "\uFEFF" + linhas.map(l => l.join(";")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = `relatorio_ecommerce_${inicio}_${fim}.csv`;
    a.click();
    toast({ title: "CSV exportado!" });
  };

  const resumo = dados?.resumo;

  return (
    <Layout title="Relatórios E-commerce">
      <div className="space-y-4">

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Globe className="w-6 h-6" /> Relatórios E-commerce
            </h1>
            <p className="text-sm text-muted-foreground">
              Exclusivo pedidos online — separado dos relatórios do PDV
            </p>
          </div>
          <Badge variant="outline" className="text-xs px-3 py-1 border-primary text-primary">
            🌐 Somente vendas online
          </Badge>
        </div>

        {/* Filtro período */}
        <div className="flex gap-2 items-end flex-wrap">
          <div>
            <Label className="text-xs">De</Label>
            <Input type="date" value={inicio} onChange={e => setInicio(e.target.value)} className="h-8 w-36" />
          </div>
          <div>
            <Label className="text-xs">Até</Label>
            <Input type="date" value={fim} onChange={e => setFim(e.target.value)} className="h-8 w-36" />
          </div>
          <Button size="sm" onClick={buscar} disabled={loading}>
            <RefreshCw className={`w-3.5 h-3.5 mr-1 ${loading ? "animate-spin" : ""}`} />
            {loading ? "Carregando..." : "Atualizar"}
          </Button>
          <Button size="sm" variant="outline" onClick={exportarCSV} disabled={!dados || loading}>
            <Download className="w-3.5 h-3.5 mr-1" />CSV
          </Button>
          {/* Atalhos de período */}
          <div className="flex gap-1 ml-auto">
            {[
              { label: "Hoje", ini: hoje, fim: hoje },
              { label: "7 dias", ini: new Date(Date.now()-6*86400000).toISOString().split("T")[0], fim: hoje },
              { label: "Mês", ini: mesInicio, fim: hoje },
            ].map(p => (
              <Button key={p.label} size="sm" variant="ghost" className="text-xs h-8"
                onClick={() => { setInicio(p.ini); setFim(p.fim); }}>
                {p.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Cards resumo */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: "Receita Total",      val: fmt(resumo?.receita_total || 0),      icon: TrendingUp,  cor: "text-green-600" },
            { label: "Pedidos",            val: resumo?.total_pedidos || 0,            icon: ShoppingBag, cor: "text-blue-600" },
            { label: "Clientes Únicos",    val: resumo?.clientes_unicos || 0,          icon: Users,       cor: "text-purple-600" },
            { label: "Cancelados",         val: resumo?.pedidos_cancelados || 0,       icon: XCircle,     cor: "text-red-500" },
          ].map(card => {
            const Icon = card.icon;
            return (
              <Card key={card.label}>
                <CardContent className="pt-4 pb-4 flex items-center gap-3">
                  <Icon className={`w-6 h-6 shrink-0 ${card.cor}`} />
                  <div>
                    <p className="text-xs text-muted-foreground">{card.label}</p>
                    <p className={`text-xl font-bold ${card.cor}`}>{card.val}</p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Linha 2 resumo */}
        <div className="grid grid-cols-3 gap-3">
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground">Receita Produtos</p>
              <p className="text-lg font-bold">{fmt(resumo?.receita_produtos || 0)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground">Receita Frete</p>
              <p className="text-lg font-bold">{fmt(resumo?.receita_frete || 0)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4 flex justify-between items-center">
              <div>
                <p className="text-xs text-muted-foreground">Retiradas</p>
                <p className="text-lg font-bold">{resumo?.retiradas || 0}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Entregas</p>
                <p className="text-lg font-bold">{resumo?.entregas || 0}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Gráfico vendas por dia */}
        {dados?.por_dia?.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Receita por Dia</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={dados.por_dia}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="data" tick={{ fontSize: 11 }}
                    tickFormatter={v => new Date(v + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} />
                  <YAxis tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: any) => fmt(v)} labelFormatter={l =>
                    new Date(l + "T12:00:00").toLocaleDateString("pt-BR")} />
                  <Bar dataKey="receita" fill="#7c3aed" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        <div className="grid lg:grid-cols-2 gap-4">
          {/* Por status */}
          {dados?.por_status?.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Pedidos por Status</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {dados.por_status.map((s: any) => {
                    const pct = resumo?.total_pedidos > 0
                      ? Math.round((s.qtd / resumo.total_pedidos) * 100) : 0;
                    return (
                      <div key={s.status} className="space-y-1">
                        <div className="flex justify-between text-sm">
                          <span className="font-medium">{STATUS_LABELS[s.status] || s.status}</span>
                          <span className="text-muted-foreground">{s.qtd} ({pct}%)</span>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all"
                            style={{ width: `${pct}%`, backgroundColor: STATUS_CORES[s.status] || "#94a3b8" }} />
                        </div>
                        {s.valor > 0 && (
                          <p className="text-xs text-muted-foreground text-right">{fmt(s.valor)}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Top produtos */}
          {dados?.top_produtos?.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Top Produtos Online</CardTitle>
                <CardDescription>Mais vendidos pelo e-commerce</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {dados.top_produtos.slice(0, 10).map((p: any, i: number) => (
                    <div key={i} className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground w-5 text-right font-mono">{i + 1}.</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{p.nome_produto}</p>
                        <p className="text-xs text-muted-foreground">{p.qtd_vendida} und. vendidas</p>
                      </div>
                      <span className="text-sm font-bold text-green-600 shrink-0">{fmt(p.receita)}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Vazio */}
        {!loading && dados && !dados.por_dia?.length && (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <Globe className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">Nenhum pedido online no período</p>
              <p className="text-sm mt-1">Sincronize o Supabase em Pedidos Online para importar.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
}
