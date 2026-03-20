/**
 * ASTIA PDV — Compras v1.0
 * Entrada de mercadoria: seleciona fornecedor, adiciona itens,
 * atualiza estoque e custo médio automaticamente
 */
import { useState, useEffect, useRef } from "react";
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
import { comprasAPI, fornecedoresAPI, produtosAPI } from "@/lib/api";
import {
  ShoppingBag, Plus, Search, Trash2, Eye, X,
  ChevronLeft, Package, Truck, FileText, TrendingDown, RefreshCw
} from "lucide-react";

const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);

type ItemCompra = {
  produto_id: number;
  nome_produto: string;
  codigo_barras: string;
  quantidade: number;
  preco_unitario: number;
  total: number;
};

export default function Compras() {
  const { toast } = useToast();
  const { usuario } = useAuth();

  // ── Lista de compras ──────────────────────────────────────────────────────
  const [lista, setLista] = useState<any[]>([]);
  const [loadingLista, setLoadingLista] = useState(true);
  const [buscaLista, setBuscaLista] = useState("");
  const [view, setView] = useState<"lista" | "nova" | "detalhe">("lista");
  const [compraDetalhe, setCompraDetalhe] = useState<any>(null);
  const [itensDetalhe, setItensDetalhe] = useState<any[]>([]);

  // ── Nova compra ───────────────────────────────────────────────────────────
  const [fornecedores, setFornecedores] = useState<any[]>([]);
  const [fornecedorId, setFornecedorId] = useState<string>("");
  const [numeroNf, setNumeroNf] = useState("");
  const [dataEmissao, setDataEmissao] = useState("");
  const [dataRecebimento, setDataRecebimento] = useState(new Date().toISOString().split("T")[0]);
  const [condicao, setCondicao] = useState("a_vista");
  const [formaPgto, setFormaPgto] = useState("boleto");
  const [desconto, setDesconto] = useState("0");
  const [frete, setFrete] = useState("0");
  const [outrasDespesas, setOutrasDespesas] = useState("0");
  const [observacoes, setObservacoes] = useState("");
  const [itens, setItens] = useState<ItemCompra[]>([]);
  const [saving, setSaving] = useState(false);

  // ── Busca de produto para adicionar ──────────────────────────────────────
  const [buscaProd, setBuscaProd] = useState("");
  const [resultadosProd, setResultadosProd] = useState<any[]>([]);
  const [buscandoProd, setBuscandoProd] = useState(false);
  const buscaTimer = useRef<any>(null);
  const [itemQtd, setItemQtd] = useState("1");
  const [itemCusto, setItemCusto] = useState("");
  const [prodSelecionado, setProdSelecionado] = useState<any>(null);

  const carregar = async () => {
    setLoadingLista(true);
    try { setLista(await comprasAPI.listar() || []); }
    catch { toast({ title: "Erro ao carregar compras", variant: "destructive" }); }
    finally { setLoadingLista(false); }
  };

  useEffect(() => {
    carregar();
    fornecedoresAPI.listar({ ativo: 1 }).then(r => setFornecedores(r || [])).catch(() => {});
  }, []);

  // Busca de produto com debounce
  useEffect(() => {
    if (buscaProd.length < 2) { setResultadosProd([]); return; }
    clearTimeout(buscaTimer.current);
    buscaTimer.current = setTimeout(async () => {
      setBuscandoProd(true);
      try {
        // Tenta busca por código de barras primeiro
        if (/^\d{4,}$/.test(buscaProd)) {
          const p = await produtosAPI.buscarPorCodigo(buscaProd);
          if (p) { setResultadosProd([p]); setBuscandoProd(false); return; }
        }
        const r = await produtosAPI.listar({ busca: buscaProd });
        setResultadosProd((r || []).slice(0, 8));
      } catch { setResultadosProd([]); }
      finally { setBuscandoProd(false); }
    }, 350);
  }, [buscaProd]);

  const selecionarProd = (p: any) => {
    setProdSelecionado(p);
    setItemCusto(p.preco_custo > 0 ? String(p.preco_custo) : "");
    setResultadosProd([]);
    setBuscaProd(p.nome);
  };

  const adicionarItem = () => {
    if (!prodSelecionado) { toast({ title: "Selecione um produto", variant: "destructive" }); return; }
    const qtd = parseFloat(itemQtd) || 0;
    const custo = parseFloat(itemCusto) || 0;
    if (qtd <= 0) { toast({ title: "Quantidade inválida", variant: "destructive" }); return; }
    if (custo <= 0) { toast({ title: "Informe o custo unitário", variant: "destructive" }); return; }

    // Se já existe, atualiza
    const idx = itens.findIndex(i => i.produto_id === prodSelecionado.id);
    if (idx >= 0) {
      const novos = [...itens];
      novos[idx] = { ...novos[idx], quantidade: novos[idx].quantidade + qtd, preco_unitario: custo, total: (novos[idx].quantidade + qtd) * custo };
      setItens(novos);
    } else {
      setItens(prev => [...prev, {
        produto_id: prodSelecionado.id,
        nome_produto: prodSelecionado.nome,
        codigo_barras: prodSelecionado.codigo_barras || "",
        quantidade: qtd,
        preco_unitario: custo,
        total: qtd * custo,
      }]);
    }
    setBuscaProd(""); setProdSelecionado(null); setItemQtd("1"); setItemCusto("");
  };

  const removerItem = (idx: number) => setItens(prev => prev.filter((_, i) => i !== idx));

  const subtotal = itens.reduce((s, i) => s + i.total, 0);
  const totalCompra = subtotal - (parseFloat(desconto) || 0) + (parseFloat(frete) || 0) + (parseFloat(outrasDespesas) || 0);

  const salvarCompra = async () => {
    if (!fornecedorId) { toast({ title: "Selecione o fornecedor", variant: "destructive" }); return; }
    if (itens.length === 0) { toast({ title: "Adicione pelo menos um item", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const r = await comprasAPI.criar({
        fornecedor_id: parseInt(fornecedorId),
        usuario_id: usuario?.id,
        numero_nf: numeroNf,
        data_emissao: dataEmissao || null,
        data_recebimento: dataRecebimento,
        desconto_valor: parseFloat(desconto) || 0,
        frete: parseFloat(frete) || 0,
        outras_despesas: parseFloat(outrasDespesas) || 0,
        condicao_pagamento: condicao,
        forma_pagamento: formaPgto,
        observacoes,
        itens,
      });
      toast({ title: `Compra ${r.numero} registrada!`, description: `Estoque de ${itens.length} produto(s) atualizado.` });
      // Reset
      setFornecedorId(""); setNumeroNf(""); setDataEmissao(""); setItens([]);
      setDesconto("0"); setFrete("0"); setOutrasDespesas("0"); setObservacoes("");
      setView("lista"); carregar();
    } catch (e: any) {
      toast({ title: "Erro ao salvar compra", description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  const verDetalhe = async (compra: any) => {
    setCompraDetalhe(compra);
    try { setItensDetalhe(await comprasAPI.itens(compra.id) || []); }
    catch { setItensDetalhe([]); }
    setView("detalhe");
  };

  const cancelarCompra = async (compra: any) => {
    const motivo = prompt("Motivo do cancelamento:");
    if (!motivo) return;
    try {
      await comprasAPI.cancelar(compra.id, motivo, usuario?.id || 0);
      toast({ title: "Compra cancelada — estoque estornado" });
      setView("lista"); carregar();
    } catch (e: any) {
      toast({ title: "Erro ao cancelar", description: e.message, variant: "destructive" });
    }
  };

  const statusBadge = (s: string) =>
    s === "recebida" ? "default" : s === "pendente" ? "secondary" : "destructive";

  const filtrados = lista.filter(c =>
    c.numero?.toLowerCase().includes(buscaLista.toLowerCase()) ||
    c.fornecedor_nome?.toLowerCase().includes(buscaLista.toLowerCase()) ||
    c.numero_nf?.includes(buscaLista)
  );

  // ══════════════════════════════════════════════════════════════════
  // VIEW: DETALHE DA COMPRA
  // ══════════════════════════════════════════════════════════════════
  if (view === "detalhe" && compraDetalhe) {
    return (
      <Layout title="Detalhes da Compra">
        <div className="space-y-4 max-w-3xl">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => setView("lista")}>
              <ChevronLeft className="w-4 h-4 mr-1" />Voltar
            </Button>
            <h1 className="text-xl font-bold">{compraDetalhe.numero}</h1>
            <Badge variant={statusBadge(compraDetalhe.status)}>{compraDetalhe.status}</Badge>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Fornecedor</CardTitle></CardHeader>
              <CardContent className="text-sm space-y-1">
                <p className="font-medium">{compraDetalhe.fornecedor_nome || "—"}</p>
                {compraDetalhe.numero_nf && <p className="text-muted-foreground">NF: {compraDetalhe.numero_nf}</p>}
                {compraDetalhe.data_emissao && <p className="text-muted-foreground">Emissão: {compraDetalhe.data_emissao}</p>}
                <p className="text-muted-foreground">Recebimento: {compraDetalhe.data_recebimento}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Totais</CardTitle></CardHeader>
              <CardContent className="text-sm space-y-1">
                <div className="flex justify-between"><span>Subtotal</span><span>{fmt(compraDetalhe.subtotal)}</span></div>
                {compraDetalhe.desconto_valor > 0 && <div className="flex justify-between text-green-600"><span>Desconto</span><span>-{fmt(compraDetalhe.desconto_valor)}</span></div>}
                {compraDetalhe.frete > 0 && <div className="flex justify-between"><span>Frete</span><span>{fmt(compraDetalhe.frete)}</span></div>}
                <div className="flex justify-between font-bold border-t pt-1"><span>TOTAL</span><span>{fmt(compraDetalhe.total)}</span></div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Itens ({itensDetalhe.length})</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead><tr className="border-b">{["Produto","Qtd","Custo Unit.","Total"].map(h =>
                  <th key={h} className="text-left p-2 text-xs font-medium text-muted-foreground">{h}</th>)}</tr></thead>
                <tbody>
                  {itensDetalhe.map(item => (
                    <tr key={item.id} className="border-b">
                      <td className="p-2">
                        <p className="font-medium">{item.nome_produto}</p>
                        {item.codigo_barras && <p className="text-xs text-muted-foreground">{item.codigo_barras}</p>}
                      </td>
                      <td className="p-2">{item.quantidade}</td>
                      <td className="p-2">{fmt(item.preco_unitario)}</td>
                      <td className="p-2 font-medium">{fmt(item.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>

          {compraDetalhe.status === "recebida" && (
            <Button variant="destructive" size="sm" onClick={() => cancelarCompra(compraDetalhe)}>
              Cancelar Compra (estorna estoque)
            </Button>
          )}
        </div>
      </Layout>
    );
  }

  // ══════════════════════════════════════════════════════════════════
  // VIEW: NOVA COMPRA
  // ══════════════════════════════════════════════════════════════════
  if (view === "nova") {
    return (
      <Layout title="Nova Compra">
        <div className="space-y-4 max-w-4xl">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => setView("lista")}>
              <ChevronLeft className="w-4 h-4 mr-1" />Voltar
            </Button>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <ShoppingBag className="w-5 h-5" /> Nova Entrada de Mercadoria
            </h1>
          </div>

          {/* Cabeçalho da compra */}
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Truck className="w-4 h-4" />Fornecedor e Nota Fiscal</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Fornecedor *</Label>
                  <Select value={fornecedorId} onValueChange={setFornecedorId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o fornecedor..." />
                    </SelectTrigger>
                    <SelectContent>
                      {fornecedores.map(f => (
                        <SelectItem key={f.id} value={String(f.id)}>
                          {f.razao_social}{f.nome_fantasia ? ` (${f.nome_fantasia})` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {fornecedores.length === 0 && (
                    <p className="text-xs text-amber-600 mt-1">Nenhum fornecedor cadastrado. Cadastre em Fornecedores primeiro.</p>
                  )}
                </div>
                <div>
                  <Label>Número da NF</Label>
                  <Input value={numeroNf} onChange={e => setNumeroNf(e.target.value)} placeholder="000000" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label>Data de Emissão</Label>
                  <Input type="date" value={dataEmissao} onChange={e => setDataEmissao(e.target.value)} />
                </div>
                <div>
                  <Label>Data de Recebimento</Label>
                  <Input type="date" value={dataRecebimento} onChange={e => setDataRecebimento(e.target.value)} />
                </div>
                <div>
                  <Label>Condição de Pagamento</Label>
                  <Select value={condicao} onValueChange={setCondicao}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="a_vista">À Vista</SelectItem>
                      <SelectItem value="7d">7 dias</SelectItem>
                      <SelectItem value="14d">14 dias</SelectItem>
                      <SelectItem value="21d">21 dias</SelectItem>
                      <SelectItem value="28d">28 dias</SelectItem>
                      <SelectItem value="30d">30 dias</SelectItem>
                      <SelectItem value="45d">45 dias</SelectItem>
                      <SelectItem value="60d">60 dias</SelectItem>
                      <SelectItem value="30_60">30/60 dias</SelectItem>
                      <SelectItem value="30_60_90">30/60/90 dias</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Forma de Pagamento</Label>
                  <Select value={formaPgto} onValueChange={setFormaPgto}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="boleto">Boleto</SelectItem>
                      <SelectItem value="pix">PIX</SelectItem>
                      <SelectItem value="transferencia">Transferência</SelectItem>
                      <SelectItem value="dinheiro">Dinheiro</SelectItem>
                      <SelectItem value="credito">Cartão Crédito</SelectItem>
                      <SelectItem value="debito">Cartão Débito</SelectItem>
                      <SelectItem value="cheque">Cheque</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Observações</Label>
                  <Input value={observacoes} onChange={e => setObservacoes(e.target.value)} placeholder="Informações adicionais" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Adicionar itens */}
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Package className="w-4 h-4" />Adicionar Produtos</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2 flex-wrap">
                <div className="relative flex-1 min-w-48">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    placeholder="Nome ou código de barras do produto..."
                    value={buscaProd}
                    onChange={e => { setBuscaProd(e.target.value); setProdSelecionado(null); }}
                  />
                  {/* Dropdown resultados */}
                  {resultadosProd.length > 0 && (
                    <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-background border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                      {resultadosProd.map(p => (
                        <button key={p.id} type="button"
                          className="w-full text-left px-3 py-2 hover:bg-muted text-sm border-b last:border-0"
                          onClick={() => selecionarProd(p)}>
                          <p className="font-medium">{p.nome}</p>
                          <p className="text-xs text-muted-foreground">
                            {p.codigo_barras || "Sem código"} · Estoque: {p.estoque_atual} · Custo atual: {fmt(p.preco_custo)}
                          </p>
                        </button>
                      ))}
                    </div>
                  )}
                  {buscandoProd && (
                    <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-background border rounded-lg shadow-lg p-3 text-center text-sm text-muted-foreground">
                      Buscando...
                    </div>
                  )}
                </div>
                <div className="w-24">
                  <Input type="number" min="0.001" step="0.001" placeholder="Qtd" value={itemQtd}
                    onChange={e => setItemQtd(e.target.value)} />
                </div>
                <div className="w-32">
                  <Input type="number" min="0" step="0.01" placeholder="Custo R$" value={itemCusto}
                    onChange={e => setItemCusto(e.target.value)} />
                </div>
                <Button onClick={adicionarItem} disabled={!prodSelecionado}>
                  <Plus className="w-4 h-4 mr-1" />Adicionar
                </Button>
              </div>

              {/* Tabela de itens */}
              {itens.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-collapse">
                    <thead><tr className="border-b">{["Produto","Qtd","Custo Unit.","Total",""].map(h =>
                      <th key={h} className="text-left p-2 text-xs font-medium text-muted-foreground">{h}</th>)}</tr></thead>
                    <tbody>
                      {itens.map((item, idx) => (
                        <tr key={idx} className="border-b hover:bg-muted/30">
                          <td className="p-2 font-medium">{item.nome_produto}</td>
                          <td className="p-2">
                            <Input type="number" min="0.001" step="0.001" value={item.quantidade}
                              className="w-20 h-7 text-sm"
                              onChange={e => {
                                const qtd = parseFloat(e.target.value) || 0;
                                const novos = [...itens]; novos[idx] = { ...novos[idx], quantidade: qtd, total: qtd * novos[idx].preco_unitario }; setItens(novos);
                              }} />
                          </td>
                          <td className="p-2">
                            <Input type="number" min="0" step="0.01" value={item.preco_unitario}
                              className="w-28 h-7 text-sm"
                              onChange={e => {
                                const custo = parseFloat(e.target.value) || 0;
                                const novos = [...itens]; novos[idx] = { ...novos[idx], preco_unitario: custo, total: novos[idx].quantidade * custo }; setItens(novos);
                              }} />
                          </td>
                          <td className="p-2 font-medium">{fmt(item.total)}</td>
                          <td className="p-2">
                            <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-destructive" onClick={() => removerItem(idx)}>
                              <X className="w-3.5 h-3.5" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-center py-6 text-muted-foreground text-sm">Nenhum produto adicionado ainda</p>
              )}
            </CardContent>
          </Card>

          {/* Totais e finalizar */}
          {itens.length > 0 && (
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><TrendingDown className="w-4 h-4" />Totais</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <Label className="text-xs">Desconto (R$)</Label>
                        <Input type="number" min="0" step="0.01" value={desconto} onChange={e => setDesconto(e.target.value)} className="h-8" />
                      </div>
                      <div>
                        <Label className="text-xs">Frete (R$)</Label>
                        <Input type="number" min="0" step="0.01" value={frete} onChange={e => setFrete(e.target.value)} className="h-8" />
                      </div>
                      <div>
                        <Label className="text-xs">Outras Despesas (R$)</Label>
                        <Input type="number" min="0" step="0.01" value={outrasDespesas} onChange={e => setOutrasDespesas(e.target.value)} className="h-8" />
                      </div>
                    </div>
                  </div>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between"><span className="text-muted-foreground">Subtotal ({itens.length} itens)</span><span>{fmt(subtotal)}</span></div>
                    {parseFloat(desconto) > 0 && <div className="flex justify-between text-green-600"><span>Desconto</span><span>-{fmt(parseFloat(desconto))}</span></div>}
                    {parseFloat(frete) > 0 && <div className="flex justify-between"><span>Frete</span><span>+{fmt(parseFloat(frete))}</span></div>}
                    {parseFloat(outrasDespesas) > 0 && <div className="flex justify-between"><span>Outras despesas</span><span>+{fmt(parseFloat(outrasDespesas))}</span></div>}
                    <div className="flex justify-between font-bold text-base border-t pt-2 mt-2">
                      <span>TOTAL DA COMPRA</span><span>{fmt(totalCompra)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground pt-1">
                      ✓ Estoque e custo médio serão atualizados automaticamente ao confirmar
                    </p>
                  </div>
                </div>
                <div className="flex gap-2 justify-end mt-4">
                  <Button variant="outline" onClick={() => setView("lista")}>Cancelar</Button>
                  <Button onClick={salvarCompra} disabled={saving} className="min-w-40">
                    {saving ? "Registrando..." : `Confirmar Entrada — ${fmt(totalCompra)}`}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </Layout>
    );
  }

  // ══════════════════════════════════════════════════════════════════
  // VIEW: LISTA DE COMPRAS
  // ══════════════════════════════════════════════════════════════════
  return (
    <Layout title="Compras">
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShoppingBag className="w-6 h-6" /> Compras
          </h1>
          <Button onClick={() => setView("nova")}><Plus className="w-4 h-4 mr-2" />Nova Entrada</Button>
        </div>

        {/* Busca */}
        <div className="flex gap-2 flex-wrap">
          <div className="relative flex-1 min-w-48 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Buscar por número, fornecedor ou NF..." value={buscaLista}
              onChange={e => setBuscaLista(e.target.value)} className="pl-9" />
          </div>
          <Button variant="outline" size="sm" onClick={carregar}>
            <RefreshCw className="w-3.5 h-3.5 mr-1" />Atualizar
          </Button>
        </div>

        {/* Tabela */}
        <Card>
          <CardContent className="pt-3 overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b">
                  {["Número","Fornecedor","NF","Recebimento","Itens","Total","Status","Ações"].map(h =>
                    <th key={h} className="text-left p-2 text-xs font-medium text-muted-foreground">{h}</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {loadingLista && (
                  <tr><td colSpan={8} className="text-center py-8 text-muted-foreground">Carregando...</td></tr>
                )}
                {!loadingLista && filtrados.length === 0 && (
                  <tr><td colSpan={8} className="text-center py-8 text-muted-foreground">
                    {buscaLista ? "Nenhuma compra encontrada." : "Nenhuma compra registrada. Clique em \"Nova Entrada\" para começar."}
                  </td></tr>
                )}
                {filtrados.map(c => (
                  <tr key={c.id} className="border-b hover:bg-muted/40">
                    <td className="p-2 font-mono text-xs font-medium">{c.numero}</td>
                    <td className="p-2">
                      <p className="font-medium">{c.fornecedor_nome || "—"}</p>
                      {c.nome_fantasia && <p className="text-xs text-muted-foreground">{c.nome_fantasia}</p>}
                    </td>
                    <td className="p-2 text-xs">{c.numero_nf || "—"}</td>
                    <td className="p-2 text-xs font-mono">{c.data_recebimento}</td>
                    <td className="p-2 text-center text-xs">{c.total_itens || "—"}</td>
                    <td className="p-2 font-medium">{fmt(c.total)}</td>
                    <td className="p-2">
                      <Badge variant={statusBadge(c.status)} className="text-xs capitalize">{c.status}</Badge>
                    </td>
                    <td className="p-2">
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => verDetalhe(c)}>
                        <Eye className="w-3.5 h-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        {!loadingLista && (
          <p className="text-xs text-muted-foreground">{filtrados.length} compra{filtrados.length !== 1 ? 's' : ''} encontrada{filtrados.length !== 1 ? 's' : ''}</p>
        )}
      </div>
    </Layout>
  );
}
