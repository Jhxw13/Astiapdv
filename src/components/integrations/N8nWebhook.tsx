import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Webhook, Send, Settings } from "lucide-react";

interface N8nWebhookProps {
  title?: string;
  description?: string;
  defaultUrl?: string;
  onSuccess?: (data: any) => void;
  payload?: Record<string, any>;
}

export const N8nWebhook: React.FC<N8nWebhookProps> = ({
  title = "Integração N8N",
  description = "Configure seu webhook do N8N",
  defaultUrl = "",
  onSuccess,
  payload = {}
}) => {
  const [webhookUrl, setWebhookUrl] = useState(defaultUrl);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleTrigger = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!webhookUrl) {
      toast({
        title: "Erro",
        description: "Por favor, insira a URL do webhook do N8N",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    console.log("Disparando webhook N8N:", webhookUrl);

    try {
      const requestPayload = {
        timestamp: new Date().toISOString(),
        triggered_from: window.location.origin,
        source: "pdv-system",
        ...payload
      };

      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        mode: "no-cors", // Para lidar com CORS
        body: JSON.stringify(requestPayload),
      });

      // Como estamos usando no-cors, não conseguimos verificar o status da resposta
      // Mas podemos assumir que foi enviado com sucesso
      toast({
        title: "Webhook Enviado",
        description: "A requisição foi enviada para o N8N. Verifique o histórico do seu workflow para confirmar.",
      });

      if (onSuccess) {
        onSuccess(requestPayload);
      }

    } catch (error) {
      console.error("Erro ao disparar webhook:", error);
      toast({
        title: "Erro",
        description: "Falha ao disparar o webhook do N8N. Verifique a URL e tente novamente.",
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
          <Webhook className="h-5 w-5" />
          {title}
        </CardTitle>
        <p className="text-sm text-muted-foreground">{description}</p>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleTrigger} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="webhook-url">URL do Webhook N8N</Label>
            <Input
              id="webhook-url"
              type="url"
              placeholder="https://seu-n8n.exemplo.com/webhook/..."
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              required
            />
            <p className="text-xs text-muted-foreground">
              Cole aqui a URL do webhook que você criou no N8N
            </p>
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
                  Enviando...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  Disparar N8N
                </>
              )}
            </Button>
            
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                window.open('https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.webhook/', '_blank');
              }}
            >
              <Settings className="h-4 w-4 mr-2" />
              Ajuda N8N
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};