/**
 * ASTIA PDV — Etiquetas, Cupom e QR Code
 * Editor de etiquetas com preview ao vivo, personalizacao completa
 */
import { useState, useEffect } from "react";
import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Printer, Tag, QrCode, Plus, Trash2, Search, Settings2, Eye } from "lucide-react";
import { produtosAPI, configAPI, sistemaAPI } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

function QRCodeImg({ url, size = 180 }: { url: string; size?: number }) {
  if (!url) return <div className="w-44 h-44 bg-muted rounded-xl flex items-center justify-center text-muted-foreground text-sm">Aguardando URL...</div>;
  return (
    <img src={`https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(url)}&bgcolor=ffffff&color=000000&margin=4`}
      alt="QR Code" className="rounded-xl border" width={size} height={size}
      onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
  );
}

// Tamanhos predefinidos em mm -> px (96dpi: 1mm = 3.78px)
const FORMATOS = [
  { id: "25x15",  label: "25×15mm (pequena)", w: 94,  fontSize: 7  },
  { id: "40x25",  label: "40×25mm (padrão)",  w: 151, fontSize: 9  },
  { id: "50x30",  label: "50×30mm (média)",   w: 189, fontSize: 10 },
  { id: "58x40",  label: "58×40mm (larga)",   w: 219, fontSize: 11 },
  { id: "80x40",  label: "80×40mm (grande)",  w: 302, fontSize: 13 },
  { id: "100x50", label: "100×50mm (extra)",  w: 378, fontSize: 15 },
  { id: "custom", label: "Personalizado",     w: 0,   fontSize: 10 },
];

interface EtiqConfig {
  formato: string;
  largura_custom: number;
  colunas: number;
  mostrarLoja: boolean;
  mostrarCodigo: boolean;
  mostrarPreco: boolean;
  mostrarCategoria: boolean;
  mostrarVariacao: boolean;
  corFundo: string;
  corTexto: string;
  corBorda: string;
  espessuraBorda: number;
  raioArredondamento: number;
  tamanhoNome: number;
  tamanhoPreco: number;
  tamanhoCodigo: number;
  negritoNome: boolean;
  negritoPreco: boolean;
  padding: number;
  tipoCodigo: "barras" | "qrcode" | "ambos" | "nenhum";
}

const configPadrao: EtiqConfig = {
  formato: "40x25", largura_custom: 151, colunas: 3,
  mostrarLoja: true, mostrarCodigo: true, mostrarPreco: true,
  mostrarCategoria: false, mostrarVariacao: true,
  corFundo: "#ffffff", corTexto: "#000000", corBorda: "#333333",
  espessuraBorda: 1, raioArredondamento: 3,
  tamanhoNome: 9, tamanhoPreco: 13, tamanhoCodigo: 7,
  negritoNome: true, negritoPreco: true, padding: 4,
  tipoCodigo: "barras",
};

/** Gera imagem de código de barras EAN/Code128 via Canvas — sem API externa */
function gerarBarcodeDataURL(codigo: string, largura: number, altura: number): string {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = largura;
    canvas.height = altura;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, largura, altura);

    // Code 128 simplificado — padrão de barras para qualquer string
    const barras = gerarCode128Barras(codigo);
    if (!barras.length) return "";

    const totalBits = barras.reduce((s, b) => s + b, 0);
    const barW = largura / totalBits;
    let x = 0;
    barras.forEach((bits, i) => {
      ctx.fillStyle = i % 2 === 0 ? "#000000" : "#ffffff";
      ctx.fillRect(x, 0, barW * bits, altura);
      x += barW * bits;
    });
    return canvas.toDataURL("image/png");
  } catch { return ""; }
}

