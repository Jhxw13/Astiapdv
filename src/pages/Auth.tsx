import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { sistemaAPI, licenseAPI } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { LogIn, Eye, EyeOff, Wifi, ChevronDown, ChevronUp, Loader2, QrCode, X, ShieldAlert, KeyRound, RefreshCw } from "lucide-react";

export default function Auth() {
  const { login } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [email, setEmail]   = useState("");
  const [senha, setSenha]   = useState("");
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [error, setError]   = useState("");
  const [showServer, setShowServer] = useState(false);
  const [serverURL, setServerURL] = useState(sistemaAPI.getServerURL());
  const [serverIP, setServerIP] = useState("");
  const [showQR, setShowQR] = useState(false);
  const [licenseInfo, setLicenseInfo] = useState<any>(null);
  const [licenseLoading, setLicenseLoading] = useState(true);
  const [licenseKey, setLicenseKey] = useState("");
  const [licenseServerUrl, setLicenseServerUrl] = useState("");
  const [activating, setActivating] = useState(false);

  useEffect(() => {
    sistemaAPI.getServerIP().then(ip => setServerIP(ip || "")).catch(() => {});
    licenseAPI.status()
      .then((s) => {
        setLicenseInfo(s);
        setLicenseServerUrl(s?.serverUrl || "");
      })
      .catch(() => {
        setLicenseInfo({ accessAllowed: true, reason: "Validação de licença indisponível no momento" });
      })
      .finally(() => setLicenseLoading(false));
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!licenseInfo?.accessAllowed) {
      setError("Licença inativa. Ative a licença para continuar.");
      return;
    }
    if (!email || !senha) { setError("Preencha e-mail e senha"); return; }
    setLoading(true);
    setError("");
    try {
      const res = await login(email, senha);
      if (res.ok && res.destino) {
        toast({ title: "Login realizado!", description: "Bem-vindo ao ASTIA PDV" });
        navigate(res.destino, { replace: true });
      } else {
        setError(res.erro || "Erro ao fazer login");
      }
    } catch (err: any) {
      setError(err.message || "Erro ao conectar com o servidor");
    } finally {
      setLoading(false);
    }
  };

  const salvarServidor = () => {
    sistemaAPI.setServerURL(serverURL);
    toast({ title: "Servidor salvo!", description: serverURL });
    setShowServer(false);
  };

  const qrLoginURL = serverIP
    ? `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(`http://${serverIP}:3567/auth`)}`
    : "";

  const ativarLicenca = async () => {
    if (!licenseKey.trim()) {
      toast({ title: "Informe a chave de licença", variant: "destructive" });
      return;
    }
    setActivating(true);
    try {
      const st = await licenseAPI.activate(licenseKey.trim(), licenseServerUrl.trim() || undefined);
      setLicenseInfo(st);
      toast({ title: "Licença ativada com sucesso!" });
      setLicenseKey("");
    } catch (e: any) {
      toast({ title: "Erro ao ativar licença", description: e.message, variant: "destructive" });
    } finally {
      setActivating(false);
    }
  };

  const validarLicencaAgora = async () => {
    setLicenseLoading(true);
    try {
      const st = await licenseAPI.verify();
      setLicenseInfo(st);
    } catch (e: any) {
      toast({ title: "Falha ao validar licença", description: e.message, variant: "destructive" });
    } finally {
      setLicenseLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
      <div className="w-full max-w-sm space-y-4">
        {!licenseLoading && (
          <Alert variant={licenseInfo?.accessAllowed ? "default" : "destructive"}>
            <AlertDescription className="flex items-start gap-2">
              <ShieldAlert className="h-4 w-4 mt-0.5 shrink-0" />
              <span>
                <strong>Status da licença:</strong> {licenseInfo?.reason || "Indisponível"}
                {licenseInfo?.validUntil ? ` • Válida até ${new Date(licenseInfo.validUntil).toLocaleDateString('pt-BR')}` : ""}
              </span>
            </AlertDescription>
          </Alert>
        )}

        {!licenseLoading && !licenseInfo?.accessAllowed && (
          <Card className="border-destructive/40">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <KeyRound className="h-4 w-4" /> Ativar Licença
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input
                placeholder="Chave de licença"
                value={licenseKey}
                onChange={e => setLicenseKey(e.target.value)}
              />
              <Input
                placeholder="Servidor de licença (opcional)"
                value={licenseServerUrl}
                onChange={e => setLicenseServerUrl(e.target.value)}
              />
              <div className="flex gap-2">
                <Button className="flex-1" onClick={ativarLicenca} disabled={activating}>
                  {activating ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Ativando...</> : "Ativar"}
                </Button>
                <Button variant="outline" onClick={validarLicencaAgora} disabled={licenseLoading}>
                  <RefreshCw className={`h-4 w-4 ${licenseLoading ? "animate-spin" : ""}`} />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Logo */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-black mb-3 shadow-lg">
            <img src="/astia_logo.svg" alt="ASTIA PDV" className="w-14 h-14 object-contain" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">ASTIA PDV</h1>
          <p className="text-muted-foreground text-xs">by VYN Developer</p>
        </div>

        {/* Login */}
        <Card>
          <CardHeader><CardTitle className="text-center">Entrar</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <div className="space-y-1">
                <Label htmlFor="email">E-mail</Label>
                <Input id="email" type="email" value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="exemplo@email.com" disabled={loading} autoFocus />
              </div>
              <div className="space-y-1">
                <Label htmlFor="senha">Senha</Label>
                <div className="relative">
                  <Input id="senha" type={showPass ? "text" : "password"} value={senha}
                    onChange={e => setSenha(e.target.value)}
                    placeholder="••••••••" disabled={loading} className="pr-10" />
                  <button type="button" onClick={() => setShowPass(!showPass)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={loading || !licenseInfo?.accessAllowed}>
                {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Entrando...</> : <><LogIn className="mr-2 h-4 w-4" />Entrar</>}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* QR Code para acesso pelo celular (gerente) */}
        {serverIP && (
          <Card className="border-dashed">
            <CardContent className="pt-4 pb-3">
              <button
                type="button"
                className="w-full flex items-center justify-between text-sm text-muted-foreground hover:text-foreground"
                onClick={() => setShowQR(!showQR)}
              >
                <span className="flex items-center gap-2">
                  <QrCode className="h-4 w-4" />
                  Acessar pelo celular (gerente)
                </span>
                {showQR ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </button>
              {showQR && (
                <div className="mt-3 flex flex-col items-center gap-3">
                  <p className="text-xs text-muted-foreground text-center">
                    Escaneie para abrir o sistema no celular e autorizar descontos remotamente
                  </p>
                  {qrLoginURL && (
                    <img
                      src={qrLoginURL}
                      alt="QR de acesso"
                      className="w-44 h-44 rounded-lg border"
                    />
                  )}
                  <p className="text-xs font-mono text-primary">http://{serverIP}:3567</p>
                  <p className="text-xs text-muted-foreground text-center">
                    Conecte o celular na mesma rede Wi-Fi
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Consulta de preços */}
        <Card className="border-dashed">
          <CardContent className="pt-4 pb-3">
            <p className="text-sm text-center text-muted-foreground mb-2">Acesso público</p>
            <Button variant="outline" className="w-full text-sm" onClick={() => navigate('/consulta-preco')}>
              Consulta de Preços (sem login)
            </Button>
          </CardContent>
        </Card>

        {/* Config do servidor */}
        <button
          type="button"
          onClick={() => setShowServer(!showServer)}
          className="w-full flex items-center justify-center gap-1 text-xs text-muted-foreground hover:text-foreground py-1"
        >
          <Wifi className="h-3 w-3" />
          Configurar servidor
          {showServer ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>

        {showServer && (
          <Card className="border-dashed">
            <CardContent className="pt-4 space-y-3">
              <p className="text-xs text-muted-foreground">
                Se você está em outro computador da rede, informe o IP do servidor:
              </p>
              <Input
                placeholder="http://192.168.1.100:3567"
                value={serverURL}
                onChange={e => setServerURL(e.target.value)}
                className="text-sm font-mono"
              />
              <Button size="sm" className="w-full" onClick={salvarServidor}>
                Salvar servidor
              </Button>
            </CardContent>
          </Card>
        )}

        <p className="text-center text-xs text-muted-foreground mt-4">
          ASTIA PDV v3.0 · Criado por <span className="font-medium text-foreground">João Victor Gomes Geraldo</span>
          <br />
          <a href="https://www.instagram.com/vynmkt/" target="_blank" rel="noopener noreferrer"
            className="text-purple-600 hover:underline font-medium">@vynmkt</a>
          {" "}·{" "}
          <a href="https://wa.me/5511921261309" target="_blank" rel="noopener noreferrer"
            className="text-green-600 hover:underline">(11) 92126-1309</a>
        </p>
      </div>
    </div>
  );
}
