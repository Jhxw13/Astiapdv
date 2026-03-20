import { useState, useEffect } from "react";
import { Layout } from "@/components/layout/Layout";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { SalesChart } from "@/components/dashboard/SalesChart";
import { TopProducts } from "@/components/dashboard/TopProducts";
import { RecentSales } from "@/components/dashboard/RecentSales";
import { AnalyticsInsights } from "@/components/analytics/AnalyticsInsights";
import { relatoriosAPI, produtosAPI, clientesAPI } from "@/lib/api";
import { DollarSign, Users, CreditCard, Activity, TrendingUp, Package, AlertTriangle } from "lucide-react";

export default function Dashboard() {
  const hoje = new Date();
  const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().split("T")[0];
  const fim = hoje.toISOString().split("T")[0];

  const [resumo, setResumo] = useState<any>(null);
  const [totalProdutos, setTotalProdutos] = useState(0);
  const [estoqueBaixo, setEstoqueBaixo] = useState(0);
  const [totalClientes, setTotalClientes] = useState(0);
  const [produtosVencendo, setProdutosVencendo] = useState<any[]>([]);

  useEffect(() => {
    const load = async () => {
      try {
        const [r, prods, clientes] = await Promise.all([
          relatoriosAPI.resumo(inicio, fim),
          produtosAPI.listar({ ativo: 1 }),
          clientesAPI.listar({ ativo: 1 }),
        ]);
        setResumo(r);
        setTotalProdutos((prods || []).length);
        setEstoqueBaixo((prods || []).filter((p: any) => p.estoque_atual <= p.estoque_minimo).length);
        const agora = Date.now();
        const vencendo = (prods || []).filter((p: any) => {
          if (!p.data_validade) return false;
          const dias = Math.floor((new Date(p.data_validade).getTime() - agora) / 86400000);
          return dias <= (p.dias_validade_alerta || 30);
        });
        setProdutosVencendo(vencendo);
        setTotalClientes((clientes || []).length);
      } catch {}
    };
    load();
  }, []);

  const fmt = (v: number) => `R$ ${(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;

  return (
    <Layout title="Dashboard">
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <MetricCard title="Receita do Mês" value={fmt(resumo?.receita_total || 0)} change={resumo?.total_vendas ? `${resumo.total_vendas} vendas` : "Sem vendas"} changeType={resumo?.receita_total > 0 ? "positive" : "neutral"} icon={DollarSign} />
          <MetricCard title="Vendas do Mês" value={(resumo?.total_vendas || 0).toString()} change={resumo?.ticket_medio ? `Ticket médio: ${fmt(resumo.ticket_medio)}` : "Nenhuma venda"} changeType={resumo?.total_vendas > 0 ? "positive" : "neutral"} icon={CreditCard} />
          <MetricCard title="Clientes Ativos" value={totalClientes.toString()} change={`${totalClientes} clientes cadastrados`} changeType={totalClientes > 0 ? "positive" : "neutral"} icon={Users} />
          <MetricCard title="Produtos" value={totalProdutos.toString()} change={estoqueBaixo > 0 ? `${estoqueBaixo} com estoque baixo` : "Estoque adequado"} changeType={estoqueBaixo > 0 ? "negative" : "positive"} icon={estoqueBaixo > 0 ? AlertTriangle : Package} />
        </div>

        {/* Alerta de validade */}
        {produtosVencendo.length > 0 && (
          <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold text-red-700 dark:text-red-300">
                  {produtosVencendo.filter((p: any) => new Date(p.data_validade).getTime() < Date.now()).length > 0
                    ? `⛔ ${produtosVencendo.filter((p: any) => new Date(p.data_validade).getTime() < Date.now()).length} produto(s) VENCIDO(s)!`
                    : `⚠️ ${produtosVencendo.length} produto(s) próximo(s) do vencimento`}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {produtosVencendo.slice(0, 8).map((p: any) => {
                    const dias = Math.floor((new Date(p.data_validade).getTime() - Date.now()) / 86400000);
                    return (
                      <span key={p.id} className={`text-xs px-2 py-1 rounded-full font-medium ${dias < 0 ? "bg-red-200 dark:bg-red-900 text-red-800 dark:text-red-200" : "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200"}`}>
                        {p.nome} · {dias < 0 ? `VENCIDO há ${Math.abs(dias)}d` : `${dias}d`}
                      </span>
                    );
                  })}
                  {produtosVencendo.length > 8 && <span className="text-xs text-muted-foreground">+{produtosVencendo.length - 8} mais</span>}
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-7">
          <SalesChart />
          <TopProducts />
        </div>

        {/* Alerta de validade */}
        {produtosVencendo.length > 0 && (
          <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold text-red-700 dark:text-red-300">
                  {produtosVencendo.filter((p: any) => new Date(p.data_validade).getTime() < Date.now()).length > 0
                    ? `⛔ ${produtosVencendo.filter((p: any) => new Date(p.data_validade).getTime() < Date.now()).length} produto(s) VENCIDO(s)!`
                    : `⚠️ ${produtosVencendo.length} produto(s) próximo(s) do vencimento`}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {produtosVencendo.slice(0, 8).map((p: any) => {
                    const dias = Math.floor((new Date(p.data_validade).getTime() - Date.now()) / 86400000);
                    return (
                      <span key={p.id} className={`text-xs px-2 py-1 rounded-full font-medium ${dias < 0 ? "bg-red-200 dark:bg-red-900 text-red-800 dark:text-red-200" : "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200"}`}>
                        {p.nome} · {dias < 0 ? `VENCIDO há ${Math.abs(dias)}d` : `${dias}d`}
                      </span>
                    );
                  })}
                  {produtosVencendo.length > 8 && <span className="text-xs text-muted-foreground">+{produtosVencendo.length - 8} mais</span>}
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-7">
          <RecentSales />
          <div className="col-span-4 grid gap-4 md:grid-cols-2">
            <MetricCard title="Ticket Médio" value={fmt(resumo?.ticket_medio || 0)} change="Baseado nas vendas do mês" changeType="positive" icon={Activity} />
            <MetricCard title="Total de Descontos" value={fmt(resumo?.total_descontos || 0)} change="No mês atual" changeType="neutral" icon={TrendingUp} />
          </div>
        </div>

        <AnalyticsInsights />
      </div>
    </Layout>
  );
}