function gerarCode128Barras(texto: string): number[] {
  // Code 128B encoding table (simplified)
  const START_B = [11, 1, 4, 1, 2, 3, 2];
  const STOP    = [2, 3, 3, 1, 1, 1, 2];
  const CODE128B: Record<number, number[]> = {
    32:[1,1,2,2,3,2],33:[1,2,2,1,3,2],34:[1,2,2,3,3,1],35:[1,1,3,2,2,3],
    36:[1,2,3,1,2,3],37:[1,2,3,3,2,1],38:[1,1,2,3,3,2],39:[1,3,2,1,3,2],
    40:[1,3,2,3,3,1],41:[2,2,1,2,3,2],42:[2,2,1,3,3,1],43:[2,1,1,3,2,3],
    44:[2,3,1,1,2,3],45:[2,3,1,3,2,1],46:[2,1,2,1,3,3],47:[2,1,2,3,3,1],
    48:[2,1,3,1,3,2],49:[2,1,3,2,3,1],50:[3,1,2,1,3,2],51:[3,1,2,3,3,1],
    52:[3,1,3,1,2,2],53:[3,2,2,1,2,3],54:[3,3,1,1,2,2],55:[3,3,1,2,2,1],
    56:[3,2,1,2,2,3],57:[3,2,1,3,2,1],
    65:[1,2,3,1,2,3],66:[1,2,3,3,2,1],67:[1,3,3,1,2,2],68:[1,3,3,2,2,1],
    69:[2,1,1,2,2,3],70:[2,1,1,3,2,2],71:[2,2,1,1,2,3],72:[2,2,1,3,2,1],
    73:[2,1,2,1,1,4],74:[2,2,2,1,1,3],75:[2,2,2,3,1,1],76:[3,1,1,1,2,3],
    77:[3,1,1,3,2,1],78:[3,1,2,1,1,3],79:[3,1,2,3,1,1],80:[3,2,1,1,1,3],
    81:[3,2,1,1,3,1],82:[3,2,1,3,1,1],83:[3,2,2,1,1,2],84:[3,3,2,1,1,1],
    85:[1,2,1,2,2,3],86:[1,2,1,3,2,2],87:[1,3,1,1,2,3],88:[1,3,1,2,3,1],
    89:[1,3,1,3,2,1],90:[1,3,2,1,2,2],
    97:[2,1,1,2,3,2],98:[2,1,1,3,3,1],99:[2,1,2,2,1,3],100:[2,1,2,3,1,2],
    101:[2,1,3,2,1,2],102:[2,2,1,1,3,2],103:[2,2,1,2,3,1],104:[2,2,2,1,3,1],
    105:[2,2,3,1,1,2],106:[2,3,1,1,2,2],107:[2,3,2,1,1,2],108:[3,1,1,2,2,2],
    109:[3,2,2,1,2,1],110:[3,1,2,2,2,1],111:[3,1,2,1,2,2],112:[1,1,2,2,1,4],
    113:[1,1,4,2,1,2],114:[1,2,2,4,1,1],115:[1,4,2,2,1,1],116:[1,4,1,2,2,2],
    117:[1,1,2,4,2,1],118:[1,1,4,3,1,1],119:[1,3,1,1,4,1],120:[1,1,3,4,1,1],
    121:[1,4,1,1,3,1],122:[1,4,1,3,1,1],
  };
  const bars: number[] = [...START_B];
  let check = 104; // START_B value
  for (let i = 0; i < texto.length; i++) {
    const code = texto.charCodeAt(i);
    const pattern = CODE128B[code] || CODE128B[63]; // fallback '?'
    bars.push(...pattern);
    check += (code - 32) * (i + 1);
  }
  const checkVal = check % 103;
  const checkCode = Object.entries(CODE128B).find(([k]) => parseInt(k) - 32 === checkVal)?.[1] || CODE128B[32];
  bars.push(...checkCode);
  bars.push(...STOP);
  return bars;
}

