/**
 * ASTIA PDV — Consulta de Preços
 * Pública (sem login) — acessível pelo QR Code via Wi-Fi
 * Câmera para escanear código de barras no celular
 */
import { useState, useEffect, useRef } from "react";
import { produtosAPI, configAPI } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Search, Package, Tag, X, Camera, ZoomIn } from "lucide-react";

export default function ConsultaPreco() {
  const [busca, setBusca] = useState("");
  const [produtos, setProdutos] = useState<any[]>([]);
  const [config, setConfig] = useState<any>({});
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [cameraAberta, setCameraAberta] = useState(false);
  const [cameraErro, setCameraErro] = useState("");
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    configAPI.get().then(c => setConfig(c || {})).catch(() => {});
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (busca.trim().length < 2) { setProdutos([]); setErro(""); return; }
    setLoading(true);
    setErro("");
    const t = setTimeout(async () => {
      try {
        const data = await produtosAPI.listar({ busca: busca.trim(), ativo: 1 });
        setProdutos(data || []);
        if ((data || []).length === 0) setErro(`Nenhum produto encontrado para "${busca}"`);
      } catch {
        setErro("Erro ao buscar. Verifique a conexão com o servidor.");
        setProdutos([]);
      } finally { setLoading(false); }
    }, 350);
    return () => clearTimeout(t);
  }, [busca]);

  const abrirCamera = async () => {
    setCameraErro("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      streamRef.current = stream;
      setCameraAberta(true);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().then(() => {
            // Inicia scan automático contínuo após 1s (dá tempo para câmera focar)
            setTimeout(() => iniciarScanContinuo(), 1000);
          }).catch(() => {});
        }
      }, 100);
    } catch {
      setCameraErro("Não foi possível acessar a câmera. Verifique as permissões do navegador.");
    }
  };

  const fecharCamera = () => {
    if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setCameraAberta(false);
    setCameraErro("");
  };

  const scanIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const iniciarScanContinuo = () => {
    // @ts-ignore
    if (!("BarcodeDetector" in window)) {
      setCameraErro("Use o campo de busca para digitar o código. (BarcodeDetector não suportado neste navegador)");
      return;
    }
    setCameraErro("");
    // @ts-ignore
    const detector = new BarcodeDetector({ formats: ["ean_13","ean_8","code_128","code_39","qr_code"] });
    scanIntervalRef.current = setInterval(async () => {
      if (!videoRef.current) return;
      try {
        const barcodes = await detector.detect(videoRef.current);
        if (barcodes.length > 0) {
          clearInterval(scanIntervalRef.current!);
          setBusca(barcodes[0].rawValue);
          fecharCamera();
        }
      } catch {}
    }, 500);
  };

  const capturarFrame = async () => {
    if (!videoRef.current) return;
    // @ts-ignore
    if (!("BarcodeDetector" in window)) {
      // Fallback: captura canvas e tenta ler
      setCameraErro("Leitura automática não disponível. Digite o código manualmente.");
      return;
    }
    try {
      // @ts-ignore
      const detector = new BarcodeDetector({ formats: ["ean_13","ean_8","code_128","qr_code"] });
      const barcodes = await detector.detect(videoRef.current);
      if (barcodes.length > 0) {
        setBusca(barcodes[0].rawValue);
        fecharCamera();
      } else {
        setCameraErro("Nenhum código detectado. Tente aproximar mais.");
        setTimeout(() => setCameraErro(""), 2500);
      }
    } catch (e: any) { setCameraErro("Erro: " + e.message); }
  };

  useEffect(() => { return () => { fecharCamera(); if (scanIntervalRef.current) clearInterval(scanIntervalRef.current); }; }, []);

  const fmt = (v: number) => `R$ ${Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)" }}>

      {/* Camera overlay */}
      {cameraAberta && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col">
          <div className="flex items-center justify-between p-4">
            <h3 className="text-white font-bold">Escanear código de barras</h3>
            <button onClick={fecharCamera} className="text-white p-2"><X className="w-6 h-6" /></button>
          </div>
          <div className="flex-1 relative">
            <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-64 h-40 border-2 border-white/80 rounded-lg relative">
                <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-violet-400 rounded-tl" />
                <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-violet-400 rounded-tr" />
                <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-violet-400 rounded-bl" />
                <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-violet-400 rounded-br" />
              </div>
            </div>
            {cameraErro && (
              <div className="absolute bottom-24 left-0 right-0 text-center">
                <span className="bg-red-500/90 text-white text-sm px-4 py-2 rounded-full">{cameraErro}</span>
              </div>
            )}
          </div>
          <div className="p-6 flex flex-col gap-3">
            <button onClick={capturarFrame}
              className="w-full py-4 bg-violet-600 hover:bg-violet-700 text-white font-bold rounded-2xl text-lg flex items-center justify-center gap-2">
              <ZoomIn className="w-6 h-6" /> Capturar código
            </button>
            <p className="text-slate-400 text-xs text-center">Aponte para o código de barras e toque em "Capturar"</p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="text-center py-6 px-4">
        <h1 className="text-2xl font-bold text-white">{config.nome || "ASTIA PDV"}</h1>
        <p className="text-slate-400 text-sm mt-1">Consulta de Preços</p>
      </div>

      {/* Campo de busca */}
      <div className="px-4 pb-4 max-w-2xl mx-auto w-full">
        <div className="flex gap-2">
          {/* Input de busca */}
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5 pointer-events-none" />
            <Input
              ref={inputRef}
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Nome, código de barras ou EAN..."
              className="pl-12 pr-10 py-6 text-base bg-white/10 border-white/20 text-white placeholder:text-slate-400 focus:bg-white/20 focus:border-white/40 rounded-2xl"
            />
            {busca && (
              <button
                onClick={() => { setBusca(""); setProdutos([]); inputRef.current?.focus(); }}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          {/* Botão câmera */}
          <button
            onClick={abrirCamera}
            className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0"
            style={{ background: "linear-gradient(135deg, #7c3aed, #6600ff)" }}
            title="Escanear com a câmera"
          >
            <Camera className="w-6 h-6 text-white" />
          </button>
        </div>
        <p className="text-slate-500 text-xs text-center mt-2">
          Conecte um leitor de código de barras USB ou toque em 📷 para usar a câmera
        </p>
      </div>

      {/* Resultados */}
      <div className="flex-1 px-4 pb-8 max-w-2xl mx-auto w-full">
        {loading && (
          <div className="text-center text-slate-400 py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto mb-3" />
            Buscando...
          </div>
        )}

        {erro && !loading && (
          <div className="text-center text-slate-400 py-12">
            <Package className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>{erro}</p>
          </div>
        )}

        {!loading && produtos.length > 0 && (
          <div className="space-y-3">
            {produtos.map(p => (
              <Card key={p.id} className="bg-white/10 border-white/10 hover:bg-white/15 transition-colors">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-white text-base leading-tight">{p.nome}</h3>
                      {p.categoria_nome && (
                        <div className="flex items-center gap-1 mt-1">
                          <Tag className="w-3 h-3 text-slate-400" />
                          <span className="text-xs text-slate-400">{p.categoria_nome}</span>
                        </div>
                      )}
                      {(p.codigo_barras || p.sku) && (
                        <p className="text-xs text-slate-500 mt-1 font-mono">{p.codigo_barras || p.sku}</p>
                      )}
                      {/* Estoque */}
                      <div className={`inline-flex items-center gap-1.5 mt-2 px-2 py-1 rounded-full text-xs font-semibold ${
                        p.estoque_atual <= 0
                          ? "bg-red-500/20 text-red-400 border border-red-500/30"
                          : p.estoque_atual <= (p.estoque_minimo || 5)
                            ? "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30"
                            : "bg-green-500/20 text-green-400 border border-green-500/30"
                      }`}>
                        <Package className="w-3 h-3" />
                        {p.estoque_atual <= 0
                          ? "Sem estoque"
                          : `${p.estoque_atual} ${p.unidade_medida || "un"} em estoque`
                        }
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-2xl font-black text-white">
                        {fmt(p.preco_venda)}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Rodapé */}
      <div className="py-4 text-center text-slate-600 text-xs border-t border-white/5">
        ASTIA PDV by VYN Developer
      </div>
    </div>
  );
}
