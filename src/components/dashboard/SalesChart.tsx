import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { relatoriosAPI } from "@/lib/api";

export function SalesChart() {
  const [data, setData] = useState<any[]>([]);
  const hoje = new Date();
  const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().split("T")[0];
  const fim = hoje.toISOString().split("T")[0];

  useEffect(() => {
    relatoriosAPI.vendasPorDia(inicio, fim).then(d => setData(d || [])).catch(() => {});
  }, []);

  return (
    <Card className="col-span-4 glass-card">
      <CardHeader>
        <CardTitle>Vendas do Mês</CardTitle>
        <CardDescription>Faturamento diário</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="data" tickFormatter={d => d?.slice(8) || d} />
            <YAxis tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} />
            <Tooltip formatter={(v: any) => [`R$ ${Number(v).toFixed(2)}`, "Total"]} />
            <Bar dataKey="total" fill="hsl(var(--primary))" radius={[4,4,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
