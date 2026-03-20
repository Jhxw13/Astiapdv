import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { vendasAPI } from "@/lib/api";

export function RecentSales() {
  const [vendas, setVendas] = useState<any[]>([]);

  useEffect(() => {
    vendasAPI.listar({ status: "concluida" }).then(d => setVendas((d || []).slice(0, 5))).catch(() => {});
  }, []);

  return (
    <Card className="col-span-3 glass-card">
      <CardHeader>
        <CardTitle>Vendas Recentes</CardTitle>
        <CardDescription>Últimas 5 vendas</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {vendas.length === 0 && <p className="text-muted-foreground text-sm text-center py-4">Nenhuma venda recente</p>}
          {vendas.map(v => (
            <div key={v.id} className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{v.numero}</p>
                <p className="text-xs text-muted-foreground">{v.cliente_nome || "Cliente não informado"}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold">R$ {Number(v.total).toFixed(2)}</p>
                <Badge variant="outline" className="text-xs">{v.forma_pagamento}</Badge>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
