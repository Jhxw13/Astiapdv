/**
 * ASTIA PDV — Flyers & Promoções v6.0
 * - Fonte "Oferta do Dia" embutida (sem internet)
 * - Logo da loja automática no header (sem nome)
 * - Preço promocional com tachado
 * - Ícones SVG profissionais
 * - Cores 100% customizáveis
 * - PDF 100% local via Electron
 */
import { useState, useEffect } from "react";
import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { flyersAPI, configAPI, getLogoURL } from "@/lib/api";
import { OFERTA_DO_DIA_B64 } from "@/lib/fontOfertaDoDia";
import {
  Megaphone, Search, Plus, X, AlertTriangle,
  ChevronRight, Eye, RefreshCw, Zap, Loader2,
  FileText, LayoutGrid, Palette, Type, Tag
} from "lucide-react";

const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);

const TEMPLATES = [
  { id: "oferta_semana",  nome: "Oferta da Semana",      emoji: "🏷️", cor: "#dc2626", bg: "#fff0f0", card: "#ffffff", texto: "#1a1a1a", desc: "Clássico vermelho" },
  { id: "perto_validade", nome: "Perto da Validade",     emoji: "⚡", cor: "#d97706", bg: "#fffbeb", card: "#ffffff", texto: "#1a1a1a", desc: "Sugestão automática", auto: true },
  { id: "black_friday",   nome: "Black Friday",          emoji: "🔥", cor: "#f59e0b", bg: "#09090b", card: "#1c1c1e", texto: "#f8f8f8", desc: "Dark + dourado" },
  { id: "acougue",        nome: "Açougue / Frigorífico", emoji: "🥩", cor: "#991b1b", bg: "#fff5f5", card: "#ffffff", texto: "#1a1a1a", desc: "Vermelho forte" },
  { id: "padaria",        nome: "Padaria / Mercearia",   emoji: "🥖", cor: "#92400e", bg: "#fffbf0", card: "#ffffff", texto: "#1a1a1a", desc: "Tom quente" },
  { id: "personalizado",  nome: "Personalizado",         emoji: "✨", cor: "#6d28d9", bg: "#faf5ff", card: "#ffffff", texto: "#1a1a1a", desc: "Cores livres", custom: true },
];

const FONTES_TITULO = [
  { id: "Oferta do Dia", nome: "Oferta do Dia ⭐", info: "Embutida — funciona offline" },
  { id: "Bebas Neue",    nome: "Bebas Neue",       info: "Display impacto" },
  { id: "Oswald",        nome: "Oswald",            info: "Forte e legível" },
  { id: "Righteous",     nome: "Righteous",         info: "Moderno arredondado" },
  { id: "Russo One",     nome: "Russo One",         info: "Pesado e marcante" },
];

const FONTES_TEXTO = [
  { id: "Inter",   nome: "Inter" },
  { id: "Lato",    nome: "Lato" },
  { id: "Roboto",  nome: "Roboto" },
  { id: "Poppins", nome: "Poppins" },
  { id: "Nunito",  nome: "Nunito" },
];