function EtiquetaPreview({ produto, cfg, loja }: { produto: any; cfg: EtiqConfig; loja: any }) {
  const fmt = FORMATOS.find(f => f.id === cfg.formato) || FORMATOS[1];
  const w = cfg.formato === "custom" ? cfg.largura_custom : fmt.w;
  const codigo = produto?.codigo_barras || produto?.sku || "";
  const partes = (produto?.nome || "").split(" - ");
  const nome = partes[0];
  const variacao = partes[1] || "";
  const preco = `R$ ${Number(produto?.preco_venda || 0).toFixed(2)}`;
  const alturaBarras = Math.max(18, Math.floor(w * 0.22));
  const qrSize = Math.max(36, Math.floor(w * 0.55));

  const barcodeDataURL = (cfg.tipoCodigo === "barras" || cfg.tipoCodigo === "ambos") && codigo
    ? gerarBarcodeDataURL(codigo, Math.floor(w * 0.9), alturaBarras)
    : "";
  const qrURL = (cfg.tipoCodigo === "qrcode" || cfg.tipoCodigo === "ambos") && codigo
    ? `https://api.qrserver.com/v1/create-qr-code/?size=${qrSize}x${qrSize}&data=${encodeURIComponent(codigo)}&bgcolor=ffffff&color=000000&margin=2`
    : "";

  return (
    <div style={{
      width: w, display: "inline-flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      padding: cfg.padding,
      background: cfg.corFundo, color: cfg.corTexto,
      border: `${cfg.espessuraBorda}px solid ${cfg.corBorda}`,
      borderRadius: cfg.raioArredondamento,
      fontFamily: "'Courier New', monospace",
      textAlign: "center", boxSizing: "border-box",
      gap: 2,
    }}>
      {cfg.mostrarLoja && loja?.nome && (
        <div style={{ fontSize: cfg.tamanhoCodigo, opacity: 0.7, lineHeight: 1.1 }}>{loja.nome}</div>
      )}
      <div style={{ fontSize: cfg.tamanhoNome, fontWeight: cfg.negritoNome ? "bold" : "normal", lineHeight: 1.2, wordBreak: "break-word", width: "100%" }}>
        {nome}
      </div>
      {cfg.mostrarVariacao && variacao && (
        <div style={{ fontSize: cfg.tamanhoNome - 1, opacity: 0.75, lineHeight: 1 }}>{variacao}</div>
      )}
      {cfg.mostrarCategoria && produto?.categoria_nome && (
        <div style={{ fontSize: cfg.tamanhoCodigo, opacity: 0.6, lineHeight: 1 }}>{produto.categoria_nome}</div>
      )}
      {cfg.mostrarPreco && (
        <div style={{ fontSize: cfg.tamanhoPreco, fontWeight: cfg.negritoPreco ? "900" : "bold", lineHeight: 1.1, letterSpacing: 0.3 }}>
          {preco}
        </div>
      )}
      {cfg.mostrarCodigo && codigo && (
        <>
          {barcodeDataURL && (
            <img src={barcodeDataURL} alt={codigo}
              style={{ width: "90%", height: alturaBarras, imageRendering: "pixelated" }} />
          )}
          {qrURL && (
            <img src={qrURL} alt={codigo}
              style={{ width: qrSize, height: qrSize }}
              onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
          )}
          <div style={{ fontSize: cfg.tamanhoCodigo, letterSpacing: 1, lineHeight: 1 }}>{codigo}</div>
        </>
      )}
    </div>
  );
}

