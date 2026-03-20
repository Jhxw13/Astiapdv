/**
 * ASTIA PDV — Pedidos Online v1.0
 * SEPARADO do PDV — nunca mistura com vendas locais
 * Gerencia pedidos vindos do site (Supabase → ASTIA)
 */
import { useState, useEffect } from "react";
import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { ecommerceAPI, configAPI } from "@/lib/api";
import {
  ShoppingBag, RefreshCw, Eye, Phone, MapPin,
  Package, Truck, CheckCircle, XCircle, Clock,
  ChevronLeft, Globe, AlertCircle
} from "lucide-react";

const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);

const STATUS_CONFIG: Record<string, { label: string; cor: "default"|"secondary"|"destructive"|"outline"; icon: any }> = {
  recebido:         { label: "Recebido",          cor: "secondary",    icon: Clock },
  confirmado:       { label: "Confirmado",         cor: "default",      icon: CheckCircle },
  em_preparo:       { label: "Em Preparo",         cor: "default",      icon: Package },
  saiu:             { label: "Saiu p/ Entrega",    cor: "default",      icon: Truck },
  entregue:         { label: "Entregue",           cor: "default",      icon: CheckCircle },
  pronto_retirada:  { label: "Pronto Retirada",    cor: "default",      icon: Package },
  retirado:         { label: "Retirado",           cor: "default",      icon: CheckCircle },
  cancelado:        { label: "Cancelado",          cor: "destructive",  icon: XCircle },
};

const PROXIMOS_STATUS: Record<string, string[]> = {
  recebido:        ["confirmado", "cancelado"],
  confirmado:      ["em_preparo", "cancelado"],
  em_preparo:      ["saiu", "pronto_retirada", "cancelado"],
  saiu:            ["entregue"],
  pronto_retirada: ["retirado"],
  entregue:        [],
  retirado:        [],
  cancelado:       [],
};

