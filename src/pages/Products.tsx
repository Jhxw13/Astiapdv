import { useState, useEffect, useRef } from "react";
import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Search, Package, Edit, AlertTriangle, Tag, Barcode, RefreshCw, Camera, X } from "lucide-react";
import { produtosAPI, categoriasAPI } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

// Gera um EAN-13 válido baseado no timestamp
function gerarEAN13(): string {
  const base = String(Date.now()).slice(-12).padStart(12, "0");
  const digits = base.split("").map(Number);
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += digits[i] * (i % 2 === 0 ? 1 : 3);
  const check = (10 - (sum % 10)) % 10;
  return base + check;
}

export default function Products() {
  const { toast } = useToast();
  const { usuario } = useAuth();
  const podeEditar = usuario?.cargo === "admin" || usuario?.cargo === "gerente";
  const [produtos, setProdutos] = useState<any[]>([]);
  const [categorias, setCategorias] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isCategoryDialogOpen, setIsCategoryDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => { fetchProdutos(); fetchCategorias(); }, []);

  const fetchProdutos = async () => {
    try {
      const data = await produtosAPI.listar({ busca: searchTerm });
      setProdutos(data || []);
    } catch { toast({ title: "Erro", description: "Erro ao carregar produtos", variant: "destructive" }); }
  };

  const fetchCategorias = async () => {
    try { setCategorias(await categoriasAPI.listar() || []); } catch {}
  };

  useEffect(() => {
    const t = setTimeout(() => fetchProdutos(), 300);
    return () => clearTimeout(t);
  }, [searchTerm]);

  const getStockStatus = (stock: number) => {
    if (stock === 0) return { label: "Sem estoque", variant: "destructive" as const };
    if (stock <= 5) return { label: "Estoque baixo", variant: "secondary" as const };
    return { label: "Em estoque", variant: "default" as const };
  };

  const handleSaveProduct = async (data: any) => {
    setLoading(true);
    try {
      // Auto-generate barcode if empty
      if (!data.codigo_barras || data.codigo_barras.trim() === "") {
        data.codigo_barras = gerarEAN13();
      }
      if (editingProduct) {
        await produtosAPI.atualizar(editingProduct.id, data);
        toast({ title: "Produto atualizado!" });
      } else {
        await produtosAPI.criar(data);
        toast({ title: "Produto adicionado!" });
      }
      setIsAddDialogOpen(false);
      setEditingProduct(null);
      fetchProdutos();
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally { setLoading(false); }
  };

  const handleSaveCategory = async (data: any) => {
    setLoading(true);
    try {
      await categoriasAPI.criar(data);
      toast({ title: "Categoria adicionada!" });
      setIsCategoryDialogOpen(false);
      fetchCategorias();
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally { setLoading(false); }
  };

  const ProductForm = ({ produto, onSave, onCancel }: any) => {
    const [f, setF] = useState({
      nome: produto?.nome || "", sku: produto?.sku || "", codigo_barras: produto?.codigo_barras || "",
      categoria_id: produto?.categoria_id?.toString() || "", preco_venda: produto?.preco_venda?.toString() || "",
      preco_custo: produto?.preco_custo?.toString() || "", estoque_atual: produto?.estoque_atual?.toString() || "0",
      estoque_minimo: produto?.estoque_minimo?.toString() || "5", descricao: produto?.descricao || "",
      permitir_venda_sem_estoque: produto?.permitir_venda_sem_estoque ?? 1,
      unidade_medida: produto?.unidade_medida || "UN",
      data_validade: produto?.data_validade || "",
      dias_validade_alerta: produto?.dias_validade_alerta?.toString() || "30",
      percentual_lucro: produto?.percentual_lucro?.toString() || "",
      codigo_lote: produto?.codigo_lote || "",
      online_foto_url: produto?.online_foto_url || "",
      promocao_ativa: produto?.promocao_ativa ?? 0,
      preco_promocional: produto?.preco_promocional?.toString() || "",
    });

    const [scannerOpen, setScannerOpen] = useState(false);
    const videoScanRef = useRef<HTMLVideoElement>(null);
    const streamScanRef = useRef<MediaStream | null>(null);
    const scanLoopRef = useRef<number>(0);

    const abrirScanner = async () => {
      setScannerOpen(true);
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } }
        });
        streamScanRef.current = s;
        if (videoScanRef.current) {
          videoScanRef.current.srcObject = s;
          await videoScanRef.current.play();
        }
        iniciarScanProduto();
      } catch {
        toast({ title: "Câmera não disponível", description: "Permita o acesso à câmera no navegador", variant: "destructive" });
        setScannerOpen(false);
      }
    };

    const fecharScanner = () => {
      cancelAnimationFrame(scanLoopRef.current);
      streamScanRef.current?.getTracks().forEach(t => t.stop());
      streamScanRef.current = null;
      setScannerOpen(false);
    };

    const iniciarScanProduto = () => {
      const canvas = document.createElement("canvas");
      const tick = async () => {
        const video = videoScanRef.current;
        if (!video || !streamScanRef.current) return;
        if (video.readyState === video.HAVE_ENOUGH_DATA) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);

          if ((window as any).jsQR) {
            const qr = (window as any).jsQR(imgData.data, imgData.width, imgData.height);
            if (qr?.data) {
              navigator.vibrate?.(100);
              setF(prev => ({ ...prev, codigo_barras: qr.data }));
              fecharScanner();
              return;
            }
          }
          if ("BarcodeDetector" in window) {
            try {
              const det = new (window as any).BarcodeDetector({ formats: ["ean_13","ean_8","code_128","code_39","upc_a"] });
              const codes = await det.detect(canvas);
              if (codes.length > 0) {
                navigator.vibrate?.(100);
                setF(prev => ({ ...prev, codigo_barras: codes[0].rawValue }));
                fecharScanner();
                return;
              }
            } catch {}
          }
        }
        scanLoopRef.current = requestAnimationFrame(tick);
      };
      scanLoopRef.current = requestAnimationFrame(tick);
    };

    useEffect(() => {
      // Carrega jsQR se não estiver carregado
      if (!(window as any).jsQR) {
        const s = document.createElement("script");
        s.src = "https://cdnjs.cloudflare.com/ajax/libs/jsQR/1.4.0/jsQR.min.js";
        document.head.appendChild(s);
      }
      return () => fecharScanner();
    }, []);

    const handleFoto = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => setF(prev => ({ ...prev, online_foto_url: reader.result as string }));
      reader.readAsDataURL(file);
    };

    const submit = (e: React.FormEvent) => {
      e.preventDefault();
      onSave({ ...f, preco_venda: parseFloat(f.preco_venda) || 0, preco_custo: parseFloat(f.preco_custo) || 0,
        estoque_atual: parseInt(f.estoque_atual) || 0, estoque_minimo: parseInt(f.estoque_minimo) || 5, permitir_venda_sem_estoque: f.permitir_venda_sem_estoque,
        categoria_id: f.categoria_id ? parseInt(f.categoria_id) : null,
        data_validade: f.data_validade || null,
        dias_validade_alerta: parseInt(f.dias_validade_alerta) || 30,
        percentual_lucro: parseFloat(f.percentual_lucro) || 0,
        codigo_lote: f.codigo_lote || null,
        preco_promocional: parseFloat(f.preco_promocional) || 0,
        promocao_ativa: f.promocao_ativa,
      });
    };
    return (
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div><Label>Nome *</Label><Input value={f.nome} onChange={e => setF({...f, nome: e.target.value})} required /></div>
          <div><Label>SKU</Label><Input value={f.sku} onChange={e => setF({...f, sku: e.target.value})} /></div>
          <div><Label>Categoria</Label>
            <Select value={f.categoria_id} onValueChange={v => setF({...f, categoria_id: v})}>
              <SelectTrigger><SelectValue placeholder="Sem categoria" /></SelectTrigger>
              <SelectContent>{categorias.map(c => <SelectItem key={c.id} value={c.id.toString()}>{c.nome}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Cód. Barras</Label>
            <div className="flex gap-2 mt-1">
              <Input
                value={f.codigo_barras}
                onChange={e => setF({...f, codigo_barras: e.target.value})}
                onKeyDown={e => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (!f.codigo_barras) setF(prev => ({...prev, codigo_barras: gerarEAN13()}));
                  }
                }}
                placeholder="Deixe vazio e pressione Enter para gerar"
              />
              <button type="button" title="Escanear com câmera"
                onClick={abrirScanner}
                className="px-3 py-2 border rounded-md hover:bg-muted shrink-0 text-primary">
                <Camera className="w-4 h-4" />
              </button>
              <button type="button" title="Gerar código automaticamente"
                onClick={() => setF(prev => ({...prev, codigo_barras: gerarEAN13()}))}
                className="px-3 py-2 border rounded-md hover:bg-muted shrink-0">
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              <Camera className="w-3 h-3 inline mr-1"/>Escanear com câmera · 🔄 Gerar EAN-13 · ou Enter no campo vazio
            </p>

            {/* Modal scanner inline */}
            {scannerOpen && (
              <div style={{
                position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)",
                zIndex: 9999, display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center", gap: 12,
              }}>
                <div style={{ color: "white", fontSize: 16, fontWeight: 700 }}>
                  📷 Aponte para o código de barras
                </div>
                <div style={{ position: "relative", width: "90vw", maxWidth: 480, borderRadius: 14, overflow: "hidden" }}>
                  <video ref={videoScanRef} autoPlay playsInline muted
                    style={{ width: "100%", display: "block", borderRadius: 14 }} />
                  {/* Mira */}
                  <div style={{
                    position: "absolute", inset: 0,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    pointerEvents: "none",
                  }}>
                    <div style={{
                      width: "70%", height: "35%",
                      border: "2px solid rgba(124,92,252,0.8)",
                      borderRadius: 10,
                      boxShadow: "0 0 0 9999px rgba(0,0,0,0.5)",
                    }} />
                  </div>
                </div>
                <button type="button" onClick={fecharScanner}
                  className="btn btn-outline"
                  style={{
                    background: "white", color: "#111", border: "none",
                    padding: "10px 32px", borderRadius: 10,
                    fontWeight: 600, cursor: "pointer", fontSize: 14,
                  }}>
                  <X className="w-4 h-4 inline mr-2"/>Cancelar
                </button>
              </div>
            )}
          </div>
          <div>
            <Label>Preço Venda (R$) *</Label>
            <Input type="number" step="0.01" value={f.preco_venda}
              onChange={e => {
                const venda = parseFloat(e.target.value) || 0;
                const custo = parseFloat(f.preco_custo) || 0;
                const lucro = custo > 0 ? (((venda - custo) / custo) * 100).toFixed(1) : f.percentual_lucro;
                setF({...f, preco_venda: e.target.value, percentual_lucro: String(lucro)});
              }} required />
          </div>
          <div>
            <Label>Preço Custo (R$)</Label>
            <Input type="number" step="0.01" value={f.preco_custo}
              onChange={e => {
                const custo = parseFloat(e.target.value) || 0;
                const venda = parseFloat(f.preco_venda) || 0;
                const lucro = custo > 0 ? (((venda - custo) / custo) * 100).toFixed(1) : f.percentual_lucro;
                setF({...f, preco_custo: e.target.value, percentual_lucro: String(lucro)});
              }} />
          </div>

          {/* Preço Promocional */}
          <div className={`col-span-2 rounded-xl border-2 p-3 transition-colors ${f.promocao_ativa ? "border-orange-400 bg-orange-50 dark:bg-orange-950/20" : "border-border bg-muted/30"}`}>
            <div className="flex items-center justify-between mb-2">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input type="checkbox" checked={!!f.promocao_ativa}
                  onChange={e => setF({ ...f, promocao_ativa: e.target.checked ? 1 : 0, preco_promocional: e.target.checked ? f.preco_promocional : "" })}
                  className="w-4 h-4 accent-orange-500" />
                <span className="font-semibold text-sm flex items-center gap-1">
                  🏷️ Valor Promocional
                  {!!f.promocao_ativa && <span className="text-xs font-normal text-orange-600 bg-orange-100 dark:bg-orange-900/30 px-2 py-0.5 rounded-full ml-1">ATIVO</span>}
                </span>
              </label>
              {f.promocao_ativa && f.preco_venda && f.preco_promocional && (
                <span className="text-xs font-bold text-green-600">
                  -{Math.round((1 - parseFloat(f.preco_promocional) / parseFloat(f.preco_venda)) * 100)}% de desconto
                </span>
              )}
            </div>
            {!!f.promocao_ativa && (
              <div className="flex gap-3 items-center">
                <div className="flex-1">
                  <Label className="text-xs text-muted-foreground">Preço normal</Label>
                  <p className="text-sm font-bold text-muted-foreground line-through">R$ {parseFloat(f.preco_venda || "0").toFixed(2)}</p>
                </div>
                <div className="text-2xl text-muted-foreground">→</div>
                <div className="flex-1">
                  <Label className="text-xs text-orange-600 font-semibold">Preço promocional (R$) *</Label>
                  <Input type="number" step="0.01" min="0"
                    value={f.preco_promocional}
                    onChange={e => setF({ ...f, preco_promocional: e.target.value })}
                    placeholder="0,00"
                    className="border-orange-400 focus:border-orange-500 font-bold text-orange-600"
                    required={!!f.promocao_ativa} />
                </div>
              </div>
            )}
            {!f.promocao_ativa && (
              <p className="text-xs text-muted-foreground">Ative para definir um preço especial de promoção. O preço original fica riscado no flyer.</p>
            )}
          </div>
          <div>
            <Label className="flex items-center gap-1">% Lucro
              {parseFloat(f.percentual_lucro) > 0 && (
                <span className={`text-xs font-bold ml-1 ${parseFloat(f.percentual_lucro) < 10 ? "text-red-500" : parseFloat(f.percentual_lucro) < 30 ? "text-yellow-500" : "text-green-500"}`}>
                  {parseFloat(f.percentual_lucro).toFixed(1)}%
                </span>
              )}
            </Label>
            <Input type="number" step="0.1" placeholder="Calculado automaticamente"
              value={f.percentual_lucro}
              onChange={e => {
                const lucro = parseFloat(e.target.value) || 0;
                const custo = parseFloat(f.preco_custo) || 0;
                const venda = custo > 0 ? (custo * (1 + lucro / 100)).toFixed(2) : f.preco_venda;
                setF({...f, percentual_lucro: e.target.value, preco_venda: String(venda)});
              }} />
            <p className="text-xs text-muted-foreground mt-1">Alterar lucro % recalcula o preço de venda</p>
          </div>
          <div>
            <Label>Estoque Atual</Label>
            <div className="flex items-center gap-2 mt-1">
              <button type="button"
                onClick={() => setF(prev => ({...prev, estoque_atual: String(Math.max(0, parseInt(prev.estoque_atual || "0") - 1))}))}
                className="w-9 h-9 rounded-lg border bg-background hover:bg-muted flex items-center justify-center font-bold text-lg text-red-500">−</button>
              <Input type="number" value={f.estoque_atual}
                onChange={e => setF({...f, estoque_atual: e.target.value})}
                className="text-center font-mono font-bold text-lg" />
              <button type="button"
                onClick={() => setF(prev => ({...prev, estoque_atual: String(parseInt(prev.estoque_atual||"0") + 1)}))}
                className="w-9 h-9 rounded-lg border bg-background hover:bg-muted flex items-center justify-center font-bold text-lg text-green-500">+</button>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
            <input type="checkbox" id="venda_sem_estoque" checked={!!f.permitir_venda_sem_estoque}
              onChange={e => setF({...f, permitir_venda_sem_estoque: e.target.checked ? 1 : 0})}
              className="w-4 h-4 accent-violet-600" />
            <label htmlFor="venda_sem_estoque" className="text-sm cursor-pointer">
              <span className="font-medium">Vender mesmo sem estoque</span>
              <span className="block text-xs text-muted-foreground">Não trava o caixa quando estoque chegar a zero</span>
            </label>
          </div>
          <div><Label>Estoque Mínimo</Label><Input type="number" value={f.estoque_minimo} onChange={e => setF({...f, estoque_minimo: e.target.value})} /></div>
          <div><Label>Unidade</Label>
            <Select value={f.unidade_medida} onValueChange={v => setF({...f, unidade_medida: v})}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="UN">Unidade</SelectItem><SelectItem value="KG">Kg</SelectItem><SelectItem value="LT">Litro</SelectItem><SelectItem value="MT">Metro</SelectItem></SelectContent>
            </Select>
          </div>
          <div>
            <Label className="flex items-center gap-1">📅 Validade do Produto</Label>
            <Input type="date" value={f.data_validade}
              onChange={e => setF({...f, data_validade: e.target.value})} />
            <p className="text-xs text-muted-foreground mt-1">Deixe vazio se o produto não vence</p>
          </div>
          <div>
            <Label>Alerta de Vencimento (dias antes)</Label>
            <Input type="number" min={1} value={f.dias_validade_alerta}
              onChange={e => setF({...f, dias_validade_alerta: e.target.value})} />
          </div>
          <div>
            <Label>Código do Lote</Label>
            <Input value={f.codigo_lote} placeholder="Ex: LOT2024001"
              onChange={e => setF({...f, codigo_lote: e.target.value})} />
          </div>
        </div>
        <div><Label>Descrição</Label><Textarea value={f.descricao} onChange={e => setF({...f, descricao: e.target.value})} rows={2} /></div>

        {/* Foto do produto (para flyers e loja online) */}
        <div>
          <Label className="flex items-center gap-2">📷 Foto do Produto <span className="text-xs text-muted-foreground font-normal">— aparece nos flyers e loja online</span></Label>
          <div className="flex gap-3 items-center mt-1">
            {f.online_foto_url ? (
              <div className="relative shrink-0">
                <img src={f.online_foto_url} alt="Foto" className="w-20 h-20 object-cover rounded-xl border" />
                <button type="button" onClick={() => setF(p => ({ ...p, online_foto_url: "" }))}
                  className="absolute -top-2 -right-2 w-5 h-5 bg-destructive text-white rounded-full flex items-center justify-center text-xs font-bold leading-none">×</button>
              </div>
            ) : (
              <div className="w-20 h-20 shrink-0 rounded-xl border-2 border-dashed flex items-center justify-center text-muted-foreground text-[10px] text-center">
                Sem foto
              </div>
            )}
            <label className="cursor-pointer flex-1">
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg border hover:border-primary/50 hover:bg-muted/50 transition-colors text-sm text-muted-foreground">
                📁 {f.online_foto_url ? "Trocar foto" : "Adicionar foto"}
              </div>
              <input type="file" accept="image/*" onChange={handleFoto} className="hidden" />
            </label>
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <Button type="submit" className="btn-gradient" disabled={loading}>{produto ? "Atualizar" : "Adicionar"}</Button>
          <Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button>
        </div>
      </form>
    );
  };

  const CategoryForm = ({ onSave, onCancel }: any) => {
    const [f, setF] = useState({ nome: "", descricao: "" });
    return (
      <form onSubmit={e => { e.preventDefault(); onSave(f); }} className="space-y-4">
        <div><Label>Nome *</Label><Input value={f.nome} onChange={e => setF({...f, nome: e.target.value})} required /></div>
        <div><Label>Descrição</Label><Textarea value={f.descricao} onChange={e => setF({...f, descricao: e.target.value})} rows={2} /></div>
        <div className="flex gap-2 pt-2">
          <Button type="submit" className="btn-gradient" disabled={loading}>Adicionar</Button>
          <Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button>
        </div>
      </form>
    );
  };

  return (
    <Layout title="Produtos">
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
            <Input placeholder="Buscar produtos..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-10" />
          </div>
          <div className="flex gap-2">
            <Dialog open={isCategoryDialogOpen} onOpenChange={setIsCategoryDialogOpen}>
              <DialogTrigger asChild><Button variant="outline"><Tag className="w-4 h-4 mr-2" />Nova Categoria</Button></DialogTrigger>
              <DialogContent><DialogHeader><DialogTitle>Nova Categoria</DialogTitle></DialogHeader>
                <CategoryForm onSave={handleSaveCategory} onCancel={() => setIsCategoryDialogOpen(false)} />
              </DialogContent>
            </Dialog>
            <Dialog open={isAddDialogOpen} onOpenChange={o => { setIsAddDialogOpen(o); if (!o) setEditingProduct(null); }}>
              <DialogTrigger asChild><Button className="btn-gradient"><Plus className="w-4 h-4 mr-2" />Novo Produto</Button></DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader><DialogTitle>{editingProduct ? "Editar Produto" : "Novo Produto"}</DialogTitle><DialogDescription>Preencha os dados do produto</DialogDescription></DialogHeader>
                <ProductForm produto={editingProduct} onSave={handleSaveProduct} onCancel={() => { setIsAddDialogOpen(false); setEditingProduct(null); }} />
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          {[
            { label: "Total", value: produtos.length, cls: "" },
            { label: "Ativos", value: produtos.filter(p => p.ativo !== 0).length, cls: "text-green-600" },
            { label: "Estoque Baixo", value: produtos.filter(p => p.estoque_atual <= p.estoque_minimo && p.estoque_atual > 0).length, cls: "text-yellow-600" },
            { label: "Sem Estoque", value: produtos.filter(p => p.estoque_atual === 0).length, cls: "text-destructive" },
          ].map(m => (
            <Card key={m.label} className="glass-card"><CardHeader className="pb-2"><CardTitle className="text-sm font-medium">{m.label}</CardTitle></CardHeader>
              <CardContent><div className={`text-2xl font-bold ${m.cls}`}>{m.value}</div></CardContent></Card>
          ))}
        </div>

        <Card className="glass-card">
          <CardHeader><CardTitle className="flex items-center"><Package className="w-5 h-5 mr-2" />Catálogo de Produtos</CardTitle><CardDescription>{produtos.length} produto(s)</CardDescription></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow><TableHead>SKU</TableHead><TableHead>Produto</TableHead><TableHead>Categoria</TableHead><TableHead>Preço</TableHead><TableHead>Estoque</TableHead><TableHead>Validade</TableHead><TableHead>Status</TableHead><TableHead>Ações</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {produtos.map(p => {
                  const ss = getStockStatus(p.estoque_atual);
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="font-mono text-sm">{p.sku || p.codigo_barras || "-"}</TableCell>
                      <TableCell><div className="font-medium">{p.nome}</div>{p.descricao && <div className="text-xs text-muted-foreground">{p.descricao}</div>}</TableCell>
                      <TableCell><Badge variant="secondary">{p.categoria_nome || "Sem categoria"}</Badge></TableCell>
                      <TableCell className="font-medium">
                        R$ {Number(p.preco_venda).toFixed(2)}
                        {p.percentual_lucro > 0 && (
                          <span className={`ml-1 text-xs font-bold ${p.percentual_lucro < 10 ? "text-red-500" : p.percentual_lucro < 30 ? "text-yellow-500" : "text-green-500"}`}>
                            ({Number(p.percentual_lucro).toFixed(0)}%)
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">{p.estoque_atual}{p.estoque_atual <= p.estoque_minimo && <AlertTriangle className="w-4 h-4 text-yellow-500" />}</div>
                      </TableCell>
                      <TableCell>
                        {p.data_validade ? (() => {
                          const dias = Math.floor((new Date(p.data_validade).getTime() - Date.now()) / 86400000);
                          return dias < 0
                            ? <span className="text-xs font-bold text-red-600 bg-red-50 dark:bg-red-950/30 px-2 py-0.5 rounded-full">VENCIDO</span>
                            : dias <= (p.dias_validade_alerta || 30)
                            ? <span className="text-xs font-bold text-yellow-600 bg-yellow-50 dark:bg-yellow-950/30 px-2 py-0.5 rounded-full">{dias}d</span>
                            : <span className="text-xs text-muted-foreground">{new Date(p.data_validade).toLocaleDateString("pt-BR")}</span>
                        })() : <span className="text-xs text-muted-foreground">—</span>}
                        <Badge variant={ss.variant} className="text-xs">{ss.label}</Badge>
                      </TableCell>
                      <TableCell><Badge variant={p.ativo !== 0 ? "default" : "secondary"}>{p.ativo !== 0 ? "Ativo" : "Inativo"}</Badge></TableCell>
                      <TableCell>
                        <Button variant="outline" size="sm" onClick={() => { setEditingProduct(p); setIsAddDialogOpen(true); }}><Edit className="w-3 h-3" /></Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
