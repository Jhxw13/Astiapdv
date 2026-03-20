/**
 * ASTIA PDV — Fechamento de Caixa v1.0
 * Gerente confere valores do sistema vs físico, salva divergências
 * Exportação XML e CSV por período
 */
import { useState, useEffect } from "react";
import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { conferenciaAPI } from "@/lib/api";
import {
  ClipboardCheck, RefreshCw, Save, Download,
  FileCode, CheckCircle, AlertTriangle, Search,
  ChevronLeft, Banknote, CreditCard, Smartphone, QrCode
} from "lucide-react";

const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);

const fmtNum = (v: number) => Number(v || 0).toFixed(2);

type Forma = { key: string; label: string; icon: any; cor: string };
const FORMAS: Forma[] = [
  { key: "dinheiro", label: "Dinheiro",       icon: Banknote,    cor: "text-green-600" },
  { key: "debito",   label: "Débito",          icon: CreditCard,  cor: "text-blue-600" },
  { key: "credito",  label: "Crédito",         icon: CreditCard,  cor: "text-purple-600" },
  { key: "pix",      label: "PIX",             icon: QrCode,      cor: "text-cyan-600" },
];

export default function FechamentoCaixa() {
  const { toast } = useToast();
  const { usuario } = useAuth();

  const hoje = new Date().toISOString().split("T")[0];

  // ── Conferência do dia ─────────────────────────────────────────────────────
  const [view, setView]             = useState<"lista" | "conferir">("lista");
  const [dataSel, setDataSel]       = useState(hoje);
  const [pdvSel, setPdvSel]         = useState("1");
  const [numPdvs, setNumPdvs]       = useState(1);
  const [sistema, setSistema]       = useState<any>(null);
  const [conferido, setConferido]   = useState<Record<string, string>>({});
  const [obs, setObs]               = useState("");
  const [loading, setLoading]       = useState(false);
  const [saving, setSaving]         = useState(false);

  // ── Lista / filtro ─────────────────────────────────────────────────────────
  const [lista, setLista]           = useState<any[]>([]);
  const [loadingLista, setLoadingLista] = useState(false);
  const [filtroInicio, setFiltroInicio] = useState(
    new Date(new Date().setDate(1)).toISOString().split("T")[0]
  );
  const [filtroFim, setFiltroFim]   = useState(hoje);
  const [filtroPdv, setFiltroPdv]   = useState("");

  useEffect(() => {
    carregarLista();
    // Descobre quantos PDVs existem
    conferenciaAPI.dadosSistema(hoje, 1).then(() => {}).catch(() => {});
  }, []);

  const carregarLista = async () => {
    setLoadingLista(true);
    try {
      const r = await conferenciaAPI.listar({
        inicio: filtroInicio,
        fim: filtroFim,
        pdv: filtroPdv ? parseInt(filtroPdv) : undefined,
      });
      setLista(r || []);
    } catch (e: any) {
      toast({ title: "Erro ao carregar", description: e.message, variant: "destructive" });
    } finally { setLoadingLista(false); }
  };

  const abrirConferencia = async (data: string, pdv: string) => {
    setDataSel(data);
    setPdvSel(pdv);
    setLoading(true);
    try {
      const dados = await conferenciaAPI.dadosSistema(data, parseInt(pdv));
      setSistema(dados);
      // Preenche conferido com valores já salvos (se existir) ou com o sistema
      const conf: Record<string, string> = {};
      FORMAS.forEach(f => {
        const salvo = lista.find(l => l.data_referencia === data && String(l.numero_pdv) === pdv);
        conf[f.key] = salvo
          ? fmtNum(salvo[`${f.key}_conferido`] ?? dados[`${f.key}_sistema`])
          : fmtNum(dados[`${f.key}_sistema`] ?? 0);
      });
      setConferido(conf);
      setObs("");
      setView("conferir");
    } catch (e: any) {
      toast({ title: "Erro ao carregar dados", description: e.message, variant: "destructive" });
    } finally { setLoading(false); }
  };

  const salvar = async () => {
    setSaving(true);
    try {
      await conferenciaAPI.salvar({
        data_referencia: dataSel,
        numero_pdv: parseInt(pdvSel),
        dinheiro_conferido: parseFloat(conferido.dinheiro) || 0,
        debito_conferido:   parseFloat(conferido.debito)   || 0,
        credito_conferido:  parseFloat(conferido.credito)  || 0,
        pix_conferido:      parseFloat(conferido.pix)      || 0,
        observacoes: obs,
        gerente_id: usuario?.id,
      });
      toast({ title: "Fechamento salvo!" });
      setView("lista");
      carregarLista();
    } catch (e: any) {
      toast({ title: "Erro ao salvar", description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  // ── Exportação ─────────────────────────────────────────────────────────────
  const exportarXML = () => {
    if (!lista.length) { toast({ title: "Nenhum dado para exportar", variant: "destructive" }); return; }

    const linhas = lista.map(l => {
      const totalSistema   = FORMAS.reduce((s, f) => s + Number(l[`${f.key}_sistema`] || 0), 0);
      const totalConferido = FORMAS.reduce((s, f) => s + Number(l[`${f.key}_conferido`] ?? l[`${f.key}_sistema`] ?? 0), 0);
      const difTotal       = totalConferido - totalSistema;

      const formasXML = FORMAS.map(f => {
        const sis = Number(l[`${f.key}_sistema`] || 0);
        const con = Number(l[`${f.key}_conferido`] ?? sis);
        return `    <forma tipo="${f.key}" sistema="${fmtNum(sis)}" conferido="${fmtNum(con)}" diferenca="${fmtNum(con - sis)}" />`;
      }).join("\n");

      return `  <fechamento>
    <data>${l.data_referencia}</data>
    <pdv>${l.numero_pdv}</pdv>
    <operador>${l.operador_nome || ""}</operador>
    <gerente>${l.gerente_nome || ""}</gerente>
    <status>${l.status}</status>
    <formas>
${formasXML}
    </formas>
    <total_sistema>${fmtNum(totalSistema)}</total_sistema>
    <total_conferido>${fmtNum(totalConferido)}</total_conferido>
    <diferenca_total>${fmtNum(difTotal)}</diferenca_total>
    <observacoes>${l.observacoes || ""}</observacoes>
  </fechamento>`;
    }).join("\n");

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<fechamentos periodo_inicio="${filtroInicio}" periodo_fim="${filtroFim}" gerado_em="${new Date().toISOString()}">
${linhas}
</fechamentos>`;

    baixar(xml, `fechamento_caixa_${filtroInicio}_${filtroFim}.xml`, "application/xml");
    toast({ title: `XML exportado — ${lista.length} registro(s)` });
  };

  const exportarCSV = () => {
    if (!lista.length) { toast({ title: "Nenhum dado para exportar", variant: "destructive" }); return; }

    const header = [
      "Data", "PDV", "Operador", "Gerente", "Status",
      "Dinheiro Sistema", "Dinheiro Conferido", "Dinheiro Diferença",
      "Débito Sistema",   "Débito Conferido",   "Débito Diferença",
      "Crédito Sistema",  "Crédito Conferido",  "Crédito Diferença",
      "PIX Sistema",      "PIX Conferido",       "PIX Diferença",
      "Total Sistema",    "Total Conferido",    "Total Diferença",
      "Observações"
    ].join(";");

    const rows = lista.map(l => {
      const totalSistema   = FORMAS.reduce((s, f) => s + Number(l[`${f.key}_sistema`] || 0), 0);
      const totalConferido = FORMAS.reduce((s, f) => s + Number(l[`${f.key}_conferido`] ?? l[`${f.key}_sistema`] ?? 0), 0);
      return [
        l.data_referencia, l.numero_pdv,
        l.operador_nome || "", l.gerente_nome || "", l.status,
        ...FORMAS.flatMap(f => {
          const sis = Number(l[`${f.key}_sistema`] || 0);
          const con = Number(l[`${f.key}_conferido`] ?? sis);
          return [fmtNum(sis), fmtNum(con), fmtNum(con - sis)];
        }),
        fmtNum(totalSistema), fmtNum(totalConferido), fmtNum(totalConferido - totalSistema),
        l.observacoes || ""
      ].join(";");
    }).join("\n");

    baixar("\uFEFF" + header + "\n" + rows,
      `fechamento_caixa_${filtroInicio}_${filtroFim}.csv`, "text/csv;charset=utf-8");
    toast({ title: `CSV exportado — ${lista.length} registro(s)` });
  };

  const baixar = (conteudo: string, nome: string, tipo: string) => {
    const blob = new Blob([conteudo], { type: tipo });
    const a    = document.createElement("a");
    a.href     = URL.createObjectURL(blob);
    a.download = nome;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  // ── Cálculos de diferença ──────────────────────────────────────────────────
  const diferencas = sistema
    ? FORMAS.reduce((acc, f) => {
        const sis = Number(sistema[`${f.key}_sistema`] || 0);
        const con = parseFloat(conferido[f.key] || "0");
        acc[f.key] = con - sis;
        return acc;
      }, {} as Record<string, number>)
    : {};

  const totalSistema   = sistema ? FORMAS.reduce((s, f) => s + Number(sistema[`${f.key}_sistema`] || 0), 0) : 0;
  const totalConferido = sistema ? FORMAS.reduce((s, f) => s + parseFloat(conferido[f.key] || "0"), 0) : 0;
  const difTotal       = totalConferido - totalSistema;
  const temDivergencia = Math.abs(difTotal) > 0.005;

  // ══════════════════════════════════════════════════════════════════
  // VIEW: CONFERÊNCIA DO DIA
  // ══════════════════════════════════════════════════════════════════
  if (view === "conferir") {
    return (
      <Layout title="Fechamento de Caixa">
        <div className="space-y-4 max-w-2xl">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => setView("lista")}>
              <ChevronLeft className="w-4 h-4 mr-1" />Voltar
            </Button>
            <div>
              <h1 className="text-xl font-bold flex items-center gap-2">
                <ClipboardCheck className="w-5 h-5" /> Conferência de Caixa
              </h1>
              <p className="text-sm text-muted-foreground">
                {new Date(dataSel + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}
                {" · "} PDV {pdvSel}
                {sistema?.operador_nome && ` · Operador: ${sistema.operador_nome}`}
              </p>
            </div>
          </div>

          {/* Estatísticas do dia */}
          {sistema && (
            <div className="grid grid-cols-3 gap-3 text-center">
              <Card>
                <CardContent className="pt-3 pb-3">
                  <p className="text-xs text-muted-foreground">Vendas</p>
                  <p className="text-xl font-bold">{sistema.qtd_vendas || 0}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-3 pb-3">
                  <p className="text-xs text-muted-foreground">Total do dia</p>
                  <p className="text-xl font-bold text-green-600">{fmt(sistema.total_vendas)}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-3 pb-3">
                  <p className="text-xs text-muted-foreground">Descontos</p>
                  <p className="text-xl font-bold text-red-500">{fmt(sistema.total_descontos)}</p>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Tabela de conferência */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Conferência por Forma de Pagamento</CardTitle>
              <CardDescription>Preencha o valor conferido fisicamente / na maquininha</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-3 font-medium text-muted-foreground">Forma</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">SISTEMA</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">CONFERIDO</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">DIFERENÇA</th>
                    </tr>
                  </thead>
                  <tbody>
                    {FORMAS.map(f => {
                      const sis = sistema ? Number(sistema[`${f.key}_sistema`] || 0) : 0;
                      const dif = diferencas[f.key] || 0;
                      const Icon = f.icon;
                      return (
                        <tr key={f.key} className="border-b hover:bg-muted/30">
                          <td className="p-3">
                            <span className={`flex items-center gap-2 font-medium ${f.cor}`}>
                              <Icon className="w-4 h-4" />
                              {f.label}
                            </span>
                          </td>
                          <td className="p-3 text-right font-mono font-medium">{fmt(sis)}</td>
                          <td className="p-3 text-right">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={conferido[f.key] ?? ""}
                              onChange={e => setConferido(prev => ({ ...prev, [f.key]: e.target.value }))}
                              className="w-32 text-right font-mono px-2 py-1 border rounded-lg focus:outline-none focus:border-primary text-sm"
                            />
                          </td>
                          <td className={`p-3 text-right font-mono font-bold ${
                            Math.abs(dif) < 0.005 ? "text-green-600"
                            : dif > 0 ? "text-blue-600" : "text-red-600"
                          }`}>
                            {dif > 0.005 ? "+" : ""}{fmt(dif)}
                            {Math.abs(dif) < 0.005 && " ✓"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 font-bold">
                      <td className="p-3">TOTAL</td>
                      <td className="p-3 text-right font-mono">{fmt(totalSistema)}</td>
                      <td className="p-3 text-right font-mono">{fmt(totalConferido)}</td>
                      <td className={`p-3 text-right font-mono text-lg ${
                        temDivergencia ? (difTotal > 0 ? "text-blue-600" : "text-red-600") : "text-green-600"
                      }`}>
                        {difTotal > 0.005 ? "+" : ""}{fmt(difTotal)}
                        {!temDivergencia && " ✓"}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Status */}
              <div className={`mt-4 p-3 rounded-xl border flex items-center gap-2 text-sm font-medium ${
                temDivergencia
                  ? "bg-red-50 dark:bg-red-950/30 border-red-300 dark:border-red-800 text-red-700"
                  : "bg-green-50 dark:bg-green-950/30 border-green-300 dark:border-green-800 text-green-700"
              }`}>
                {temDivergencia
                  ? <><AlertTriangle className="w-4 h-4" /> Divergência detectada — registre a ocorrência nas observações</>
                  : <><CheckCircle className="w-4 h-4" /> Caixa fechado sem divergências</>
                }
              </div>

              {/* Observações */}
              <div className="mt-3">
                <Label className="text-xs">Observações (opcional)</Label>
                <input
                  type="text"
                  value={obs}
                  onChange={e => setObs(e.target.value)}
                  placeholder="Motivo da divergência, ocorrências do dia..."
                  className="w-full mt-1 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:border-primary"
                />
              </div>

              <div className="flex gap-2 justify-end mt-4">
                <Button variant="outline" onClick={() => setView("lista")}>Cancelar</Button>
                <Button onClick={salvar} disabled={saving}>
                  <Save className="w-4 h-4 mr-2" />
                  {saving ? "Salvando..." : "Salvar Fechamento"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  // ══════════════════════════════════════════════════════════════════
  // VIEW: LISTA DE FECHAMENTOS
  // ══════════════════════════════════════════════════════════════════
  return (
    <Layout title="Fechamento de Caixa">
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ClipboardCheck className="w-6 h-6" /> Fechamento de Caixa
          </h1>
          <Button onClick={() => abrirConferencia(hoje, pdvSel)} disabled={loading}>
            {loading ? "Carregando..." : <>+ Conferir Hoje (PDV {pdvSel})</>}
          </Button>
        </div>

        {/* Filtros + Ações */}
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex gap-3 flex-wrap items-end">
              <div>
                <Label className="text-xs">De</Label>
                <Input type="date" value={filtroInicio} onChange={e => setFiltroInicio(e.target.value)} className="h-8 w-36" />
              </div>
              <div>
                <Label className="text-xs">Até</Label>
                <Input type="date" value={filtroFim} onChange={e => setFiltroFim(e.target.value)} className="h-8 w-36" />
              </div>
              <div className="w-28">
                <Label className="text-xs">PDV</Label>
                <Input type="number" min="1" value={filtroPdv} onChange={e => setFiltroPdv(e.target.value)}
                  placeholder="Todos" className="h-8" />
              </div>
              <Button size="sm" variant="outline" onClick={carregarLista} disabled={loadingLista}>
                <Search className="w-3.5 h-3.5 mr-1" />Buscar
              </Button>

              <div className="flex gap-2 ml-auto">
                <Button size="sm" variant="outline" onClick={exportarCSV} disabled={!lista.length}>
                  <Download className="w-3.5 h-3.5 mr-1" />CSV
                </Button>
                <Button size="sm" variant="outline" onClick={exportarXML} disabled={!lista.length}>
                  <FileCode className="w-3.5 h-3.5 mr-1" />XML
                </Button>
              </div>
            </div>

            {/* Conferir data/PDV manualmente */}
            <div className="flex gap-2 mt-3 pt-3 border-t items-end">
              <div>
                <Label className="text-xs">Conferir data específica</Label>
                <Input type="date" value={dataSel} onChange={e => setDataSel(e.target.value)} className="h-8 w-36" />
              </div>
              <div className="w-24">
                <Label className="text-xs">PDV</Label>
                <Input type="number" min="1" value={pdvSel} onChange={e => setPdvSel(e.target.value)} className="h-8" />
              </div>
              <Button size="sm" onClick={() => abrirConferencia(dataSel, pdvSel)} disabled={loading}>
                <ClipboardCheck className="w-3.5 h-3.5 mr-1" />Conferir
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Tabela lista */}
        <Card>
          <CardContent className="pt-3 overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b">
                  {["Data","PDV","Operador","Gerente","Dinheiro","Débito","Crédito","PIX","Total Sis.","Total Conf.","Diferença","Status",""].map(h =>
                    <th key={h} className="text-left p-2 text-xs font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {loadingLista && <tr><td colSpan={13} className="text-center py-8 text-muted-foreground">Carregando...</td></tr>}
                {!loadingLista && lista.length === 0 && (
                  <tr><td colSpan={13} className="text-center py-8 text-muted-foreground">
                    Nenhum fechamento encontrado. Clique em "Conferir" para registrar.
                  </td></tr>
                )}
                {lista.map((l, i) => {
                  const totalSis = FORMAS.reduce((s, f) => s + Number(l[`${f.key}_sistema`] || 0), 0);
                  const totalCon = FORMAS.reduce((s, f) => s + Number(l[`${f.key}_conferido`] ?? l[`${f.key}_sistema`] ?? 0), 0);
                  const dif = totalCon - totalSis;
                  return (
                    <tr key={i} className="border-b hover:bg-muted/40">
                      <td className="p-2 font-mono text-xs font-medium">
                        {new Date(l.data_referencia + "T12:00:00").toLocaleDateString("pt-BR")}
                      </td>
                      <td className="p-2 text-center">{l.numero_pdv}</td>
                      <td className="p-2 text-xs">{l.operador_nome || "—"}</td>
                      <td className="p-2 text-xs">{l.gerente_nome || "—"}</td>
                      {FORMAS.map(f => {
                        const sis = Number(l[`${f.key}_sistema`] || 0);
                        const con = Number(l[`${f.key}_conferido`] ?? sis);
                        const d   = con - sis;
                        return (
                          <td key={f.key} className="p-2 text-xs">
                            <div className="font-mono">{fmt(sis)}</div>
                            {Math.abs(d) > 0.005 && (
                              <div className={`text-xs font-mono ${d > 0 ? "text-blue-500" : "text-red-500"}`}>
                                {d > 0 ? "+" : ""}{fmt(d)}
                              </div>
                            )}
                          </td>
                        );
                      })}
                      <td className="p-2 font-mono text-xs">{fmt(totalSis)}</td>
                      <td className="p-2 font-mono text-xs">{fmt(totalCon)}</td>
                      <td className={`p-2 font-mono text-xs font-bold ${Math.abs(dif) < 0.005 ? "text-green-600" : dif > 0 ? "text-blue-600" : "text-red-600"}`}>
                        {Math.abs(dif) < 0.005 ? "✓" : (dif > 0 ? "+" : "") + fmt(dif)}
                      </td>
                      <td className="p-2">
                        <Badge variant={l.status === "conferido" ? "default" : l.status === "divergente" ? "destructive" : "secondary"}
                          className="text-xs capitalize">{l.status}</Badge>
                      </td>
                      <td className="p-2">
                        <Button size="sm" variant="ghost" className="h-7 text-xs"
                          onClick={() => abrirConferencia(l.data_referencia, String(l.numero_pdv))}>
                          Rever
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>

        {!loadingLista && lista.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {lista.length} registro(s) · {lista.filter(l => l.status === "divergente").length} com divergência
          </p>
        )}
      </div>
    </Layout>
  );
}
