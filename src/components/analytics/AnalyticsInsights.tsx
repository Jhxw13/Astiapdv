import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, Info } from "lucide-react";

export function AnalyticsInsights() {
  return (
    <Card className="glass-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="w-5 h-5" />
          Insights
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Info className="w-4 h-4" />
          <span>Acesse a página de Relatórios para análises detalhadas do período.</span>
        </div>
      </CardContent>
    </Card>
  );
}
