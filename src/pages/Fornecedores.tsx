/**
 * ASTIA PDV — Fornecedores v1.0
 * Cadastro completo de fornecedores com busca, edição e exclusão
 */
import { useState, useEffect } from "react";
import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { fornecedoresAPI } from "@/lib/api";
import { Plus, Search, Edit, Trash2, Truck, Phone, Mail, MapPin, Building2 } from "lucide-react";

const empty = {
  razao_social: "", nome_fantasia: "", tipo_pessoa: "J",
  cnpj: "", cpf: "", inscricao_estadual: "",
  email: "", telefone: "", celular: "",
  cep: "", logradouro: "", numero: "", complemento: "",
  bairro: "", cidade: "", estado: "",
  contato_nome: "", prazo_pagamento: "30", observacoes: "", ativo: 1,
};

function mascararCNPJ(v: string) {
  return v.replace(/\D/g,'').replace(/(\d{2})(\d)/,'$1.$2').replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d)/,'$1/$2').replace(/(\d{4})(\d)/,'$1-$2').slice(0,18);
}
function mascararTel(v: string) {
  const n = v.replace(/\D/g,'');
  if (n.length <= 10) return n.replace(/(\d{2})(\d{4})(\d)/,'($1) $2-$3').slice(0,14);
  return n.replace(/(\d{2})(\d{5})(\d)/,'($1) $2-$3').slice(0,15);
}

