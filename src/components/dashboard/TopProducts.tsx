import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { relatoriosAPI } from "@/lib/api";

export function TopProducts() {
  const [products, setProducts] = useState<any[]>([]);
  const hoje = new Date();
  const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().split("T")[0];
  const fim = hoje.toISOString().split("T")[0];

  useEffect(() => {
    relatoriosAPI.topProdutos(inicio, fim, 5).then(d => setProducts(d || [])).catch(() => {});
  }, []);

  return (
    <Card className="col-span-3 glass-card">
      <CardHeader>
        <CardTitle>Top Produtos</CardTitle>
        <CardDescription>Mais vendidos no mês</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {products.length === 0 && <p className="text-muted-foreground text-sm text-center py-4">Nenhuma venda no período</p>}
          {products.map((p, i) => (
            <div key={i} className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-muted-foreground w-5">{i + 1}.</span>
                <div>
                  <p className="text-sm font-medium leading-tight">{p.nome}</p>
                  <p className="text-xs text-muted-foreground">{p.qtd_vendida} unidades</p>
                </div>
              </div>
              <span className="text-sm font-semibold">R$ {Number(p.receita).toFixed(2)}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
