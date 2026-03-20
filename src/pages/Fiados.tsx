import { useEffect, useMemo, useState } from "react";
import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Wallet, Plus, Search, AlertTriangle, CheckCircle2 } from "lucide-react";
import { clientesAPI, fiadosAPI } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

const hoje = new Date().toISOString().slice(0, 10);
const daqui30 = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
const fmt = (v: number) => "R$ " + Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 });

function statusVariant(status: string): "default" | "destructive" | "secondary" | "outline" {
  if (status === "paga") return "default";
  if (status === "vencida") return "destructive";
  if (status === "parcial") return "secondary";
  return "outline";
}

function statusLabel(status: string) {
  if (status === "aberta") return "Aberta";
  if (status === "parcial") return "Parcial";
  if (status === "paga") return "Paga";
  if (status === "vencida") return "Vencida";
  return status;
}

export default function Fiados() {
  const { toast } = useToast();
  const { usuario } = useAuth();

  const [loading, setLoading] = useState(true);
  const [fiados, setFiados] = useState<any[]>([]);
  const [clientes, setClientes] = useState<any[]>([]);
  const [busca, setBusca] = useState("");
  const [status, setStatus] = useState("abertas");
  const [somenteAtrasados, setSomenteAtrasados] = useState(false);

  const [openNovo, setOpenNovo] = useState(false);
  const [salvandoNovo, setSalvandoNovo] = useState(false);
  const [novo, setNovo] = useState({
    cliente_id: "",
    valor: "",
    data_vencimento: daqui30,
    descricao: "",
    observacoes: "",
  });

  const [openReceber, setOpenReceber] = useState(false);
  const [recebendo, setRecebendo] = useState(false);
  const [fiadoSelecionado, setFiadoSelecionado] = useState<any>(null);
  const [recebimento, setRecebimento] = useState({
    valor_pago: "",
    forma: "dinheiro",
    data: hoje,
    observacoes: "",
  });
  const [openItens, setOpenItens] = useState(false);
  const [contaItens, setContaItens] = useState<any>(null);
  const [itensConta, setItensConta] = useState<any[]>([]);
  const [loadingItens, setLoadingItens] = useState(false);
  const [salvandoItem, setSalvandoItem] = useState(false);
  const [novoItem, setNovoItem] = useState({
    nome_item: "",
    quantidade: "1",
    valor_unitario: "",
    observacoes: "",
  });

  const carregar = async () => {
    setLoading(true);
    try {
      const [lista, cls] = await Promise.all([
        fiadosAPI.listar({ status, busca, somente_atrasados: somenteAtrasados }),
        clientesAPI.listar({ ativo: 1 }),
      ]);
      setFiados(lista || []);
      setClientes(cls || []);
    } catch (e: any) {
      toast({ title: "Erro ao carregar fiados", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    carregar();
  }, [status, somenteAtrasados]);

  const resumo = useMemo(() => {
    const aberto = fiados
      .filter((f) => ["aberta", "parcial", "vencida"].includes(f.status))
      .reduce((s, f) => s + Number(f.valor_aberto || 0), 0);
    const vencido = fiados
      .filter((f) => f.status === "vencida")
      .reduce((s, f) => s + Number(f.valor_aberto || 0), 0);
    const recebidos = fiados
      .filter((f) => f.status === "paga")
      .reduce((s, f) => s + Number(f.valor || 0), 0);
    return { aberto, vencido, recebidos };
  }, [fiados]);

  const criarFiado = async (e: React.FormEvent) => {
    e.preventDefault();
    setSalvandoNovo(true);
    try {
      await fiadosAPI.criar({
        ...novo,
        cliente_id: Number(novo.cliente_id),
        valor: Number(novo.valor),
        usuario_id: usuario?.id || null,
      });
      toast({ title: "Fiado lançado com sucesso" });
      setOpenNovo(false);
      setNovo({
        cliente_id: "",
        valor: "",
        data_vencimento: daqui30,
        descricao: "",
        observacoes: "",
      });
      await carregar();
    } catch (e: any) {
      toast({ title: "Erro ao lançar fiado", description: e.message, variant: "destructive" });
    } finally {
      setSalvandoNovo(false);
    }
  };

  const abrirReceber = (f: any) => {
    setFiadoSelecionado(f);
    setRecebimento({
      valor_pago: String(Number(f.valor_aberto || 0).toFixed(2)),
      forma: "dinheiro",
      data: hoje,
      observacoes: "",
    });
    setOpenReceber(true);
  };

  const carregarItensConta = async (contaId: number) => {
    setLoadingItens(true);
    try {
      const itens = await fiadosAPI.itens(contaId);
      setItensConta(itens || []);
    } catch (e: any) {
      toast({ title: "Erro ao carregar itens", description: e.message, variant: "destructive" });
    } finally {
      setLoadingItens(false);
    }
  };

  const abrirItens = async (f: any) => {
    setContaItens(f);
    setNovoItem({ nome_item: "", quantidade: "1", valor_unitario: "", observacoes: "" });
    setOpenItens(true);
    await carregarItensConta(Number(f.id));
  };

  const adicionarItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contaItens) return;
    setSalvandoItem(true);
    try {
      await fiadosAPI.adicionarItem({
        conta_id: Number(contaItens.id),
        nome_item: novoItem.nome_item,
        quantidade: Number(novoItem.quantidade),
        valor_unitario: Number(novoItem.valor_unitario),
        observacoes: novoItem.observacoes,
        usuario_id: usuario?.id || null,
      });
      toast({ title: "Item lançado no fiado" });
      setNovoItem({ nome_item: "", quantidade: "1", valor_unitario: "", observacoes: "" });
      await Promise.all([carregarItensConta(Number(contaItens.id)), carregar()]);
    } catch (e: any) {
      toast({ title: "Erro ao lançar item", description: e.message, variant: "destructive" });
    } finally {
      setSalvandoItem(false);
    }
  };

  const confirmarRecebimento = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fiadoSelecionado) return;
    setRecebendo(true);
    try {
      await fiadosAPI.receber(
        Number(fiadoSelecionado.id),
        Number(recebimento.valor_pago),
        recebimento.forma,
        recebimento.data,
        recebimento.observacoes
      );
      toast({ title: "Recebimento registrado" });
      setOpenReceber(false);
      setFiadoSelecionado(null);
      await carregar();
    } catch (e: any) {
      toast({ title: "Erro ao receber fiado", description: e.message, variant: "destructive" });
    } finally {
      setRecebendo(false);
    }
  };

  return (
    <Layout title="Fiados">
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Wallet className="w-6 h-6 text-amber-600" />
              Controle de Fiados
            </h1>
            <p className="text-sm text-muted-foreground">Lance fiados, acompanhe vencimentos e registre recebimentos</p>
          </div>
          <Dialog open={openNovo} onOpenChange={setOpenNovo}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Novo fiado
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Lançar novo fiado</DialogTitle>
                <DialogDescription>Selecione o cliente e informe valor e vencimento.</DialogDescription>
              </DialogHeader>
              <form onSubmit={criarFiado} className="space-y-3">
                <div>
                  <Label>Cliente</Label>
                  <Select value={novo.cliente_id} onValueChange={(v) => setNovo((p) => ({ ...p, cliente_id: v }))}>
                    <SelectTrigger><SelectValue placeholder="Selecione o cliente" /></SelectTrigger>
                    <SelectContent>
                      {clientes.map((c) => (
                        <SelectItem key={c.id} value={String(c.id)}>{c.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Valor inicial (opcional)</Label>
                    <Input type="number" step="0.01" min="0" value={novo.valor} onChange={(e) => setNovo((p) => ({ ...p, valor: e.target.value }))} />
                  </div>
                  <div>
                    <Label>Vencimento</Label>
                    <Input type="date" value={novo.data_vencimento} onChange={(e) => setNovo((p) => ({ ...p, data_vencimento: e.target.value }))} />
                  </div>
                </div>
                <div>
                  <Label>Descrição</Label>
                  <Input value={novo.descricao} onChange={(e) => setNovo((p) => ({ ...p, descricao: e.target.value }))} placeholder="Ex: Compra do dia 20/03" />
                </div>
                <div>
                  <Label>Observações</Label>
                  <Input value={novo.observacoes} onChange={(e) => setNovo((p) => ({ ...p, observacoes: e.target.value }))} />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" onClick={() => setOpenNovo(false)}>Cancelar</Button>
                  <Button type="submit" disabled={salvandoNovo}>{salvandoNovo ? "Salvando..." : "Lançar fiado"}</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Em aberto</p><p className="text-xl font-bold">{fmt(resumo.aberto)}</p></CardContent></Card>
          <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Atrasados</p><p className="text-xl font-bold text-red-600">{fmt(resumo.vencido)}</p></CardContent></Card>
          <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Quitados</p><p className="text-xl font-bold text-green-600">{fmt(resumo.recebidos)}</p></CardContent></Card>
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Buscar fiados</CardTitle>
            <CardDescription>Filtre por status, atraso e cliente</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <div className="relative flex-1 min-w-52">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input value={busca} onChange={(e) => setBusca(e.target.value)} className="pl-8" placeholder="Cliente, telefone ou descrição..." />
              </div>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="abertas">Abertas/Parciais</SelectItem>
                  <SelectItem value="vencida">Somente vencidas</SelectItem>
                  <SelectItem value="paga">Somente pagas</SelectItem>
                  <SelectItem value="todas">Todas</SelectItem>
                </SelectContent>
              </Select>
              <Button variant={somenteAtrasados ? "destructive" : "outline"} onClick={() => setSomenteAtrasados((s) => !s)}>
                <AlertTriangle className="w-4 h-4 mr-2" />
                {somenteAtrasados ? "Atrasados: ON" : "Só atrasados"}
              </Button>
              <Button variant="outline" onClick={carregar}>Atualizar</Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{fiados.length} registro(s)</CardTitle>
            <CardDescription>Controle simples de fiado para o dia a dia da loja</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Produtos</TableHead>
                  <TableHead>Data da compra</TableHead>
                  <TableHead className="text-center">Itens</TableHead>
                  <TableHead>Vencimento</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead className="text-right">Pago</TableHead>
                  <TableHead className="text-right">Aberto</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {fiados.map((f) => (
                  <TableRow key={f.id}>
                    <TableCell className="font-medium">{f.cliente_nome}</TableCell>
                    <TableCell className="max-w-[260px]">
                      {f.itens_resumo ? (
                        <div className="truncate" title={f.itens_resumo}>{f.itens_resumo}</div>
                      ) : (
                        <div className="text-muted-foreground text-xs">Sem itens detalhados (abra em Itens)</div>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {f.data_compra_em ? new Date(f.data_compra_em).toLocaleString("pt-BR") : "-"}
                    </TableCell>
                    <TableCell className="text-center">{Number(f.itens_count || 0)}</TableCell>
                    <TableCell>{new Date(f.data_vencimento + "T00:00:00").toLocaleDateString("pt-BR")}</TableCell>
                    <TableCell><Badge variant={statusVariant(f.status)}>{statusLabel(f.status)}</Badge></TableCell>
                    <TableCell className="text-right">{fmt(f.valor)}</TableCell>
                    <TableCell className="text-right">{fmt(f.valor_pago)}</TableCell>
                    <TableCell className="text-right font-semibold">{fmt(f.valor_aberto)}</TableCell>
                    <TableCell>
                      <div className="flex gap-1.5">
                        <Button size="sm" variant="outline" onClick={() => abrirItens(f)}>Itens</Button>
                        {["aberta", "parcial", "vencida"].includes(f.status) ? (
                          <Button size="sm" onClick={() => abrirReceber(f)}>
                            <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                            Receber
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground self-center">Quitado</span>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {!loading && fiados.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={10} className="py-10 text-center text-muted-foreground">
                      Nenhum fiado encontrado.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Dialog open={openItens} onOpenChange={setOpenItens}>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>Extrato por itens</DialogTitle>
              <DialogDescription>
                {contaItens ? `${contaItens.cliente_nome} • Conta ${contaItens.descricao}` : ""}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <form onSubmit={adicionarItem} className="grid grid-cols-1 md:grid-cols-5 gap-2">
                <Input
                  className="md:col-span-2"
                  placeholder="Item / produto"
                  value={novoItem.nome_item}
                  onChange={(e) => setNovoItem((p) => ({ ...p, nome_item: e.target.value }))}
                />
                <Input
                  type="number"
                  step="0.001"
                  min="0.001"
                  placeholder="Qtd"
                  value={novoItem.quantidade}
                  onChange={(e) => setNovoItem((p) => ({ ...p, quantidade: e.target.value }))}
                />
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="Valor un."
                  value={novoItem.valor_unitario}
                  onChange={(e) => setNovoItem((p) => ({ ...p, valor_unitario: e.target.value }))}
                />
                <Button type="submit" disabled={salvandoItem}>{salvandoItem ? "Lançando..." : "Adicionar"}</Button>
              </form>
              <Input
                placeholder="Observação do item (opcional)"
                value={novoItem.observacoes}
                onChange={(e) => setNovoItem((p) => ({ ...p, observacoes: e.target.value }))}
              />
              <div className="rounded-xl border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data/Hora</TableHead>
                      <TableHead>Item</TableHead>
                      <TableHead className="text-right">Qtd</TableHead>
                      <TableHead className="text-right">Unit.</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loadingItens && (
                      <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground">Carregando itens...</TableCell></TableRow>
                    )}
                    {!loadingItens && itensConta.map((it) => (
                      <TableRow key={it.id}>
                        <TableCell className="whitespace-nowrap">{new Date(it.criado_em).toLocaleString("pt-BR")}</TableCell>
                        <TableCell>{it.nome_item}</TableCell>
                        <TableCell className="text-right">{Number(it.quantidade).toLocaleString("pt-BR")}</TableCell>
                        <TableCell className="text-right">{fmt(it.valor_unitario)}</TableCell>
                        <TableCell className="text-right font-semibold">{fmt(it.total)}</TableCell>
                      </TableRow>
                    ))}
                    {!loadingItens && itensConta.length === 0 && (
                      <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground">Nenhum item lançado ainda.</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={openReceber} onOpenChange={setOpenReceber}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Receber fiado</DialogTitle>
              <DialogDescription>
                {fiadoSelecionado ? `${fiadoSelecionado.cliente_nome} • Em aberto: ${fmt(fiadoSelecionado.valor_aberto)}` : ""}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={confirmarRecebimento} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Valor recebido</Label>
                  <Input type="number" step="0.01" min="0.01" value={recebimento.valor_pago} onChange={(e) => setRecebimento((p) => ({ ...p, valor_pago: e.target.value }))} />
                </div>
                <div>
                  <Label>Data</Label>
                  <Input type="date" value={recebimento.data} onChange={(e) => setRecebimento((p) => ({ ...p, data: e.target.value }))} />
                </div>
              </div>
              <div>
                <Label>Forma de pagamento</Label>
                <Select value={recebimento.forma} onValueChange={(v) => setRecebimento((p) => ({ ...p, forma: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dinheiro">Dinheiro</SelectItem>
                    <SelectItem value="pix">PIX</SelectItem>
                    <SelectItem value="debito">Débito</SelectItem>
                    <SelectItem value="credito">Crédito</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Observações</Label>
                <Input value={recebimento.observacoes} onChange={(e) => setRecebimento((p) => ({ ...p, observacoes: e.target.value }))} placeholder="Opcional" />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setOpenReceber(false)}>Cancelar</Button>
                <Button type="submit" disabled={recebendo}>{recebendo ? "Salvando..." : "Confirmar recebimento"}</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}