export default function Impressao() {
  const { toast } = useToast();
  const [produtos, setProdutos] = useState<any[]>([]);
  const [config, setConfig] = useState<any>({});
  const [serverIP, setServerIP] = useState("");
  const [busca, setBusca] = useState("");

  // Etiquetas
  const [linhas, setLinhas] = useState<{ produtoId: string; qtd: string }[]>([{ produtoId: "", qtd: "1" }]);
  const [cfg, setCfg] = useState<EtiqConfig>(configPadrao);
  const [abaEditor, setAbaEditor] = useState<"produtos" | "visual">("produtos");

  useEffect(() => {
    produtosAPI.listar({ ativo: 1 }).then(d => setProdutos(d || [])).catch(() => {});
    configAPI.get().then(c => { if (c) setConfig(c); }).catch(() => {});
    sistemaAPI.getServerIP().then(ip => setServerIP(ip || "")).catch(() => {});
    // Load saved config
    try { const s = localStorage.getItem("astia_etiq_cfg"); if (s) setCfg(JSON.parse(s)); } catch {}
  }, []);

  const salvarCfg = (novo: Partial<EtiqConfig>) => {
    const merged = { ...cfg, ...novo };
    setCfg(merged);
    try { localStorage.setItem("astia_etiq_cfg", JSON.stringify(merged)); } catch {}
  };

  const prodsFiltrados = produtos.filter(p =>
    !busca || p.nome.toLowerCase().includes(busca.toLowerCase()) ||
    (p.codigo_barras || "").includes(busca)
  );

  const itensEtiqueta = linhas.filter(l => l.produtoId).flatMap(l => {
    const p = produtos.find(x => x.id.toString() === l.produtoId);
    if (!p) return [];
    return Array.from({ length: Math.max(1, parseInt(l.qtd) || 1) }, () => p);
  });

  const consultaURL = serverIP ? `http://${serverIP}:3567/consulta-preco` : "";

  const imprimir = () => {
    if (itensEtiqueta.length === 0) {
      toast({ title: "Adicione ao menos um produto", variant: "destructive" }); return;
    }
    const fmt = FORMATOS.find(f => f.id === cfg.formato) || FORMATOS[1];
    const w = cfg.formato === "custom" ? cfg.largura_custom : fmt.w;
    const cols = cfg.colunas;
    const codigo = (p: any) => p.codigo_barras || p.sku || "";
    const partes = (p: any) => { const parts = (p.nome || "").split(" - "); return { nome: parts[0], var: parts[1] || "" }; };
    const preco = (p: any) => `R$ ${Number(p.preco_venda || 0).toFixed(2)}`;

    const cells = itensEtiqueta.map(p => {
      const { nome, var: variacao } = partes(p);
      const cod = codigo(p);
      const barcodeImg = (cfg.tipoCodigo === "barras" || cfg.tipoCodigo === "ambos") && cod
        ? (() => {
            const dataURL = gerarBarcodeDataURL(cod, Math.floor(w * 0.9), Math.max(16, Math.floor(w * 0.22)));
            return dataURL ? `<img src="${dataURL}" style="width:90%;height:${Math.max(16, Math.floor(w * 0.22))}px;image-rendering:pixelated;display:block;margin:0 auto">` : "";
          })()
        : "";
      const qrImg = (cfg.tipoCodigo === "qrcode" || cfg.tipoCodigo === "ambos") && cod
        ? `<img src="https://api.qrserver.com/v1/create-qr-code/?size=${Math.max(36,Math.floor(w*0.55))}x${Math.max(36,Math.floor(w*0.55))}&data=${encodeURIComponent(cod)}&bgcolor=ffffff&color=000000&margin=2" style="width:${Math.max(36,Math.floor(w*0.55))}px;height:${Math.max(36,Math.floor(w*0.55))}px;display:block;margin:0 auto" onerror="this.style.display='none'">`
        : "";
      return `
        <div style="width:${w}px;display:inline-flex;flex-direction:column;align-items:center;justify-content:center;
          padding:${cfg.padding}px;background:${cfg.corFundo};color:${cfg.corTexto};
          border:${cfg.espessuraBorda}px solid ${cfg.corBorda};border-radius:${cfg.raioArredondamento}px;
          font-family:'Courier New',monospace;text-align:center;box-sizing:border-box;gap:2px;
          margin:2px;vertical-align:top;">
          ${cfg.mostrarLoja && config?.nome ? `<div style="font-size:${cfg.tamanhoCodigo}px;opacity:.7;line-height:1.1">${config.nome}</div>` : ""}
          <div style="font-size:${cfg.tamanhoNome}px;font-weight:${cfg.negritoNome?"bold":"normal"};line-height:1.2;word-break:break-word;width:100%">${nome}</div>
          ${cfg.mostrarVariacao && variacao ? `<div style="font-size:${cfg.tamanhoNome-1}px;opacity:.75;line-height:1">${variacao}</div>` : ""}
          ${cfg.mostrarPreco ? `<div style="font-size:${cfg.tamanhoPreco}px;font-weight:${cfg.negritoPreco?"900":"bold"};line-height:1.1;letter-spacing:.3px">${preco(p)}</div>` : ""}
          ${barcodeImg}
          ${qrImg}
          ${cfg.mostrarCodigo && cod ? `<div style="font-size:${cfg.tamanhoCodigo}px;letter-spacing:1px;line-height:1">${cod}</div>` : ""}
        </div>`;
    }).join("");

    const win = window.open("", "_blank", "width=900,height=700");
    if (!win) { alert("Permita popups para imprimir"); return; }
    win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Etiquetas ASTIA PDV</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{background:#fff;padding:8px}
  .grid{display:flex;flex-wrap:wrap;gap:4px;align-items:flex-start}
  @media print{@page{margin:8mm;size:auto}body{padding:0}.grid{gap:3px}}
</style></head><body>
<div class="grid">${cells}</div>
<script>window.onload=()=>setTimeout(()=>window.print(),500)</script>
</body></html>`);
    win.document.close();
    toast({ title: `${itensEtiqueta.length} etiqueta(s) enviada(s) para impressão` });
  };

  const C = (key: keyof EtiqConfig, val: any) => salvarCfg({ [key]: val });

  const fmtAtual = FORMATOS.find(f => f.id === cfg.formato) || FORMATOS[1];

  return (
    <Layout title="Impressão">
      <div className="space-y-4 max-w-6xl mx-auto">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Printer className="w-6 h-6 text-violet-600" /> Impressão</h1>
          <p className="text-sm text-muted-foreground">Etiquetas personalizáveis, cupom e QR Code de consulta</p>
        </div>

        <Tabs defaultValue="etiqueta">
          <TabsList className="grid grid-cols-3 w-full max-w-sm">
            <TabsTrigger value="etiqueta" className="flex items-center gap-1.5"><Tag className="w-3.5 h-3.5" /> Etiquetas</TabsTrigger>
            <TabsTrigger value="cupom" className="flex items-center gap-1.5"><Printer className="w-3.5 h-3.5" /> Cupom</TabsTrigger>
            <TabsTrigger value="qrcode" className="flex items-center gap-1.5"><QrCode className="w-3.5 h-3.5" /> QR Code</TabsTrigger>
          </TabsList>

          {/* ══════ ETIQUETAS ══════ */}
          <TabsContent value="etiqueta" className="mt-4">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

              {/* Painel esquerdo: Configurações */}
              <div className="lg:col-span-1 space-y-3">
                <div className="flex border rounded-xl overflow-hidden">
                  <button onClick={() => setAbaEditor("produtos")}
                    className={`flex-1 py-2 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${abaEditor==="produtos"?"bg-violet-600 text-white":"hover:bg-muted"}`}>
                    <Tag className="w-3.5 h-3.5" /> Produtos
                  </button>
                  <button onClick={() => setAbaEditor("visual")}
                    className={`flex-1 py-2 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${abaEditor==="visual"?"bg-violet-600 text-white":"hover:bg-muted"}`}>
                    <Settings2 className="w-3.5 h-3.5" /> Visual
                  </button>
                </div>

                {/* ── Sub-painel Produtos ── */}
                {abaEditor === "produtos" && (
                  <Card>
                    <CardContent className="pt-4 space-y-3">
                      {/* Busca produto */}
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-3.5 h-3.5" />
                        <Input placeholder="Buscar produto..." value={busca}
                          onChange={e => setBusca(e.target.value)} className="pl-9 h-8 text-sm" />
                      </div>
                      {busca && (
                        <div className="max-h-40 overflow-y-auto rounded-lg border divide-y bg-background shadow text-sm">
                          {prodsFiltrados.slice(0, 8).map(p => (
                            <button key={p.id} type="button"
                              onClick={() => { setLinhas(prev => [...prev.filter(l => l.produtoId !== p.id.toString()), { produtoId: p.id.toString(), qtd: "1" }]); setBusca(""); }}
                              className="w-full flex items-center justify-between px-3 py-2 hover:bg-muted/60 text-left">
                              <span className="font-medium truncate">{p.nome}</span>
                              <span className="text-violet-600 font-bold shrink-0 ml-2">R$ {Number(p.preco_venda).toFixed(2)}</span>
                            </button>
                          ))}
                        </div>
                      )}

                      {/* Lista de linhas adicionadas */}
                      <div className="space-y-2">
                        {linhas.map((l, i) => {
                          const prod = produtos.find(p => p.id.toString() === l.produtoId);
                          return (
                            <div key={i} className="flex items-center gap-2">
                              <div className={`flex-1 text-sm truncate px-2 py-1.5 rounded-lg border ${prod ? "bg-violet-50 dark:bg-violet-950/20 border-violet-300 font-medium" : "bg-muted/30 text-muted-foreground"}`}>
                                {prod ? prod.nome : "Nenhum produto selecionado"}
                              </div>
                              <Input type="number" min={1} max={99} value={l.qtd}
                                onChange={e => setLinhas(prev => prev.map((x, j) => j===i ? {...x, qtd: e.target.value} : x))}
                                className="w-14 h-8 text-center text-sm font-mono" />
                              <button onClick={() => setLinhas(prev => prev.filter((_, j) => j !== i))}
                                className="p-1.5 hover:bg-red-50 dark:hover:bg-red-950/30 rounded text-red-500">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          );
                        })}
                        <button onClick={() => setLinhas(prev => [...prev, { produtoId: "", qtd: "1" }])}
                          className="w-full py-2 border-2 border-dashed rounded-lg text-xs text-muted-foreground hover:border-violet-400 hover:text-violet-600 transition-colors flex items-center justify-center gap-1.5">
                          <Plus className="w-3.5 h-3.5" /> Adicionar linha
                        </button>
                      </div>

                      {/* Colunas */}
                      <div className="flex items-center justify-between pt-1 border-t">
                        <Label className="text-xs">Colunas por linha</Label>
                        <div className="flex gap-1">
                          {[1,2,3,4,5].map(n => (
                            <button key={n} onClick={() => C("colunas", n)}
                              className={`w-7 h-7 rounded-md text-xs font-bold border transition-all ${cfg.colunas===n ? "bg-violet-600 text-white border-violet-600" : "hover:bg-muted"}`}>{n}</button>
                          ))}
                        </div>
                      </div>

                      {/* Botão imprimir */}
                      <Button onClick={imprimir} className="w-full bg-violet-600 hover:bg-violet-700 text-white">
                        <Printer className="w-4 h-4 mr-2" /> Imprimir {itensEtiqueta.length} etiqueta(s)
                      </Button>
                    </CardContent>
                  </Card>
                )}

                {/* ── Sub-painel Visual ── */}
                {abaEditor === "visual" && (
                  <Card>
                    <CardContent className="pt-4 space-y-4">
                      {/* Formato */}
                      <div className="space-y-1.5">
                        <Label className="text-xs font-semibold">Formato</Label>
                        <div className="grid grid-cols-1 gap-1">
                          {FORMATOS.map(f => (
                            <button key={f.id} onClick={() => C("formato", f.id)}
                              className={`px-3 py-1.5 rounded-lg text-xs border text-left transition-all ${cfg.formato===f.id ? "bg-violet-600 text-white border-violet-600" : "hover:bg-muted"}`}>
                              {f.label}
                            </button>
                          ))}
                        </div>
                        {cfg.formato === "custom" && (
                          <div className="flex items-center gap-2 mt-1">
                            <Label className="text-xs whitespace-nowrap">Largura px</Label>
                            <Input type="number" min={60} max={600} value={cfg.largura_custom}
                              onChange={e => C("largura_custom", parseInt(e.target.value) || 150)}
                              className="h-7 text-sm" />
                          </div>
                        )}
                      </div>

                      {/* Campos */}
                      <div className="space-y-1.5">
                        <Label className="text-xs font-semibold">Campos exibidos</Label>
                        <div className="grid grid-cols-2 gap-1.5">
                          {[
                            ["mostrarLoja","Nome da loja"],["mostrarPreco","Preço"],
                            ["mostrarCodigo","Código"],
                            ["mostrarVariacao","Variação"],["mostrarCategoria","Categoria"],
                          ].map(([key, label]) => (
                            <label key={key} className="flex items-center gap-1.5 text-xs cursor-pointer">
                              <input type="checkbox" checked={!!(cfg as any)[key]}
                                onChange={e => C(key as keyof EtiqConfig, e.target.checked)}
                                className="accent-violet-600 w-3.5 h-3.5" />
                              {label}
                            </label>
                          ))}
                        </div>
                      </div>

                      {/* Tipo de código */}
                      {cfg.mostrarCodigo && (
                        <div className="space-y-1.5">
                          <Label className="text-xs font-semibold">Tipo de código</Label>
                          <div className="grid grid-cols-2 gap-1.5">
                            {([
                              ["barras",  "📊 Código de Barras"],
                              ["qrcode",  "⬛ QR Code"],
                              ["ambos",   "📊⬛ Barras + QR"],
                              ["nenhum",  "❌ Só número"],
                            ] as [string, string][]).map(([val, label]) => (
                              <label key={val} className={`flex items-center gap-1.5 text-xs cursor-pointer px-2 py-1.5 rounded border transition-colors ${cfg.tipoCodigo === val ? "border-violet-500 bg-violet-50 dark:bg-violet-950/30 text-violet-700 font-medium" : "border-border hover:bg-muted/50"}`}>
                                <input type="radio" name="tipoCodigo" value={val}
                                  checked={cfg.tipoCodigo === val}
                                  onChange={() => C("tipoCodigo", val)}
                                  className="accent-violet-600 w-3 h-3" />
                                {label}
                              </label>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Fontes */}
                      <div className="space-y-2">
                        <Label className="text-xs font-semibold">Tamanho das fontes</Label>
                        {[
                          { key: "tamanhoNome", label: "Nome", bold: "negritoNome" },
                          { key: "tamanhoPreco", label: "Preço", bold: "negritoPreco" },
                          { key: "tamanhoCodigo", label: "Código", bold: null },
                        ].map(({ key, label, bold }) => (
                          <div key={key} className="flex items-center gap-2">
                            <span className="text-xs w-14 text-muted-foreground">{label}</span>
                            <button onClick={() => C(key as keyof EtiqConfig, Math.max(5, (cfg as any)[key] - 1))} className="w-6 h-6 border rounded text-sm font-bold hover:bg-muted">−</button>
                            <span className="w-6 text-center text-xs font-mono">{(cfg as any)[key]}</span>
                            <button onClick={() => C(key as keyof EtiqConfig, Math.min(30, (cfg as any)[key] + 1))} className="w-6 h-6 border rounded text-sm font-bold hover:bg-muted">+</button>
                            {bold && (
                              <label className="flex items-center gap-1 text-xs cursor-pointer ml-1">
                                <input type="checkbox" checked={!!(cfg as any)[bold]}
                                  onChange={e => C(bold as keyof EtiqConfig, e.target.checked)}
                                  className="accent-violet-600 w-3 h-3" /> Bold
                              </label>
                            )}
                          </div>
                        ))}
                      </div>

                      {/* Cores */}
                      <div className="space-y-2">
                        <Label className="text-xs font-semibold">Cores</Label>
                        {[
                          { key: "corFundo", label: "Fundo" },
                          { key: "corTexto", label: "Texto" },
                          { key: "corBorda", label: "Borda" },
                        ].map(({ key, label }) => (
                          <div key={key} className="flex items-center gap-2">
                            <span className="text-xs w-12 text-muted-foreground">{label}</span>
                            <input type="color" value={(cfg as any)[key]}
                              onChange={e => C(key as keyof EtiqConfig, e.target.value)}
                              className="w-8 h-6 rounded border cursor-pointer" />
                            <span className="text-xs font-mono text-muted-foreground">{(cfg as any)[key]}</span>
                          </div>
                        ))}
                      </div>

                      {/* Borda e arredondamento */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs">Espessura borda</Label>
                          <Input type="number" min={0} max={5} value={cfg.espessuraBorda}
                            onChange={e => C("espessuraBorda", parseInt(e.target.value) || 0)} className="h-7 text-sm" />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Arredondamento</Label>
                          <Input type="number" min={0} max={20} value={cfg.raioArredondamento}
                            onChange={e => C("raioArredondamento", parseInt(e.target.value) || 0)} className="h-7 text-sm" />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Padding interno</Label>
                          <Input type="number" min={0} max={20} value={cfg.padding}
                            onChange={e => C("padding", parseInt(e.target.value) || 2)} className="h-7 text-sm" />
                        </div>
                      </div>
                      <button onClick={() => { setCfg(configPadrao); localStorage.removeItem("astia_etiq_cfg"); }}
                        className="w-full py-1.5 text-xs border rounded-lg hover:bg-muted text-muted-foreground">
                        Restaurar padrão
                      </button>
                    </CardContent>
                  </Card>
                )}
              </div>

              {/* Painel direito: Preview */}
              <div className="lg:col-span-2 space-y-3">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Eye className="w-4 h-4 text-violet-600" /> Preview ao vivo
                      <Badge variant="secondary" className="text-xs">{itensEtiqueta.length} etiqueta(s)</Badge>
                      <span className="text-xs text-muted-foreground ml-auto">{fmtAtual.label} · {cfg.colunas} colunas</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {itensEtiqueta.length === 0 ? (
                      <div className="flex items-center justify-center py-16 text-muted-foreground border-2 border-dashed rounded-xl">
                        <div className="text-center">
                          <Tag className="w-10 h-10 mx-auto mb-2 opacity-20" />
                          <p className="text-sm">Busque e selecione produtos para ver o preview</p>
                        </div>
                      </div>
                    ) : (
                      <div className="overflow-auto bg-muted/20 rounded-xl p-4 border">
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                          {itensEtiqueta.map((p, i) => (
                            <EtiquetaPreview key={i} produto={p} cfg={cfg} loja={config} />
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          {/* ══════ CUPOM ══════ */}
          <TabsContent value="cupom" className="mt-4">
            <Card className="max-w-lg">
              <CardHeader><CardTitle className="text-base">Teste de Cupom Não Fiscal</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">O cupom é gerado automaticamente após cada venda no PDV. Use esta aba para testar o modelo.</p>
                <div className="p-4 bg-muted/30 rounded-xl font-mono text-xs space-y-1 border">
                  <p className="text-center font-bold text-sm">{config?.nome || "ASTIA PDV"}</p>
                  {config?.cnpj && <p className="text-center">CNPJ: {config.cnpj}</p>}
                  <p className="border-t border-dashed my-1"></p>
                  <p>CUPOM NÃO FISCAL</p>
                  <p>Data: {new Date().toLocaleString("pt-BR")}</p>
                  <p className="border-t border-dashed my-1"></p>
                  <p>Camiseta Básica    2x  R$99,80</p>
                  <p>Calça Jeans        1x  R$120,00</p>
                  <p className="border-t border-dashed my-1"></p>
                  <p className="font-bold">TOTAL: R$ 219,80</p>
                  <p>Pagamento: PIX</p>
                  <p className="border-t border-dashed my-1"></p>
                  <p className="text-center">Obrigado pela preferência!</p>
                </div>
                <p className="text-xs text-muted-foreground">O cupom real é impresso automaticamente ao finalizar a venda no PDV (se impressora configurada).</p>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ══════ QR CODE ══════ */}
          <TabsContent value="qrcode" className="mt-4">
            <Card className="max-w-md">
              <CardHeader><CardTitle className="text-base">QR Code — Consulta de Preços</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Imprima este QR Code e coloque na loja. Clientes escaneiam e consultam preços pelo celular.
                </p>
                <div className="flex flex-col items-center gap-4 p-6 bg-white dark:bg-slate-900 rounded-xl border">
                  <QRCodeImg url={consultaURL} size={200} />
                  <div className="text-center">
                    <p className="text-xs font-mono text-muted-foreground break-all">{consultaURL || "Aguardando IP do servidor..."}</p>
                  </div>
                </div>
                <Button className="w-full" variant="outline"
                  onClick={() => {
                    const win = window.open("", "_blank", "width=400,height=500");
                    if (!win) return;
                    win.document.write(`<!DOCTYPE html><html><head><title>QR Code</title>
<style>body{font-family:Arial,sans-serif;text-align:center;padding:40px}h2{margin-bottom:4px}p{color:#666;font-size:13px}</style>
</head><body><h2>${config?.nome || "ASTIA PDV"}</h2><p>Consulte preços pelo celular</p><br>
<img src="https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(consultaURL)}&margin=4" style="border:1px solid #ddd;border-radius:8px">
<br><br><p style="font-family:monospace;font-size:11px">${consultaURL}</p>
<script>window.onload=()=>setTimeout(()=>window.print(),400)</script></body></html>`);
                    win.document.close();
                  }}>
                  <Printer className="w-4 h-4 mr-2" /> Imprimir QR Code
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