export default function PedidosOnline() {
  const { toast } = useToast();
  const { usuario } = useAuth();

  const [pedidos, setPedidos]       = useState<any[]>([]);
  const [loading, setLoading]       = useState(true);
  const [sincronizando, setSinc]    = useState(false);
  const [filtroStatus, setFiltro]   = useState("");
  const [busca, setBusca]           = useState("");
  const [pedidoDetalhe, setDetalhe] = useState<any>(null);
  const [itensDetalhe, setItens]    = useState<any[]>([]);
  const [config, setConfig]         = useState<any>({});

  const hoje = new Date().toISOString().split("T")[0];
  const [inicio, setInicio] = useState(hoje);
  const [fim, setFim]       = useState(hoje);

  useEffect(() => {
    carregarConfig();
    carregarPedidos();
  }, []);

  const carregarConfig = async () => {
    try { setConfig(await configAPI.get() || {}); } catch {}
  };

  const carregarPedidos = async () => {
    setLoading(true);
    try {
      const r = await ecommerceAPI.pedidos({
        status: filtroStatus || undefined,
        inicio, fim,
        busca: busca || undefined,
      });
      setPedidos(r || []);
    } catch (e: any) {
      toast({ title: "Erro ao carregar pedidos", description: e.message, variant: "destructive" });
    } finally { setLoading(false); }
  };

  const sincronizar = async () => {
    if (!config.ecommerce_supabase_url || !config.ecommerce_supabase_key) {
      toast({ title: "Configure o Supabase em Configurações → Loja Online", variant: "destructive" }); return;
    }
    setSinc(true);
    try {
      const r = await ecommerceAPI.sincronizarSupabase(
        config.ecommerce_supabase_url,
        config.ecommerce_supabase_key
      );
      toast({ title: `✅ ${r.importados} novo(s) pedido(s) importado(s)` });
      carregarPedidos();
    } catch (e: any) {
      toast({ title: "Erro na sincronização", description: e.message, variant: "destructive" });
    } finally { setSinc(false); }
  };

  const atualizarStatus = async (id: number, status: string) => {
    try {
      await ecommerceAPI.atualizarStatus(id, status);
      toast({ title: `Status atualizado: ${STATUS_CONFIG[status]?.label}` });
      if (pedidoDetalhe?.id === id) setDetalhe((p: any) => ({ ...p, status }));
      carregarPedidos();
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
  };

  const verDetalhe = async (pedido: any) => {
    setDetalhe(pedido);
    try { setItens(await ecommerceAPI.itensPedido(pedido.id) || []); }
    catch { setItens([]); }
  };

  const pendentes = pedidos.filter(p => p.status === "recebido").length;

  return (
    <Layout title="Pedidos Online">
      <div className="space-y-4">

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Globe className="w-6 h-6" /> Pedidos Online
            </h1>
            <p className="text-sm text-muted-foreground">Exclusivo e-commerce — separado das vendas do PDV</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={sincronizar} disabled={sincronizando}>
              <RefreshCw className={`w-4 h-4 mr-2 ${sincronizando ? "animate-spin" : ""}`} />
              {sincronizando ? "Sincronizando..." : "Sincronizar Supabase"}
            </Button>
          </div>
        </div>

        {/* Aviso se não configurado */}
        {!config.ecommerce_supabase_url && (
          <div className="flex items-center gap-3 p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-300 rounded-xl text-sm text-amber-800 dark:text-amber-300">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <span>Supabase não configurado. Vá em <strong>Configurações → Loja Online</strong> para conectar.</span>
          </div>
        )}

        {/* Badge pendentes */}
        {pendentes > 0 && (
          <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-950/30 border border-red-300 rounded-xl text-sm font-medium text-red-700">
            <Clock className="w-4 h-4" />
            {pendentes} pedido{pendentes > 1 ? "s" : ""} aguardando confirmação!
          </div>
        )}

        {/* Filtros */}
        <div className="flex gap-2 flex-wrap items-end">
          <div>
            <Label className="text-xs">De</Label>
            <Input type="date" value={inicio} onChange={e => setInicio(e.target.value)} className="h-8 w-36" />
          </div>
          <div>
            <Label className="text-xs">Até</Label>
            <Input type="date" value={fim} onChange={e => setFim(e.target.value)} className="h-8 w-36" />
          </div>
          <div className="w-40">
            <Label className="text-xs">Status</Label>
            <Select value={filtroStatus} onValueChange={setFiltro}>
              <SelectTrigger className="h-8"><SelectValue placeholder="Todos" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">Todos</SelectItem>
                {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1 min-w-40">
            <Label className="text-xs">Buscar</Label>
            <Input placeholder="Nome, telefone ou número..." value={busca}
              onChange={e => setBusca(e.target.value)} className="h-8" />
          </div>
          <Button size="sm" onClick={carregarPedidos} disabled={loading}>
            {loading ? "..." : "Buscar"}
          </Button>
        </div>

        {/* Tabela */}
        <Card>
          <CardContent className="pt-3 overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b">
                  {["Número","Cliente","Telefone","Tipo","Total","Status","Data","Ações"].map(h =>
                    <th key={h} className="text-left p-2 text-xs font-medium text-muted-foreground">{h}</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {loading && <tr><td colSpan={8} className="text-center py-8 text-muted-foreground">Carregando...</td></tr>}
                {!loading && pedidos.length === 0 && (
                  <tr><td colSpan={8} className="text-center py-8 text-muted-foreground">
                    Nenhum pedido online. Clique em "Sincronizar Supabase" para importar.
                  </td></tr>
                )}
                {pedidos.map(p => {
                  const st = STATUS_CONFIG[p.status] || { label: p.status, cor: "outline", icon: Clock };
                  return (
                    <tr key={p.id} className="border-b hover:bg-muted/40">
                      <td className="p-2 font-mono text-xs font-bold text-primary">{p.numero}</td>
                      <td className="p-2 font-medium">{p.cliente_nome}</td>
                      <td className="p-2 text-xs">
                        <a href={`https://wa.me/55${p.cliente_telefone?.replace(/\D/g,'')}`}
                          target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-1 text-green-600 hover:underline">
                          <Phone className="w-3 h-3" />{p.cliente_telefone}
                        </a>
                      </td>
                      <td className="p-2">
                        <Badge variant="outline" className="text-xs">
                          {p.tipo_entrega === 'retirada' ? '🏪 Retirada' : '🚚 Entrega'}
                        </Badge>
                      </td>
                      <td className="p-2 font-medium">{fmt(p.total)}</td>
                      <td className="p-2">
                        <Badge variant={st.cor} className="text-xs">{st.label}</Badge>
                      </td>
                      <td className="p-2 text-xs font-mono text-muted-foreground">
                        {new Date(p.criado_em).toLocaleDateString("pt-BR")}
                      </td>
                      <td className="p-2">
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => verDetalhe(p)}>
                          <Eye className="w-3.5 h-3.5" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>

        {!loading && (
          <p className="text-xs text-muted-foreground">{pedidos.length} pedido(s) encontrado(s)</p>
        )}
      </div>

      {/* Dialog Detalhe */}
      <Dialog open={!!pedidoDetalhe} onOpenChange={v => { if (!v) { setDetalhe(null); setItens([]); }}}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          {pedidoDetalhe && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Globe className="w-5 h-5" />
                  Pedido {pedidoDetalhe.numero}
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-4">
                {/* Cliente */}
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Cliente</p>
                    <p className="font-medium">{pedidoDetalhe.cliente_nome}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Telefone</p>
                    <a href={`https://wa.me/55${pedidoDetalhe.cliente_telefone?.replace(/\D/g,'')}`}
                      target="_blank" rel="noopener noreferrer"
                      className="text-green-600 hover:underline flex items-center gap-1 font-medium">
                      <Phone className="w-3.5 h-3.5" />{pedidoDetalhe.cliente_telefone}
                    </a>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Tipo</p>
                    <p className="font-medium">{pedidoDetalhe.tipo_entrega === 'retirada' ? '🏪 Retirada na loja' : '🚚 Entrega'}</p>
                  </div>
                  {pedidoDetalhe.tipo_entrega === 'entrega' && (
                    <div>
                      <p className="text-xs text-muted-foreground">Endereço</p>
                      <p className="font-medium text-xs">
                        {[pedidoDetalhe.endereco_rua, pedidoDetalhe.endereco_numero, pedidoDetalhe.endereco_bairro]
                          .filter(Boolean).join(", ")}
                      </p>
                    </div>
                  )}
                </div>

                {/* Itens */}
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">ITENS</p>
                  <div className="space-y-1">
                    {itensDetalhe.map((item, i) => (
                      <div key={i} className="flex justify-between text-sm">
                        <span className="text-muted-foreground">{item.nome_produto} × {item.quantidade}</span>
                        <span className="font-medium font-mono">{fmt(item.total)}</span>
                      </div>
                    ))}
                    {pedidoDetalhe.frete > 0 && (
                      <div className="flex justify-between text-sm text-muted-foreground border-t pt-1">
                        <span>Frete</span>
                        <span className="font-mono">{fmt(pedidoDetalhe.frete)}</span>
                      </div>
                    )}
                    <div className="flex justify-between font-bold border-t pt-1">
                      <span>TOTAL</span>
                      <span className="font-mono text-primary">{fmt(pedidoDetalhe.total)}</span>
                    </div>
                  </div>
                </div>

                {pedidoDetalhe.observacoes && (
                  <div className="bg-muted/50 rounded-lg p-3 text-sm">
                    <p className="text-xs text-muted-foreground mb-1">Observações do cliente:</p>
                    <p>{pedidoDetalhe.observacoes}</p>
                  </div>
                )}

                {/* Ações de status */}
                {(PROXIMOS_STATUS[pedidoDetalhe.status] || []).length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">ATUALIZAR STATUS</p>
                    <div className="flex flex-wrap gap-2">
                      {(PROXIMOS_STATUS[pedidoDetalhe.status] || []).map(s => {
                        const st = STATUS_CONFIG[s];
                        return (
                          <Button
                            key={s}
                            size="sm"
                            variant={s === "cancelado" ? "destructive" : "default"}
                            onClick={() => atualizarStatus(pedidoDetalhe.id, s)}
                          >
                            {st?.label}
                          </Button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Status atual */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Status atual:</span>
                  <Badge variant={STATUS_CONFIG[pedidoDetalhe.status]?.cor || "outline"}>
                    {STATUS_CONFIG[pedidoDetalhe.status]?.label || pedidoDetalhe.status}
                  </Badge>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
