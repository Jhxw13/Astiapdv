/**
 * VYN CRM - Configurações v2.5
 * Abas: Loja | Usuários | Fiscal / Certificado Digital | Rede | Banco de Dados
 */
import { useState, useEffect } from "react";
import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Settings, Users, Plus, Edit, Shield, Server, Wifi,
  FileKey2, CheckCircle2, AlertTriangle, Eye, EyeOff,
  Upload, RefreshCw, Building2, Lock, ImageIcon, X,
  Globe, ShoppingBag, Calendar, Truck, MapPin, Zap, ExternalLink,
  Bot, MessageCircle, Sparkles, Copy, Check, Link, Download, Loader
} from "lucide-react";
import { authAPI, configAPI, sistemaAPI, ecommerceAPI } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";

// ── Helpers ───────────────────────────────────────────────────
const cargoBadge = (c: string) =>
  ({ admin: ["destructive" as const, "Admin"], gerente: ["default" as const, "Gerente"], vendedor: ["secondary" as const, "Vendedor"], caixa: ["outline" as const, "Caixa"] }[c] || ["secondary" as const, c]);

const REGIMES = [
  { value: "simples_nacional",       label: "Simples Nacional" },
  { value: "lucro_presumido",        label: "Lucro Presumido" },
  { value: "lucro_real",             label: "Lucro Real" },
  { value: "mei",                    label: "MEI" },
];

