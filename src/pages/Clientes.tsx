import { useState, useEffect } from "react";
import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, Plus, Search, Edit, Trash2, Phone, Mail, MapPin, AlertCircle, RefreshCw } from "lucide-react";
import { clientesAPI } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

const emptyForm = {
  nome: "", tipo_pessoa: "F",
  email: "", telefone: "", celular: "",
  cpf: "", cnpj: "", rg: "",
  cep: "", logradouro: "", numero: "", complemento: "",
  bairro: "", cidade: "", estado: "",
  observacoes: ""
};

const Clientes = () => {
  const { toast } = useToast();
  const [clientes, setClientes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCliente, setEditingCliente] = useState<any | null>(null);
  const [formData, setFormData] = useState({ ...emptyForm });
  const [erro, setErro] = useState("");

  useEffect(() => { fetchClientes(); }, []);

  const fetchClientes = async () => {
    setLoading(true);
    setErro("");
    try {
      const data = await clientesAPI.listar({});
      setClientes(data || []);
    } catch (e: any) {
      const msg = e?.message || "Erro desconhecido";
      setErro(msg);
      toast({ title: "Erro ao carregar clientes", description: msg, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const t = setTimeout(async () => {
      try {
        const data = await clientesAPI.listar({ busca: searchTerm });
        setClientes(data || []);
      } catch {}
    }, 350);
    return () => clearTimeout(t);
  }, [searchTerm]);

  const f = (field: string, value: string) =>
    setFormData(prev => ({ ...prev, [field]: value }));

  const buscarCEP = async (cep: string) => {
    const c = cep.replace(/\D/g, "");
    if (c.length !== 8) return;
    try {
      const res = await fetch(`https://viacep.com.br/ws/${c}/json/`);
      const d = await res.json();
      if (!d.erro) {
        setFormData(prev => ({
          ...prev,
          logradouro: d.logradouro || prev.logradouro,
          bairro: d.bairro || prev.bairro,
          cidade: d.localidade || prev.cidade,
          estado: d.uf || prev.estado,
        }));
      }
    } catch {}
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.nome.trim()) {
      toast({ title: "Nome é obrigatório", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      if (editingCliente) {
        await clientesAPI.atualizar(editingCliente.id, formData);
        toast({ title: "✅ Cliente atualizado!" });
      } else {
        await clientesAPI.criar(formData);
        toast({ title: "✅ Cliente cadastrado!" });
      }
      setIsDialogOpen(false);
      setEditingCliente(null);
      setFormData({ ...emptyForm });
      fetchClientes();
    } catch (e: any) {
      toast({ title: "Erro ao salvar", description: e?.message || "Verifique os dados e tente novamente", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (c: any) => {
    setEditingCliente(c);
    setFormData({
      nome: c.nome || "", tipo_pessoa: c.tipo_pessoa || "F",
      email: c.email || "", telefone: c.telefone || "", celular: c.celular || "",
      cpf: c.cpf || "", cnpj: c.cnpj || "", rg: c.rg || "",
      cep: c.cep || "", logradouro: c.logradouro || "", numero: c.numero || "",
      complemento: c.complemento || "", bairro: c.bairro || "",
      cidade: c.cidade || "", estado: c.estado || "",
      observacoes: c.observacoes || ""
    });
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Excluir este cliente?")) return;
    try {
      await clientesAPI.deletar(id);
      toast({ title: "Cliente excluído!" });
      fetchClientes();
    } catch (e: any) {
      toast({ title: "Erro ao excluir", description: e?.message, variant: "destructive" });
    }
  };

  const handleOpenNew = () => {
    setEditingCliente(null);
    setFormData({ ...emptyForm });
    setIsDialogOpen(true);
  };

  return (
    <Layout title="Clientes">
      <div className="space-y-6">

        {/* Cabeçalho */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Clientes</h1>
            <p className="text-muted-foreground">Gerencie sua base de clientes</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={fetchClientes} disabled={loading}>
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
            <Dialog
              open={isDialogOpen}
              onOpenChange={o => {
                setIsDialogOpen(o);
                if (!o) { setEditingCliente(null); setFormData({ ...emptyForm }); }
              }}
            >
              <DialogTrigger asChild>
                <Button className="btn-gradient" onClick={handleOpenNew}>
                  <Plus className="w-4 h-4 mr-2" />Novo Cliente
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>{editingCliente ? "Editar Cliente" : "Novo Cliente"}</DialogTitle>
                  <DialogDescription>Preencha os dados do cliente</DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit}>
                  <Tabs defaultValue="dados">
                    <TabsList className="mb-4 w-full">
                      <TabsTrigger value="dados" className="flex-1">Dados Pessoais</TabsTrigger>
                      <TabsTrigger value="endereco" className="flex-1">Endereço</TabsTrigger>
                      <TabsTrigger value="obs" className="flex-1">Observações</TabsTrigger>
                    </TabsList>

                    {/* ABA 1: DADOS */}
                    <TabsContent value="dados" className="space-y-4">
                      <div>
                        <Label>Tipo de Pessoa *</Label>
                        <Select value={formData.tipo_pessoa} onValueChange={v => f("tipo_pessoa", v)}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="F">Pessoa Física (CPF)</SelectItem>
                            <SelectItem value="J">Pessoa Jurídica (CNPJ)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Nome {formData.tipo_pessoa === "J" ? "(Razão Social)" : ""} *</Label>
                        <Input
                          value={formData.nome}
                          onChange={e => f("nome", e.target.value)}
                          required
                          placeholder={formData.tipo_pessoa === "J" ? "Razão Social" : "Nome completo"}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        {formData.tipo_pessoa === "F" ? (
                          <>
                            <div>
                              <Label>CPF</Label>
                              <Input value={formData.cpf} onChange={e => f("cpf", e.target.value)} placeholder="000.000.000-00" />
                            </div>
                            <div>
                              <Label>RG</Label>
                              <Input value={formData.rg} onChange={e => f("rg", e.target.value)} />
                            </div>
                          </>
                        ) : (
                          <>
                            <div>
                              <Label>CNPJ</Label>
                              <Input value={formData.cnpj} onChange={e => f("cnpj", e.target.value)} placeholder="00.000.000/0000-00" />
                            </div>
                            <div>
                              <Label>Inscrição Estadual</Label>
                              <Input value={formData.rg} onChange={e => f("rg", e.target.value)} placeholder="IE" />
                            </div>
                          </>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label>E-mail</Label>
                          <Input type="email" value={formData.email} onChange={e => f("email", e.target.value)} />
                        </div>
                        <div>
                          <Label>Telefone / WhatsApp</Label>
                          <Input value={formData.telefone} onChange={e => f("telefone", e.target.value)} placeholder="(00) 00000-0000" />
                        </div>
                      </div>
                      <div>
                        <Label>Celular</Label>
                        <Input value={formData.celular} onChange={e => f("celular", e.target.value)} placeholder="(00) 00000-0000" />
                      </div>
                    </TabsContent>

                    {/* ABA 2: ENDEREÇO */}
                    <TabsContent value="endereco" className="space-y-4">
                      <div className="grid grid-cols-3 gap-4">
                        <div className="col-span-2">
                          <Label>CEP</Label>
                          <Input
                            value={formData.cep}
                            onChange={e => { f("cep", e.target.value); buscarCEP(e.target.value); }}
                            placeholder="00000-000"
                          />
                        </div>
                        <div>
                          <Label>Estado</Label>
                          <Input value={formData.estado} onChange={e => f("estado", e.target.value)} placeholder="SP" maxLength={2} />
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-4">
                        <div className="col-span-2">
                          <Label>Logradouro</Label>
                          <Input value={formData.logradouro} onChange={e => f("logradouro", e.target.value)} />
                        </div>
                        <div>
                          <Label>Número</Label>
                          <Input value={formData.numero} onChange={e => f("numero", e.target.value)} />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label>Complemento</Label>
                          <Input value={formData.complemento} onChange={e => f("complemento", e.target.value)} />
                        </div>
                        <div>
                          <Label>Bairro</Label>
                          <Input value={formData.bairro} onChange={e => f("bairro", e.target.value)} />
                        </div>
                      </div>
                      <div>
                        <Label>Cidade</Label>
                        <Input value={formData.cidade} onChange={e => f("cidade", e.target.value)} />
                      </div>
                    </TabsContent>

                    {/* ABA 3: OBS */}
                    <TabsContent value="obs" className="space-y-4">
                      <div>
                        <Label>Observações</Label>
                        <textarea
                          className="w-full min-h-[120px] rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          value={formData.observacoes}
                          onChange={e => f("observacoes", e.target.value)}
                          placeholder="Anotações sobre o cliente..."
                        />
                      </div>
                    </TabsContent>
                  </Tabs>

                  <div className="flex gap-2 justify-end mt-6 pt-4 border-t">
                    <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>Cancelar</Button>
                    <Button type="submit" className="btn-gradient" disabled={saving}>
                      {saving ? "Salvando..." : editingCliente ? "Atualizar Cliente" : "Cadastrar Cliente"}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Alerta de erro de conexão */}
        {erro && (
          <Card className="border-destructive bg-destructive/10">
            <CardContent className="pt-4 pb-4 flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-destructive shrink-0" />
              <div className="flex-1">
                <p className="font-medium text-destructive">Erro ao conectar com o servidor</p>
                <p className="text-sm text-muted-foreground">{erro}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Verifique se o servidor VYN CRM está rodando (porta 3567).
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={fetchClientes}>
                <RefreshCw className="w-4 h-4 mr-1" />Tentar novamente
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Tabela */}
        <Card className="glass-card">
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-3">
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5" />
                Lista de Clientes
                <Badge variant="secondary">{clientes.length}</Badge>
              </CardTitle>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input
                  placeholder="Buscar por nome, CPF, CNPJ..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="pl-10 w-72"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-12 text-muted-foreground">
                <RefreshCw className="w-8 h-8 mx-auto mb-3 animate-spin opacity-40" />
                <p>Carregando clientes...</p>
              </div>
            ) : clientes.length === 0 && !erro ? (
              <div className="text-center py-12 text-muted-foreground">
                <Users className="w-12 h-12 mx-auto mb-4 opacity-30" />
                <p className="font-medium">Nenhum cliente cadastrado</p>
                <p className="text-sm">Clique em "Novo Cliente" para começar</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Contato</TableHead>
                    <TableHead>CPF / CNPJ</TableHead>
                    <TableHead>Localização</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clientes.map(c => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.nome}</TableCell>
                      <TableCell>
                        <Badge variant={c.tipo_pessoa === "J" ? "default" : "secondary"}>
                          {c.tipo_pessoa === "J" ? "PJ" : "PF"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {c.email && (
                          <div className="flex items-center gap-1 text-sm">
                            <Mail className="w-3 h-3 shrink-0" />
                            <span className="truncate max-w-[160px]">{c.email}</span>
                          </div>
                        )}
                        {(c.telefone || c.celular) && (
                          <div className="flex items-center gap-1 text-sm text-muted-foreground">
                            <Phone className="w-3 h-3 shrink-0" />
                            {c.telefone || c.celular}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-sm">{c.cpf || c.cnpj || "—"}</TableCell>
                      <TableCell>
                        {c.cidade ? (
                          <div className="flex items-center gap-1 text-sm text-muted-foreground">
                            <MapPin className="w-3 h-3 shrink-0" />
                            {c.cidade}{c.estado ? `, ${c.estado}` : ""}
                          </div>
                        ) : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-2 justify-end">
                          <Button variant="outline" size="sm" onClick={() => handleEdit(c)}>
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="outline" size="sm"
                            onClick={() => handleDelete(c.id)}
                            className="text-destructive hover:text-destructive hover:border-destructive"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

export default Clientes;
