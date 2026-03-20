/**
 * ASTIA PDV — Representantes / Vendedores Externos v2.0
 * Representantes = vendedores externos que recebem % de comissão por venda.
 */
import { useState, useEffect } from "react";
import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { representantesAPI, comissoesAPI } from "@/lib/api";
import { UserCheck, Plus, Search, Edit, Trash2, DollarSign, CheckCircle, Clock, BarChart3, RefreshCw, Info } from "lucide-react";

const fmt = (v: any) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v) || 0);
const emptyForm = { nome: "", cpf: "", email: "", telefone: "", celular: "", cep: "", logradouro: "", numero: "", complemento: "", bairro: "", cidade: "", estado: "", perc_comissao: "5", observacoes: "" };

export default function Representantes() {
  const { toast } = useToast();
  const [lista, setLista] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<any>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [comissoes, setComissoes] = useState<any[]>([]);
  const [resumo, setResumo] = useState<any[]>([]);
  const [loadingCom, setLoadingCom] = useState(false);
  const [filtroRep, setFiltroRep] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("");
  const [inicio, setInicio] = useState("");
  const [fim, setFim] = useState("");
  const [selecionadas, setSelecionadas] = useState<Set<number>>(new Set());

  const carregar = async () => {
    setLoading(true);
    try { setLista(await representantesAPI.listar({ ativo: 1 }) || []); }
    catch (e: any) { toast({ title: "Erro", description: e.message, variant: "destructive" }); }
    finally { setLoading(false); }
  };

  const carregarComissoes = async () => {
    setLoadingCom(true);
    try {
      const [c, r] = await Promise.all([
        comissoesAPI.listar({ representante_id: filtroRep ? parseInt(filtroRep) : undefined, status: filtroStatus || undefined, inicio: inicio || undefined, fim: fim || undefined }),
        comissoesAPI.resumo(inicio || undefined, fim || undefined),
      ]);
      setComissoes(c || []);
      setResumo(r || []);
    } catch (e: any) {
      toast({ title: "Erro ao carregar comissões", description: e.message, variant: "destructive" });
    } finally { setLoadingCom(false); }
  };

  useEffect(() => { carregar(); }, []);

  const salvar = async () => {
    if (!form.nome?.trim()) { toast({ title: "Nome obrigatório", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const dados = { ...form, perc_comissao: parseFloat(form.perc_comissao) || 0 };
      if (editId) await representantesAPI.atualizar(editId, dados);
      else await representantesAPI.criar(dados);
      toast({ title: editId ? "Atualizado!" : "Cadastrado!" });
      setDialogOpen(false); carregar();
    } catch (e: any) { toast({ title: "Erro", description: e.message, variant: "destructive" }); }
    finally { setSaving(false); }
  };

  const excluir = async (id: number, nome: string) => {
    if (!confirm(`Desativar "${nome}"?`)) return;
    try { await representantesAPI.deletar(id); toast({ title: "Desativado!" }); carregar(); }
    catch (e: any) { toast({ title: "Erro", description: e.message, variant: "destructive" }); }
  };

  const pagarSelecionadas = async () => {
    if (!selecionadas.size) return;
    try {
      const r = await comissoesAPI.pagar(Array.from(selecionadas), new Date().toISOString().split("T")[0]);
      toast({ title: `${r.pagas} comissão(ões) pagas!` });
      setSelecionadas(new Set()); carregarComissoes();
    } catch (e: any) { toast({ title: "Erro", description: e.message, variant: "destructive" }); }
  };

  const f = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((p: any) => ({ ...p, [k]: e.target.value }));
  const filtrados = lista.filter(r => !busca || r.nome?.toLowerCase().includes(busca.toLowerCase()) || r.cpf?.includes(busca));
  const totalPendente = resumo.reduce((s, r) => s + Number(r.comissao_pendente || 0), 0);
  const totalPago = resumo.reduce((s, r) => s + Number(r.comissao_paga || 0), 0);

  return (
    <Layout title="Representantes">
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><UserCheck className="w-6 h-6" /> Representantes</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Vendedores externos e consultores que recebem comissão por vendas</p>
        </div>

        <div className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-xl text-sm text-blue-800 dark:text-blue-300">
          <Info className="w-4 h-4 mt-0.5 shrink-0" />
          <span><strong>O que são?</strong> Pessoas externas (revendedores, consultores) que indicam clientes e recebem % por venda. Para vincular a uma venda, selecione o representante no PDV na tela de checkout.</span>
        </div>

        <Tabs defaultValue="cadastro">
          <TabsList>
            <TabsTrigger value="cadastro"><UserCheck className="w-4 h-4 mr-2" />Cadastro</TabsTrigger>
            <TabsTrigger value="comissoes" onClick={carregarComissoes}><DollarSign className="w-4 h-4 mr-2" />Comissões</TabsTrigger>
            <TabsTrigger value="resumo" onClick={carregarComissoes}><BarChart3 className="w-4 h-4 mr-2" />Resumo</TabsTrigger>
          </TabsList>

          {/* CADASTRO */}
          <TabsContent value="cadastro" className="space-y-4 mt-4">
            <div className="flex gap-2 flex-wrap items-center">
              <div className="relative flex-1 min-w-48 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input placeholder="Buscar por nome ou CPF..." value={busca} onChange={e => setBusca(e.target.value)} className="pl-9" />
              </div>
              <Button onClick={() => { setEditId(null); setForm(emptyForm); setDialogOpen(true); }}>
                <Plus className="w-4 h-4 mr-2" />Novo Representante
              </Button>
            </div>
            <Card>
              <CardContent className="pt-3 overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead><tr className="border-b">{["Nome","CPF","Contato","Cidade","% Comissão","Ações"].map(h => <th key={h} className="text-left p-2 text-xs font-medium text-muted-foreground">{h}</th>)}</tr></thead>
                  <tbody>
                    {loading && <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">Carregando...</td></tr>}
                    {!loading && filtrados.length === 0 && <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">{busca ? "Nenhum resultado." : "Nenhum representante cadastrado."}</td></tr>}
                    {filtrados.map(rep => (
                      <tr key={rep.id} className="border-b hover:bg-muted/40">
                        <td className="p-2 font-medium">{rep.nome}</td>
                        <td className="p-2 font-mono text-xs">{rep.cpf || "—"}</td>
                        <td className="p-2 text-xs"><div>{rep.telefone || rep.celular || "—"}</div>{rep.email && <div className="text-muted-foreground">{rep.email}</div>}</td>
                        <td className="p-2 text-xs">{rep.cidade ? `${rep.cidade}/${rep.estado}` : "—"}</td>
                        <td className="p-2"><Badge variant="secondary" className="font-mono font-bold">{Number(rep.perc_comissao || 0).toFixed(1)}%</Badge></td>
                        <td className="p-2"><div className="flex gap-1">
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => { setEditId(rep.id); setForm({ ...rep, perc_comissao: String(rep.perc_comissao) }); setDialogOpen(true); }}><Edit className="w-3.5 h-3.5" /></Button>
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => excluir(rep.id, rep.nome)}><Trash2 className="w-3.5 h-3.5" /></Button>
                        </div></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* COMISSÕES */}
          <TabsContent value="comissoes" className="space-y-4 mt-4">
            <div className="flex gap-2 flex-wrap items-end">
              <div className="w-44"><Label className="text-xs">Representante</Label>
                <Select value={filtroRep} onValueChange={setFiltroRep}>
                  <SelectTrigger className="h-8"><SelectValue placeholder="Todos" /></SelectTrigger>
                  <SelectContent><SelectItem value="">Todos</SelectItem>{lista.map(r => <SelectItem key={r.id} value={String(r.id)}>{r.nome}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="w-32"><Label className="text-xs">Status</Label>
                <Select value={filtroStatus} onValueChange={setFiltroStatus}>
                  <SelectTrigger className="h-8"><SelectValue placeholder="Todos" /></SelectTrigger>
                  <SelectContent><SelectItem value="">Todos</SelectItem><SelectItem value="pendente">Pendente</SelectItem><SelectItem value="paga">Paga</SelectItem></SelectContent>
                </Select>
              </div>
              <div><Label className="text-xs">De</Label><Input type="date" value={inicio} onChange={e => setInicio(e.target.value)} className="h-8 w-36" /></div>
              <div><Label className="text-xs">Até</Label><Input type="date" value={fim} onChange={e => setFim(e.target.value)} className="h-8 w-36" /></div>
              <Button size="sm" variant="outline" onClick={carregarComissoes} disabled={loadingCom}><RefreshCw className={`w-3.5 h-3.5 mr-1 ${loadingCom ? "animate-spin" : ""}`} />Buscar</Button>
              {selecionadas.size > 0 && <Button size="sm" onClick={pagarSelecionadas} className="bg-green-600 hover:bg-green-700"><CheckCircle className="w-3.5 h-3.5 mr-1" />Pagar {selecionadas.size} selecionada{selecionadas.size > 1 ? "s" : ""}</Button>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/30"><CardContent className="pt-3 pb-3 flex items-center gap-3"><Clock className="w-5 h-5 text-amber-600" /><div><p className="text-xs text-muted-foreground">A Pagar</p><p className="text-lg font-bold text-amber-700">{fmt(totalPendente)}</p></div></CardContent></Card>
              <Card className="border-green-200 bg-green-50 dark:bg-green-950/30"><CardContent className="pt-3 pb-3 flex items-center gap-3"><CheckCircle className="w-5 h-5 text-green-600" /><div><p className="text-xs text-muted-foreground">Pagas</p><p className="text-lg font-bold text-green-700">{fmt(totalPago)}</p></div></CardContent></Card>
            </div>
            <Card>
              <CardContent className="pt-3 overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead><tr className="border-b">
                    <th className="p-2 w-8"><input type="checkbox" checked={selecionadas.size > 0 && selecionadas.size === comissoes.filter(c => c.status === "pendente").length && comissoes.length > 0} onChange={e => { if (e.target.checked) setSelecionadas(new Set(comissoes.filter(c => c.status === "pendente").map(c => c.id))); else setSelecionadas(new Set()); }} className="accent-violet-600" /></th>
                    {["Representante","Venda","Data","Valor Venda","% Comis.","Comissão","Status","Pago em"].map(h => <th key={h} className="text-left p-2 text-xs font-medium text-muted-foreground">{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {loadingCom && <tr><td colSpan={9} className="text-center py-8 text-muted-foreground">Buscando...</td></tr>}
                    {!loadingCom && comissoes.length === 0 && <tr><td colSpan={9} className="text-center py-8 text-muted-foreground">Nenhuma comissão ainda. Vincule representantes às vendas no PDV.</td></tr>}
                    {comissoes.map(c => (
                      <tr key={c.id} className="border-b hover:bg-muted/40">
                        <td className="p-2">{c.status === "pendente" && <input type="checkbox" checked={selecionadas.has(c.id)} onChange={() => setSelecionadas(prev => { const n = new Set(prev); n.has(c.id) ? n.delete(c.id) : n.add(c.id); return n; })} className="accent-violet-600" />}</td>
                        <td className="p-2 font-medium">{c.representante_nome}</td>
                        <td className="p-2 font-mono text-xs">{c.numero_venda}</td>
                        <td className="p-2 text-xs font-mono">{c.data_venda?.slice(0, 10)}</td>
                        <td className="p-2">{fmt(c.valor_venda)}</td>
                        <td className="p-2 text-center"><Badge variant="outline" className="font-mono">{Number(c.perc_comissao || 0).toFixed(1)}%</Badge></td>
                        <td className="p-2 font-bold text-green-700">{fmt(c.valor_comissao)}</td>
                        <td className="p-2"><Badge variant={c.status === "paga" ? "default" : "secondary"} className="text-xs">{c.status === "paga" ? "✓ Paga" : "⏳ Pendente"}</Badge></td>
                        <td className="p-2 text-xs font-mono text-muted-foreground">{c.data_pagamento || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* RESUMO */}
          <TabsContent value="resumo" className="space-y-4 mt-4">
            <div className="flex gap-2 items-end flex-wrap">
              <div><Label className="text-xs">De</Label><Input type="date" value={inicio} onChange={e => setInicio(e.target.value)} className="h-8 w-36" /></div>
              <div><Label className="text-xs">Até</Label><Input type="date" value={fim} onChange={e => setFim(e.target.value)} className="h-8 w-36" /></div>
              <Button size="sm" variant="outline" onClick={carregarComissoes} disabled={loadingCom}><RefreshCw className={`w-3.5 h-3.5 mr-1 ${loadingCom ? "animate-spin" : ""}`} />Atualizar</Button>
            </div>
            {loadingCom && <p className="text-center py-8 text-muted-foreground">Carregando...</p>}
            {!loadingCom && resumo.length === 0 && <Card><CardContent className="py-10 text-center text-muted-foreground"><UserCheck className="w-10 h-10 mx-auto mb-3 opacity-20" /><p>Nenhum dado ainda.</p><p className="text-sm mt-1">Cadastre representantes e vincule às vendas no PDV.</p></CardContent></Card>}
            <div className="grid gap-3">
              {resumo.map(r => {
                const total = Number(r.total_comissao || 0);
                const pago  = Number(r.comissao_paga || 0);
                const pct   = total > 0 ? (pago / total) * 100 : 0;
                return (
                  <Card key={r.id}><CardContent className="pt-4 pb-4">
                    <div className="flex items-start justify-between flex-wrap gap-3">
                      <div>
                        <p className="font-bold text-base">{r.nome}</p>
                        <p className="text-sm text-muted-foreground">{Number(r.total_vendas || 0)} venda{Number(r.total_vendas) !== 1 ? "s" : ""} · <span className="font-mono">{Number(r.perc_comissao || 0).toFixed(1)}%</span></p>
                      </div>
                      <div className="flex gap-4 text-right">
                        <div><p className="text-xs text-muted-foreground">Vendido</p><p className="font-bold">{fmt(r.total_vendido)}</p></div>
                        <div><p className="text-xs text-muted-foreground">A Pagar</p><p className="font-bold text-amber-600">{fmt(r.comissao_pendente)}</p></div>
                        <div><p className="text-xs text-muted-foreground">Pago</p><p className="font-bold text-green-600">{fmt(r.comissao_paga)}</p></div>
                        <div><p className="text-xs text-muted-foreground">Total Comissão</p><p className="font-bold text-primary">{fmt(r.total_comissao)}</p></div>
                      </div>
                    </div>
                    {total > 0 && <div className="mt-3 h-1.5 bg-muted rounded-full overflow-hidden"><div className="h-full bg-green-500 rounded-full" style={{ width: `${Math.min(100, pct)}%` }} /></div>}
                  </CardContent></Card>
                );
              })}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editId ? "Editar" : "Novo"} Representante</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2"><Label>Nome completo *</Label><Input value={form.nome || ""} onChange={f("nome")} autoFocus /></div>
              <div><Label>CPF</Label><Input value={form.cpf || ""} onChange={f("cpf")} placeholder="000.000.000-00" /></div>
              <div><Label>% de Comissão *</Label>
                <div className="relative"><Input type="number" min="0" max="100" step="0.1" value={form.perc_comissao || "5"} onChange={f("perc_comissao")} className="pr-7" /><span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">%</span></div>
                <p className="text-xs text-muted-foreground mt-1">% do total da venda</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div><Label>Telefone</Label><Input value={form.telefone || ""} onChange={f("telefone")} /></div>
              <div><Label>Celular</Label><Input value={form.celular || ""} onChange={f("celular")} /></div>
              <div><Label>E-mail</Label><Input type="email" value={form.email || ""} onChange={f("email")} /></div>
            </div>
            <div className="border-t pt-3 grid grid-cols-4 gap-3">
              <div><Label>CEP</Label><Input value={form.cep || ""} onChange={f("cep")} /></div>
              <div className="col-span-2"><Label>Logradouro</Label><Input value={form.logradouro || ""} onChange={f("logradouro")} /></div>
              <div><Label>Nº</Label><Input value={form.numero || ""} onChange={f("numero")} /></div>
              <div><Label>Bairro</Label><Input value={form.bairro || ""} onChange={f("bairro")} /></div>
              <div className="col-span-2"><Label>Cidade</Label><Input value={form.cidade || ""} onChange={f("cidade")} /></div>
              <div><Label>UF</Label><Input value={form.estado || ""} onChange={f("estado")} maxLength={2} className="uppercase" /></div>
            </div>
            <div><Label>Observações</Label><Input value={form.observacoes || ""} onChange={f("observacoes")} /></div>
            <div className="flex gap-2 justify-end pt-1">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button onClick={salvar} disabled={saving}>{saving ? "Salvando..." : editId ? "Atualizar" : "Cadastrar"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
