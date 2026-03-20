/**
 * ASTIA PDV — Importação de dados do SisAdven PDV
 * Suporta: CSV exportado do Access (Arqdados.mdb)
 * Campos mapeados: produto, clientes, fornecedores
 */
import { useState } from "react";
import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { produtosAPI, clientesAPI } from "@/lib/api";
import { Upload, CheckCircle2, AlertTriangle, FileText, RefreshCw, Package, Users } from "lucide-react";

// ─── Parser de CSV genérico ────────────────────────────────────────────────────
function parseCSV(text: string): Record<string, string>[] {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  if (lines.length < 2) return [];
  const headers = lines[0].split(";").map(h =>
    h.replace(/^["']|["']$/g, "").trim().toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, "_")
  );
  return lines.slice(1).filter(l => l.trim()).map(line => {
    const values = line.split(";").map(v => v.replace(/^["']|["']$/g, "").trim());
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = values[i] || ""; });
    return row;
  });
}

// ─── Mapeia campos do SisAdven para ASTIA ────────────────────────────────────
function mapProduto(row: Record<string, string>) {
  // Possíveis nomes de colunas do SisAdven
  const nome = row.descricao || row.nome || row.produto || row.descr || row.produtodescric || "";
  const codigo = row.codigo || row.cod || row.codigoproduto || row.produtocodigo || "";
  const preco_venda = parseFloat((row.preco || row.precovenda || row.valor || row.preco_venda || "0").replace(",", ".")) || 0;
  const preco_custo = parseFloat((row.custo || row.precocusto || row.valorcompras || row.preco_custo || "0").replace(",", ".")) || 0;
  const estoque = parseFloat((row.estoque || row.qtd || row.quantidade || row.saldo || "0").replace(",", ".")) || 0;
  const marca = row.marca || row.fabricante || "";
  const unidade = row.unidade || row.un || row.und || "UN";
  const codigo_barras = row.codigobarras || row.ean || row.barcode || row.cod_barras || "";
  const data_validade = row.validade || row.data_validade || row.vencimento || "";
  const lucro_pct = preco_custo > 0 && preco_venda > 0
    ? ((preco_venda - preco_custo) / preco_custo * 100)
    : 0;
  return {
    nome: nome.trim(),
    sku: codigo.trim(),
    codigo_barras: codigo_barras.trim(),
    preco_venda,
    preco_custo,
    estoque_atual: Math.round(estoque),
    estoque_minimo: 5,
    unidade_medida: unidade.toUpperCase().slice(0, 5) || "UN",
    descricao: marca ? `Marca: ${marca}` : "",
    ativo: 1,
    permitir_venda_sem_estoque: 1,
    percentual_lucro: parseFloat(lucro_pct.toFixed(1)),
    data_validade: data_validade || null,
    codigo_lote: row.lote || null,
  };
}

function mapCliente(row: Record<string, string>) {
  const nome = row.nome || row.razaosocial || row.cliente || row.nomecliente || "";
  const cpf = (row.cpf || "").replace(/\D/g, "");
  const cnpj = (row.cnpj || "").replace(/\D/g, "");
  const tel = row.telefone || row.tel || row.celular || row.fone || "";
  const email = row.email || row.mail || "";
  const cidade = row.cidade || "";
  const bairro = row.bairro || "";
  const logradouro = row.endereco || row.logradouro || row.rua || "";
  return {
    nome: nome.trim(),
    cpf: cpf || null,
    cnpj: cnpj || null,
    telefone: tel.replace(/\D/g, "").slice(0, 15) || null,
    email: email || null,
    cidade: cidade || null,
    bairro: bairro || null,
    logradouro: logradouro || null,
    ativo: 1,
  };
}

// ─── Componente principal ──────────────────────────────────────────────────────
export default function Importacao() {
  const { toast } = useToast();
  const [step, setStep] = useState<"idle"|"preview"|"importing"|"done">("idle");
  const [tipo, setTipo] = useState<"produtos"|"clientes">("produtos");
  const [rows, setRows] = useState<any[]>([]);
  const [erros, setErros] = useState<string[]>([]);
  const [importados, setImportados] = useState(0);
  const [total, setTotal] = useState(0);
  const [fileName, setFileName] = useState("");

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = ev => {
      const text = ev.target?.result as string;
      const parsed = parseCSV(text);
      if (parsed.length === 0) {
        toast({ title: "Arquivo vazio ou formato inválido", description: "Use CSV separado por ponto-e-vírgula (;)", variant: "destructive" });
        return;
      }
      // Auto-detect tipo
      const cols = Object.keys(parsed[0]).join(" ");
      if (cols.includes("preco") || cols.includes("estoque") || cols.includes("produto") || cols.includes("descricao")) {
        setTipo("produtos");
      } else if (cols.includes("nome") || cols.includes("cpf") || cols.includes("cliente")) {
        setTipo("clientes");
      }
      const mapped = parsed.map(tipo === "clientes" ? mapCliente : mapProduto)
        .filter(r => r.nome && r.nome.length > 1);
      setRows(mapped);
      setStep("preview");
    };
    reader.readAsText(file, "latin1");
    e.target.value = "";
  };

  const importar = async () => {
    setStep("importing");
    setErros([]);
    setImportados(0);
    setTotal(rows.length);
    const novosErros: string[] = [];
    let ok = 0;
    for (let i = 0; i < rows.length; i++) {
      try {
        if (tipo === "produtos") await produtosAPI.criar(rows[i]);
        else await clientesAPI.criar(rows[i]);
        ok++;
        setImportados(ok);
      } catch (e: any) {
        novosErros.push(`Linha ${i+1} (${rows[i].nome}): ${e.message}`);
        if (novosErros.length > 20) break;
      }
    }
    setErros(novosErros);
    setImportados(ok);
    setStep("done");
    toast({ title: `✅ ${ok} de ${rows.length} registros importados!` });
  };

  const resetar = () => { setStep("idle"); setRows([]); setErros([]); setImportados(0); setFileName(""); };

  const INSTRUCOES = [
    { titulo: "Exportar do SisAdven", passos: [
      "Abra o SisAdven PDV",
      "Vá em Cadastro → Produtos (ou Clientes)",
      "Clique em Relatório → Exportar → Excel/CSV",
      "Salve como CSV separado por ponto-e-vírgula (;)",
      "Escolha codificação Latin-1 ou ANSI",
    ]},
    { titulo: "Exportar direto do Access", passos: [
      "Abra o arquivo Arqdados.mdb no Microsoft Access",
      "Clique com botão direito na tabela (Produtos/Clientes)",
      "Selecione Exportar → Arquivo de Texto",
      "Escolha Delimitado, separador: ponto-e-vírgula (;)",
      "Marque 'Incluir nomes dos campos na primeira linha'",
    ]},
  ];

  return (
    <Layout title="Importação de Dados">
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Upload className="w-6 h-6 text-violet-600" /> Importação de Dados
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Importe produtos e clientes do SisAdven PDV ou qualquer CSV
          </p>
        </div>

        {/* IDLE */}
        {step === "idle" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              {[
                { id: "produtos", label: "Produtos", icon: Package, desc: "Cadastro de produtos com preços e estoque" },
                { id: "clientes", label: "Clientes", icon: Users, desc: "Cadastro de clientes e fornecedores" },
              ].map(opt => (
                <button key={opt.id} onClick={() => setTipo(opt.id as any)}
                  className={`p-4 rounded-xl border-2 text-left transition-all ${tipo === opt.id ? "border-violet-500 bg-violet-50 dark:bg-violet-950/20" : "border-border hover:border-muted-foreground"}`}>
                  <opt.icon className={`w-6 h-6 mb-2 ${tipo === opt.id ? "text-violet-600" : "text-muted-foreground"}`} />
                  <p className="font-semibold">{opt.label}</p>
                  <p className="text-xs text-muted-foreground mt-1">{opt.desc}</p>
                </button>
              ))}
            </div>

            <label className="flex flex-col items-center justify-center w-full h-40 border-2 border-dashed border-violet-300 dark:border-violet-700 rounded-xl cursor-pointer hover:bg-violet-50 dark:hover:bg-violet-950/10 transition-colors">
              <Upload className="w-8 h-8 text-violet-400 mb-2" />
              <p className="font-semibold text-violet-600">Selecionar arquivo CSV</p>
              <p className="text-xs text-muted-foreground mt-1">Separado por ponto-e-vírgula (;) · Codificação Latin-1</p>
              <input type="file" accept=".csv,.txt" className="hidden" onChange={handleFile} />
            </label>

            <div className="space-y-3">
              {INSTRUCOES.map(inst => (
                <div key={inst.titulo} className="p-4 bg-muted/30 rounded-xl border">
                  <p className="font-semibold text-sm mb-2 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-violet-600" /> {inst.titulo}
                  </p>
                  <ol className="list-decimal list-inside space-y-1">
                    {inst.passos.map((p, i) => <li key={i} className="text-xs text-muted-foreground">{p}</li>)}
                  </ol>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* PREVIEW */}
        {step === "preview" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold">{fileName}</p>
                <p className="text-sm text-muted-foreground">{rows.length} registros encontrados para importar como <strong>{tipo}</strong></p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={resetar}>Cancelar</Button>
                <Button onClick={importar} className="bg-violet-600 hover:bg-violet-700 text-white">
                  Importar {rows.length} registros
                </Button>
              </div>
            </div>
            <div className="rounded-xl border overflow-auto max-h-96">
              <table className="w-full text-xs">
                <thead className="bg-muted/60 sticky top-0">
                  <tr>
                    {tipo === "produtos"
                      ? ["Nome","Código","Preço Venda","Preço Custo","Lucro %","Estoque","Validade"].map(h => <th key={h} className="p-2 text-left font-semibold">{h}</th>)
                      : ["Nome","CPF/CNPJ","Telefone","Email","Cidade"].map(h => <th key={h} className="p-2 text-left font-semibold">{h}</th>)
                    }
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 50).map((r, i) => (
                    <tr key={i} className="border-t hover:bg-muted/30">
                      {tipo === "produtos" ? <>
                        <td className="p-2 font-medium max-w-32 truncate">{r.nome}</td>
                        <td className="p-2 font-mono">{r.sku || "—"}</td>
                        <td className="p-2">R$ {Number(r.preco_venda).toFixed(2)}</td>
                        <td className="p-2">R$ {Number(r.preco_custo).toFixed(2)}</td>
                        <td className="p-2">
                          <span className={`font-bold ${r.percentual_lucro < 10 ? "text-red-500" : r.percentual_lucro < 30 ? "text-yellow-500" : "text-green-500"}`}>
                            {Number(r.percentual_lucro).toFixed(1)}%
                          </span>
                        </td>
                        <td className="p-2">{r.estoque_atual}</td>
                        <td className="p-2">{r.data_validade || "—"}</td>
                      </> : <>
                        <td className="p-2 font-medium max-w-32 truncate">{r.nome}</td>
                        <td className="p-2 font-mono">{r.cpf || r.cnpj || "—"}</td>
                        <td className="p-2">{r.telefone || "—"}</td>
                        <td className="p-2">{r.email || "—"}</td>
                        <td className="p-2">{r.cidade || "—"}</td>
                      </>}
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length > 50 && <p className="p-2 text-xs text-muted-foreground text-center">Mostrando 50 de {rows.length} registros</p>}
            </div>
          </div>
        )}

        {/* IMPORTING */}
        {step === "importing" && (
          <div className="text-center py-16 space-y-4">
            <RefreshCw className="w-12 h-12 mx-auto text-violet-600 animate-spin" />
            <p className="font-semibold text-lg">Importando...</p>
            <p className="text-muted-foreground">{importados} de {total} registros</p>
            <div className="w-full max-w-sm mx-auto bg-muted rounded-full h-2">
              <div className="bg-violet-600 h-2 rounded-full transition-all" style={{ width: `${total ? (importados/total*100) : 0}%` }} />
            </div>
          </div>
        )}

        {/* DONE */}
        {step === "done" && (
          <div className="space-y-4">
            <div className="p-6 bg-green-50 dark:bg-green-950/30 border border-green-300 dark:border-green-700 rounded-xl text-center">
              <CheckCircle2 className="w-12 h-12 text-green-600 mx-auto mb-3" />
              <p className="font-bold text-lg text-green-700 dark:text-green-300">Importação concluída!</p>
              <p className="text-muted-foreground mt-1">{importados} de {total} {tipo} importados com sucesso</p>
            </div>
            {erros.length > 0 && (
              <div className="p-4 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl">
                <p className="font-semibold text-red-700 dark:text-red-300 flex items-center gap-2 mb-2">
                  <AlertTriangle className="w-4 h-4" /> {erros.length} erro(s)
                </p>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {erros.map((e, i) => <p key={i} className="text-xs text-red-600 font-mono">{e}</p>)}
                </div>
              </div>
            )}
            <Button onClick={resetar} className="w-full">Nova Importação</Button>
          </div>
        )}
      </div>
    </Layout>
  );
}