// ── Componente de Status do Certificado ───────────────────────
function CertificadoStatus({ info }: { info?: any }) {
  if (!info?.ok) return (
    <div className="flex items-center gap-2 text-muted-foreground text-sm">
      <AlertTriangle className="w-4 h-4 text-yellow-500" />
      {info?.erro || "Nenhum certificado instalado"}
    </div>
  );
  const nome = info.caminho?.split(/[/\\]/).pop() || info.caminho || "";
  const diasRestantes = info.dias_restantes ?? null;
  const cor = info.vencido ? "text-red-600" : diasRestantes !== null && diasRestantes < 30 ? "text-yellow-600" : "text-green-600";
  return (
    <div className="space-y-2 text-sm">
      <div className="flex items-center gap-2">
        <CheckCircle2 className={`w-4 h-4 shrink-0 ${cor}`} />
        <span className={`font-semibold ${cor}`}>{info.vencido ? "Certificado VENCIDO" : "Certificado instalado"}</span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div><span className="text-muted-foreground">Empresa: </span><span className="font-medium">{info.razao_social}</span></div>
        {info.cnpj && <div><span className="text-muted-foreground">CNPJ: </span><span className="font-mono">{info.cnpj}</span></div>}
        <div><span className="text-muted-foreground">Válido de: </span><span>{info.validade_inicio}</span></div>
        <div><span className="text-muted-foreground">Válido até: </span><span className={cor}>{info.validade_fim}</span></div>
        {diasRestantes !== null && !info.vencido && (
          <div className="col-span-2"><span className={`font-semibold ${cor}`}>{diasRestantes} dias restantes</span></div>
        )}
        <div className="col-span-2 font-mono text-muted-foreground truncate">{nome}</div>
      </div>
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────
const Configuracoes = () => {
  const { usuario } = useAuth();
  const isAdmin = usuario?.cargo === 'admin';
  const isGerente = usuario?.cargo === 'gerente' || isAdmin;
  const { toast } = useToast();

  const [usuarios, setUsuarios] = useState<any[]>([]);
  const [configLoja, setConfigLoja] = useState<any>({});
  const [serverIP, setServerIP] = useState("");
  const [serverMode, setServerMode] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingCert, setLoadingCert] = useState(false);
  const [certInfo, setCertInfo] = useState<any>(null);
  const [testando, setTestando] = useState(false);
  const [showSenha, setShowSenha] = useState(false);

  // Form de usuário
  const [isUserDialogOpen, setIsUserDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);
  const emptyUserForm = { nome: "", email: "", senha: "", cargo: "vendedor" };
  const [userForm, setUserForm] = useState(emptyUserForm);

  useEffect(() => {
    fetchUsuarios();
    fetchConfig();
    loadServerInfo();
  }, []);

  const loadServerInfo = async () => {
    try {
      const [ip, mode] = await Promise.all([sistemaAPI.getServerIP(), sistemaAPI.getMode()]);
      setServerIP(ip);
      setServerMode(mode);
    } catch {}
  };

  const fetchUsuarios = async () => {
    try { setUsuarios(await authAPI.listarUsuarios() || []); } catch {}
  };

  const fetchConfig = async () => {
    try { setConfigLoja(await configAPI.get() || {}); } catch {}
  };

  const c = (field: string, value: any) =>
    setConfigLoja((prev: any) => ({ ...prev, [field]: value }));

  // ── Salvar configurações da loja ──────────────────────────
  const handleSaveLoja = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await configAPI.update(configLoja);
      toast({ title: "✅ Configurações salvas!" });
      window.dispatchEvent(new Event("astia:config-updated"));
    } catch (err: any) {
      toast({ title: "Erro ao salvar", description: err.message, variant: "destructive" });
    } finally { setLoading(false); }
  };

  // ── Salvar configurações fiscais ──────────────────────────
  const handleSaveFiscal = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await configAPI.update({
        razao_social:          configLoja.razao_social,
        cnpj:                  configLoja.cnpj,
        inscricao_estadual:    configLoja.inscricao_estadual,
        inscricao_municipal:   configLoja.inscricao_municipal,
        regime_tributario:     configLoja.regime_tributario,
        ambiente_nfe:          configLoja.ambiente_nfe,
        serie_nfe:             configLoja.serie_nfe,
        serie_nfce:            configLoja.serie_nfce,
        certificado_digital_path: configLoja.certificado_digital_path,
        certificado_senha:     configLoja.certificado_senha,
      });
      toast({ title: "✅ Configurações fiscais salvas!" });
    } catch (err: any) {
      toast({ title: "Erro ao salvar", description: err.message, variant: "destructive" });
    } finally { setLoading(false); }
  };

  // ── Selecionar certificado via diálogo nativo ─────────────
  const handleSelecionarCertificado = async () => {
    setLoadingCert(true);
    try {
      const path = await configAPI.selecionarCertificado();
      if (path) {
        c("certificado_digital_path", path);
        toast({ title: "Certificado selecionado!", description: path.split(/[/\\]/).pop() });
        // Lê automaticamente se já tem senha
        if (configLoja.certificado_senha) {
          await lerCertificado(path, configLoja.certificado_senha);
        }
      }
    } catch (err: any) {
      toast({ title: "Erro ao selecionar certificado", description: err.message, variant: "destructive" });
    } finally { setLoadingCert(false); }
  };

  const lerCertificado = async (path: string, senha: string) => {
    if (!path || !senha) return;
    setTestando(true);
    try {
      const info = await configAPI.lerCertificado(path, senha);
      setCertInfo(info);
      if (info.ok) {
        toast({ title: info.vencido ? "⚠️ Certificado VENCIDO" : "✅ Certificado válido!", description: info.razao_social });
      } else {
        toast({ title: "Certificado inválido", description: info.erro, variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "Erro ao ler certificado", description: e.message, variant: "destructive" });
    } finally { setTestando(false); }
  };

  // ── Usuários ──────────────────────────────────────────────
  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (editingUser) {
        await authAPI.ativarDesativar(editingUser.id, editingUser.ativo);
        toast({ title: "Usuário atualizado!" });
      } else {
        await authAPI.criarUsuario(userForm);
        toast({ title: "✅ Usuário criado!" });
      }
      setIsUserDialogOpen(false);
      setEditingUser(null);
      setUserForm(emptyUserForm);
      fetchUsuarios();
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally { setLoading(false); }
  };

  const toggleAtivo = async (u: any) => {
    try {
      await authAPI.ativarDesativar(u.id, u.ativo ? 0 : 1);
      toast({ title: u.ativo ? "Usuário desativado" : "Usuário ativado" });
      fetchUsuarios();
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    }
  };

  const isElectron = typeof window !== "undefined" && !!window.vyn;

  return (
    <Layout title="Configurações">
      <div className="space-y-4">
        <div>
          <h1 className="text-3xl font-bold">Configurações</h1>
          <p className="text-muted-foreground">Gerencie as configurações do sistema</p>
        </div>

        <Tabs defaultValue="loja">
          <TabsList className="flex-wrap h-auto gap-1">
            {isAdmin && <TabsTrigger value="loja" className="flex items-center gap-1">
              <Building2 className="w-4 h-4" />Dados da Loja
            </TabsTrigger>}
            {isAdmin && <TabsTrigger value="fiscal" className="flex items-center gap-1">
              <FileKey2 className="w-4 h-4" />Fiscal / NF-e
            </TabsTrigger>}
            <TabsTrigger value="usuarios" className="flex items-center gap-1">
              <Users className="w-4 h-4" />Usuários
            </TabsTrigger>
            <TabsTrigger value="rede" className="flex items-center gap-1">
              <Wifi className="w-4 h-4" />Rede
            </TabsTrigger>
            {isAdmin && (
              <TabsTrigger value="banco" className="flex items-center gap-1">
                <Server className="w-4 h-4" />Banco de Dados
              </TabsTrigger>
            )}
            {isAdmin && (
              <TabsTrigger value="loja_online" className="flex items-center gap-1">
                <Globe className="w-4 h-4" />Loja Online
              </TabsTrigger>
            )}
            {isAdmin && (
              <TabsTrigger value="gptmaker" className="flex items-center gap-1">
                <Bot className="w-4 h-4" />IA / WhatsApp
              </TabsTrigger>
            )}
          </TabsList>

          {/* ═══════════════════════════════ ABA LOJA ═══════════════════════════════ */}
          {isAdmin && <TabsContent value="loja" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="w-5 h-5" />Dados da Loja
                </CardTitle>
                <CardDescription>Informações gerais exibidas nos documentos e cupons</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSaveLoja} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Nome Fantasia / Nome da Loja</Label>
                      <Input value={configLoja.nome || ""} onChange={e => c("nome", e.target.value)} />
                    </div>
                    <div>
                      <Label>Razão Social</Label>
                      <Input value={configLoja.razao_social || ""} onChange={e => c("razao_social", e.target.value)} />
                    </div>
                    <div>
                      <Label>CNPJ</Label>
                      <Input value={configLoja.cnpj || ""} onChange={e => c("cnpj", e.target.value)} placeholder="00.000.000/0000-00" />
                    </div>
                    <div>
                      <Label>CPF (pessoa física)</Label>
                      <Input value={configLoja.cpf || ""} onChange={e => c("cpf", e.target.value)} placeholder="000.000.000-00" />
                    </div>
                    <div>
                      <Label>Inscrição Estadual</Label>
                      <Input value={configLoja.inscricao_estadual || ""} onChange={e => c("inscricao_estadual", e.target.value)} />
                    </div>
                    <div>
                      <Label>Inscrição Municipal</Label>
                      <Input value={configLoja.inscricao_municipal || ""} onChange={e => c("inscricao_municipal", e.target.value)} />
                    </div>
                    <div>
                      <Label>Telefone</Label>
                      <Input value={configLoja.telefone || ""} onChange={e => c("telefone", e.target.value)} placeholder="(00) 0000-0000" />
                    </div>
                    <div>
                      <Label>E-mail</Label>
                      <Input type="email" value={configLoja.email || ""} onChange={e => c("email", e.target.value)} />
                    </div>
                  </div>
                  {/* Logo da empresa */}
                  <div className="p-4 border rounded-xl bg-muted/30 space-y-3">
                    <Label className="font-semibold flex items-center gap-2">
                      <ImageIcon className="w-4 h-4" /> Logo da Empresa
                    </Label>
                    <div className="flex items-center gap-4">
                      {/* Preview */}
                      <div className="w-20 h-20 rounded-xl border-2 border-dashed border-border flex items-center justify-center bg-background overflow-hidden shrink-0">
                        {configLoja.logo_path ? (
                          <img
                            src={configLoja.logo_path.startsWith('data:') ? configLoja.logo_path : (configLoja.logo_path.startsWith('http') ? configLoja.logo_path : `file://${configLoja.logo_path}`)}
                            alt="Logo"
                            className="w-full h-full object-contain"
                            onError={() => c("logo_path", "")}
                          />
                        ) : (
                          <ImageIcon className="w-8 h-8 text-muted-foreground opacity-40" />
                        )}
                      </div>
                      <div className="space-y-2 flex-1">
                        <div className="flex gap-2 flex-wrap">
                          {/* Electron: seletor de arquivo nativo */}
                          <Button type="button" variant="outline" size="sm"
                            onClick={async () => {
                              try {
                                const path = await configAPI.selecionarLogo();
                                if (path) c("logo_path", path);
                              } catch {
                                // Fallback web: input file
                                document.getElementById("logo-upload-input")?.click();
                              }
                            }}>
                            <Upload className="w-3.5 h-3.5 mr-1.5" /> Selecionar arquivo
                          </Button>
                          {/* Web fallback: input file */}
                          <input id="logo-upload-input" type="file" accept="image/png,image/jpeg,image/webp,image/gif"
                            className="hidden"
                            onChange={e => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              const reader = new FileReader();
                              reader.onload = ev => c("logo_path", ev.target?.result as string);
                              reader.readAsDataURL(file);
                              e.target.value = "";
                            }}
                          />
                          {configLoja.logo_path && (
                            <Button type="button" variant="ghost" size="sm"
                              className="text-destructive hover:text-destructive"
                              onClick={() => c("logo_path", "")}>
                              <X className="w-3.5 h-3.5 mr-1" /> Remover
                            </Button>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          PNG, JPG ou WEBP. Aparece nos orçamentos, cupons e consulta de preço.
                          Tamanho recomendado: 200×200px.
                        </p>
                      </div>
                    </div>
                  </div>

                  <Separator />
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <Label>CEP</Label>
                      <Input value={configLoja.cep || ""} onChange={e => c("cep", e.target.value)} />
                    </div>
                    <div className="col-span-2">
                      <Label>Logradouro</Label>
                      <Input value={configLoja.logradouro || ""} onChange={e => c("logradouro", e.target.value)} />
                    </div>
                    <div>
                      <Label>Número</Label>
                      <Input value={configLoja.numero || ""} onChange={e => c("numero", e.target.value)} />
                    </div>
                    <div>
                      <Label>Bairro</Label>
                      <Input value={configLoja.bairro || ""} onChange={e => c("bairro", e.target.value)} />
                    </div>
                    <div>
                      <Label>Cidade</Label>
                      <Input value={configLoja.cidade || ""} onChange={e => c("cidade", e.target.value)} />
                    </div>
                    <div>
                      <Label>Estado</Label>
                      <Input value={configLoja.estado || ""} onChange={e => c("estado", e.target.value)} placeholder="SP" maxLength={2} />
                    </div>
                  </div>
                  <div className="flex justify-end pt-2">
                    <Button type="submit" className="btn-gradient" disabled={loading}>
                      {loading ? "Salvando..." : "Salvar Dados da Loja"}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </TabsContent>}

          {/* ═══════════════════════════ ABA FISCAL / NF-e ═══════════════════════════ */}
          {isAdmin && <TabsContent value="fiscal" className="mt-4 space-y-4">

            {/* Aviso de ambiente */}
            {configLoja.ambiente_nfe === "producao" ? (
              <Card className="border-green-500 bg-green-50 dark:bg-green-950/40">
                <CardContent className="pt-4 pb-4 flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" />
                  <div>
                    <p className="font-semibold text-green-700 dark:text-green-400">Ambiente de Produção</p>
                    <p className="text-sm text-muted-foreground">As notas fiscais emitidas terão validade legal.</p>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card className="border-yellow-500 bg-yellow-50 dark:bg-yellow-950/40">
                <CardContent className="pt-4 pb-4 flex items-center gap-3">
                  <AlertTriangle className="w-5 h-5 text-yellow-600 shrink-0" />
                  <div>
                    <p className="font-semibold text-yellow-700 dark:text-yellow-400">Ambiente de Homologação (Teste)</p>
                    <p className="text-sm text-muted-foreground">As notas emitidas são apenas para testes e não têm validade fiscal.</p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Certificado Digital */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileKey2 className="w-5 h-5" />Certificado Digital A1 (.pfx / .p12)
                </CardTitle>
                <CardDescription>
                  Necessário para assinar eletronicamente as notas fiscais (NF-e / NFC-e).
                  O arquivo fica armazenado localmente, nunca é enviado para fora do servidor.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Status atual */}
                <div className="p-3 rounded-lg bg-muted/60 border">
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground mb-2 block">
                    Certificado instalado
                  </Label>
                  <CertificadoStatus info={certInfo} />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Botão de seleção — só funciona no Electron (servidor) */}
                  <div>
                    <Label>Arquivo do Certificado (.pfx ou .p12)</Label>
                    {isElectron ? (
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full mt-1 justify-start gap-2"
                        onClick={handleSelecionarCertificado}
                        disabled={loadingCert}
                      >
                        <Upload className="w-4 h-4" />
                        {loadingCert ? "Abrindo..." : "Selecionar Arquivo..."}
                      </Button>
                    ) : (
                      <div className="mt-1">
                        <Input
                          value={configLoja.certificado_digital_path || ""}
                          onChange={e => c("certificado_digital_path", e.target.value)}
                          placeholder="Caminho completo do arquivo .pfx"
                          className="font-mono text-xs"
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          No PDV cliente, informe o caminho do certificado no servidor.
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Senha do certificado */}
                  <div>
                    <Label className="flex items-center gap-1">
                      <Lock className="w-3 h-3" />Senha do Certificado
                    </Label>
                    <div className="relative mt-1">
                      <Input
                        type={showSenha ? "text" : "password"}
                        value={configLoja.certificado_senha || ""}
                        onChange={e => c("certificado_senha", e.target.value)}
                        placeholder="Senha do arquivo .pfx"
                        className="pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowSenha(v => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showSenha ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      A senha é criptografada e armazenada apenas localmente.
                    </p>
                  </div>
                </div>
                {/* Botão Testar Certificado */}
                {configLoja.certificado_digital_path && (
                  <div className="flex items-center gap-3 pt-2 border-t">
                    <Button type="button" variant="outline" className="flex items-center gap-2"
                      disabled={testando || !configLoja.certificado_senha}
                      onClick={() => lerCertificado(configLoja.certificado_digital_path, configLoja.certificado_senha)}>
                      {testando ? <><RefreshCw className="w-4 h-4 animate-spin" /> Lendo...</> : <><CheckCircle2 className="w-4 h-4 text-green-600" /> Testar e verificar certificado</>}
                    </Button>
                    <p className="text-xs text-muted-foreground">Informe a senha e clique para verificar a validade.</p>
                  </div>
                )}

                {/* Aviso sobre certificado de teste */}
                <div className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded-xl border border-blue-200 dark:border-blue-800 text-sm space-y-1">
                  <p className="font-semibold text-blue-700 dark:text-blue-300 flex items-center gap-2">
                    <FileKey2 className="w-4 h-4" /> Certificado de Desenvolvimento incluso
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Um certificado de teste autoassinado foi gerado para SP. Arquivo: <code className="font-mono">certificado_teste_SP.pfx</code> · Senha: <code className="font-mono">teste123</code>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Para produção: adquira um certificado A1 em Certisign, Serasa ou Valid (CNPJ vinculado).
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* ── Focus NF-e ───────────────────────────────────────────── */}
            <Card className={configLoja.focus_nfe_habilitado ? "border-green-400 dark:border-green-600" : "border-border"}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 justify-between">
                  <span className="flex items-center gap-2">
                    <span className="text-lg">⚡</span> Focus NF-e — Emissão Fiscal Real
                  </span>
                  {/* Switch liga/desliga */}
                  <label className="flex items-center gap-2 cursor-pointer">
                    <span className="text-sm font-normal text-muted-foreground">
                      {configLoja.focus_nfe_habilitado ? "ATIVO" : "INATIVO"}
                    </span>
                    <div
                      onClick={() => c("focus_nfe_habilitado", configLoja.focus_nfe_habilitado ? 0 : 1)}
                      className={`relative w-12 h-6 rounded-full transition-colors cursor-pointer ${
                        configLoja.focus_nfe_habilitado
                          ? "bg-green-500" : "bg-slate-300 dark:bg-slate-600"
                      }`}
                    >
                      <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                        configLoja.focus_nfe_habilitado ? "translate-x-7" : "translate-x-1"
                      }`} />
                    </div>
                  </label>
                </CardTitle>
                <CardDescription>
                  {configLoja.focus_nfe_habilitado
                    ? "✅ Emissão real ativa — notas serão enviadas à SEFAZ via Focus NF-e"
                    : "⬛ Desabilitado — sistema usa XML simulado para testes (sem custo)"}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {!configLoja.focus_nfe_habilitado && (
                  <div className="p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-xl text-sm space-y-1">
                    <p className="font-semibold text-blue-700 dark:text-blue-300">Como ativar para um cliente</p>
                    <ol className="text-xs text-muted-foreground space-y-0.5 list-decimal list-inside">
                      <li>Assinar plano Focus NF-e em <strong>focusnfe.com.br</strong> (~R$50–150/mês)</li>
                      <li>Copiar a API Key do painel Focus</li>
                      <li>Colar no campo abaixo e ligar o switch acima</li>
                      <li>Testar em homologação antes de ir para produção</li>
                    </ol>
                  </div>
                )}
                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <Label className="flex items-center gap-1">
                      <span>🔑</span> API Key Focus NF-e
                    </Label>
                    <div className="relative mt-1">
                      <Input
                        type={showSenha ? "text" : "password"}
                        value={configLoja.focus_api_key || ""}
                        onChange={e => c("focus_api_key", e.target.value)}
                        placeholder="Cole aqui a API Key fornecida pela Focus NF-e"
                        className="pr-10 font-mono text-sm"
                      />
                      <button type="button" onClick={() => setShowSenha(v => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                        {showSenha ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      A API Key fica armazenada apenas localmente, nunca é enviada para fora do servidor.
                    </p>
                  </div>
                </div>
                {configLoja.focus_nfe_habilitado && configLoja.focus_api_key && (
                  <div className="p-3 bg-green-50 dark:bg-green-950/30 border border-green-300 dark:border-green-700 rounded-xl text-sm space-y-1">
                    <p className="font-semibold text-green-700 dark:text-green-400">✅ Integração configurada</p>
                    <p className="text-xs text-muted-foreground">
                      Ambiente: <strong>{configLoja.ambiente_nfe === "producao" ? "Produção (notas reais)" : "Homologação (testes)"}</strong>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Ao finalizar uma venda com NFC-e ou NF-e no PDV, a nota será enviada automaticamente à SEFAZ.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Configurações Tributárias */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="w-5 h-5" />Configurações Tributárias
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSaveFiscal} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Regime Tributário</Label>
                      <Select value={configLoja.regime_tributario || "simples_nacional"} onValueChange={v => c("regime_tributario", v)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {REGIMES.map(r => (
                            <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Ambiente NF-e / NFC-e</Label>
                      <Select value={configLoja.ambiente_nfe || "homologacao"} onValueChange={v => c("ambiente_nfe", v)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="homologacao">🧪 Homologação (Testes)</SelectItem>
                          <SelectItem value="producao">✅ Produção (Real)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <Separator />
                  <p className="text-sm font-medium text-muted-foreground">Numeração das Notas</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Série NF-e</Label>
                      <Input
                        type="number" min="1" max="999"
                        value={configLoja.serie_nfe || 1}
                        onChange={e => c("serie_nfe", parseInt(e.target.value) || 1)}
                      />
                    </div>
                    <div>
                      <Label>Série NFC-e</Label>
                      <Input
                        type="number" min="1" max="999"
                        value={configLoja.serie_nfce || 1}
                        onChange={e => c("serie_nfce", parseInt(e.target.value) || 1)}
                      />
                    </div>
                  </div>

                  <Separator />

                  {/* Resumo para conferência */}
                  <div className="rounded-lg bg-muted/60 p-4 space-y-2 text-sm">
                    <p className="font-semibold mb-2">Resumo da configuração fiscal</p>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                      <span className="text-muted-foreground">CNPJ</span>
                      <span className="font-mono">{configLoja.cnpj || "—"}</span>
                      <span className="text-muted-foreground">Inscrição Estadual</span>
                      <span>{configLoja.inscricao_estadual || "—"}</span>
                      <span className="text-muted-foreground">Regime Tributário</span>
                      <span>{REGIMES.find(r => r.value === configLoja.regime_tributario)?.label || "—"}</span>
                      <span className="text-muted-foreground">Ambiente</span>
                      <span className={configLoja.ambiente_nfe === "producao" ? "text-green-600 font-medium" : "text-yellow-600 font-medium"}>
                        {configLoja.ambiente_nfe === "producao" ? "✅ Produção" : "🧪 Homologação"}
                      </span>
                      <span className="text-muted-foreground">Certificado</span>
                      <span className={configLoja.certificado_digital_path ? "text-green-600" : "text-yellow-600"}>
                        {configLoja.certificado_digital_path
                          ? "✅ " + (configLoja.certificado_digital_path.split(/[/\\]/).pop())
                          : "⚠ Não instalado"
                        }
                      </span>
                    </div>
                  </div>

                  <div className="flex justify-end pt-2">
                    <Button type="submit" className="btn-gradient" disabled={loading}>
                      {loading ? "Salvando..." : "Salvar Configurações Fiscais"}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </TabsContent>}

          {/* ═══════════════════════════ ABA USUÁRIOS ═══════════════════════════════ */}
          <TabsContent value="usuarios" className="mt-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Users className="w-5 h-5" />Usuários do Sistema
                    </CardTitle>
                    <CardDescription>Gerencie usuários e permissões de acesso</CardDescription>
                  </div>
                  <Dialog open={isUserDialogOpen} onOpenChange={o => {
                    setIsUserDialogOpen(o);
                    if (!o) { setEditingUser(null); setUserForm(emptyUserForm); }
                  }}>
                    <DialogTrigger asChild>
                      <Button><Plus className="w-4 h-4 mr-2" />Novo Usuário</Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>{editingUser ? "Editar Usuário" : "Novo Usuário"}</DialogTitle>
                        <DialogDescription>Preencha os dados do usuário</DialogDescription>
                      </DialogHeader>
                      <form onSubmit={handleSaveUser} className="space-y-4">
                        <div>
                          <Label>Nome *</Label>
                          <Input value={userForm.nome} onChange={e => setUserForm({ ...userForm, nome: e.target.value })} required />
                        </div>
                        <div>
                          <Label>E-mail *</Label>
                          <Input type="email" value={userForm.email} onChange={e => setUserForm({ ...userForm, email: e.target.value })} required disabled={!!editingUser} />
                        </div>
                        {!editingUser && (
                          <div>
                            <Label>Senha * (mínimo 6 caracteres)</Label>
                            <Input type="password" value={userForm.senha} onChange={e => setUserForm({ ...userForm, senha: e.target.value })} required minLength={6} />
                          </div>
                        )}
                        <div>
                          <Label>Cargo</Label>
                          <Select value={userForm.cargo} onValueChange={v => setUserForm({ ...userForm, cargo: v })}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {isAdmin && <SelectItem value="admin">Administrador (acesso total)</SelectItem>}
                              <SelectItem value="gerente">Gerente (sem configurações)</SelectItem>
                              <SelectItem value="vendedor">Vendedor (PDV + clientes)</SelectItem>
                              <SelectItem value="caixa">Caixa (apenas PDV)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex gap-2 justify-end">
                          <Button type="button" variant="outline" onClick={() => setIsUserDialogOpen(false)}>Cancelar</Button>
                          <Button type="submit" disabled={loading}>{editingUser ? "Salvar" : "Criar Usuário"}</Button>
                        </div>
                      </form>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>E-mail</TableHead>
                      <TableHead>Cargo</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {usuarios.map(u => {
                      const [variant, label] = cargoBadge(u.cargo);
                      return (
                        <TableRow key={u.id}>
                          <TableCell className="font-medium flex items-center gap-2">
                            {usuario?.id === u.id && <Shield className="w-4 h-4 text-primary" title="Você" />}
                            {u.nome}
                          </TableCell>
                          <TableCell className="text-muted-foreground">{u.email}</TableCell>
                          <TableCell><Badge variant={variant}>{label}</Badge></TableCell>
                          <TableCell>
                            <Badge variant={u.ativo ? "default" : "secondary"}>
                              {u.ativo ? "Ativo" : "Inativo"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button variant="outline" size="sm" onClick={() => {
                                setEditingUser(u);
                                setUserForm({ nome: u.nome, email: u.email, senha: "", cargo: u.cargo });
                                setIsUserDialogOpen(true);
                              }}>
                                <Edit className="w-3 h-3" />
                              </Button>
                              {usuario?.id !== u.id && (
                                <Button
                                  variant="outline" size="sm"
                                  onClick={() => toggleAtivo(u)}
                                  className={u.ativo ? "text-destructive hover:text-destructive" : "text-green-600 hover:text-green-600"}
                                >
                                  {u.ativo ? "Desativar" : "Ativar"}
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ═══════════════════════════ ABA REDE ════════════════════════════════════ */}
          <TabsContent value="rede" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Wifi className="w-5 h-5" />Rede Local</CardTitle>
                <CardDescription>Informações de conexão na rede interna</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Modo de Operação</Label>
                    <div className="mt-1 font-medium">
                      {serverMode === "server" ? "🖥 Servidor (host)" : "💻 Cliente (PDV remoto)"}
                    </div>
                  </div>
                  <div>
                    <Label>Endereço do Servidor</Label>
                    <div className="mt-1 font-mono font-medium">{serverIP || "localhost"}:3567</div>
                  </div>
                </div>

                {serverMode === "server" && (
                  <div className="p-4 bg-muted rounded-lg space-y-2">
                    <p className="font-semibold text-sm">📡 Outros PDVs devem se conectar em:</p>
                    <p className="font-mono text-primary text-lg">http://{serverIP || "localhost"}:3567</p>
                    <p className="text-xs text-muted-foreground">
                      No computador do PDV cliente, abra o navegador e acesse este endereço,
                      ou configure o aplicativo para apontar para este IP.
                    </p>
                  </div>
                )}

                {serverMode !== "server" && (
                  <div className="space-y-2">
                    <Label>URL do Servidor (se precisar alterar)</Label>
                    <div className="flex gap-2">
                      <Input
                        defaultValue={sistemaAPI.getServerURL()}
                        id="server-url-input"
                        placeholder="http://192.168.1.100:3567"
                        className="font-mono"
                      />
                      <Button variant="outline" onClick={() => {
                        const el = document.getElementById("server-url-input") as HTMLInputElement;
                        if (el?.value) {
                          sistemaAPI.setServerURL(el.value);
                          toast({ title: "URL salva!", description: "Recarregue a página para conectar." });
                        }
                      }}>Salvar</Button>
                    </div>
                  </div>
                )}

                <Button variant="outline" size="sm" onClick={loadServerInfo}>
                  <RefreshCw className="w-4 h-4 mr-2" />Atualizar informações
                </Button>

                {serverMode === "server" && (
                  <div className="mt-4 p-4 bg-slate-50 dark:bg-slate-900 rounded-lg border border-dashed space-y-3">
                    <p className="text-sm font-semibold flex items-center gap-2">
                      🔥 Firewall do Windows
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Se outros dispositivos não conseguem acessar, execute este comando
                      <strong> uma vez</strong> como Administrador no Windows:
                    </p>
                    <div className="bg-black rounded p-3 flex items-start justify-between gap-2">
                      <code className="text-green-400 text-xs break-all">
                        netsh advfirewall firewall add rule name="ASTIA PDV" dir=in action=allow protocol=TCP localport=3567
                      </code>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText('netsh advfirewall firewall add rule name="ASTIA PDV" dir=in action=allow protocol=TCP localport=3567');
                          toast({ title: "Comando copiado!" });
                        }}
                        className="shrink-0 text-xs text-slate-400 hover:text-white border border-slate-600 rounded px-2 py-1"
                      >
                        Copiar
                      </button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Após executar, teste acessando <code className="bg-muted px-1 rounded">http://{serverIP || "SEU-IP"}:3567</code> em outro dispositivo na mesma rede Wi-Fi.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ═══════════════════════════ ABA BANCO DE DADOS ══════════════════════════ */}
          {isAdmin && (
            <TabsContent value="banco" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Server className="w-5 h-5" />Banco de Dados
                  </CardTitle>
                  <CardDescription>Backup, restauração e acesso aos dados locais</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="p-3 bg-muted/60 rounded-lg text-sm text-muted-foreground">
                    O banco de dados SQLite fica armazenado localmente neste servidor.
                    Faça backups regulares para evitar perda de dados.
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <Button variant="outline" onClick={() => sistemaAPI.backupExportar()}>
                      <Server className="w-4 h-4 mr-2" />Exportar Backup (.sqlite)
                    </Button>
                    <Button variant="outline" className="text-destructive hover:text-destructive" onClick={() => {
                      if (confirm("⚠️ Restaurar o backup vai SUBSTITUIR todos os dados atuais. Continuar?")) {
                        sistemaAPI.backupImportar();
                      }
                    }}>
                      <Upload className="w-4 h-4 mr-2" />Restaurar Backup
                    </Button>
                    <Button variant="ghost" onClick={() => sistemaAPI.abrirPastaDados()}>
                      Abrir Pasta de Dados
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          )}

          {/* ═══════════════════════ ABA LOJA ONLINE ═══════════════════════ */}
          {isAdmin && (
            <TabsContent value="loja_online" className="mt-4 space-y-4">

              {/* Toggle principal — habilitar/desabilitar e-commerce */}
              <Card className={configLoja.ecommerce_ativo || configLoja.ecommerce_agendamento
                ? "border-primary/50 bg-primary/5" : ""}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base flex items-center gap-2">
                        <Globe className="w-4 h-4" /> Loja Online / E-commerce
                      </CardTitle>
                      <CardDescription className="mt-1">
                        Quando ativado, aparece "Pedidos Online" e "Rel. E-commerce" no menu lateral.
                        Pedidos online ficam <strong>separados</strong> do PDV.
                      </CardDescription>
                    </div>
                    {/* Badge de status */}
                    <div className={`px-3 py-1 rounded-full text-xs font-bold shrink-0 ${
                      configLoja.ecommerce_ativo || configLoja.ecommerce_agendamento
                        ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                        : "bg-muted text-muted-foreground"
                    }`}>
                      {configLoja.ecommerce_ativo || configLoja.ecommerce_agendamento ? "✓ Ativo" : "Inativo"}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <label className={`flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-colors ${configLoja.ecommerce_ativo ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'}`}>
                      <input type="checkbox" className="accent-primary w-4 h-4"
                        checked={!!configLoja.ecommerce_ativo}
                        onChange={e => c('ecommerce_ativo', e.target.checked ? 1 : 0)} />
                      <div>
                        <p className="font-semibold flex items-center gap-2"><ShoppingBag className="w-4 h-4" /> Modo Loja</p>
                        <p className="text-xs text-muted-foreground">Catálogo de produtos + carrinho + pedidos</p>
                      </div>
                    </label>
                    <label className={`flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-colors ${configLoja.ecommerce_agendamento ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'}`}>
                      <input type="checkbox" className="accent-primary w-4 h-4"
                        checked={!!configLoja.ecommerce_agendamento}
                        onChange={e => c('ecommerce_agendamento', e.target.checked ? 1 : 0)} />
                      <div>
                        <p className="font-semibold flex items-center gap-2"><Calendar className="w-4 h-4" /> Modo Agendamento</p>
                        <p className="text-xs text-muted-foreground">Serviços + agenda visual + horários</p>
                      </div>
                    </label>
                  </div>
                  {configLoja.ecommerce_ativo || configLoja.ecommerce_agendamento ? (
                    <div className="text-xs text-center text-muted-foreground bg-muted/50 rounded-lg py-2">
                      {configLoja.ecommerce_ativo && configLoja.ecommerce_agendamento
                        ? '⚡ Modo Híbrido ativado — loja + agendamento no mesmo site'
                        : configLoja.ecommerce_ativo
                        ? '🛒 Modo Loja ativado'
                        : '📅 Modo Agendamento ativado'}
                    </div>
                  ) : (
                    <div className="text-xs text-center text-muted-foreground bg-muted/50 rounded-lg py-2">
                      ℹ️ Ative um dos modos acima para exibir as opções de e-commerce no menu
                    </div>
                  )}
                  {/* Salvar aqui para o toggle ser imediato */}
                  <div className="flex justify-end">
                    <Button size="sm" onClick={async () => {
                      setLoading(true);
                      try {
                        await configAPI.update(configLoja);
                        toast({ title: configLoja.ecommerce_ativo || configLoja.ecommerce_agendamento
                          ? "✅ E-commerce ativado! Menu atualizado."
                          : "E-commerce desativado. Menu atualizado." });
                        window.dispatchEvent(new Event("astia:config-updated"));
                      } catch (err: any) {
                        toast({ title: "Erro ao salvar", description: err.message, variant: "destructive" });
                      } finally { setLoading(false); }
                    }} disabled={loading}>
                      {loading ? "Salvando..." : "Salvar e atualizar menu"}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Credenciais Supabase */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Zap className="w-4 h-4" /> Conexão Supabase
                  </CardTitle>
                  <CardDescription>Credenciais do projeto Supabase do cliente (Project Settings → API)</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <Label>URL do Projeto Supabase</Label>
                    <Input value={configLoja.ecommerce_supabase_url || ''}
                      onChange={e => c('ecommerce_supabase_url', e.target.value)}
                      placeholder="https://xxxxx.supabase.co" className="font-mono text-sm" />
                  </div>
                  <div>
                    <Label>Chave Anon (anon key)</Label>
                    <Input value={configLoja.ecommerce_supabase_key || ''}
                      onChange={e => c('ecommerce_supabase_key', e.target.value)}
                      placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." className="font-mono text-sm" />
                  </div>
                  <div>
                    <Label>URL do Site (Vercel/Lovable)</Label>
                    <div className="flex gap-2">
                      <Input value={configLoja.ecommerce_site_url || ''}
                        onChange={e => c('ecommerce_site_url', e.target.value)}
                        placeholder="https://sualoja.vercel.app" className="font-mono text-sm" />
                      {configLoja.ecommerce_site_url && (
                        <Button variant="outline" size="sm" onClick={() => {
                          if (window.vyn) {
                            // Electron: usa shell.openExternal via preload
                            const { shell } = window.require?.('electron') || {};
                            shell ? shell.openExternal(configLoja.ecommerce_site_url) : window.open(configLoja.ecommerce_site_url, '_blank');
                          } else {
                            window.open(configLoja.ecommerce_site_url, '_blank');
                          }
                        }}>
                          <ExternalLink className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                  <div>
                    <Label>WhatsApp para contato (com DDD)</Label>
                    <Input value={configLoja.ecommerce_whatsapp || ''}
                      onChange={e => c('ecommerce_whatsapp', e.target.value)}
                      placeholder="11999999999" />
                  </div>
                </CardContent>
              </Card>

              {/* Frete */}
              {!!configLoja.ecommerce_ativo && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Truck className="w-4 h-4" /> Entrega e Frete
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { val: 'retirada',     label: 'Só Retirada',         desc: 'Cliente retira na loja' },
                        { val: 'fixo_bairro',  label: 'Fixo por Bairro',     desc: 'Valor diferente por bairro' },
                        { val: 'fixo_unico',   label: 'Frete Fixo Único',    desc: 'Mesmo valor para todos' },
                      ].map(opt => (
                        <label key={opt.val} className={`flex flex-col gap-1 p-3 rounded-xl border-2 cursor-pointer transition-colors ${(configLoja.ecommerce_frete_tipo || 'retirada') === opt.val ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'}`}>
                          <div className="flex items-center gap-2">
                            <input type="radio" name="frete_tipo" value={opt.val}
                              checked={(configLoja.ecommerce_frete_tipo || 'retirada') === opt.val}
                              onChange={() => c('ecommerce_frete_tipo', opt.val)}
                              className="accent-primary" />
                            <span className="font-medium text-sm">{opt.label}</span>
                          </div>
                          <span className="text-xs text-muted-foreground pl-5">{opt.desc}</span>
                        </label>
                      ))}
                    </div>

                    {configLoja.ecommerce_frete_tipo === 'fixo_unico' && (
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label>Valor do Frete (R$)</Label>
                          <Input type="number" min="0" step="0.01"
                            value={configLoja.ecommerce_frete_fixo || '0'}
                            onChange={e => c('ecommerce_frete_fixo', parseFloat(e.target.value) || 0)} />
                        </div>
                        <div>
                          <Label>Pedido Mínimo (R$)</Label>
                          <Input type="number" min="0" step="0.01"
                            value={configLoja.ecommerce_pedido_minimo || '0'}
                            onChange={e => c('ecommerce_pedido_minimo', parseFloat(e.target.value) || 0)} />
                        </div>
                      </div>
                    )}

                    {configLoja.ecommerce_frete_tipo === 'fixo_bairro' && (() => {
                      let bairros: {bairro: string; valor: number}[] = [];
                      try { bairros = JSON.parse(configLoja.ecommerce_bairros || '[]'); } catch { bairros = []; }
                      if (!Array.isArray(bairros)) bairros = [];
                      return (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> Tabela de Bairros</Label>
                          <Button size="sm" variant="outline" onClick={() => {
                            c('ecommerce_bairros', JSON.stringify([...bairros, { bairro: '', valor: 0 }]));
                          }}>
                            <Plus className="w-3.5 h-3.5 mr-1" />Adicionar
                          </Button>
                        </div>
                        {bairros.length === 0
                          ? <p className="text-sm text-muted-foreground text-center py-3">Nenhum bairro. Clique em "Adicionar".</p>
                          : bairros.map((b, i) => (
                            <div key={i} className="flex gap-2 items-center">
                              <Input placeholder="Nome do bairro" value={b.bairro || ''}
                                onChange={e => {
                                  const arr = bairros.map((x, j) => j === i ? { ...x, bairro: e.target.value } : x);
                                  c('ecommerce_bairros', JSON.stringify(arr));
                                }} className="flex-1" />
                              <Input type="number" min="0" step="0.01" placeholder="R$" value={b.valor ?? 0}
                                onChange={e => {
                                  const arr = bairros.map((x, j) => j === i ? { ...x, valor: parseFloat(e.target.value) || 0 } : x);
                                  c('ecommerce_bairros', JSON.stringify(arr));
                                }} className="w-24" />
                              <Button size="sm" variant="ghost" className="text-destructive px-2"
                                onClick={() => c('ecommerce_bairros', JSON.stringify(bairros.filter((_, j) => j !== i)))}>
                                <X className="w-4 h-4" />
                              </Button>
                            </div>
                          ))
                        }
                        <div className="grid grid-cols-2 gap-3 pt-1">
                          <div>
                            <Label className="text-xs">Pedido Mínimo (R$)</Label>
                            <Input type="number" min="0" step="0.01"
                              value={configLoja.ecommerce_pedido_minimo || '0'}
                              onChange={e => c('ecommerce_pedido_minimo', parseFloat(e.target.value) || 0)} />
                          </div>
                          <div>
                            <Label className="text-xs">Tempo de entrega estimado</Label>
                            <Input value={configLoja.ecommerce_tempo_entrega || ''}
                              onChange={e => c('ecommerce_tempo_entrega', e.target.value)}
                              placeholder="ex: 40-60 min" />
                          </div>
                        </div>
                      </div>
                      );
                    })()}
                  </CardContent>
                </Card>
              )}

              {/* Sincronização */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <RefreshCw className="w-4 h-4" /> Sincronização
                  </CardTitle>
                  <CardDescription>
                    Envia produtos para o site e importa pedidos novos do Supabase
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {configLoja.ecommerce_ultimo_sync && (
                    <p className="text-xs text-muted-foreground">
                      Última sincronização: {new Date(configLoja.ecommerce_ultimo_sync).toLocaleString('pt-BR')}
                    </p>
                  )}
                  <Button
                    className="w-full"
                    disabled={!configLoja.ecommerce_supabase_url || !configLoja.ecommerce_supabase_key}
                    onClick={async () => {
                      try {
                        toast({ title: "Sincronizando..." });
                        const r = await ecommerceAPI.sincronizarSupabase(
                          configLoja.ecommerce_supabase_url,
                          configLoja.ecommerce_supabase_key
                        );
                        await configAPI.update({ ecommerce_ultimo_sync: new Date().toISOString() });
                        toast({ title: `✅ Sync concluído!`, description: `${r.importados} pedido(s) importado(s) · ${r.produtos_enviados} produto(s) enviado(s)` });
                      } catch (e: any) {
                        toast({ title: "Erro na sincronização", description: e.message, variant: "destructive" });
                      }
                    }}
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    {(!configLoja.ecommerce_supabase_url || !configLoja.ecommerce_supabase_key)
                      ? 'Configure o Supabase primeiro'
                      : 'Sincronizar agora'}
                  </Button>
                </CardContent>
              </Card>

              {/* Salvar */}
              <div className="flex justify-end">
                <Button onClick={async () => {
                  setLoading(true);
                  try {
                    await configAPI.update(configLoja);
                    toast({ title: "✅ Configurações da loja online salvas!" });
                    window.dispatchEvent(new Event("astia:config-updated"));
                  } catch (err: any) {
                    toast({ title: "Erro ao salvar", description: err.message, variant: "destructive" });
                  } finally { setLoading(false); }
                }} disabled={loading}>
                  {loading ? "Salvando..." : "Salvar Configurações"}
                </Button>
              </div>
            </TabsContent>
          )}

          {/* ══════════════════════ ABA GPT MAKER / IA WHATSAPP ══════════════════════ */}
          {isAdmin && (
            <TabsContent value="gptmaker" className="mt-4">
              <GptMakerTab configLoja={configLoja} />
            </TabsContent>
          )}
        </Tabs>
      </div>
    </Layout>
  );
};

