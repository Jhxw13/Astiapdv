/**
 * ASTIA PDV — Pedidos / Orcamentos
 * Layout unico no topo — sem multiplos Layout/SidebarProvider
 * 3 paineis inline (lista / novo / detalhe) dentro de um unico Layout
 */
import { useState, useEffect, useCallback } from "react";
import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { pedidosAPI, produtosAPI, clientesAPI, configAPI } from "@/lib/api";
import {
  Plus, Trash2, FileText, Search, RefreshCw,
  Printer, X, ChevronLeft, Package, User,
  Tag, Calendar, Percent, MessageSquare,
  CreditCard, Clock, ArrowRight,
} from "lucide-react";

interface ItemForm {
  produto_id: number; nome_produto: string;
  quantidade: number; preco_unitario: number; total: number;
}
interface OrcamentoForm {
  cliente_id: string; desconto_valor: number; desconto_pct: number;
  observacoes: string; condicoes_pagamento: string;
  prazo_entrega: string; validade_dias: number; itens: ItemForm[];
}
const formVazio = (): OrcamentoForm => ({
  cliente_id: "", desconto_valor: 0, desconto_pct: 0,
  observacoes: "", condicoes_pagamento: "", prazo_entrega: "",
  validade_dias: 7, itens: [],
});

