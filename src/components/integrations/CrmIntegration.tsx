import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Users, Send, Settings, Zap } from "lucide-react";

interface CrmIntegrationProps {
  customerData?: {
    name: string;
    email?: string;
    phone?: string;
  };
  saleData?: {
    saleNumber: number;
    total: number;
    date: string;
    paymentMethod: string;
  };
  onSuccess?: (data: any) => void;
}

export const CrmIntegration: React.FC<CrmIntegrationProps> = ({
  customerData,
  saleData,
  onSuccess
}) => {
  const [webhookUrl, setWebhookUrl] = useState("");
  const [crmType, setCrmType] = useState("hubspot");
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleSyncToCrm = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!webhookUrl) {
      toast({
        title: "Erro",
        description: "Por favor, insira a URL do webhook do N8N para integração com CRM",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    console.log("Sincronizando com CRM via N8N:", webhookUrl);

    try {
      const payload = {
        timestamp: new Date().toISOString(),
        source: "pdv-system",
        event: "customer_sale_sync",
        crm_type: crmType,
        customer: customerData || {
          name: "Cliente Não Identificado",
          email: null,
          phone: null
        },
        sale: saleData || null,
        metadata: {
          integration_type: "n8n_webhook",
          triggered_from: window.location.origin
        }
      };

      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        mode: "no-cors", // Para lidar com CORS
        body: JSON.stringify(payload),
      });

      toast({
        title: "Sincronização Enviada",
        description: `Dados enviados para ${crmType.toUpperCase()} via N8N. Verifique o histórico do seu workflow para confirmar.`,
      });

      if (onSuccess) {
        onSuccess(payload);
      }

    } catch (error) {
      console.error("Erro ao sincronizar com CRM:", error);
      toast({
        title: "Erro",
        description: "Falha ao sincronizar com o CRM. Verifique a URL do webhook e tente novamente.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          Integração CRM via N8N
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Sincronize dados de clientes e vendas com seu CRM usando workflows N8N
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSyncToCrm} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="crm-type">Tipo de CRM</Label>
              <Select value={crmType} onValueChange={setCrmType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="hubspot">HubSpot</SelectItem>
                  <SelectItem value="salesforce">Salesforce</SelectItem>
                  <SelectItem value="pipedrive">Pipedrive</SelectItem>
                  <SelectItem value="zoho">Zoho CRM</SelectItem>
                  <SelectItem value="custom">CRM Personalizado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="webhook-url">URL do Webhook N8N</Label>
              <Input
                id="webhook-url"
                type="url"
                placeholder="https://seu-n8n.exemplo.com/webhook/crm-sync"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                required
              />
            </div>
          </div>

          {/* Prévia dos dados */}
          <div className="bg-muted p-4 rounded-lg space-y-2">
            <h4 className="font-medium text-sm">Dados que serão enviados:</h4>
            <div className="text-xs space-y-1">
              {customerData && (
                <div>
                  <strong>Cliente:</strong> {customerData.name}
                  {customerData.email && ` (${customerData.email})`}
                  {customerData.phone && ` - ${customerData.phone}`}
                </div>
              )}
              {saleData && (
                <div>
                  <strong>Venda:</strong> #{saleData.saleNumber} - R$ {saleData.total.toFixed(2)} 
                  ({saleData.paymentMethod})
                </div>
              )}
              <div><strong>CRM:</strong> {crmType.toUpperCase()}</div>
            </div>
          </div>
          
          <div className="flex gap-2">
            <Button 
              type="submit" 
              disabled={isLoading || !webhookUrl}
              className="flex items-center gap-2"
            >
              {isLoading ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Sincronizando...
                </>
              ) : (
                <>
                  <Zap className="h-4 w-4" />
                  Sincronizar com CRM
                </>
              )}
            </Button>
            
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                window.open('https://docs.n8n.io/integrations/builtin/app-nodes/', '_blank');
              }}
            >
              <Settings className="h-4 w-4 mr-2" />
              Configurar CRM no N8N
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};