// ── GPT Maker Integration Tab ─────────────────────────────────────────────
function GptMakerTab({ configLoja }: { configLoja: any }) {
  const [copied, setCopied] = useState<string | null>(null);
  const [gptUrl, setGptUrl] = useState("");
  const [iframeKey, setIframeKey] = useState(0);
  const [tunnel, setTunnel] = useState<{ status: string; url: string | null; log: string[] }>({
    status: 'off', url: null, log: []
  });
  const [downloading, setDownloading] = useState(false);
  const { toast } = useToast();

  const vyn = (window as any).vyn;

  // Carrega status inicial e escuta eventos em tempo real
  useEffect(() => {
    vyn?.tunnelStatus?.().then((s: any) => { if (s) setTunnel(s); });
    const unsub = vyn?.on?.('tunnel:status', (s: any) => { if (s) setTunnel(s); });
    return () => { unsub?.(); };
  }, []);

  const iniciarTunnel = async () => {
    setTunnel(t => ({ ...t, status: 'starting', log: [...t.log, 'Iniciando...'] }));
    try {
      const r = await vyn?.tunnelStart?.();
      if (r) setTunnel(prev => ({ ...prev, ...r }));
    } catch (e: any) {
      toast({ title: "Erro ao iniciar túnel", description: e.message, variant: "destructive" });
    }
  };

  const pararTunnel = async () => {
    await vyn?.tunnelStop?.();
    setTunnel({ status: 'off', url: null, log: [] });
  };

  const baixarCloudflared = async () => {
    setDownloading(true);
    try {
      const r = await vyn?.tunnelDownload?.();
      if (r?.ok) toast({ title: "✅ cloudflared baixado com sucesso!" });
      else toast({ title: "Erro no download", description: r?.erro, variant: "destructive" });
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally { setDownloading(false); }
  };

  const copy = (text: string, key: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  const CopyBtn = ({ text, id }: { text: string; id: string }) => (
    <button onClick={() => copy(text, id)}
      className="ml-2 p-1 rounded hover:bg-muted transition-colors shrink-0" title="Copiar">
      {copied === id
        ? <Check className="w-3.5 h-3.5 text-green-500" />
        : <Copy className="w-3.5 h-3.5 text-muted-foreground" />}
    </button>
  );

  const apiBase = tunnel.url || `http://${window.location.hostname}:3567/api`;
  const nomeLoja = configLoja?.nome || "Minha Loja";

  const promptBase = `Você é o assistente de IA do ${nomeLoja}, um sistema de PDV (Ponto de Venda).
Você tem acesso à API do ASTIA PDV em tempo real via webhooks.

URL da API: ${apiBase}
Método: POST — Content-Type: application/json
Formato: { "channel": "canal", "data": {...} }

Canais disponíveis:
- produtos:buscar-codigo → buscar produto por código de barras (data: "7891234...")
- produtos:listar → listar todos os produtos ativos (data: {})
- vendas:resumo-dia → resumo de vendas do dia (data: {})
- clientes:listar → listar clientes cadastrados (data: {})
- estoque:alertas → produtos com estoque abaixo do mínimo (data: {})

Responda sempre em português. Seja objetivo, amigável e use os dados reais da API.
Quando perguntarem sobre produtos, preços, vendas ou estoque, consulte a API antes de responder.`;

  const statusColor = { off: "gray", starting: "yellow", active: "green", error: "red" }[tunnel.status] || "gray";
  const statusLabel = { off: "Desligado", starting: "Iniciando...", active: "Ativo", error: "Erro" }[tunnel.status] || "Desligado";

  return (
    <div className="space-y-5 max-w-4xl">

      {/* Header */}
      <div className="flex items-start gap-4 p-5 rounded-2xl border bg-gradient-to-r from-violet-50 to-purple-50 dark:from-violet-950/20 dark:to-purple-950/20 border-violet-200 dark:border-violet-800">
        <div className="w-12 h-12 rounded-xl bg-violet-600 flex items-center justify-center shrink-0">
          <Bot className="w-6 h-6 text-white" />
        </div>
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            IA + WhatsApp via GPT Maker
            <Badge className="bg-violet-600 text-white text-xs">Somente Admin</Badge>
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Conecte um agente de IA ao WhatsApp. O comerciante consulta vendas, estoque e produtos
            direto pelo WhatsApp — sem abrir o sistema. Cada cliente tem seu próprio túnel.
          </p>
        </div>
      </div>

      {/* ── PAINEL DO TÚNEL ── */}
      <Card className={`border-2 ${tunnel.status === 'active' ? 'border-green-400 dark:border-green-700' : tunnel.status === 'starting' ? 'border-yellow-400' : tunnel.status === 'error' ? 'border-red-400' : 'border-border'}`}>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center justify-between">
            <span className="flex items-center gap-2">
              <div className={`w-2.5 h-2.5 rounded-full ${tunnel.status === 'active' ? 'bg-green-500 animate-pulse' : tunnel.status === 'starting' ? 'bg-yellow-500 animate-pulse' : tunnel.status === 'error' ? 'bg-red-500' : 'bg-gray-400'}`} />
              Túnel Cloudflare — {statusLabel}
            </span>
            <div className="flex gap-2">
              {tunnel.status === 'off' || tunnel.status === 'error' ? (
                <Button size="sm" onClick={iniciarTunnel} className="h-7 gap-1.5 bg-violet-600 hover:bg-violet-700">
                  <Zap className="w-3.5 h-3.5" /> Ligar Túnel
                </Button>
              ) : tunnel.status === 'active' ? (
                <Button size="sm" variant="outline" onClick={pararTunnel} className="h-7">
                  Desligar
                </Button>
              ) : (
                <Button size="sm" disabled className="h-7 gap-1.5">
                  <Loader className="w-3.5 h-3.5 animate-spin" /> Aguarde...
                </Button>
              )}
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {tunnel.url ? (
            <div className="p-3 rounded-xl bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800">
              <p className="text-xs font-semibold text-green-700 dark:text-green-400 mb-1">🌐 URL Pública — use esta no GPT Maker</p>
              <div className="flex items-center gap-2">
                <code className="text-sm font-mono text-green-800 dark:text-green-300 flex-1 break-all">{tunnel.url}/api</code>
                <CopyBtn text={tunnel.url + "/api"} id="tunnel-url" />
                <button onClick={() => window.open(tunnel.url!, '_blank')}
                  className="p-1 rounded hover:bg-green-100 dark:hover:bg-green-900/40">
                  <ExternalLink className="w-3.5 h-3.5 text-green-700 dark:text-green-400" />
                </button>
              </div>
            </div>
          ) : (
            <div className="p-3 rounded-xl bg-muted/40 border text-sm text-muted-foreground">
              {tunnel.status === 'starting'
                ? '⏳ Aguardando URL do túnel... isso leva alguns segundos.'
                : tunnel.status === 'error'
                ? '❌ Falha ao iniciar túnel. Veja o log abaixo ou tente baixar o cloudflared novamente.'
                : '💡 Ligue o túnel para obter uma URL pública que o GPT Maker consegue acessar de qualquer lugar.'}
            </div>
          )}

          {/* Log */}
          {tunnel.log.length > 0 && (
            <details className="text-xs">
              <summary className="text-muted-foreground cursor-pointer hover:text-foreground">Ver log do túnel</summary>
              <pre className="mt-2 p-3 bg-black/80 text-green-400 rounded-xl max-h-32 overflow-y-auto font-mono text-xs leading-relaxed">
                {tunnel.log.join('\n')}
              </pre>
            </details>
          )}

          <div className="flex items-center gap-2 pt-1 border-t">
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={baixarCloudflared} disabled={downloading}>
              {downloading ? <><RefreshCw className="w-3 h-3 animate-spin" />Baixando...</> : <><Download className="w-3 h-3" />Baixar/Atualizar cloudflared</>}
            </Button>
            <span className="text-xs text-muted-foreground">~30MB — necessário na primeira vez</span>
          </div>
        </CardContent>
      </Card>

      {/* Prompt */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center justify-between">
            <span className="flex items-center gap-2"><MessageCircle className="w-4 h-4" />Prompt do agente (cole no GPT Maker)</span>
            <CopyBtn text={promptBase} id="prompt" />
          </CardTitle>
          <CardDescription>
            {tunnel.url ? '✅ URL do túnel já incluída no prompt' : '⚠️ Ligue o túnel para a URL aparecer no prompt'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <pre className="text-xs bg-muted/60 rounded-xl p-4 overflow-auto whitespace-pre-wrap leading-relaxed border max-h-52 font-mono">
            {promptBase}
          </pre>
        </CardContent>
      </Card>

      {/* Canais disponíveis */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2"><Link className="w-4 h-4" />Canais da API disponíveis</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2">
            {[
              { canal: "produtos:buscar-codigo", data: '"7891234567890"',     desc: "Buscar produto por EAN" },
              { canal: "produtos:listar",        data: '{}',                  desc: "Listar todos os produtos" },
              { canal: "vendas:resumo-dia",      data: '{}',                  desc: "Resumo de vendas hoje" },
              { canal: "clientes:listar",        data: '{}',                  desc: "Listar clientes" },
              { canal: "estoque:alertas",        data: '{}',                  desc: "Alertas estoque baixo" },
              { canal: "flyers:listar-todos",    data: '{}',                  desc: "Produtos para flyer" },
            ].map(c => {
              const payload = JSON.stringify({ channel: c.canal, data: c.data === '{}' ? {} : c.data });
              return (
                <div key={c.canal} className="flex items-center gap-2 p-2.5 rounded-xl bg-muted/30 border text-xs">
                  <div className="flex-1 min-w-0">
                    <code className="font-mono text-violet-600 dark:text-violet-400 block truncate">{c.canal}</code>
                    <span className="text-muted-foreground">{c.desc}</span>
                  </div>
                  <CopyBtn text={payload} id={c.canal} />
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* GPT Maker iframe */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center justify-between">
            <span className="flex items-center gap-2"><ExternalLink className="w-4 h-4" />Painel GPT Maker</span>
          </CardTitle>
          <CardDescription>Cole sua URL do GPT Maker para gerenciar o agente sem sair do ASTIA</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input placeholder="https://app.gptmaker.ai/..." value={gptUrl} onChange={e => setGptUrl(e.target.value)} />
            {gptUrl && <Button variant="outline" size="icon" onClick={() => setIframeKey(k => k + 1)}><RefreshCw className="w-4 h-4" /></Button>}
          </div>
          {gptUrl ? (
            <div className="rounded-xl overflow-hidden border" style={{ height: 600 }}>
              <iframe key={iframeKey} src={gptUrl} className="w-full h-full" title="GPT Maker" allow="camera; microphone" />
            </div>
          ) : (
            <div className="rounded-xl border-2 border-dashed p-8 text-center space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center mx-auto">
                <Bot className="w-7 h-7 text-violet-600" />
              </div>
              <div>
                <p className="font-semibold mb-1">Ainda não tem uma conta no GPT Maker?</p>
                <p className="text-sm text-muted-foreground mb-3">Crie agentes de IA conectados ao WhatsApp sem programar nada.</p>
                <a href="https://gptmaker.ai" target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-violet-600 text-white rounded-xl text-sm font-semibold hover:bg-violet-700 transition-colors">
                  <ExternalLink className="w-4 h-4" /> Criar conta grátis
                </a>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Como funciona */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2"><Sparkles className="w-4 h-4 text-violet-500" />Como configurar do zero</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="space-y-3 text-sm">
            {[
              { n:1, t:"Ligar o túnel",          d:"Clique em \"Ligar Túnel\" acima. O ASTIA baixa o cloudflared automaticamente e gera uma URL pública." },
              { n:2, t:"Criar conta no GPT Maker",d:"Acesse gptmaker.ai e crie uma conta grátis. Crie um novo agente." },
              { n:3, t:"Colar o prompt",          d:"No campo \"Instruções do sistema\" do agente, cole o prompt gerado acima (já tem a URL do túnel)." },
              { n:4, t:"Conectar WhatsApp",       d:"No GPT Maker, vá em Canais → WhatsApp → escanear QR Code com o celular da loja." },
              { n:5, t:"Testar",                  d:"Envie uma mensagem para o número conectado: \"Qual meu produto mais vendido hoje?\"" },
            ].map(s => (
              <li key={s.n} className="flex gap-3">
                <div className="w-6 h-6 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center font-bold text-violet-600 text-xs shrink-0 mt-0.5">{s.n}</div>
                <div>
                  <p className="font-semibold">{s.t}</p>
                  <p className="text-muted-foreground text-xs mt-0.5">{s.d}</p>
                </div>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}

export default Configuracoes;
