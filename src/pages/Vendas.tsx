import { useState, useEffect } from "react";
import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TrendingUp, Search, DollarSign, Package, Calendar, X, ChevronRight, User, CreditCard, RefreshCw, Banknote, QrCode, Ticket, Printer, ArrowLeftRight } from "lucide-react";
import { vendasAPI } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";

const fmt = (v: number) => "R$ " + Number(v||0).toLocaleString("pt-BR",{minimumFractionDigits:2});
const fmtPag = (f: string) => ({"dinheiro":"Dinheiro","credito":"Cr�dito","debito":"D�bito","pix":"PIX","voucher":"Voucher","crediario":"Fiado","fiado":"Fiado"}[f]||f);
const iconePag = (f: string): any => ({"dinheiro":Banknote,"credito":CreditCard,"debito":CreditCard,"pix":QrCode,"voucher":Ticket,"crediario":CreditCard,"fiado":CreditCard}[f]||CreditCard);
const statusBadge = (s: string): [any,string] => ({"concluida":["default","Concluída"],"cancelada":["destructive","Cancelada"],"pendente":["secondary","Pendente"]}[s]||["secondary",s]) as any;

export default function Vendas() {
  const { toast } = useToast();
  const { usuario } = useAuth();
  const navigate = useNavigate();
  const isGerente = usuario?.cargo === "admin" || usuario?.cargo === "gerente";
  const hoje = new Date().toISOString().slice(0,10);

  const [vendas, setVendas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dataInicio, setDataInicio] = useState(hoje);
  const [dataFim, setDataFim] = useState(hoje);
  const [venda, setVenda] = useState<any>(null);
  const [itens, setItens] = useState<any[]>([]);
  const [pags, setPags] = useState<any[]>([]);
  const [loadDet, setLoadDet] = useState(false);
  const [cancelando, setCancelando] = useState(false);

  useEffect(() => { fetchVendas(); }, []);

  const fetchVendas = async () => {
    setLoading(true);
    try {
      const f: any = { data_inicio: dataInicio||undefined, data_fim: dataFim||undefined };
      if (usuario?.cargo === "vendedor") f.usuario_id = usuario.id;
      setVendas(await vendasAPI.listar(f) || []);
    } catch { toast({title:"Erro ao carregar vendas",variant:"destructive"}); }
    finally { setLoading(false); }
  };

  const abrirDetalhe = async (v: any) => {
    setVenda(v); setLoadDet(true);
    try {
      const [it, pg] = await Promise.all([vendasAPI.itens(v.id), vendasAPI.pagamentos(v.id)]);
      setItens(it||[]); setPags(pg||[]);
    } catch {} finally { setLoadDet(false); }
  };

  const imprimir = () => {
    if (!venda) return;
    const win = window.open("","_blank","width=420,height=700");
    if (!win) return;
    const rows = itens.map(i=>`<tr><td>${i.nome_produto}</td><td style="text-align:center">${i.quantidade}</td><td style="text-align:right">R$ ${Number(i.preco_unitario).toFixed(2)}</td><td style="text-align:right">R$ ${Number(i.total).toFixed(2)}</td></tr>`).join("");
    win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Venda ${venda.numero}</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Courier New',monospace;font-size:12px;padding:16px;max-width:320px;margin:0 auto}
.c{text-align:center}.b{font-weight:bold}.sep{border-top:1px dashed #000;margin:8px 0}
table{width:100%;border-collapse:collapse}td,th{padding:2px 0}th{text-align:left;font-weight:bold}
@media print{@page{margin:5mm}}</style></head><body>
<div class="c b">SEGUNDA VIA</div><div class="sep"></div>
<div><b>Venda:</b> ${venda.numero}</div>
<div><b>Data:</b> ${new Date(venda.criado_em).toLocaleString("pt-BR")}</div>
<div><b>Vendedor:</b> ${venda.usuario_nome||"—"}</div>
${venda.cliente_nome?`<div><b>Cliente:</b> ${venda.cliente_nome}</div>`:""}
<div class="sep"></div>
<table><tr class="b"><th>Item</th><th style="text-align:center">Qtd</th><th style="text-align:right">Un</th><th style="text-align:right">Total</th></tr>${rows}</table>
<div class="sep"></div>
<div style="display:flex;justify-content:space-between" class="b"><span>TOTAL</span><span>R$ ${Number(venda.total).toFixed(2)}</span></div>
${pags.map(p=>`<div>${fmtPag(p.forma)}: R$ ${Number(p.valor).toFixed(2)}</div>`).join("")}
${venda.troco>0?`<div>Troco: R$ ${Number(venda.troco).toFixed(2)}</div>`:""}
<div class="sep"></div><div class="c">ASTIA PDV by VYN Developer</div>
<script>window.onload=()=>setTimeout(()=>window.print(),400)</script></body></html>`);
    win.document.close();
  };

  const cancelarVenda = async () => {
    if (!venda || !usuario?.id) return;
    if (venda.status !== "concluida") {
      toast({ title: "Esta venda já está cancelada", variant: "destructive" });
      return;
    }

    const motivo = window.prompt("Informe o motivo do cancelamento:");
    if (motivo === null) return;
    const motivoFinal = motivo.trim();
    if (motivoFinal.length < 3) {
      toast({ title: "Informe um motivo com pelo menos 3 caracteres", variant: "destructive" });
      return;
    }
    if (!window.confirm(`Confirmar cancelamento da venda ${venda.numero}?`)) return;

    setCancelando(true);
    try {
      await vendasAPI.cancelar(venda.id, motivoFinal, usuario.id);
      toast({ title: "Venda cancelada com sucesso" });
      setVenda(null);
      await fetchVendas();
    } catch (e: any) {
      toast({ title: "Erro ao cancelar venda", description: e.message, variant: "destructive" });
    } finally {
      setCancelando(false);
    }
  };

  const filtered = vendas.filter(v => !search || [v.numero,v.cliente_nome,v.usuario_nome].some(s=>(s||"").toLowerCase().includes(search.toLowerCase())));
  const concluidas = vendas.filter(v=>v.status==="concluida");
  const totalVendas = concluidas.reduce((s,v)=>s+Number(v.total),0);

  return (
    <Layout title="Vendas">
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-violet-600" />
            {isGerente ? "Todas as Vendas" : "Minhas Vendas"}
          </h1>
          <p className="text-sm text-muted-foreground">{isGerente ? "Histórico completo com filtro por período" : "Suas vendas registradas"}</p>
        </div>

        {/* Cards resumo */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            {title:"Total no período",val:fmt(totalVendas),icon:DollarSign,color:"text-green-600"},
            {title:"Vendas concluídas",val:String(concluidas.length),icon:TrendingUp,color:"text-violet-600"},
            {title:"Ticket médio",val:concluidas.length?fmt(totalVendas/concluidas.length):"R$ 0,00",icon:Calendar,color:"text-blue-600"},
            {title:"Total registros",val:String(vendas.length),icon:Package,color:"text-amber-600"},
          ].map(m=>(
            <Card key={m.title}><CardContent className="pt-4 pb-3">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs text-muted-foreground">{m.title}</p>
                <m.icon className={`w-4 h-4 ${m.color}`}/>
              </div>
              <p className="text-xl font-bold">{m.val}</p>
            </CardContent></Card>
          ))}
        </div>

        {/* Filtros */}
        <Card><CardContent className="pt-4 pb-3">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex items-center gap-2">
              <div className="space-y-1">
                <Label className="text-xs">De</Label>
                <Input type="date" value={dataInicio} onChange={e=>setDataInicio(e.target.value)} className="h-8 w-36 text-sm"/>
              </div>
              <span className="text-muted-foreground mt-5 text-sm">até</span>
              <div className="space-y-1">
                <Label className="text-xs">Até</Label>
                <Input type="date" value={dataFim} onChange={e=>setDataFim(e.target.value)} className="h-8 w-36 text-sm"/>
              </div>
              <Button size="sm" onClick={fetchVendas} disabled={loading} className="h-8 mt-5">
                <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading?"animate-spin":""}`}/>Buscar
              </Button>
            </div>
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-3.5 h-3.5"/>
              <Input placeholder="Nº, cliente ou vendedor..." value={search} onChange={e=>setSearch(e.target.value)} className="pl-9 h-8 text-sm"/>
            </div>
          </div>
        </CardContent></Card>

        {/* Tabela */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{filtered.length} venda(s)</CardTitle>
            <CardDescription>Clique em uma linha para ver os detalhes completos</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nº Cupom</TableHead>
                  <TableHead>Cliente</TableHead>
                  {isGerente && <TableHead>Vendedor</TableHead>}
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Pagamento</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Data/Hora</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(v=>{
                  const [variant,label]=statusBadge(v.status);
                  const PIcon=iconePag(v.forma_pagamento);
                  return (
                    <TableRow key={v.id} className="cursor-pointer hover:bg-muted/50" onClick={()=>abrirDetalhe(v)}>
                      <TableCell className="font-mono font-bold text-sm text-violet-700 dark:text-violet-300">{v.numero}</TableCell>
                      <TableCell className="max-w-[120px] truncate">{v.cliente_nome||<span className="text-muted-foreground text-xs">Consumidor</span>}</TableCell>
                      {isGerente&&<TableCell><div className="flex items-center gap-1"><User className="w-3 h-3 text-muted-foreground"/>{v.usuario_nome||"—"}</div></TableCell>}
                      <TableCell className="text-right font-semibold">{fmt(v.total)}</TableCell>
                      <TableCell><div className="flex items-center gap-1"><PIcon className="w-3.5 h-3.5 text-muted-foreground"/>{fmtPag(v.forma_pagamento)}</div></TableCell>
                      <TableCell><Badge variant={variant} className="text-xs">{label}</Badge></TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{new Date(v.criado_em).toLocaleString("pt-BR")}</TableCell>
                      <TableCell><ChevronRight className="w-4 h-4 text-muted-foreground"/></TableCell>
                    </TableRow>
                  );
                })}
                {filtered.length===0&&!loading&&(
                  <TableRow><TableCell colSpan={isGerente?8:7} className="text-center py-10 text-muted-foreground">
                    <TrendingUp className="w-8 h-8 mx-auto mb-2 opacity-30"/>
                    <p>Nenhuma venda no período</p>
                  </TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Modal detalhe */}
      {venda&&(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b sticky top-0 bg-white dark:bg-slate-900 z-10">
              <div>
                <h2 className="font-bold text-lg flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-violet-600"/>
                  Venda <span className="font-mono text-violet-700 dark:text-violet-300">{venda.numero}</span>
                </h2>
                <p className="text-sm text-muted-foreground">{new Date(venda.criado_em).toLocaleString("pt-BR")}</p>
              </div>
              <button onClick={()=>setVenda(null)} className="p-2 hover:bg-muted rounded-xl"><X className="w-5 h-5"/></button>
            </div>
            <div className="p-5 space-y-5">
              {/* Info grid */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {[
                  {l:"Nº do cupom",v:venda.numero,mono:true},
                  {l:"Status",v:statusBadge(venda.status)[1]},
                  {l:"Vendedor",v:venda.usuario_nome||"—"},
                  {l:"Cliente",v:venda.cliente_nome||"Consumidor"},
                  {l:"Pagamento",v:fmtPag(venda.forma_pagamento)},
                  {l:"Data",v:new Date(venda.criado_em).toLocaleString("pt-BR")},
                ].map(d=>(
                  <div key={d.l} className="p-3 bg-muted/50 rounded-xl">
                    <p className="text-xs text-muted-foreground mb-0.5">{d.l}</p>
                    <p className={`font-semibold text-sm ${d.mono?"font-mono text-violet-700 dark:text-violet-300":""}`}>{d.v}</p>
                  </div>
                ))}
              </div>

              {/* Itens */}
              <div>
                <h3 className="font-semibold text-sm mb-2 flex items-center gap-2"><Package className="w-4 h-4"/>Itens</h3>
                {loadDet?(
                  <div className="text-center py-6"><RefreshCw className="w-5 h-5 animate-spin mx-auto text-muted-foreground"/></div>
                ):(
                  <div className="rounded-xl border overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="text-left p-2.5 font-semibold">Produto</th>
                          <th className="text-center p-2.5 font-semibold">Qtd</th>
                          <th className="text-right p-2.5 font-semibold">Unit.</th>
                          <th className="text-right p-2.5 font-semibold">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {itens.map((i,idx)=>(
                          <tr key={idx} className="border-t hover:bg-muted/30">
                            <td className="p-2.5 font-medium">{i.nome_produto}</td>
                            <td className="p-2.5 text-center">{i.quantidade}</td>
                            <td className="p-2.5 text-right text-muted-foreground">R$ {Number(i.preco_unitario).toFixed(2)}</td>
                            <td className="p-2.5 text-right font-semibold">R$ {Number(i.total).toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Totais */}
              <div className="space-y-1.5">
                {venda.desconto_valor>0&&(
                  <div className="flex justify-between text-sm text-red-500"><span>Desconto</span><span>- R$ {Number(venda.desconto_valor).toFixed(2)}</span></div>
                )}
                <div className="flex justify-between font-bold text-lg border-t pt-2">
                  <span>Total</span><span className="text-green-600">R$ {Number(venda.total).toFixed(2)}</span>
                </div>
                {pags.map((p,i)=>{
                  const PIcon=iconePag(p.forma);
                  return(
                    <div key={i} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-1.5 text-muted-foreground"><PIcon className="w-3.5 h-3.5"/>{fmtPag(p.forma)}{p.parcelas>1&&` ${p.parcelas}x`}</div>
                      <span>R$ {Number(p.valor).toFixed(2)}</span>
                    </div>
                  );
                })}
                {venda.troco>0&&(
                  <div className="flex justify-between text-sm text-blue-600"><span>Troco</span><span>R$ {Number(venda.troco).toFixed(2)}</span></div>
                )}
              </div>

              {/* Ações */}
              <div className="flex gap-3 pt-2 border-t">
                <Button variant="outline" className="flex-1" onClick={imprimir}>
                  <Printer className="w-4 h-4 mr-2"/>Segunda via
                </Button>
                {isGerente&&venda.status==="concluida"&&(
                  <Button variant="destructive" className="flex-1" onClick={cancelarVenda} disabled={cancelando}>
                    {cancelando ? "Cancelando..." : "Cancelar venda"}
                  </Button>
                )}
                {isGerente&&venda.status==="concluida"&&(
                  <Button variant="outline" className="flex-1 text-amber-600 border-amber-300 hover:bg-amber-50"
                    onClick={()=>{setVenda(null);navigate("/trocas");}}>
                    <ArrowLeftRight className="w-4 h-4 mr-2"/>Registrar troca
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
