/**
 * ASTIA PDV — Scanner Mobile v1.0
 * Página acessível pelo celular via http://IP:3567/scanner
 * Usa a câmera do celular para ler QR Code / Código de Barras
 * Resultado é enviado de volta para o PDV via WebSocket-like polling
 */
import { useState, useEffect, useRef } from "react";
import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { produtosAPI, sistemaAPI } from "@/lib/api";
import { Scan, Camera, Search, Package, DollarSign, Hash, CheckCircle, XCircle, Smartphone, Wifi, QrCode } from "lucide-react";

// ── QRCode scanner via jsQR (carregado dinamicamente) ─────────────────────
declare global {
  interface Window { jsQR?: any; }
}

type Modo = "consulta" | "pdv";
type Resultado = { codigo: string; produto: any | null; timestamp: number };

export default function ScannerMobile() {
  const { toast } = useToast();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanLoopRef = useRef<number>(0);

  const [modo, setModo] = useState<Modo>("consulta");
  const [ativo, setAtivo] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [historico, setHistorico] = useState<Resultado[]>([]);
  const [serverIP, setServerIP] = useState("localhost");
  const [jsQRLoaded, setJsQRLoaded] = useState(false);

  const fmt = (v: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);

  useEffect(() => {
    sistemaAPI.getServerIP().then(ip => { if (ip) setServerIP(ip); }).catch(() => {});

    // Carrega jsQR dinamicamente
    if (!window.jsQR) {
      const script = document.createElement("script");
      script.src = "https://cdnjs.cloudflare.com/ajax/libs/jsQR/1.4.0/jsQR.min.js";
      script.onload = () => setJsQRLoaded(true);
      script.onerror = () => setJsQRLoaded(true); // continua sem QR
      document.head.appendChild(script);
    } else {
      setJsQRLoaded(true);
    }

    return () => { pararCamera(); };
  }, []);

  const iniciarCamera = async () => {
    setCarregando(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" }, // câmera traseira
          width: { ideal: 1280 },
          height: { ideal: 720 },
        }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setAtivo(true);
      iniciarScan();
    } catch (e: any) {
      toast({
        title: "Sem acesso à câmera",
        description: "Permita o acesso à câmera nas configurações do navegador",
        variant: "destructive"
      });
    } finally { setCarregando(false); }
  };

  const pararCamera = () => {
    cancelAnimationFrame(scanLoopRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setAtivo(false);
  };

  const iniciarScan = () => {
    const tick = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
        scanLoopRef.current = requestAnimationFrame(tick);
        return;
      }

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

      // Tenta QR Code
      if (window.jsQR) {
        const qr = window.jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: "dontInvert",
        });
        if (qr?.data) {
          processarCodigo(qr.data);
          return;
        }
      }

      // Tenta código de barras via BarcodeDetector (suportado em browsers modernos)
      if ("BarcodeDetector" in window) {
        // @ts-ignore
        const detector = new BarcodeDetector({ formats: ["ean_13","ean_8","code_128","code_39","qr_code","upc_a","upc_e"] });
        detector.detect(canvas).then((barcodes: any[]) => {
          if (barcodes.length > 0) {
            processarCodigo(barcodes[0].rawValue);
          }
        }).catch(() => {});
      }

      scanLoopRef.current = requestAnimationFrame(tick);
    };
    scanLoopRef.current = requestAnimationFrame(tick);
  };

  const ultimaLeituraRef = useRef<string>("");
  const ultimoTempoRef = useRef<number>(0);

  const processarCodigo = async (codigo: string) => {
    const agora = Date.now();
    // Debounce: ignora mesmo código por 3 segundos
    if (codigo === ultimaLeituraRef.current && agora - ultimoTempoRef.current < 3000) return;
    ultimaLeituraRef.current = codigo;
    ultimoTempoRef.current = agora;

    // Vibra o celular
    navigator.vibrate?.(100);

    // Pausa o scan por 2s para não re-ler
    cancelAnimationFrame(scanLoopRef.current);

    try {
      const produto = await produtosAPI.buscarPorCodigo(codigo).catch(() => null);
      const res: Resultado = { codigo, produto, timestamp: agora };
      setResultado(res);
      setHistorico(prev => [res, ...prev.slice(0, 9)]);

      // Envia para o PDV se estiver no modo PDV
      if (modo === "pdv") {
        await enviarParaPDV(codigo, produto);
      }
    } catch {}

    // Retoma scan após 2s
    setTimeout(() => {
      if (streamRef.current) iniciarScan();
    }, 2000);
  };

  const enviarParaPDV = async (codigo: string, produto: any) => {
    try {
      // Envia o código via endpoint especial do servidor
      await fetch(`http://${serverIP}:3567/api/scanner`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codigo, produto_id: produto?.id }),
      });
      toast({ title: `✅ Enviado para o PDV: ${produto?.nome || codigo}` });
    } catch {
      toast({ title: "PDV não conectado", description: "Use no modo Consulta", variant: "destructive" });
    }
  };

  const isNegativo = (v: number) => v <= 0;

  return (
    <Layout title="Scanner Mobile">
      <div className="space-y-4 max-w-lg mx-auto">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Scan className="w-6 h-6" /> Scanner Mobile
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Use a câmera do celular para ler QR Code ou código de barras
          </p>
        </div>

        {/* QR de acesso pelo celular */}
        <Card className="border-dashed">
          <CardContent className="pt-4 pb-3 flex items-center gap-3">
            <Smartphone className="w-5 h-5 text-muted-foreground shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">Acesse pelo celular</p>
              <p className="text-xs text-muted-foreground font-mono truncate">
                http://{serverIP}:3567/scanner
              </p>
            </div>
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=${encodeURIComponent(`http://${serverIP}:3567/scanner`)}&bgcolor=ffffff&color=000000&margin=2`}
              alt="QR de acesso" className="w-20 h-20 rounded border"
              onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          </CardContent>
        </Card>

        {/* Modo */}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setModo("consulta")}
            className={`p-3 rounded-xl border-2 text-sm font-medium transition-colors text-left ${modo === "consulta" ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}`}>
            <Search className="w-4 h-4 mb-1 text-primary" />
            <p className="font-semibold">Consulta de Preço</p>
            <p className="text-xs text-muted-foreground font-normal">Ver produto e preço</p>
          </button>
          <button
            onClick={() => setModo("pdv")}
            className={`p-3 rounded-xl border-2 text-sm font-medium transition-colors text-left ${modo === "pdv" ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}`}>
            <DollarSign className="w-4 h-4 mb-1 text-primary" />
            <p className="font-semibold">Enviar para PDV</p>
            <p className="text-xs text-muted-foreground font-normal">Adiciona ao carrinho</p>
          </button>
        </div>

        {/* Camera */}
        <Card>
          <CardContent className="pt-4">
            <div style={{
              position: "relative",
              borderRadius: 12, overflow: "hidden",
              background: "#000",
              aspectRatio: "4/3",
            }}>
              <video
                ref={videoRef}
                style={{ width: "100%", height: "100%", objectFit: "cover", display: ativo ? "block" : "none" }}
                playsInline muted
              />
              <canvas ref={canvasRef} style={{ display: "none" }} />

              {/* Overlay de mira */}
              {ativo && (
                <div style={{
                  position: "absolute", inset: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  pointerEvents: "none",
                }}>
                  <div style={{
                    width: "65%", aspectRatio: "1",
                    border: "2px solid rgba(124,92,252,0.8)",
                    borderRadius: 12,
                    boxShadow: "0 0 0 9999px rgba(0,0,0,0.4)",
                    position: "relative",
                  }}>
                    {/* Cantos */}
                    {[
                      { top: -2, left: -2, borderTop: "3px solid #7c5cfc", borderLeft: "3px solid #7c5cfc", borderRadius: "10px 0 0 0" },
                      { top: -2, right: -2, borderTop: "3px solid #7c5cfc", borderRight: "3px solid #7c5cfc", borderRadius: "0 10px 0 0" },
                      { bottom: -2, left: -2, borderBottom: "3px solid #7c5cfc", borderLeft: "3px solid #7c5cfc", borderRadius: "0 0 0 10px" },
                      { bottom: -2, right: -2, borderBottom: "3px solid #7c5cfc", borderRight: "3px solid #7c5cfc", borderRadius: "0 0 10px 0" },
                    ].map((s, i) => (
                      <div key={i} style={{ position: "absolute", width: 24, height: 24, ...s as any }} />
                    ))}
                  </div>
                </div>
              )}

              {/* Placeholder quando inativo */}
              {!ativo && (
                <div style={{
                  position: "absolute", inset: 0,
                  display: "flex", flexDirection: "column",
                  alignItems: "center", justifyContent: "center",
                  gap: 8, color: "#666",
                }}>
                  <Camera size={40} />
                  <p style={{ fontSize: 13 }}>Câmera desativada</p>
                </div>
              )}
            </div>

            <div className="flex gap-2 mt-3">
              {!ativo ? (
                <Button onClick={iniciarCamera} disabled={carregando} className="flex-1">
                  <Camera className="w-4 h-4 mr-2" />
                  {carregando ? "Abrindo câmera..." : "Ativar Scanner"}
                </Button>
              ) : (
                <Button onClick={pararCamera} variant="outline" className="flex-1">
                  <XCircle className="w-4 h-4 mr-2" />Parar
                </Button>
              )}
            </div>

            {!jsQRLoaded && (
              <p className="text-xs text-muted-foreground text-center mt-2">Carregando leitor de QR Code...</p>
            )}
            {"BarcodeDetector" in window ? null : (
              <p className="text-xs text-amber-600 text-center mt-2">
                ⚠️ Seu navegador tem suporte limitado a códigos de barras. Use Chrome ou Edge para melhor resultado.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Resultado */}
        {resultado && (
          <Card className={resultado.produto ? "border-green-300 dark:border-green-800" : "border-red-300 dark:border-red-800"}>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-start gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${resultado.produto ? "bg-green-100 dark:bg-green-900/30" : "bg-red-100 dark:bg-red-900/30"}`}>
                  {resultado.produto ? <CheckCircle className="w-5 h-5 text-green-600" /> : <XCircle className="w-5 h-5 text-red-500" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-mono text-xs text-muted-foreground">{resultado.codigo}</p>
                  {resultado.produto ? (
                    <>
                      <p className="font-bold text-base mt-0.5">{resultado.produto.nome}</p>
                      <div className="flex items-center gap-3 mt-2 flex-wrap">
                        <span className="text-lg font-bold text-green-700 dark:text-green-400">
                          {fmt(resultado.produto.preco_venda)}
                        </span>
                        <Badge variant={isNegativo(resultado.produto.estoque_atual) ? "destructive" : "secondary"} className="text-xs">
                          Estoque: {resultado.produto.estoque_atual}
                        </Badge>
                        {resultado.produto.categoria_nome && (
                          <Badge variant="outline" className="text-xs">{resultado.produto.categoria_nome}</Badge>
                        )}
                      </div>
                      {resultado.produto.preco_custo > 0 && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Custo: {fmt(resultado.produto.preco_custo)} · Margem: {resultado.produto.percentual_lucro > 0 ? `${Number(resultado.produto.percentual_lucro).toFixed(1)}%` : "—"}
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-red-600 mt-0.5">Produto não encontrado no sistema</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Histórico */}
        {historico.length > 1 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Últimas leituras</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-2">
                {historico.slice(1, 6).map((r, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm py-1.5 border-b last:border-0">
                    <Hash className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className="font-mono text-xs text-muted-foreground flex-1 truncate">{r.codigo}</span>
                    {r.produto ? (
                      <span className="font-medium truncate">{r.produto.nome}</span>
                    ) : (
                      <span className="text-red-500 text-xs">Não encontrado</span>
                    )}
                    {r.produto && (
                      <span className="font-bold text-xs shrink-0">{fmt(r.produto.preco_venda)}</span>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Info sobre modo PDV */}
        {modo === "pdv" && (
          <div className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-xl text-sm text-blue-800 dark:text-blue-300">
            <Wifi className="w-4 h-4 mt-0.5 shrink-0" />
            <span>No modo PDV, o código lido é enviado automaticamente para o PDV aberto no computador. Certifique-se de que o celular está na mesma rede Wi-Fi.</span>
          </div>
        )}
      </div>
    </Layout>
  );
}