// ── Ícones SVG profissionais (stroke, sem emoji) ──────────────────────────
function getIconeSVG(categoria: string, cor: string, size = 52): string {
  const cat = (categoria || "").toLowerCase();
  const wrap = (d: string) =>
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${cor}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="11" fill="${cor}18"/>${d}</svg>`;

  if (/carn|açougu|frig|frango|aves|suín|peixe/.test(cat))
    return wrap('<path d="M8.5 17.5C7 16 5 13.5 5 11c0-3.9 3.1-7 7-7s7 3.1 7 7c0 2.5-2 5-3.5 6.5"/><path d="M8.5 17.5c-1 1-1.5 2-1.5 2s2.5.5 5-2"/><circle cx="12" cy="11" r="2" fill="'+cor+'44"/>');
  if (/pão|pad|bolo|confeit|biscoito|torta|doce/.test(cat))
    return wrap('<path d="M5 12c0-3.9 3.1-7 7-7s7 3.1 7 7v1H5v-1Z"/><rect x="4" y="13" width="16" height="3" rx="1.5"/><path d="M12 5V3M9 6.5 12 5l3 1.5"/>');
  if (/leit|queij|laticín|iogurt|manteig/.test(cat))
    return wrap('<rect x="8" y="5" width="8" height="14" rx="2"/><path d="M8 9h8M11 5v4M13 5v4"/><circle cx="12" cy="14" r="1.5" fill="'+cor+'44"/>');
  if (/bebid|refrig|suco|água|cerv|vinho|café|chá/.test(cat))
    return wrap('<path d="M7 3h10l-1 8H8L7 3Z"/><path d="M8 11v7a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-7"/><path d="M15 7h2a2 2 0 0 1 2 2v1h-4"/>');
  if (/limp|higi|lavar|sabon|deterg/.test(cat))
    return wrap('<path d="M9 3h6l1 5H8L9 3Z"/><rect x="6" y="8" width="12" height="12" rx="2"/><path d="M12 12v4M10 14h4"/>');
  if (/hortifr|frut|verdur|legum|salad/.test(cat))
    return wrap('<circle cx="12" cy="15" r="5"/><path d="M12 10V7M9 8c1-2 3-3 3-3s2 1 3 3M9 15c0-1.7 1.3-3 3-3s3 1.3 3 3"/>');
  if (/frios|congel|embut|salsicha|linguiça/.test(cat))
    return wrap('<rect x="3" y="8" width="18" height="11" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2M12 12v3M10 13.5h4"/>');
  if (/cereal|grão|arroz|feijão|macarro|farinha/.test(cat))
    return wrap('<path d="M3 11h18v1a9 9 0 0 1-18 0v-1Z"/><path d="M12 11V6M8 8.5c1-2 2-3 4-3s3 1 4 3"/>');
  if (/beleza|cosm|maquiag|cabelo|perfum/.test(cat))
    return wrap('<path d="M12 2a4 4 0 0 1 4 4v1H8V6a4 4 0 0 1 4-4Z"/><rect x="6" y="7" width="12" height="13" rx="2"/><path d="M12 11v5M10 13h4"/>');
  if (/eletr|celular|fone|computad/.test(cat))
    return wrap('<rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>');
  return wrap('<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><polyline points="3.29 7 12 12 20.71 7"/><line x1="12" y1="22" x2="12" y2="12"/>');
}

const WA_SVG = '<svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/></svg>';

// ── Gerador HTML ───────────────────────────────────────────────────────────
function gerarHTML(produtos: any[], tpl: typeof TEMPLATES[0], cfg: any, loja: any, fontB64: string): string {
  const corH    = cfg.corHeader   || tpl.cor;
  const corBg   = cfg.corBgPage   || tpl.bg;
  const corCard = cfg.corCard     || tpl.card;
  const corTxt  = cfg.corTexto    || tpl.texto;
  const fontTit = cfg.fonteTitulo || "Oferta do Dia";
  const fontTx  = cfg.fonteTexto  || "Inter";
  const cols    = cfg.colunas     || 3;
  const logoH   = cfg.logoSize    || 60; // altura da logo em px
  const isDark  = corCard < "#888888";
  const border  = isDark ? "#333" : "#e0e0e0";
  const muted   = isDark ? "#999" : "#777";

  // fonteTitulo: se for "Oferta do Dia" usa a embutida, senão carrega do Google
  const isTitEmbutida = fontTit === "Oferta do Dia";
  const gfFontes = [
    fontTx,
    ...(!isTitEmbutida ? [fontTit] : []),
  ].filter(Boolean).map(f => `family=${f.replace(/ /g,"+")}:wght@400;500;600;700;800;900`).join("&");
  const gfUrl = `https://fonts.googleapis.com/css2?${gfFontes}&display=swap`;
  const fontTitCss = isTitEmbutida ? "'Oferta do Dia'" : `'${fontTit}'`;

  const logoB64 = loja?.logoBase64 || null;
  const logoURL = loja?.logoURL || "";
  const nome    = loja?.nome || "Minha Loja";
  const end1    = [loja?.logradouro, loja?.numero].filter(Boolean).join(", ");
  const end2    = [loja?.bairro, loja?.cidade, loja?.estado].filter(Boolean).join(" - ");
  const tel     = loja?.telefone || "";
  const cel     = loja?.celular  || "";
  const wp      = loja?.whatsapp || cel || tel || "";
  const wpNum   = wp.replace(/\D/g,"");
  const wpLink  = wpNum ? `https://wa.me/55${wpNum}` : "";

  // Logo no header — só imagem, sem nome
  const logoSrc = logoB64 || logoURL;
  const logoHTML = logoSrc
    ? `<img src="${logoSrc}" style="height:${logoH}px;max-width:${logoH * 4}px;width:auto;object-fit:contain;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.3));flex-shrink:0;" />`
    : `<div style="height:${logoH}px;padding:0 16px;border-radius:12px;background:rgba(255,255,255,0.2);display:flex;align-items:center;font-family:${fontTitCss},sans-serif;font-size:${Math.round(logoH*0.42)}px;color:white;letter-spacing:0.06em;flex-shrink:0;">${nome.slice(0,10).toUpperCase()}</div>`;

  // QR Code
  const qrHTML = wpLink
    ? `<div style="display:flex;flex-direction:column;align-items:center;gap:4px;flex-shrink:0;">
        <div style="background:white;border-radius:10px;padding:4px;">
          <img src="https://api.qrserver.com/v1/create-qr-code/?size=76x76&data=${encodeURIComponent(wpLink)}&margin=2" width="76" height="76" style="display:block;border-radius:6px;"/>
        </div>
        <div style="display:flex;align-items:center;gap:4px;margin-top:2px;">
          ${WA_SVG}
          <span style="font-size:8px;color:rgba(255,255,255,0.9);font-weight:700;font-family:'${fontTx}',sans-serif;letter-spacing:0.05em;">FALE CONOSCO</span>
        </div>
      </div>`
    : "";

  const faixa = `background:linear-gradient(90deg,${corH} 0%,${corH}aa 60%,transparent 100%)`;

  const cards = produtos.map(p => {
    const temFoto   = !!p.online_foto_url;
    const icone     = getIconeSVG(p.categoria_nome||"", corH, 52);
    const temPromo  = !!p.promocao_ativa && p.preco_promocional > 0;
    const precoShow = temPromo ? fmt(p.preco_promocional) : fmt(p.preco_venda);
    const isVal     = tpl.id === "perto_validade" && p.data_validade;
    const dias      = isVal ? Math.round((new Date(p.data_validade).getTime() - Date.now()) / 86400000) : null;

    // Badge de desconto
    const descPct = temPromo ? Math.round((1 - p.preco_promocional / p.preco_venda) * 100) : 0;

    return `<div style="background:${corCard};border:1.5px solid ${border};border-radius:16px;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 3px 16px rgba(0,0,0,${isDark?"0.45":"0.08"});">
  <!-- Área da imagem: proporção fixa 1:1 aprox 130px -->
  <div style="height:130px;background:${corH}18;display:flex;align-items:center;justify-content:center;position:relative;overflow:hidden;">
    ${temFoto
      ? `<img src="${p.online_foto_url}" style="width:100%;height:100%;object-fit:cover;" onerror="this.style.display='none';this.nextSibling.style.display='flex'"/><div style="display:none;width:100%;height:100%;align-items:center;justify-content:center;">${icone}</div>`
      : `<div>${icone}</div>`}
    ${temPromo ? `<div style="position:absolute;top:8px;left:8px;background:${corH};color:white;font-family:${fontTitCss},sans-serif;font-size:14px;letter-spacing:0.06em;padding:3px 10px;border-radius:99px;">-${descPct}%</div>` : ""}
    ${isVal && dias !== null ? `<div style="position:absolute;top:8px;right:8px;background:${corH};color:white;font-family:${fontTitCss},sans-serif;font-size:12px;letter-spacing:0.06em;padding:3px 10px;border-radius:99px;">${dias===0?"HOJE":dias+"D"}</div>` : ""}
  </div>
  <div style="padding:11px 13px 14px;flex:1;display:flex;flex-direction:column;">
    <p style="font-size:9px;color:${corH};font-weight:800;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:3px;font-family:'${fontTx}',sans-serif;">${p.categoria_nome||"Produto"}</p>
    <p style="font-size:13px;font-weight:700;color:${corTxt};line-height:1.3;flex:1;font-family:'${fontTx}',sans-serif;">${p.nome}</p>
    ${p.unidade ? `<p style="font-size:10px;color:${muted};margin-top:2px;font-family:'${fontTx}',sans-serif;">${p.unidade}</p>` : ""}
    <div style="margin-top:10px;padding-top:9px;border-top:1.5px solid ${border};">
      ${temPromo ? `<p style="font-family:'${fontTx}',sans-serif;font-size:11px;color:${muted};text-decoration:line-through;line-height:1;">${fmt(p.preco_venda)}</p>` : ""}
      <p style="font-family:${fontTitCss},sans-serif;font-size:34px;color:${corH};letter-spacing:0.02em;line-height:1.05;">${precoShow}</p>
      ${isVal && p.data_validade ? `<p style="font-size:9px;color:${muted};margin-top:3px;font-family:'${fontTx}',sans-serif;">Vence: ${new Date(p.data_validade+"T12:00:00").toLocaleDateString("pt-BR")}</p>` : ""}
    </div>
  </div>
</div>`;
  }).join("\n");

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8"/>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link href="${gfUrl}" rel="stylesheet"/>
<style>
@font-face {
  font-family: 'Oferta do Dia';
  src: url('data:font/truetype;base64,${fontB64}') format('truetype');
  font-weight: normal;
  font-style: normal;
}
*{margin:0;padding:0;box-sizing:border-box;}
body{font-family:'${fontTx}',system-ui,sans-serif;background:${corBg};
  -webkit-print-color-adjust:exact;print-color-adjust:exact;}
@page{size:A4;margin:0;}
@media print{body{background:${corBg}!important;}}
</style>
</head>
<body>
<div style="width:794px;min-height:1123px;display:flex;flex-direction:column;">

  <!-- HEADER: logo + título -->
  <div style="background:${corH};padding:22px 30px;display:flex;align-items:center;justify-content:space-between;gap:20px;">
    ${logoHTML}
    <div style="flex:1;text-align:center;">
      <h1 style="font-family:${fontTitCss},sans-serif;font-size:52px;color:#fff;line-height:0.95;letter-spacing:0.08em;">${cfg.titulo.toUpperCase()}</h1>
      ${cfg.subtitulo ? `<p style="font-family:'${fontTx}',sans-serif;font-size:13px;color:rgba(255,255,255,0.88);margin-top:5px;">${cfg.subtitulo}</p>` : ""}
      ${cfg.validade ? `<div style="display:inline-flex;align-items:center;gap:5px;margin-top:8px;background:rgba(0,0,0,0.22);color:rgba(255,255,255,0.96);font-family:'${fontTx}',sans-serif;font-size:11px;font-weight:600;padding:4px 13px;border-radius:99px;">&#128197; ${cfg.validade.toUpperCase()}</div>` : ""}
    </div>
    <!-- Apenas nome da loja à direita, sem endereço -->
    <p style="font-family:${fontTitCss},sans-serif;font-size:18px;color:rgba(255,255,255,0.75);letter-spacing:0.06em;flex-shrink:0;max-width:140px;text-align:right;">${nome.toUpperCase()}</p>
  </div>

  <div style="height:5px;${faixa};"></div>

  <!-- GRID -->
  <div style="flex:1;padding:18px 22px;display:grid;grid-template-columns:repeat(${cols},1fr);gap:14px;align-content:start;background:${corBg};">
    ${cards}
  </div>

  <!-- RODAPÉ: endereço completo + QR Code WhatsApp -->
  <div style="background:${corH};padding:14px 28px;display:flex;align-items:center;justify-content:space-between;gap:16px;">
    <div style="color:rgba(255,255,255,0.9);flex:1;">
      <p style="font-family:${fontTitCss},sans-serif;font-size:18px;color:#fff;letter-spacing:0.06em;">${nome.toUpperCase()}</p>
      ${end1 ? `<p style="font-size:10.5px;margin-top:3px;font-family:'${fontTx}',sans-serif;">&#128205; ${end1}${end2?" — "+end2:""}</p>` : ""}
      <div style="display:flex;gap:14px;margin-top:3px;flex-wrap:wrap;">
        ${tel ? `<span style="font-size:10px;font-family:'${fontTx}',sans-serif;">&#128222; ${tel}</span>` : ""}
        ${cel && cel!==tel ? `<span style="font-size:10px;font-family:'${fontTx}',sans-serif;">&#128241; ${cel}</span>` : ""}
        ${wp && wp!==tel && wp!==cel ? `<span style="font-size:10px;font-family:'${fontTx}',sans-serif;">&#128172; ${wp}</span>` : ""}
      </div>
      <p style="font-size:8px;color:rgba(255,255,255,0.4);margin-top:5px;font-family:'${fontTx}',sans-serif;">Preços válidos enquanto durarem os estoques &bull; Imagens meramente ilustrativas</p>
    </div>
    ${qrHTML}
  </div>
</div>
</body>
</html>`;
}

// ══════════════════════════════════════════════════════════════════
export default function Flyers() {
  const { toast } = useToast();

  const [step, setStep]   = useState<"template"|"produtos"|"config"|"preview">("template");
  const [tpl, setTpl]     = useState<typeof TEMPLATES[0]|null>(null);
  const [produtos, setProd] = useState<any[]>([]);
  const [sugestoes, setSug] = useState<any[]>([]);
  const [busca, setBusca] = useState("");
  const [todos, setTodos] = useState<any[]>([]);
  const [resultados, setRes] = useState<any[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [loadingTodos, setLoadingTodos] = useState(false);
  const [viewMode, setViewMode] = useState<"todos"|"busca">("todos");
  const [loja, setLoja]   = useState<any>({});
  const [gerando, setGer] = useState(false);
  const [html, setHtml]   = useState("");

  // Config
  const [titulo, setTitulo]     = useState("");
  const [subtitulo, setSub]     = useState("");
  const [validade, setVal]      = useState("");
  const [colunas, setCols]      = useState(3);
  const [fonteTexto, setFTx]    = useState("Inter");
  const [fonteTitulo, setFTit]  = useState("Oferta do Dia");
  const [logoSize, setLogoSize] = useState(72);
  const [corHeader, setCorH]    = useState("#dc2626");
  const [corBgPage, setCorBg]   = useState("#fff0f0");
  const [corCard, setCorCard]   = useState("#ffffff");
  const [corTexto, setCorTxt]   = useState("#1a1a1a");

  useEffect(() => {
    Promise.all([configAPI.get(), flyersAPI.logoBase64()])
      .then(([cfg, logo]) => { if (cfg) setLoja({ ...cfg, logoBase64: logo || null, logoURL: getLogoURL() }); })
      .catch(() => configAPI.get().then(c => { if (c) setLoja({ ...c, logoURL: getLogoURL() }); }).catch(()=>{}));
  }, []);

  useEffect(() => {
    if (viewMode !== "busca" || !busca) { setRes([]); return; }
    const t = setTimeout(async () => {
      setBuscando(true);
      try { setRes(await flyersAPI.buscarProdutos(busca) || []); }
      catch {} finally { setBuscando(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [busca, viewMode]);

  const loadTodos = async () => {
    setLoadingTodos(true);
    try { setTodos(await flyersAPI.listarTodos() || []); }
    catch (e: any) { toast({ title: "Erro", description: e.message, variant: "destructive" }); }
    finally { setLoadingTodos(false); }
  };

  const escolherTemplate = async (t: typeof TEMPLATES[0]) => {
    setTpl(t); setTitulo(t.nome);
    setCorH(t.cor); setCorBg(t.bg); setCorCard(t.card); setCorTxt(t.texto);
    setProd([]); setLoadingTodos(true);
    try {
      const [td, sg] = await Promise.all([
        flyersAPI.listarTodos(),
        t.auto ? flyersAPI.pertoValidade(7) : Promise.resolve([]),
      ]);
      setTodos(td||[]); setSug(sg||[]);
    } catch {} finally { setLoadingTodos(false); }
    setStep("produtos");
  };

  const add = (p: any) => {
    if (produtos.find(x => x.id===p.id)) return;
    if (produtos.length>=12) { toast({ title:"Máximo 12 produtos", variant:"destructive" }); return; }
    setProd(prev => [...prev, p]);
  };
  const rem = (id: number) => setProd(prev => prev.filter(p => p.id!==id));

  const irConfig = () => {
    if (!produtos.length) { toast({ title:"Selecione pelo menos 1 produto", variant:"destructive" }); return; }
    setCols(produtos.length<=4?2:produtos.length<=9?3:4);
    setStep("config");
  };

  const preview = async () => {
    if (!tpl) return;
    let lj = loja;
    if (!loja.logoBase64) {
      try { const l = await flyersAPI.logoBase64(); if (l) lj = {...loja, logoBase64:l}; } catch {}
    }
    if (!lj.logoURL) lj = { ...lj, logoURL: getLogoURL() };
    setHtml(gerarHTML(produtos, tpl, { titulo, subtitulo:subtitulo, validade:validade, colunas, fonteTexto, fonteTitulo, logoSize, corHeader, corBgPage, corCard, corTexto }, lj, OFERTA_DO_DIA_B64));
    setStep("preview");
  };

  const gerarPDF = async () => {
    setGer(true);
    try {
      const r = await flyersAPI.gerarPDF(html, `flyer_${tpl?.id}_${Date.now()}.pdf`);
      if (r?.ok) {
        toast({ title:"✅ PDF salvo com sucesso!" });
        flyersAPI.salvar({ template:tpl?.id, titulo, produtos_ids:produtos.map(p=>p.id), config:{colunas} }).catch(()=>{});
      } else if (!r?.cancelado) {
        toast({ title:"Erro ao gerar PDF", description:r?.erro||"Tente novamente", variant:"destructive" });
      }
    } catch (e: any) {
      toast({ title:"Erro", description:e.message, variant:"destructive" });
    } finally { setGer(false); }
  };

  const reiniciar = () => { setStep("template"); setTpl(null); setProd([]); setHtml(""); setTodos([]); };

  const lista = viewMode==="todos"
    ? (busca ? todos.filter(p => p.nome.toLowerCase().includes(busca.toLowerCase())||(p.categoria_nome||"").toLowerCase().includes(busca.toLowerCase())) : todos)
    : resultados;

  // ── STEP 1: Template ────────────────────────────────────────────────────
  if (step==="template") return (
    <Layout title="Flyers & Promoções">
      <div className="space-y-5 max-w-4xl">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Megaphone className="w-6 h-6"/>Flyers & Promoções</h1>
          <p className="text-sm text-muted-foreground mt-1">Crie flyers profissionais em PDF — grátis, ilimitado, offline</p>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {TEMPLATES.map(t => (
            <button key={t.id} onClick={()=>escolherTemplate(t)}
              className="text-left rounded-2xl border border-border bg-card p-5 hover:-translate-y-1 transition-all group shadow-sm">
              <div className="flex items-start justify-between mb-3">
                <div style={{width:52,height:52,borderRadius:14,background:t.cor,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"1.6rem",boxShadow:`0 4px 16px ${t.cor}44`}}>{t.emoji}</div>
                {t.auto && <Badge variant="secondary" className="text-xs">✨ Auto</Badge>}
                {t.custom && <Badge variant="outline" className="text-xs border-primary text-primary">Livre</Badge>}
              </div>
              <h3 className="font-bold text-base mb-1">{t.nome}</h3>
              <p className="text-sm text-muted-foreground">{t.desc}</p>
              <div className="flex items-center gap-1 mt-3 text-xs font-semibold opacity-0 group-hover:opacity-100 transition-opacity" style={{color:t.cor}}>
                Usar este <ChevronRight className="w-3.5 h-3.5"/>
              </div>
            </button>
          ))}
        </div>
      </div>
    </Layout>
  );

  // ── STEP 2: Produtos ────────────────────────────────────────────────────
  if (step==="produtos") return (
    <Layout title="Flyers — Produtos">
      <div className="space-y-4 max-w-2xl">
        <div className="flex items-center gap-3">
          <button onClick={()=>setStep("template")} className="text-sm text-muted-foreground hover:text-foreground">← Voltar</button>
          <div style={{width:36,height:36,borderRadius:10,background:tpl?.cor,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"1.1rem"}}>{tpl?.emoji}</div>
          <div><p className="font-bold">{tpl?.nome}</p><p className="text-xs text-muted-foreground">Selecione de 1 a 12 produtos</p></div>
        </div>

        {sugestoes.length>0 && (
          <Card className="border-amber-300 dark:border-amber-700">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-amber-600"/>Produtos vencendo em até 7 dias</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-2">
                {sugestoes.slice(0,6).map(p => {
                  const ja=!!produtos.find(x=>x.id===p.id);
                  return (
                    <button key={p.id} onClick={()=>add(p)} disabled={ja}
                      className={`flex items-center gap-2 p-2.5 rounded-xl border text-left transition-all ${ja?"opacity-40 bg-muted":"hover:border-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/20"}`}>
                      <div dangerouslySetInnerHTML={{__html:getIconeSVG(p.categoria_nome,"#d97706",28)}}/>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-xs truncate">{p.nome}</p>
                        <p className="text-amber-600 font-bold text-xs">{fmt(p.preco_promocional>0&&p.promocao_ativa?p.preco_promocional:p.preco_venda)}</p>
                      </div>
                      {!ja?<Plus className="w-3.5 h-3.5 shrink-0 text-muted-foreground"/>:<span className="text-green-600 font-bold text-xs">✓</span>}
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">Produtos</CardTitle>
              <div className="flex gap-1">
                <button onClick={()=>setViewMode("todos")} className={`px-2 py-1 rounded-lg text-xs flex items-center gap-1 ${viewMode==="todos"?"bg-primary text-white":"hover:bg-muted text-muted-foreground"}`}><LayoutGrid className="w-3 h-3"/>Todos</button>
                <button onClick={()=>setViewMode("busca")} className={`px-2 py-1 rounded-lg text-xs flex items-center gap-1 ${viewMode==="busca"?"bg-primary text-white":"hover:bg-muted text-muted-foreground"}`}><Search className="w-3 h-3"/>Buscar</button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0 space-y-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"/>
              <Input className="pl-9 h-9" placeholder="Filtrar..." value={busca} onChange={e=>setBusca(e.target.value)}/>
              {buscando&&<Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground"/>}
            </div>
            {loadingTodos ? (
              <p className="text-sm text-center py-6 flex items-center justify-center gap-2 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin"/>Carregando...</p>
            ) : lista.length>0 ? (
              <div className="border rounded-xl overflow-hidden divide-y max-h-72 overflow-y-auto">
                {lista.map(p => {
                  const ja=!!produtos.find(x=>x.id===p.id);
                  const preco = p.promocao_ativa && p.preco_promocional>0 ? p.preco_promocional : p.preco_venda;
                  return (
                    <button key={p.id} onClick={()=>add(p)} disabled={ja}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors ${ja?"opacity-40 bg-muted":"hover:bg-muted/50"}`}>
                      <div dangerouslySetInnerHTML={{__html:getIconeSVG(p.categoria_nome,tpl?.cor||"#6d28d9",28)}}/>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold truncate text-sm">{p.nome}</p>
                        <p className="text-xs text-muted-foreground">{p.categoria_nome||"Sem categoria"}</p>
                      </div>
                      <div className="text-right shrink-0">
                        {p.promocao_ativa&&p.preco_promocional>0 && <p className="text-xs text-muted-foreground line-through">{fmt(p.preco_venda)}</p>}
                        <span className={`font-bold text-sm ${p.promocao_ativa&&p.preco_promocional>0?"text-orange-600":""}`}>{fmt(preco)}</span>
                        {p.promocao_ativa&&p.preco_promocional>0 && <Badge variant="outline" className="text-xs ml-1 text-orange-600 border-orange-300">PROMO</Badge>}
                      </div>
                      {!ja?<Plus className="w-4 h-4 text-muted-foreground shrink-0"/>:<span className="text-green-600 text-xs font-bold shrink-0">✓</span>}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-6">
                <p className="text-sm text-muted-foreground mb-3">{viewMode==="todos"?"Clique para carregar":"Digite para buscar"}</p>
                {viewMode==="todos"&&<Button size="sm" variant="outline" onClick={loadTodos}><RefreshCw className="w-3.5 h-3.5 mr-1"/>Carregar produtos</Button>}
              </div>
            )}
          </CardContent>
        </Card>

        {produtos.length>0&&(
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center justify-between">
                <span>Selecionados <Badge variant="secondary">{produtos.length}</Badge></span>
                <Button size="sm" onClick={irConfig} className="h-7">Configurar <ChevronRight className="w-3.5 h-3.5 ml-1"/></Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-2">
                {produtos.map(p=>(
                  <div key={p.id} className="flex items-center gap-2 p-2 rounded-xl border border-primary/20 bg-primary/5">
                    <div dangerouslySetInnerHTML={{__html:getIconeSVG(p.categoria_nome,tpl?.cor||"#6d28d9",24)}}/>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold truncate">{p.nome}</p>
                      <p className="text-xs font-bold" style={{color:tpl?.cor}}>{fmt(p.promocao_ativa&&p.preco_promocional>0?p.preco_promocional:p.preco_venda)}</p>
                    </div>
                    <button onClick={()=>rem(p.id)} className="text-muted-foreground hover:text-destructive shrink-0"><X className="w-3.5 h-3.5"/></button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
        {produtos.length>0&&<div className="flex justify-end"><Button onClick={irConfig} className="gap-2">Configurar <ChevronRight className="w-4 h-4"/></Button></div>}
      </div>
    </Layout>
  );

  // ── STEP 3: Config ──────────────────────────────────────────────────────
  if (step==="config") return (
    <Layout title="Flyers — Configurar">
      <div className="space-y-4 max-w-2xl">
        <div className="flex items-center gap-3">
          <button onClick={()=>setStep("produtos")} className="text-sm text-muted-foreground hover:text-foreground">← Voltar</button>
          <h1 className="text-xl font-bold">Configurar flyer</h1>
        </div>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Tag className="w-4 h-4"/>Textos</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div><Label>Título principal *</Label><Input value={titulo} onChange={e=>setTitulo(e.target.value)} placeholder={tpl?.nome} maxLength={35}/></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Subtítulo <span className="text-xs text-muted-foreground">(opcional)</span></Label><Input value={subtitulo} onChange={e=>setSub(e.target.value)} placeholder="Ex: Só esse fim de semana!" maxLength={55}/></div>
              <div><Label>Validade <span className="text-xs text-muted-foreground">(opcional)</span></Label><Input value={validade} onChange={e=>setVal(e.target.value)} placeholder="Ex: Válido até domingo"/></div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Type className="w-4 h-4"/>Fontes</CardTitle></CardHeader>
          <CardContent className="space-y-4">

            {/* Fonte do Título */}
            <div>
              <Label className="text-xs mb-2 block font-semibold">Fonte do título, preços e destaques</Label>
              <div className="grid grid-cols-1 gap-1.5">
                {FONTES_TITULO.map(f=>(
                  <button key={f.id} onClick={()=>setFTit(f.id)}
                    className={`flex items-center justify-between px-3 py-2 rounded-xl border transition-colors ${fonteTitulo===f.id?"border-primary bg-primary/5":"border-border hover:border-primary/40"}`}>
                    <div className="text-left">
                      <span className="text-xs font-semibold">{f.nome}</span>
                      {f.info && <span className="text-xs text-muted-foreground ml-2">{f.info}</span>}
                    </div>
                    <span style={{
                      fontFamily: f.id === "Oferta do Dia" ? "system-ui" : `'${f.id}',sans-serif`,
                      fontSize: 18, fontWeight: 900, letterSpacing: "0.05em",
                      color: fonteTitulo===f.id ? corHeader : undefined,
                    }}>
                      OFERTA
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Fonte do texto */}
            <div>
              <Label className="text-xs mb-2 block font-semibold">Fonte do nome dos produtos</Label>
              <div className="grid grid-cols-2 gap-1.5">
                {FONTES_TEXTO.map(f=>(
                  <button key={f.id} onClick={()=>setFTx(f.id)}
                    className={`px-3 py-2.5 rounded-xl border transition-colors text-left ${fonteTexto===f.id?"border-primary bg-primary/5":"border-border hover:border-primary/40"}`}
                    style={{fontFamily:`'${f.id}',sans-serif`}}>
                    <p className="font-bold text-sm">{f.nome}</p>
                    <p className="text-xs text-muted-foreground">Leite integral 1L</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Tamanho da logo */}
            {(loja?.logoBase64 || loja?.logoURL) && (
              <div>
                <Label className="text-xs mb-2 block font-semibold">Tamanho da logo no header (somente Flyers)</Label>
                <div className="flex gap-2 items-center">
                  <input type="range" min={40} max={160} step={2} value={logoSize}
                    onChange={e => setLogoSize(Number(e.target.value))}
                    className="flex-1 accent-primary h-2" />
                  <span className="text-sm font-mono w-14 text-right">{logoSize}px</span>
                </div>
                <div className="flex gap-2 mt-2">
                  {[48,64,80,100,120,140].map(s => (
                    <button key={s} onClick={() => setLogoSize(s)}
                      className={`flex-1 py-1.5 rounded-lg border text-xs font-medium transition-colors ${logoSize===s?"text-white":"border-border hover:border-primary/50 text-muted-foreground"}`}
                      style={logoSize===s?{background:corHeader,borderColor:corHeader}:{}}>
                      {s}px
                    </button>
                  ))}
                </div>
              </div>
            )}
            {!(loja?.logoBase64 || loja?.logoURL) && (
              <p className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-2">
                ℹ️ Para ajustar o tamanho da logo, primeiro cadastre uma logo em <strong>Configurações → Dados da Loja</strong>.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Palette className="w-4 h-4"/>Cores</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 mb-4">
              {[
                {label:"Header e rodapé", val:corHeader, set:setCorH, presets:["#dc2626","#991b1b","#d97706","#16a34a","#2563eb","#7c3aed","#db2777","#18181b"]},
                {label:"Fundo da página", val:corBgPage, set:setCorBg, presets:["#f0f0f0","#ffffff","#fff0f0","#fef3c7","#dbeafe","#f3e8ff","#18181b","#0c0c0e"]},
                {label:"Fundo dos cards", val:corCard, set:setCorCard, presets:["#ffffff","#fafafa","#fffbeb","#fdf4ff","#eff6ff","#1a1a1d","#111827","#27272a"]},
                {label:"Texto dos produtos", val:corTexto, set:setCorTxt, presets:["#1a1a1a","#111827","#374151","#fafafa","#f8f8f8","#ffffff","#6b7280","#9ca3af"]},
              ].map(item=>(
                <div key={item.label}>
                  <Label className="text-xs mb-1.5 block">{item.label}</Label>
                  <div className="flex gap-2 items-center">
                    <input type="color" value={item.val} onChange={e=>item.set(e.target.value)} className="w-10 h-8 rounded-lg cursor-pointer border shrink-0"/>
                    <div className="flex gap-1 flex-wrap">
                      {item.presets.map(c=>(
                        <button key={c} onClick={()=>item.set(c)}
                          style={{background:c,width:20,height:20,borderRadius:5,border:item.val===c?"2px solid white":"1px solid rgba(0,0,0,0.15)",outline:item.val===c?`2px solid ${c}`:"none"}}/>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Mini preview */}
            <div className="rounded-xl overflow-hidden border" style={{background:corBgPage}}>
              <div style={{background:corHeader,padding:"10px 14px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                <span style={{fontFamily:"system-ui",fontSize:22,color:"white",fontWeight:900,letterSpacing:"0.06em"}}>{titulo.toUpperCase()||"OFERTA DA SEMANA"}</span>
                <span style={{fontSize:11,color:"rgba(255,255,255,0.7)"}}>{loja?.nome||"Minha Loja"}</span>
              </div>
              <div style={{padding:"10px 14px",display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
                {[1,2,3].map(i=>(
                  <div key={i} style={{background:corCard,borderRadius:10,padding:8,border:`1px solid ${corCard<"#888"?"#333":"#e0e0e0"}`}}>
                    <div style={{height:36,background:`${corHeader}20`,borderRadius:6,marginBottom:6}}/>
                    <p style={{fontSize:8,color:corHeader,fontWeight:700}}>CATEGORIA</p>
                    <p style={{fontSize:10,color:corTexto,fontWeight:600,fontFamily:`'${fonteTexto}',sans-serif`}}>Nome produto</p>
                    <p style={{fontSize:16,color:corHeader,fontWeight:900,marginTop:4}}>R$ 9,99</p>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <Label className="text-xs mb-2 block">Colunas de produtos</Label>
            <div className="flex gap-2">
              {[2,3,4].map(n=>(
                <button key={n} onClick={()=>setCols(n)}
                  className={`flex-1 py-2 rounded-xl border text-sm font-semibold transition-colors ${colunas===n?"text-white":"text-foreground border-border hover:border-primary/50"}`}
                  style={colunas===n?{background:corHeader,borderColor:corHeader}:{}}>{n} colunas</button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-1.5">{produtos.length} produtos em {Math.ceil(produtos.length/colunas)} linha(s)</p>
          </CardContent>
        </Card>

        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={()=>setStep("produtos")}>← Produtos</Button>
          <Button onClick={preview} disabled={!titulo} className="gap-2" style={{background:corHeader,borderColor:corHeader}}>
            <Eye className="w-4 h-4"/>Ver Preview
          </Button>
        </div>
      </div>
    </Layout>
  );

  // ── STEP 4: Preview ─────────────────────────────────────────────────────
  if (step==="preview") return (
    <Layout title="Flyers — Preview">
      <div className="space-y-4">
        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={()=>setStep("config")} className="text-sm text-muted-foreground hover:text-foreground">← Editar</button>
          <h1 className="text-xl font-bold flex-1">Preview do Flyer</h1>
          <Button variant="outline" size="sm" onClick={reiniciar}><RefreshCw className="w-4 h-4 mr-2"/>Novo</Button>
          <Button onClick={gerarPDF} disabled={gerando} className="gap-2" style={{background:corHeader,borderColor:corHeader}}>
            {gerando?<><Loader2 className="w-4 h-4 animate-spin"/>Gerando...</>:<><FileText className="w-4 h-4"/>Baixar PDF</>}
          </Button>
        </div>
        <div className="flex items-start gap-2 p-3 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-xl text-sm text-green-800 dark:text-green-300">
          <Zap className="w-4 h-4 mt-0.5 shrink-0"/>
          <span>PDF gerado 100% local — sem internet, sem custo, sem limite.</span>
        </div>
        <Card className="overflow-hidden">
          <div style={{background:"#d4d4d8",padding:20,overflowX:"auto",overflowY:"auto",maxHeight:"80vh"}}>
            <div style={{width:794,transformOrigin:"top left",transform:"scale(0.78)",marginBottom:"-22%",boxShadow:"0 8px 48px rgba(0,0,0,0.2)",borderRadius:8,overflow:"hidden"}}>
              <div dangerouslySetInnerHTML={{__html:html}}/>
            </div>
          </div>
        </Card>
      </div>
    </Layout>
  );

  return null;
}