function imprimirOrcamento(pedido: any, itens: any[], loja: any, cliente: any) {
  const win = window.open("", "_blank", "width=900,height=750");
  if (!win) { alert("Permita popups para imprimir"); return; }
  const subtotal = itens.reduce((s: number, i: any) => s + Number(i.total), 0);
  const desconto = Number(pedido.desconto_valor || 0);
  const total = subtotal - desconto;
  const validade = new Date(Date.now() + (pedido.validade_dias || 7) * 86400000).toLocaleDateString("pt-BR");
  const rows = itens.map((i: any) =>
    `<tr><td>${i.nome_produto}</td><td class="c">${i.quantidade}</td><td class="r">R$ ${Number(i.preco_unitario).toFixed(2)}</td><td class="r b">R$ ${Number(i.total).toFixed(2)}</td></tr>`
  ).join("");
  win.document.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Orcamento ${pedido.numero}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Courier New',monospace;font-size:11px;color:#111;background:#fff;padding:20px 30px;max-width:700px;margin:0 auto}
.sep{border-top:1px dashed #555;margin:10px 0}
.sep2{border-top:2px solid #111;margin:10px 0}
.c{text-align:center}.r{text-align:right}.b{font-weight:bold}
.logo{text-align:center;margin-bottom:6px}
.logo h1{font-size:20px;font-weight:900;letter-spacing:1px}
.logo p{font-size:10px;color:#444;line-height:1.6}
.titulo{text-align:center;font-size:15px;font-weight:900;letter-spacing:3px;margin:8px 0}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:4px;margin:8px 0;font-size:10px}
.row{display:flex;gap:6px}.row b{min-width:80px}
table{width:100%;border-collapse:collapse;margin:6px 0;font-size:11px}
thead tr{background:#111;color:#fff}
thead th{padding:5px 8px;text-align:left;font-size:10px;letter-spacing:.5px}
thead th.r{text-align:right}thead th.c{text-align:center}
tbody td{padding:5px 8px;border-bottom:1px dashed #ddd}
.totals{width:240px;margin-left:auto;margin-top:6px;font-size:11px}
.trow{display:flex;justify-content:space-between;padding:3px 0}
.trow.final{border-top:2px solid #111;margin-top:4px;padding-top:6px;font-size:14px;font-weight:900}
.trow.desc{color:#c00}
.stitle{font-size:10px;font-weight:900;letter-spacing:2px;margin-top:10px;margin-bottom:4px}
.signs{display:grid;grid-template-columns:1fr 1fr;gap:30px;margin-top:16px}
.sline{border-top:1px solid #555;padding-top:4px;font-size:10px;color:#555;margin-top:30px}
.footer{text-align:center;font-size:9px;color:#888;margin-top:10px}
@media print{@page{margin:12mm;size:A4}body{padding:0}}
</style></head><body>
<div class="logo">
  ${loja?.logo_path ? `<img src="${loja.logo_path.startsWith('data:') ? loja.logo_path : (loja.logo_path.startsWith('http') ? loja.logo_path : 'file://' + loja.logo_path)}" alt="Logo" style="max-height:70px;max-width:200px;object-fit:contain;margin-bottom:6px;display:block;margin-left:auto;margin-right:auto" onerror="this.style.display='none'" />` : ""}
  <h1>${loja?.nome || "ASTIA PDV"}</h1>
  <p>${[loja?.cnpj ? "CNPJ: " + loja.cnpj : "", loja?.logradouro ? loja.logradouro + (loja.numero ? ", "+loja.numero : "") + (loja.cidade ? " - "+loja.cidade+"/"+(loja.estado||"") : "") : "", loja?.telefone ? "Tel: "+loja.telefone : "", loja?.email || "", loja?.site || ""].filter(Boolean).join(" | ")}</p>
</div>
<div class="sep2"></div><div class="titulo">ORCAMENTO</div><div class="sep2"></div>
<div class="grid2">
  <div class="row"><b>N:</b><span>${pedido.numero}</span></div>
  <div class="row"><b>Data:</b><span>${new Date().toLocaleDateString("pt-BR")}</span></div>
  <div class="row"><b>Validade:</b><span>${validade} (${pedido.validade_dias||7} dias)</span></div>
  ${pedido.usuario_nome?`<div class="row"><b>Vendedor:</b><span>${pedido.usuario_nome}</span></div>`:""}
  ${pedido.cliente_nome?`<div class="row"><b>Cliente:</b><span>${pedido.cliente_nome}</span></div>`:""}
  ${(cliente?.celular||cliente?.telefone)?`<div class="row"><b>Telefone:</b><span>${cliente?.celular||cliente?.telefone}</span></div>`:""}
  ${cliente?.email?`<div class="row"><b>Email:</b><span>${cliente.email}</span></div>`:""}
</div>
<div class="sep2"></div>
<div class="stitle">ITENS DO ORCAMENTO</div>
<div class="sep2"></div>
<table>
  <thead><tr><th>Produto / Servico</th><th class="c">Qtd</th><th class="r">Valor Unit.</th><th class="r">Total</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
<div class="sep2"></div>
<div class="totals">
  <div class="trow"><span>Subtotal:</span><span>R$ ${subtotal.toFixed(2)}</span></div>
  ${desconto>0?`<div class="trow desc"><span>Desconto:</span><span>- R$ ${desconto.toFixed(2)}</span></div>`:""}
  <div class="trow final"><span>TOTAL:</span><span>R$ ${total.toFixed(2)}</span></div>
</div>
<div class="sep2"></div>
${pedido.condicoes_pagamento?`<div class="stitle">FORMA DE PAGAMENTO</div><p>${pedido.condicoes_pagamento}</p><br>`:""}
${pedido.prazo_entrega?`<p><b>Prazo de entrega:</b> ${pedido.prazo_entrega}</p><br>`:""}
${pedido.observacoes?`<p><b>Observacoes:</b> ${pedido.observacoes}</p><br>`:""}
<div class="sep2"></div>
<div class="signs">
  <div><div class="sline">Responsavel: ${pedido.usuario_nome||"_________________"}</div></div>
  <div><div class="sline">Assinatura do cliente: ______________________________</div></div>
</div>
<div class="sep2"></div>
<div class="footer">ASTIA PDV by VYN Developer -- Documento sem valor fiscal</div>
<script>window.onload=()=>setTimeout(()=>window.print(),500)</script>
</body></html>`);
  win.document.close();
}

// ─── Componente ──────────────────────────────────────────────────────────────
export default function Pedidos() {
  const { usuario } = useAuth();
  const { toast } = useToast();
  type Tela = "lista" | "novo" | "detalhe";
  const [tela, setTela] = useState<Tela>("lista");

  const [pedidos,  setPedidos]  = useState<any[]>([]);
  const [produtos, setProdutos] = useState<any[]>([]);
  const [clientes, setClientes] = useState<any[]>([]);
  const [loja,     setLoja]     = useState<any>({});
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [busca,    setBusca]    = useState("");

  const [pedidoDetalhe, setPedidoDetalhe] = useState<any>(null);
  const [itensDetalhe,  setItensDetalhe]  = useState<any[]>([]);
  const [form,          setForm]          = useState<OrcamentoForm>(formVazio());
  const [addProdId,     setAddProdId]     = useState("");
  const [addQtd,        setAddQtd]        = useState(1);
  const [addPreco,      setAddPreco]      = useState("");
  const [buscaProd,     setBuscaProd]     = useState("");
  const [showList,      setShowList]      = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const [ped, pr, cl, cfg] = await Promise.all([
        pedidosAPI.listar(), produtosAPI.listar({ ativo: 1 }),
        clientesAPI.listar({ ativo: 1 }), configAPI.get(),
      ]);
      setPedidos(ped || []); setProdutos(pr || []);
      setClientes(cl || []); setLoja(cfg || {});
    } catch (e: any) {
      toast({ title: "Erro ao carregar", description: e?.message, variant: "destructive" });
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const fmt = (v: number) => `R$ ${Number(v||0).toFixed(2)}`;
  const subtotal   = form.itens.reduce((s, i) => s + i.total, 0);
  const totalFinal = Math.max(0, subtotal - (form.desconto_valor || 0));
  const prodsSel   = produtos.filter(p =>
    !buscaProd || p.nome.toLowerCase().includes(buscaProd.toLowerCase()) ||
    (p.codigo_barras || "").includes(buscaProd)
  );
  const prodSel = produtos.find(p => p.id.toString() === addProdId);

  const irNovo = () => { setForm(formVazio()); setAddProdId(""); setAddQtd(1); setAddPreco(""); setBuscaProd(""); setShowList(false); setTela("novo"); };
  const irLista = () => setTela("lista");

  const adicionarItem = () => {
    const prod = produtos.find(p => p.id.toString() === addProdId);
    if (!prod) { toast({ title: "Selecione um produto", variant: "destructive" }); return; }
    const preco = addPreco ? parseFloat(addPreco) : prod.preco_venda;
    setForm(f => ({ ...f, itens: [...f.itens, { produto_id: prod.id, nome_produto: prod.nome, quantidade: addQtd, preco_unitario: preco, total: preco * addQtd }] }));
    setAddProdId(""); setAddQtd(1); setAddPreco(""); setBuscaProd(""); setShowList(false);
  };

  const removerItem = (idx: number) => setForm(f => ({ ...f, itens: f.itens.filter((_, i) => i !== idx) }));

  const ajustarQtd = (idx: number, d: number) => setForm(f => ({
    ...f, itens: f.itens.map((it, i) => {
      if (i !== idx) return it;
      const q = Math.max(1, it.quantidade + d);
      return { ...it, quantidade: q, total: q * it.preco_unitario };
    })
  }));

  const setDescPct = (pct: number) => {
    const p = Math.max(0, Math.min(100, pct));
    setForm(f => ({ ...f, desconto_pct: p, desconto_valor: parseFloat(((subtotal * p) / 100).toFixed(2)) }));
  };
  const setDescVal = (v: number) => {
    const val = Math.max(0, Math.min(subtotal, v));
    setForm(f => ({ ...f, desconto_valor: val, desconto_pct: subtotal > 0 ? parseFloat(((val / subtotal) * 100).toFixed(2)) : 0 }));
  };

  const salvar = async () => {
    if (form.itens.length === 0) { toast({ title: "Adicione ao menos 1 produto", variant: "destructive" }); return; }
    if (!usuario) return;
    setSaving(true);
    try {
      await pedidosAPI.criar({
        cliente_id: form.cliente_id ? parseInt(form.cliente_id) : null,
        usuario_id: usuario.id, tipo: "orcamento", itens: form.itens,
        desconto_valor: form.desconto_valor, subtotal, total: totalFinal,
        observacoes: form.observacoes, condicoes_pagamento: form.condicoes_pagamento,
        prazo_entrega: form.prazo_entrega, validade_dias: form.validade_dias,
      });
      toast({ title: "Orcamento criado!" });
      setForm(formVazio()); irLista(); carregar();
    } catch (e: any) {
      toast({ title: "Erro ao salvar", description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  const abrirDetalhe = async (ped: any) => {
    setPedidoDetalhe(ped);
    try { setItensDetalhe(await pedidosAPI.itens(ped.id) || []); } catch { setItensDetalhe([]); }
    setTela("detalhe");
  };

  const cancelarPedido = async (id: number) => {
    if (!confirm("Cancelar este orcamento?")) return;
    try { await pedidosAPI.atualizarStatus(id, "cancelado"); toast({ title: "Cancelado" }); irLista(); carregar(); }
    catch (e: any) { toast({ title: "Erro", description: e.message, variant: "destructive" }); }
  };

  const statusBadge = (s: string): [any, string] =>
    ({ aberto: ["secondary","Aberto"], convertido: ["default","Convertido"], cancelado: ["destructive","Cancelado"] }[s] as any) || ["secondary", s];

  const filtrados = pedidos.filter(p =>
    !busca || (p.numero||"").toLowerCase().includes(busca.toLowerCase()) ||
    (p.cliente_nome||"").toLowerCase().includes(busca.toLowerCase())
  );

  // ── Painel LISTA ────────────────────────────────────────────────────────────
  const PainelLista = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileText className="w-6 h-6 text-violet-600" /> Pedidos / Orcamentos
          </h1>
          <p className="text-sm text-muted-foreground">Crie orcamentos profissionais para seus clientes</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={carregar} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button onClick={irNovo} className="bg-violet-600 hover:bg-violet-700 text-white">
            <Plus className="w-4 h-4 mr-2" /> Novo Orcamento
          </Button>
        </div>
      </div>
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
        <Input placeholder="Buscar por numero ou cliente..." value={busca}
          onChange={e => setBusca(e.target.value)} className="pl-9" />
      </div>
      {loading ? (
        <div className="text-center py-16 text-muted-foreground">
          <RefreshCw className="w-8 h-8 mx-auto mb-3 animate-spin opacity-30" /><p>Carregando...</p>
        </div>
      ) : filtrados.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <FileText className="w-12 h-12 mx-auto mb-4 opacity-20" />
          <p className="font-medium">Nenhum orcamento encontrado</p>
          <p className="text-sm mt-1">Clique em "Novo Orcamento" para comecar</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtrados.map(p => {
            const [variant, label] = statusBadge(p.status);
            return (
              <div key={p.id} onClick={() => abrirDetalhe(p)}
                className="flex items-center gap-3 p-4 bg-card rounded-xl border hover:bg-muted/40 transition-colors cursor-pointer">
                <div className="w-10 h-10 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center shrink-0">
                  <FileText className="w-5 h-5 text-violet-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-sm text-violet-700 dark:text-violet-300">{p.numero}</span>
                    <Badge variant={variant} className="text-xs">{label}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground truncate">
                    {p.cliente_nome || "Sem cliente"} · {new Date(p.criado_em).toLocaleDateString("pt-BR")}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-bold">{fmt(p.total)}</p>
                </div>
                <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  // ── Painel DETALHE ──────────────────────────────────────────────────────────
  const PainelDetalhe = () => {
    if (!pedidoDetalhe) return null;
    const [variant, label] = statusBadge(pedidoDetalhe.status);
    const subT = itensDetalhe.reduce((s: number, i: any) => s + Number(i.total), 0);
    const desc = Number(pedidoDetalhe.desconto_valor || 0);
    const tot  = subT - desc;
    const cli  = clientes.find(c => c.id === pedidoDetalhe.cliente_id);
    return (
      <div className="space-y-4 max-w-3xl">
        <button onClick={irLista} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="w-4 h-4" /> Voltar
        </button>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-xl font-bold font-mono text-violet-700 dark:text-violet-300">{pedidoDetalhe.numero}</h1>
            <p className="text-sm text-muted-foreground">{new Date(pedidoDetalhe.criado_em).toLocaleString("pt-BR")}</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" size="sm"
              onClick={() => imprimirOrcamento({ ...pedidoDetalhe, validade_dias: pedidoDetalhe.validade_dias || 7 }, itensDetalhe, loja, cli)}>
              <Printer className="w-4 h-4 mr-2" /> Imprimir / PDF
            </Button>
            {pedidoDetalhe.status === "aberto" && (
              <Button variant="outline" size="sm"
                className="text-destructive border-destructive/40 hover:bg-destructive/10"
                onClick={() => cancelarPedido(pedidoDetalhe.id)}>
                <X className="w-4 h-4 mr-1" /> Cancelar
              </Button>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {[
            { l: "Status",   v: <Badge variant={variant}>{label}</Badge> },
            { l: "Cliente",  v: pedidoDetalhe.cliente_nome || "Sem cliente" },
            { l: "Vendedor", v: pedidoDetalhe.usuario_nome || "—" },
            { l: "Total",    v: fmt(tot) },
            { l: "Desconto", v: desc > 0 ? fmt(desc) : "Sem desconto" },
            { l: "Validade", v: `${pedidoDetalhe.validade_dias || 7} dias` },
          ].map(d => (
            <div key={d.l} className="p-3 bg-muted/50 rounded-xl">
              <p className="text-xs text-muted-foreground mb-1">{d.l}</p>
              <div className="font-semibold text-sm">{d.v}</div>
            </div>
          ))}
        </div>
        <div className="rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/60">
              <tr>
                <th className="text-left p-3 font-semibold">Produto</th>
                <th className="text-center p-3 font-semibold">Qtd</th>
                <th className="text-right p-3 font-semibold">Unit.</th>
                <th className="text-right p-3 font-semibold">Total</th>
              </tr>
            </thead>
            <tbody>
              {itensDetalhe.map((it: any, i: number) => (
                <tr key={i} className="border-t">
                  <td className="p-3">{it.nome_produto}</td>
                  <td className="p-3 text-center">{it.quantidade}</td>
                  <td className="p-3 text-right text-muted-foreground">R$ {Number(it.preco_unitario).toFixed(2)}</td>
                  <td className="p-3 text-right font-semibold">R$ {Number(it.total).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex justify-end">
          <div className="w-56 space-y-1.5 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{fmt(subT)}</span></div>
            {desc > 0 && <div className="flex justify-between text-red-500 font-medium"><span>Desconto</span><span>- {fmt(desc)}</span></div>}
            <div className="flex justify-between text-lg font-black border-t pt-2"><span>Total</span><span className="text-violet-600">{fmt(tot)}</span></div>
          </div>
        </div>
        {(pedidoDetalhe.observacoes || pedidoDetalhe.condicoes_pagamento || pedidoDetalhe.prazo_entrega) && (
          <div className="p-4 bg-muted/30 rounded-xl space-y-1 text-sm">
            {pedidoDetalhe.condicoes_pagamento && <p><strong>Pagamento:</strong> {pedidoDetalhe.condicoes_pagamento}</p>}
            {pedidoDetalhe.prazo_entrega && <p><strong>Prazo:</strong> {pedidoDetalhe.prazo_entrega}</p>}
            {pedidoDetalhe.observacoes && <p><strong>Obs:</strong> {pedidoDetalhe.observacoes}</p>}
          </div>
        )}
      </div>
    );
  };

  // ── Painel NOVO ─────────────────────────────────────────────────────────────
  const PainelNovo = () => (
    <div className="space-y-5 max-w-3xl pb-10">
      <div className="flex items-center gap-3">
        <button onClick={irLista} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="w-4 h-4" /> Voltar
        </button>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <FileText className="w-5 h-5 text-violet-600" /> Novo Orcamento
        </h1>
      </div>

      {/* Dados */}
      <div className="bg-card rounded-xl border p-4 space-y-4">
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
          <User className="w-3.5 h-3.5" /> Dados do orcamento
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Cliente</Label>
            <select value={form.cliente_id}
              onChange={e => setForm(f => ({ ...f, cliente_id: e.target.value }))}
              className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-violet-500">
              <option value="">Sem cliente (consumidor)</option>
              {clientes.map(c => <option key={c.id} value={c.id.toString()}>{c.nome}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1"><Calendar className="w-3 h-3" /> Validade (dias)</Label>
            <Input type="number" min={1} value={form.validade_dias}
              onChange={e => setForm(f => ({ ...f, validade_dias: parseInt(e.target.value) || 7 }))} className="h-9" />
          </div>
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1"><CreditCard className="w-3 h-3" /> Forma de pagamento</Label>
            <Input value={form.condicoes_pagamento} placeholder="Ex: PIX / Cartao / Dinheiro"
              onChange={e => setForm(f => ({ ...f, condicoes_pagamento: e.target.value }))} className="h-9" />
          </div>
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1"><Clock className="w-3 h-3" /> Prazo de entrega</Label>
            <Input value={form.prazo_entrega} placeholder="Ex: 3 dias uteis"
              onChange={e => setForm(f => ({ ...f, prazo_entrega: e.target.value }))} className="h-9" />
          </div>
          <div className="sm:col-span-2 space-y-1.5">
            <Label className="flex items-center gap-1"><MessageSquare className="w-3 h-3" /> Observacoes</Label>
            <Input value={form.observacoes} placeholder="Ex: Garantia de 30 dias contra defeitos"
              onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))} className="h-9" />
          </div>
        </div>
      </div>

      {/* Adicionar produtos */}
      <div className="bg-card rounded-xl border p-4 space-y-3">
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
          <Package className="w-3.5 h-3.5" /> Adicionar produtos
        </p>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-3.5 h-3.5" />
          <Input placeholder="Buscar produto por nome ou codigo..."
            value={buscaProd}
            onChange={e => { setBuscaProd(e.target.value); setShowList(true); setAddProdId(""); }}
            onFocus={() => setShowList(true)}
            className="pl-9 h-9" />
        </div>
        {showList && buscaProd && (
          <div className="max-h-52 overflow-y-auto rounded-lg border divide-y bg-background shadow-md">
            {prodsSel.length === 0 ? (
              <p className="p-3 text-sm text-muted-foreground text-center">Nenhum produto encontrado</p>
            ) : prodsSel.slice(0, 10).map(p => (
              <button key={p.id} type="button"
                onClick={() => { setAddProdId(p.id.toString()); setAddPreco(p.preco_venda.toFixed(2)); setBuscaProd(p.nome); setShowList(false); }}
                className={`w-full flex items-center justify-between px-3 py-2.5 text-sm hover:bg-muted/60 text-left ${addProdId === p.id.toString() ? "bg-violet-50 dark:bg-violet-950/20" : ""}`}>
                <div>
                  <span className="font-medium">{p.nome}</span>
                  {p.codigo_barras && <span className="text-xs text-muted-foreground ml-2 font-mono">{p.codigo_barras}</span>}
                </div>
                <span className="font-semibold text-violet-600 shrink-0 ml-3">R$ {Number(p.preco_venda).toFixed(2)}</span>
              </button>
            ))}
          </div>
        )}
        <div className="flex gap-2 items-end flex-wrap">
          <div className="space-y-1 flex-1 min-w-40">
            <Label className="text-xs">Selecionado</Label>
            <div className={`h-9 px-3 rounded-md border text-sm flex items-center truncate ${addProdId ? "bg-violet-50 dark:bg-violet-950/20 border-violet-300 font-medium" : "text-muted-foreground bg-muted/30"}`}>
              {addProdId ? prodSel?.nome : "Busque e clique acima"}
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Qtd</Label>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => setAddQtd(q => Math.max(1, q - 1))}
                className="w-8 h-9 rounded-md border text-red-500 font-bold hover:bg-muted flex items-center justify-center">−</button>
              <Input type="number" min={1} value={addQtd}
                onChange={e => setAddQtd(Math.max(1, parseInt(e.target.value) || 1))}
                className="h-9 text-center w-14 font-mono px-1" />
              <button type="button" onClick={() => setAddQtd(q => q + 1)}
                className="w-8 h-9 rounded-md border text-green-500 font-bold hover:bg-muted flex items-center justify-center">+</button>
            </div>
          </div>
          <div className="space-y-1 w-28">
            <Label className="text-xs">Preco unit.</Label>
            <Input type="number" step="0.01" value={addPreco} placeholder="0,00"
              onChange={e => setAddPreco(e.target.value)} className="h-9 font-mono" />
          </div>
          <Button type="button" onClick={adicionarItem} disabled={!addProdId}
            className="h-9 bg-violet-600 hover:bg-violet-700 text-white">
            <Plus className="w-4 h-4 mr-1" /> Add
          </Button>
        </div>
      </div>

      {/* Itens */}
      {form.itens.length > 0 && (
        <div className="bg-card rounded-xl border overflow-hidden">
          <div className="px-4 py-3 bg-muted/30 border-b flex items-center justify-between">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <Tag className="w-3.5 h-3.5" /> Itens ({form.itens.length})
            </p>
            <span className="text-sm font-bold text-violet-600">{fmt(subtotal)}</span>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr>
                <th className="text-left p-3 font-semibold">Produto</th>
                <th className="text-center p-3 font-semibold w-28">Qtd</th>
                <th className="text-right p-3 font-semibold">Unit.</th>
                <th className="text-right p-3 font-semibold">Total</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {form.itens.map((it, i) => (
                <tr key={i} className="border-t hover:bg-muted/30">
                  <td className="p-3 font-medium">{it.nome_produto}</td>
                  <td className="p-3">
                    <div className="flex items-center justify-center gap-1">
                      <button onClick={() => ajustarQtd(i, -1)} className="w-6 h-6 rounded border text-red-500 font-bold hover:bg-muted flex items-center justify-center text-xs">−</button>
                      <span className="w-8 text-center font-mono font-bold">{it.quantidade}</span>
                      <button onClick={() => ajustarQtd(i, +1)} className="w-6 h-6 rounded border text-green-500 font-bold hover:bg-muted flex items-center justify-center text-xs">+</button>
                    </div>
                  </td>
                  <td className="p-3 text-right text-muted-foreground">R$ {it.preco_unitario.toFixed(2)}</td>
                  <td className="p-3 text-right font-bold">R$ {it.total.toFixed(2)}</td>
                  <td className="p-3">
                    <button onClick={() => removerItem(i)} className="p-1 hover:bg-red-50 dark:hover:bg-red-950/30 rounded text-red-500">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Desconto */}
      {form.itens.length > 0 && (
        <div className="bg-card rounded-xl border p-4 space-y-4">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
            <Percent className="w-3.5 h-3.5" /> Desconto e totais
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Desconto em %</Label>
              <Input type="number" min={0} max={100} step={0.5}
                value={form.desconto_pct || ""} placeholder="0"
                onChange={e => setDescPct(parseFloat(e.target.value) || 0)} className="h-9 font-mono" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Desconto em R$</Label>
              <Input type="number" min={0} step={0.01}
                value={form.desconto_valor || ""} placeholder="0,00"
                onChange={e => setDescVal(parseFloat(e.target.value) || 0)} className="h-9 font-mono" />
            </div>
          </div>
          <div className="space-y-1.5 pt-2 border-t text-sm">
            <div className="flex justify-between text-muted-foreground"><span>Subtotal</span><span>{fmt(subtotal)}</span></div>
            {form.desconto_valor > 0 && (
              <div className="flex justify-between text-red-500 font-medium">
                <span>Desconto ({form.desconto_pct.toFixed(1)}%)</span>
                <span>- {fmt(form.desconto_valor)}</span>
              </div>
            )}
            <div className="flex justify-between text-lg font-black border-t pt-2">
              <span>TOTAL</span><span className="text-violet-600">{fmt(totalFinal)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Botoes */}
      <div className="flex gap-3">
        <Button variant="outline" className="flex-1" onClick={irLista}>
          <X className="w-4 h-4 mr-2" /> Cancelar
        </Button>
        <Button className="flex-1 bg-violet-600 hover:bg-violet-700 text-white"
          disabled={saving || form.itens.length === 0} onClick={salvar}>
          {saving ? <><RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Salvando...</> : <><FileText className="w-4 h-4 mr-2" /> Salvar Orcamento</>}
        </Button>
      </div>
    </div>
  );

  // ── RENDER: UM UNICO Layout ─────────────────────────────────────────────────
  return (
    <Layout title={tela === "novo" ? "Novo Orcamento" : tela === "detalhe" ? "Detalhe" : "Orcamentos"}>
      {tela === "lista"   && <PainelLista />}
      {tela === "detalhe" && <PainelDetalhe />}
      {tela === "novo"    && <PainelNovo />}
    </Layout>
  );
}