export default function Fornecedores() {
  const { toast } = useToast();
  const [lista, setLista] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<any>(empty);
  const [saving, setSaving] = useState(false);

  const carregar = async () => {
    setLoading(true);
    try { setLista(await fornecedoresAPI.listar({ ativo: 1 }) || []); }
    catch { toast({ title: "Erro ao carregar fornecedores", variant: "destructive" }); }
    finally { setLoading(false); }
  };

  useEffect(() => { carregar(); }, []);

  const abrirNovo = () => { setEditId(null); setForm(empty); setDialogOpen(true); };
  const abrirEditar = (f: any) => {
    setEditId(f.id);
    setForm({ ...f, prazo_pagamento: String(f.prazo_pagamento || 30) });
    setDialogOpen(true);
  };

  const salvar = async () => {
    if (!form.razao_social.trim()) {
      toast({ title: "Razão social é obrigatória", variant: "destructive" }); return;
    }
    setSaving(true);
    try {
      const dados = { ...form, prazo_pagamento: parseInt(form.prazo_pagamento) || 30 };
      if (editId) await fornecedoresAPI.atualizar(editId, dados);
      else await fornecedoresAPI.criar(dados);
      toast({ title: editId ? "Fornecedor atualizado!" : "Fornecedor cadastrado!" });
      setDialogOpen(false);
      carregar();
    } catch (e: any) {
      toast({ title: "Erro ao salvar", description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  const excluir = async (id: number, nome: string) => {
    if (!confirm(`Desativar o fornecedor "${nome}"?`)) return;
    try {
      await fornecedoresAPI.deletar(id);
      toast({ title: "Fornecedor removido!" });
      carregar();
    } catch (e: any) {
      toast({ title: "Erro ao remover", description: e.message, variant: "destructive" });
    }
  };

  const f = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev: any) => ({ ...prev, [field]: e.target.value }));

  const filtrados = lista.filter(item =>
    item.razao_social?.toLowerCase().includes(busca.toLowerCase()) ||
    item.nome_fantasia?.toLowerCase().includes(busca.toLowerCase()) ||
    item.cnpj?.includes(busca)
  );

  return (
    <Layout title="Fornecedores">
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Truck className="w-6 h-6" /> Fornecedores
          </h1>
          <Button onClick={abrirNovo}><Plus className="w-4 h-4 mr-2" />Novo Fornecedor</Button>
        </div>

        {/* Busca */}
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar por nome, fantasia ou CNPJ..." value={busca}
            onChange={e => setBusca(e.target.value)} className="pl-9" />
        </div>

        {/* Lista */}
        <Card>
          <CardContent className="pt-3 overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b text-left">
                  {["Razão Social / Fantasia","CNPJ/CPF","Contato","Cidade","Prazo","Ações"].map(h =>
                    <th key={h} className="p-2 font-medium text-muted-foreground text-xs">{h}</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">Carregando...</td></tr>
                )}
                {!loading && filtrados.length === 0 && (
                  <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">
                    Nenhum fornecedor encontrado.{!busca && " Clique em \"Novo Fornecedor\" para começar."}
                  </td></tr>
                )}
                {filtrados.map(item => (
                  <tr key={item.id} className="border-b hover:bg-muted/40">
                    <td className="p-2">
                      <p className="font-medium">{item.razao_social}</p>
                      {item.nome_fantasia && <p className="text-xs text-muted-foreground">{item.nome_fantasia}</p>}
                    </td>
                    <td className="p-2 font-mono text-xs">{item.cnpj || item.cpf || "—"}</td>
                    <td className="p-2">
                      <div className="space-y-0.5">
                        {item.telefone && <p className="text-xs flex items-center gap-1"><Phone className="w-3 h-3" />{item.telefone}</p>}
                        {item.email && <p className="text-xs flex items-center gap-1"><Mail className="w-3 h-3" />{item.email}</p>}
                        {item.contato_nome && <p className="text-xs text-muted-foreground">{item.contato_nome}</p>}
                      </div>
                    </td>
                    <td className="p-2 text-xs">
                      {item.cidade ? <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{item.cidade}/{item.estado}</span> : "—"}
                    </td>
                    <td className="p-2">
                      <Badge variant="outline" className="text-xs">{item.prazo_pagamento || 30}d</Badge>
                    </td>
                    <td className="p-2">
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => abrirEditar(item)}>
                          <Edit className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive"
                          onClick={() => excluir(item.id, item.razao_social)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        {/* Total */}
        {!loading && (
          <p className="text-xs text-muted-foreground">{filtrados.length} fornecedor{filtrados.length !== 1 ? 'es' : ''} encontrado{filtrados.length !== 1 ? 's' : ''}</p>
        )}
      </div>

      {/* Dialog Cadastro/Edição */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="w-5 h-5" />
              {editId ? "Editar Fornecedor" : "Novo Fornecedor"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Tipo */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Tipo de Pessoa *</Label>
                <Select value={form.tipo_pessoa} onValueChange={v => setForm((p: any) => ({ ...p, tipo_pessoa: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="J">Jurídica (CNPJ)</SelectItem>
                    <SelectItem value="F">Física (CPF)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{form.tipo_pessoa === 'J' ? 'CNPJ' : 'CPF'}</Label>
                <Input
                  value={form.tipo_pessoa === 'J' ? mascararCNPJ(form.cnpj || '') : form.cpf || ''}
                  onChange={e => form.tipo_pessoa === 'J'
                    ? setForm((p: any) => ({ ...p, cnpj: e.target.value.replace(/\D/g,'') }))
                    : setForm((p: any) => ({ ...p, cpf: e.target.value }))
                  }
                  placeholder={form.tipo_pessoa === 'J' ? '00.000.000/0000-00' : '000.000.000-00'}
                />
              </div>
            </div>

            {/* Razão Social / Fantasia */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Razão Social *</Label>
                <Input value={form.razao_social} onChange={f('razao_social')} placeholder="Nome completo ou razão social" autoFocus />
              </div>
              <div>
                <Label>Nome Fantasia</Label>
                <Input value={form.nome_fantasia || ''} onChange={f('nome_fantasia')} placeholder="Como é conhecido" />
              </div>
            </div>

            {/* IE e Contato */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Inscrição Estadual</Label>
                <Input value={form.inscricao_estadual || ''} onChange={f('inscricao_estadual')} />
              </div>
              <div>
                <Label>Nome do Contato</Label>
                <Input value={form.contato_nome || ''} onChange={f('contato_nome')} placeholder="Pessoa de referência" />
              </div>
            </div>

            {/* Contatos */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Telefone</Label>
                <Input value={mascararTel(form.telefone || '')}
                  onChange={e => setForm((p: any) => ({ ...p, telefone: e.target.value.replace(/\D/g,'') }))}
                  placeholder="(00) 0000-0000" />
              </div>
              <div>
                <Label>Celular</Label>
                <Input value={mascararTel(form.celular || '')}
                  onChange={e => setForm((p: any) => ({ ...p, celular: e.target.value.replace(/\D/g,'') }))}
                  placeholder="(00) 00000-0000" />
              </div>
              <div>
                <Label>E-mail</Label>
                <Input type="email" value={form.email || ''} onChange={f('email')} placeholder="fornecedor@email.com" />
              </div>
            </div>

            {/* Endereço */}
            <div className="border-t pt-3">
              <p className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> Endereço</p>
              <div className="grid grid-cols-4 gap-3">
                <div>
                  <Label>CEP</Label>
                  <Input value={form.cep || ''} onChange={f('cep')} placeholder="00000-000" />
                </div>
                <div className="col-span-2">
                  <Label>Logradouro</Label>
                  <Input value={form.logradouro || ''} onChange={f('logradouro')} />
                </div>
                <div>
                  <Label>Número</Label>
                  <Input value={form.numero || ''} onChange={f('numero')} />
                </div>
              </div>
              <div className="grid grid-cols-4 gap-3 mt-3">
                <div>
                  <Label>Complemento</Label>
                  <Input value={form.complemento || ''} onChange={f('complemento')} />
                </div>
                <div>
                  <Label>Bairro</Label>
                  <Input value={form.bairro || ''} onChange={f('bairro')} />
                </div>
                <div>
                  <Label>Cidade</Label>
                  <Input value={form.cidade || ''} onChange={f('cidade')} />
                </div>
                <div>
                  <Label>UF</Label>
                  <Input value={form.estado || ''} onChange={f('estado')} maxLength={2} className="uppercase" />
                </div>
              </div>
            </div>

            {/* Pagamento */}
            <div className="grid grid-cols-2 gap-3 border-t pt-3">
              <div>
                <Label>Prazo de Pagamento (dias)</Label>
                <Input type="number" min={0} value={form.prazo_pagamento}
                  onChange={f('prazo_pagamento')} placeholder="30" />
              </div>
              <div>
                <Label>Observações</Label>
                <Input value={form.observacoes || ''} onChange={f('observacoes')} placeholder="Anotações gerais" />
              </div>
            </div>

            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button onClick={salvar} disabled={saving}>
                {saving ? "Salvando..." : editId ? "Atualizar" : "Cadastrar"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
