/**
 * ASTIA PDV — Gerador Local de XML NF-e / NFC-e e DANFE
 *
 * Gera o XML no formato oficial SEFAZ NT 2024 e renderiza o DANFE
 * em HTML/PDF diretamente no navegador — SEM enviar para SEFAZ.
 *
 * Quando estiver pronto para produção:
 *   1. Assinar o XML com o certificado (node-forge ou xmldsig)
 *   2. Enviar ao webservice SEFAZ ou Focus NF-e
 *   3. Substituir a chave fake pela chave real retornada
 *
 * Status: SIMULADO — para testes visuais e validação de dados
 */

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Formata CNPJ: 00000000000000 → 00.000.000/0001-00 */
function fmtCNPJ(s: string) {
  const n = s.replace(/\D/g, "");
  return n.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
}

/** Formata CPF: 00000000000 → 000.000.000-00 */
function fmtCPF(s: string) {
  const n = s.replace(/\D/g, "");
  return n.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
}

/** Moeda BR */
const fmt2 = (v: number) => Number(v || 0).toFixed(2);
const fmtBR = (v: number) => Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 });

/** Gera uma chave de acesso fake de 44 dígitos (apenas para simulação) */
function gerarChaveFake(cnpj: string, serie: number, numero: number, uf = "35"): string {
  const now = new Date();
  const aamm = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const cnpjClean = cnpj.replace(/\D/g, "").padStart(14, "0");
  const serieFmt = String(serie).padStart(3, "0");
  const numFmt = String(numero).padStart(9, "0");
  const nNF = "55"; // modelo NF-e
  const base = `${uf}${aamm}${cnpjClean}${nNF}${serieFmt}${numFmt}1${Math.floor(Math.random() * 9e8).toString().padStart(9, "0")}`;
  // Calculo simplificado do dígito verificador (módulo 11)
  let sum = 0, mul = 2;
  for (let i = base.length - 1; i >= 0; i--) {
    sum += parseInt(base[i]) * mul;
    mul = mul === 9 ? 2 : mul + 1;
  }
  const rem = sum % 11;
  const dv = rem < 2 ? 0 : 11 - rem;
  return base + dv;
}

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface Emitente {
  razao_social: string;
  cnpj: string;
  inscricao_estadual: string;
  logradouro: string;
  numero: string;
  bairro: string;
  cidade: string;
  estado: string;  // UF
  cep: string;
  telefone?: string;
  email?: string;
  regime_tributario: "1" | "2" | "3"; // 1=Simples, 2=Presumido, 3=Real
}

export interface Destinatario {
  nome: string;
  cpf?: string;
  cnpj?: string;
  email?: string;
  logradouro?: string;
  cidade?: string;
  estado?: string;
  cep?: string;
  indicador_ie?: "1" | "2" | "9"; // 1=contribuinte, 2=isento, 9=não contribuinte
}

export interface ItemNFe {
  numero: number;
  codigo: string;
  descricao: string;
  ncm: string;
  cfop: string;
  unidade: string;
  quantidade: number;
  valor_unitario: number;
  valor_total: number;
  cst_icms: string;  // CSOSN para Simples: 102, 400, 500... CST para outros: 00, 20, 40...
  aliquota_icms: number;
  cst_pis: string;
  aliquota_pis: number;
  cst_cofins: string;
  aliquota_cofins: number;
}

export interface DadosNFe {
  tipo: "nfe" | "nfce";       // 55=NF-e, 65=NFC-e
  numero: number;              // Número da nota (sequencial)
  serie: number;
  chave?: string;              // Preenchida após autorização SEFAZ
  ambiente: "homologacao" | "producao";
  natureza_operacao: string;   // Ex: "VENDA AO CONSUMIDOR"
  data_emissao: string;        // ISO datetime
  forma_pagamento: string;
  valor_total: number;
  valor_desconto: number;
  troco?: number;
  emitente: Emitente;
  destinatario?: Destinatario;
  itens: ItemNFe[];
  informacoes_adicionais?: string;
}

// ─── Gerador de XML ───────────────────────────────────────────────────────────

export function gerarXMLNFe(dados: DadosNFe): string {
  const modelo = dados.tipo === "nfce" ? "65" : "55";
  const uf = dados.emitente.estado === "SP" ? "35" :
             dados.emitente.estado === "MG" ? "31" :
             dados.emitente.estado === "RJ" ? "33" :
             dados.emitente.estado === "RS" ? "43" :
             dados.emitente.estado === "PR" ? "41" : "35";

  const chave = dados.chave || gerarChaveFake(dados.emitente.cnpj, dados.serie, dados.numero, uf);
  const cnpjLimpo = dados.emitente.cnpj.replace(/\D/g, "");
  const dt = new Date(dados.data_emissao);
  const dtFmt = dt.toISOString().replace("Z", "-03:00").slice(0, 22) + ":00";

  const vBC    = fmt2(dados.itens.reduce((s, i) => s + (i.aliquota_icms > 0 ? i.valor_total : 0), 0));
  const vICMS  = fmt2(dados.itens.reduce((s, i) => s + (i.valor_total * i.aliquota_icms / 100), 0));
  const vPIS   = fmt2(dados.itens.reduce((s, i) => s + (i.valor_total * i.aliquota_pis / 100), 0));
  const vCOFINS = fmt2(dados.itens.reduce((s, i) => s + (i.valor_total * i.aliquota_cofins / 100), 0));
  const vProd  = fmt2(dados.itens.reduce((s, i) => s + i.valor_total, 0));
  const vDesc  = fmt2(dados.valor_desconto || 0);
  const vNF    = fmt2(dados.valor_total);

  const mapaPag: Record<string, string> = {
    dinheiro: "01", credito: "03", debito: "04", pix: "17", voucher: "05", crediario: "99"
  };
  const tPag = mapaPag[dados.forma_pagamento] || "01";
  const vTroco = dados.troco && dados.troco > 0 ? `<vTroco>${fmt2(dados.troco)}</vTroco>` : "";

  // Itens
  const xmlItens = dados.itens.map(item => {
    const vBCItem = item.aliquota_icms > 0 ? `<vBC>${fmt2(item.valor_total)}</vBC><pICMS>${fmt2(item.aliquota_icms)}</pICMS><vICMS>${fmt2(item.valor_total * item.aliquota_icms / 100)}</vICMS>` : "";
    const isSimples = ["102","103","300","400","500","102","201","202","203","300","400","500"].includes(item.cst_icms);
    const tagICMS = isSimples ? "CSOSN" : "CST";

    return `<det nItem="${item.numero}">
  <prod>
    <cProd>${item.codigo}</cProd>
    <cEAN>SEM GTIN</cEAN>
    <xProd>${item.descricao.replace(/&/g,"&amp;").replace(/</g,"&lt;")}</xProd>
    <NCM>${item.ncm.replace(/\D/g,"").padStart(8,"0")}</NCM>
    <CFOP>${item.cfop}</CFOP>
    <uCom>${item.unidade || "UN"}</uCom>
    <qCom>${fmt2(item.quantidade)}</qCom>
    <vUnCom>${item.valor_unitario.toFixed(10)}</vUnCom>
    <vProd>${fmt2(item.valor_total)}</vProd>
    <cEANTrib>SEM GTIN</cEANTrib>
    <uTrib>${item.unidade || "UN"}</uTrib>
    <qTrib>${fmt2(item.quantidade)}</qTrib>
    <vUnTrib>${item.valor_unitario.toFixed(10)}</vUnTrib>
    <indTot>1</indTot>
  </prod>
  <imposto>
    <ICMS><${isSimples ? "ICMSSN400" : "ICMS00"}>
      <orig>0</orig>
      <${tagICMS}>${item.cst_icms}</${tagICMS}>
      ${vBCItem}
    </${isSimples ? "ICMSSN400" : "ICMS00"}></ICMS>
    <PIS><PIS${item.cst_pis === "07" || item.cst_pis === "08" ? "NT" : "Aliq"}>
      <CST>${item.cst_pis}</CST>
      ${item.cst_pis !== "07" ? `<vBC>${fmt2(item.valor_total)}</vBC><pPIS>${fmt2(item.aliquota_pis)}</pPIS><vPIS>${fmt2(item.valor_total * item.aliquota_pis / 100)}</vPIS>` : ""}
    </PIS${item.cst_pis === "07" || item.cst_pis === "08" ? "NT" : "Aliq"}></PIS>
    <COFINS><COFINS${item.cst_cofins === "07" || item.cst_cofins === "08" ? "NT" : "Aliq"}>
      <CST>${item.cst_cofins}</CST>
      ${item.cst_cofins !== "07" ? `<vBC>${fmt2(item.valor_total)}</vBC><pCOFINS>${fmt2(item.aliquota_cofins)}</pCOFINS><vCOFINS>${fmt2(item.valor_total * item.aliquota_cofins / 100)}</vCOFINS>` : ""}
    </COFINS${item.cst_cofins === "07" || item.cst_cofins === "08" ? "NT" : "Aliq"}></COFINS>
  </imposto>
</det>`;
  }).join("\n");

  // Destinatário
  const destXml = dados.destinatario ? `
  <dest>
    ${dados.destinatario.cnpj ? `<CNPJ>${dados.destinatario.cnpj.replace(/\D/g,"")}</CNPJ>` : dados.destinatario.cpf ? `<CPF>${dados.destinatario.cpf.replace(/\D/g,"")}</CPF>` : "<idEstrangeiro>EX</idEstrangeiro>"}
    <xNome>${(dados.destinatario.nome || "CONSUMIDOR FINAL").replace(/&/g,"&amp;")}</xNome>
    <indIEDest>${dados.destinatario.indicador_ie || "9"}</indIEDest>
    ${dados.destinatario.email ? `<email>${dados.destinatario.email}</email>` : ""}
  </dest>` : `
  <dest>
    <CPF>00000000000</CPF>
    <xNome>CONSUMIDOR FINAL</xNome>
    <indIEDest>9</indIEDest>
  </dest>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- DOCUMENTO SIMULADO — NÃO AUTORIZADO PELA SEFAZ — APENAS PARA TESTES -->
<nfeProc versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe">
<NFe xmlns="http://www.portalfiscal.inf.br/nfe">
<infNFe versao="4.00" Id="NFe${chave}">
<ide>
  <cUF>${uf}</cUF>
  <cNF>${chave.slice(35, 43)}</cNF>
  <natOp>${dados.natureza_operacao}</natOp>
  <mod>${modelo}</mod>
  <serie>${dados.serie}</serie>
  <nNF>${dados.numero}</nNF>
  <dhEmi>${dtFmt}</dhEmi>
  <tpNF>1</tpNF>
  <idDest>1</idDest>
  <cMunFG>${dados.emitente.estado === "SP" ? "3550308" : "0000000"}</cMunFG>
  <tpImp>${dados.tipo === "nfce" ? "4" : "1"}</tpImp>
  <tpEmis>1</tpEmis>
  <cDV>${chave.slice(-1)}</cDV>
  <tpAmb>${dados.ambiente === "producao" ? "1" : "2"}</tpAmb>
  <finNFe>1</finNFe>
  <indFinal>1</indFinal>
  <indPres>1</indPres>
  <procEmi>0</procEmi>
  <verProc>ASTIA PDV 1.0</verProc>
</ide>
<emit>
  <CNPJ>${cnpjLimpo}</CNPJ>
  <xNome>${dados.emitente.razao_social.replace(/&/g,"&amp;")}</xNome>
  <enderEmit>
    <xLgr>${dados.emitente.logradouro.replace(/&/g,"&amp;")}</xLgr>
    <nro>${dados.emitente.numero}</nro>
    <xBairro>${dados.emitente.bairro.replace(/&/g,"&amp;")}</xBairro>
    <cMun>${dados.emitente.estado === "SP" ? "3550308" : "0000000"}</cMun>
    <xMun>${dados.emitente.cidade.replace(/&/g,"&amp;")}</xMun>
    <UF>${dados.emitente.estado}</UF>
    <CEP>${dados.emitente.cep.replace(/\D/g,"")}</CEP>
    <cPais>1058</cPais>
    <xPais>Brasil</xPais>
    ${dados.emitente.telefone ? `<fone>${dados.emitente.telefone.replace(/\D/g,"")}</fone>` : ""}
  </enderEmit>
  <IE>${dados.emitente.inscricao_estadual.replace(/\D/g,"")}</IE>
  <CRT>${dados.emitente.regime_tributario}</CRT>
</emit>
${destXml}
${xmlItens}
<total>
  <ICMSTot>
    <vBC>${vBC}</vBC>
    <vICMS>${vICMS}</vICMS>
    <vICMSDeson>0.00</vICMSDeson>
    <vFCP>0.00</vFCP>
    <vBCST>0.00</vBCST>
    <vST>0.00</vST>
    <vFCPST>0.00</vFCPST>
    <vFCPSTRet>0.00</vFCPSTRet>
    <vProd>${vProd}</vProd>
    <vFrete>0.00</vFrete>
    <vSeg>0.00</vSeg>
    <vDesc>${vDesc}</vDesc>
    <vII>0.00</vII>
    <vIPI>0.00</vIPI>
    <vIPIDevol>0.00</vIPIDevol>
    <vPIS>${vPIS}</vPIS>
    <vCOFINS>${vCOFINS}</vCOFINS>
    <vOutro>0.00</vOutro>
    <vNF>${vNF}</vNF>
  </ICMSTot>
</total>
<transp>
  <modFrete>9</modFrete>
</transp>
<pag>
  <detPag>
    <tPag>${tPag}</tPag>
    <vPag>${vNF}</vPag>
    ${vTroco}
  </detPag>
</pag>
${dados.informacoes_adicionais ? `<infAdic><infCpl>${dados.informacoes_adicionais.replace(/&/g,"&amp;")}</infCpl></infAdic>` : ""}
</infNFe>
<!-- ASSINATURA DIGITAL PENDENTE — NECESSÁRIO CERTIFICADO DIGITAL A1 PARA ENVIO À SEFAZ -->
<Signature xmlns="http://www.w3.org/2000/09/xmldsig#">
  <SignedInfo><CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/>
  <SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"/>
  <Reference URI="#NFe${chave}"><Transforms><Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"/><Transform Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/></Transforms>
  <DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/><DigestValue>SIMULADO</DigestValue></Reference></SignedInfo>
  <SignatureValue>SIMULADO_SEM_CERTIFICADO</SignatureValue>
</Signature>
</NFe>
</nfeProc>`;
}

// ─── Gerador de DANFE HTML ────────────────────────────────────────────────────


// ─── Cupom NFC-e (80mm — modelo compacto para impressora térmica) ─────────────
export function gerarCupomNFCe(dados: DadosNFe): string {
  const chave = dados.chave || gerarChaveFake(dados.emitente.cnpj, dados.serie, dados.numero);
  const dt = new Date(dados.data_emissao);
  const dtBR = dt.toLocaleDateString("pt-BR") + " " + dt.toLocaleTimeString("pt-BR");
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(chave)}&bgcolor=ffffff&color=000000&margin=4`;
  const mapaPag: Record<string, string> = { dinheiro:"DINHEIRO",credito:"CARTÃO CRÉDITO",debito:"CARTÃO DÉBITO",pix:"PIX",voucher:"VOUCHER",crediario:"CREDIÁRIO" };
  const pagLabel = mapaPag[dados.forma_pagamento] || dados.forma_pagamento.toUpperCase();
  const vPago = dados.valor_total + (dados.troco || 0);

  const linhasItens = dados.itens.map(i => `
    <div class="item">
      <div class="item-nome">${i.descricao}</div>
      <div class="item-detalhe">
        <span>${i.quantidade.toFixed(3)} x R$ ${fmtBR(i.valor_unitario)}</span>
        <span class="item-total">R$ ${fmtBR(i.valor_total)}</span>
      </div>
    </div>`).join("");

  return `<!DOCTYPE html><html lang="pt-BR"><head>
<meta charset="UTF-8">
<title>NFC-e ${String(dados.numero).padStart(8,"0")}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Courier New',Courier,monospace;font-size:11px;background:#fff;color:#000;width:302px;margin:0 auto;padding:8px 4px}
  .c{text-align:center}.b{font-weight:bold}.sep{border-top:1px dashed #000;margin:6px 0}
  .title-nfce{font-size:18px;font-weight:900;letter-spacing:2px}
  .title-danfe{font-size:13px;font-weight:900;text-align:right}
  .header-row{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:4px}
  .emitente{flex:1}
  .emitente .nome{font-size:13px;font-weight:900;text-transform:uppercase}
  .emitente .cnpj{font-size:10px}
  .numero-row{display:flex;justify-content:space-between;align-items:center;margin:4px 0}
  .numero-box{border:1px solid #000;padding:2px 8px;font-size:13px;font-weight:900;font-family:monospace;letter-spacing:2px}
  .numero-label{font-size:9px;font-weight:bold;text-transform:uppercase;color:#555}
  .item{margin:3px 0}
  .item-nome{font-weight:bold;font-size:11px;text-transform:uppercase}
  .item-detalhe{display:flex;justify-content:space-between;font-size:10px}
  .item-total{font-weight:bold}
  .total-row{display:flex;justify-content:space-between;font-size:14px;font-weight:900;margin:4px 0}
  .pag-row{display:flex;justify-content:space-between;font-size:11px;margin:2px 0}
  .troco-row{display:flex;justify-content:space-between;font-size:11px;margin:2px 0}
  .chave{font-family:monospace;font-size:8px;word-break:break-all;text-align:center;margin:4px 0;line-height:1.4}
  .aviso{background:#ff0;color:#000;font-size:9px;font-weight:bold;text-align:center;padding:2px;margin:3px 0}
  .qr{text-align:center;margin:6px 0}
  @media print{@page{margin:3mm;size:80mm auto}body{width:100%;padding:0}}
</style></head><body>

${dados.ambiente === "homologacao" ? '<div class="aviso">*** HOMOLOGAÇÃO — SEM VALOR FISCAL ***</div>' : ""}

<div class="header-row">
  <div class="emitente">
    <div class="nome">${dados.emitente.razao_social}</div>
    <div class="cnpj">${fmtCNPJ(dados.emitente.cnpj)}</div>
  </div>
  <div>
    <div class="title-nfce">NFCE</div>
    <div class="title-danfe">DANFE<br>NFC-e</div>
  </div>
</div>

<div class="numero-row">
  <span class="numero-label">NÚMERO</span>
  <span class="numero-box">${String(dados.numero).padStart(8,"0")}</span>
</div>

<div class="sep"></div>

${linhasItens}

<div class="sep"></div>

<div class="total-row"><span>TOTAL</span><span>R$ ${fmtBR(dados.valor_total)}</span></div>
<div class="pag-row"><span>${pagLabel}</span><span>R$ ${fmtBR(vPago)}</span></div>
${dados.troco && dados.troco > 0 ? `<div class="troco-row"><span>TROCO</span><span>R$ ${fmtBR(dados.troco)}</span></div>` : ""}
${dados.destinatario?.cpf ? `<div class="pag-row"><span>CPF</span><span>${fmtCPF(dados.destinatario.cpf)}</span></div>` : ""}

<div class="sep"></div>

<div class="c" style="font-size:9px;margin-bottom:2px">Chave de Acesso</div>
<div class="chave">${chave}</div>

<div class="c" style="font-size:8px;color:#555;margin:2px 0">
  Consulte em: <b>nfe.fazenda.gov.br</b>
</div>

<div class="qr">
  <img src="${qrCodeUrl}" width="150" height="150" alt="QR Code" onerror="this.style.display='none'">
</div>

<div class="sep"></div>
<div class="c" style="font-size:9px">ASTIA PDV by VYN Developer</div>
<div class="c" style="font-size:8px;color:#555">Série ${dados.serie} — ${dtBR}</div>

<script>window.onload=()=>setTimeout(()=>window.print(),500)</script>
</body></html>`;
}

// ─── DANFE A4 completo (NF-e) ─────────────────────────────────────────────────
export function gerarDANFE(dados: DadosNFe): string {
  // NFC-e usa o cupom compacto; NF-e usa o A4
  if (dados.tipo === "nfce") return gerarCupomNFCe(dados);

  const chave = dados.chave || gerarChaveFake(dados.emitente.cnpj, dados.serie, dados.numero);
  const chaveFormatada = chave.replace(/(\d{4})/g, "$1 ").trim();
  const dt = new Date(dados.data_emissao);
  const dtBR = dt.toLocaleDateString("pt-BR") + " " + dt.toLocaleTimeString("pt-BR");
  const modelo = dados.tipo === "nfce" ? "65" : "55";
  const tipoLabel = dados.tipo === "nfce" ? "NFC-e" : "NF-e";
  const ambienteLabel = dados.ambiente === "producao" ? "" : `<div style="text-align:center;background:#ff0;color:#000;font-size:10px;font-weight:bold;padding:2px;margin-bottom:4px">*** AMBIENTE DE HOMOLOGAÇÃO — SEM VALOR FISCAL ***</div>`;

  const linhasItens = dados.itens.map(i => `
  <tr>
    <td style="padding:3px 4px;border-bottom:1px solid #ddd">${i.codigo}<br><span style="font-size:9px;color:#666">${i.ncm} | ${i.cfop}</span></td>
    <td style="padding:3px 4px;border-bottom:1px solid #ddd">${i.descricao}</td>
    <td style="padding:3px 4px;border-bottom:1px solid #ddd;text-align:center">${i.unidade || "UN"}</td>
    <td style="padding:3px 4px;border-bottom:1px solid #ddd;text-align:center">${i.quantidade.toFixed(2)}</td>
    <td style="padding:3px 4px;border-bottom:1px solid #ddd;text-align:right">R$ ${fmtBR(i.valor_unitario)}</td>
    <td style="padding:3px 4px;border-bottom:1px solid #ddd;text-align:right"><strong>R$ ${fmtBR(i.valor_total)}</strong></td>
  </tr>`).join("");

  const vBC    = dados.itens.reduce((s, i) => s + (i.aliquota_icms > 0 ? i.valor_total : 0), 0);
  const vICMS  = dados.itens.reduce((s, i) => s + (i.valor_total * i.aliquota_icms / 100), 0);
  const vPIS   = dados.itens.reduce((s, i) => s + (i.valor_total * i.aliquota_pis / 100), 0);
  const vCOFINS = dados.itens.reduce((s, i) => s + (i.valor_total * i.aliquota_cofins / 100), 0);

  const mapaPagLabel: Record<string, string> = {
    "01":"Dinheiro","03":"Cartão de Crédito","04":"Cartão de Débito","17":"PIX","05":"Voucher","99":"Outros"
  };
  const mapaPag: Record<string, string> = {
    dinheiro:"01",credito:"03",debito:"04",pix:"17",voucher:"05",crediario:"99"
  };
  const tPag = mapaPag[dados.forma_pagamento] || "01";
  const pagLabel = mapaPagLabel[tPag] || dados.forma_pagamento;

  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(chave)}&bgcolor=ffffff&color=000000&margin=4`;

  return `<!DOCTYPE html>
<html lang="pt-BR"><head>
<meta charset="UTF-8">
<title>DANFE ${tipoLabel} ${String(dados.numero).padStart(9,"0")}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:Arial,Helvetica,sans-serif;font-size:10px;color:#000;background:#fff;padding:10px}
  .danfe{max-width:210mm;margin:0 auto;border:1px solid #000;padding:6px}
  .header{display:flex;gap:8px;border-bottom:1px solid #000;padding-bottom:6px;margin-bottom:6px}
  .logo-box{width:100px;min-width:100px;display:flex;align-items:center;justify-content:center;border:1px solid #ccc;font-size:9px;color:#666}
  .emitente{flex:1}
  .emitente h1{font-size:14px;font-weight:bold}
  .emitente p{font-size:9px;color:#333;line-height:1.4}
  .danfe-box{width:90px;min-width:90px;border:1px solid #000;text-align:center;padding:4px;font-size:9px}
  .danfe-box .titulo{font-size:12px;font-weight:bold;letter-spacing:1px}
  .danfe-box .mod{font-size:18px;font-weight:900;border:2px solid #000;width:32px;height:32px;display:flex;align-items:center;justify-content:center;margin:4px auto}
  .section{border:1px solid #000;margin-bottom:4px}
  .section-title{background:#000;color:#fff;font-size:9px;font-weight:bold;padding:2px 4px;letter-spacing:1px}
  .field-grid{display:grid;gap:0}
  .field{border-right:1px solid #ccc;border-bottom:1px solid #ccc;padding:2px 4px}
  .field label{display:block;font-size:8px;color:#666;letter-spacing:.5px;text-transform:uppercase}
  .field span{font-size:10px;font-weight:bold}
  table{width:100%;border-collapse:collapse;font-size:9px}
  thead{background:#f0f0f0}
  thead th{padding:3px 4px;border-bottom:2px solid #000;font-size:8px;text-align:left}
  .totals-row{display:flex;justify-content:flex-end;gap:0;border-top:2px solid #000;margin-top:4px}
  .total-item{border:1px solid #ccc;padding:3px 8px;text-align:center}
  .total-item label{display:block;font-size:8px;color:#666}
  .total-item span{font-size:11px;font-weight:bold}
  .total-item.final{background:#000;color:#fff}
  .total-item.final label{color:#ccc}
  .chave-box{background:#f9f9f9;border:1px solid #ccc;padding:4px 6px;font-family:monospace;font-size:9px;word-break:break-all;text-align:center;margin:4px 0}
  .footer{display:flex;justify-content:space-between;align-items:center;margin-top:6px;padding-top:6px;border-top:1px dashed #999}
  .qrcode{text-align:center}
  .aviso{background:#fff9c4;border:1px solid #f9a825;padding:3px 6px;font-size:9px;text-align:center;margin-bottom:4px}
  @media print{@page{margin:8mm;size:A4}body{padding:0}.danfe{border:none;padding:0}}
</style>
</head><body>
<div class="danfe">
  ${ambienteLabel}
  ${dados.ambiente === "homologacao" ? `<div class="aviso">⚠️ DOCUMENTO SIMULADO — AMBIENTE DE HOMOLOGAÇÃO — NÃO TEM VALOR FISCAL</div>` : ""}

  <!-- HEADER -->
  <div class="header">
    <div class="logo-box">${dados.emitente.razao_social.charAt(0)}</div>
    <div class="emitente">
      <h1>${dados.emitente.razao_social}</h1>
      <p>${dados.emitente.logradouro}, ${dados.emitente.numero} — ${dados.emitente.bairro}</p>
      <p>${dados.emitente.cidade} / ${dados.emitente.estado} — CEP: ${dados.emitente.cep}</p>
      ${dados.emitente.telefone ? `<p>Tel: ${dados.emitente.telefone}</p>` : ""}
      <p>CNPJ: ${fmtCNPJ(dados.emitente.cnpj)} — IE: ${dados.emitente.inscricao_estadual}</p>
    </div>
    <div class="danfe-box">
      <div class="titulo">DANFE</div>
      <div style="font-size:9px">${dados.tipo === "nfce" ? "NFC-e" : "Nota Fiscal Eletrônica"}</div>
      <div class="mod">${modelo}</div>
      <div style="font-size:8px">Série: ${dados.serie}</div>
      <div style="font-weight:bold;font-size:11px">Nº ${String(dados.numero).padStart(9,"0")}</div>
      <div style="font-size:8px;margin-top:4px">${dtBR}</div>
    </div>
  </div>

  <!-- CHAVE DE ACESSO -->
  <div class="section">
    <div class="section-title">CHAVE DE ACESSO</div>
    <div class="chave-box">${chaveFormatada}</div>
    <div style="text-align:center;font-size:8px;color:#666;padding-bottom:3px">
      Consulte em <strong>nfe.fazenda.gov.br</strong> (após autorização SEFAZ)
    </div>
  </div>

  <!-- NATUREZA / DESTINATÁRIO -->
  <div class="section">
    <div class="section-title">DESTINATÁRIO / REMETENTE</div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;border-bottom:1px solid #ccc">
      <div class="field" style="grid-column:span 2"><label>Nome / Razão Social</label><span>${dados.destinatario?.nome || "CONSUMIDOR FINAL"}</span></div>
      <div class="field"><label>${dados.destinatario?.cnpj ? "CNPJ" : "CPF"}</label><span>${dados.destinatario?.cnpj ? fmtCNPJ(dados.destinatario.cnpj) : dados.destinatario?.cpf ? fmtCPF(dados.destinatario.cpf) : "000.000.000-00"}</span></div>
    </div>
    <div style="display:grid;grid-template-columns:2fr 1fr 1fr">
      <div class="field"><label>Natureza da Operação</label><span>${dados.natureza_operacao}</span></div>
      <div class="field"><label>Data Emissão</label><span>${dt.toLocaleDateString("pt-BR")}</span></div>
      <div class="field"><label>Hora Emissão</label><span>${dt.toLocaleTimeString("pt-BR")}</span></div>
    </div>
  </div>

  <!-- ITENS -->
  <div class="section">
    <div class="section-title">DADOS DOS PRODUTOS / SERVIÇOS</div>
    <table>
      <thead><tr>
        <th>Cód. / NCM / CFOP</th><th>Descrição do Produto</th>
        <th style="text-align:center">Un</th><th style="text-align:center">Qtd</th>
        <th style="text-align:right">Vl. Unit.</th><th style="text-align:right">Vl. Total</th>
      </tr></thead>
      <tbody>${linhasItens}</tbody>
    </table>
  </div>

  <!-- TOTAIS -->
  <div class="section">
    <div class="section-title">CÁLCULO DO IMPOSTO</div>
    <div style="display:grid;grid-template-columns:repeat(6,1fr)">
      <div class="field"><label>BC ICMS</label><span>R$ ${fmtBR(vBC)}</span></div>
      <div class="field"><label>Vl. ICMS</label><span>R$ ${fmtBR(vICMS)}</span></div>
      <div class="field"><label>Vl. PIS</label><span>R$ ${fmtBR(vPIS)}</span></div>
      <div class="field"><label>Vl. COFINS</label><span>R$ ${fmtBR(vCOFINS)}</span></div>
      <div class="field"><label>Desconto</label><span>R$ ${fmtBR(dados.valor_desconto || 0)}</span></div>
      <div class="field" style="background:#f0f0f0"><label>VALOR TOTAL NF</label><span style="font-size:12px;font-weight:900">R$ ${fmtBR(dados.valor_total)}</span></div>
    </div>
  </div>

  <!-- TRANSPORTADOR -->
  <div class="section">
    <div class="section-title">TRANSPORTADOR / VOLUMES TRANSPORTADOS</div>
    <div class="field" style="border:none;padding:3px 4px"><label>Modalidade do Frete</label><span>9 — Sem Frete</span></div>
  </div>

  <!-- PAGAMENTO -->
  <div class="section">
    <div class="section-title">DADOS DO PAGAMENTO</div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr">
      <div class="field"><label>Forma de Pagamento</label><span>${pagLabel}</span></div>
      <div class="field"><label>Valor Pago</label><span>R$ ${fmtBR(dados.valor_total)}</span></div>
      <div class="field"><label>Troco</label><span>R$ ${fmtBR(dados.troco || 0)}</span></div>
    </div>
  </div>

  <!-- INFORMAÇÕES ADICIONAIS -->
  ${dados.informacoes_adicionais ? `<div class="section"><div class="section-title">INFORMAÇÕES ADICIONAIS</div><div class="field" style="border:none">${dados.informacoes_adicionais}</div></div>` : ""}

  <!-- FOOTER COM QR CODE -->
  <div class="footer">
    <div style="flex:1;font-size:9px;color:#666">
      <p>Emitido por <strong>ASTIA PDV</strong> by VYN Developer</p>
      <p style="margin-top:2px">CRT: ${dados.emitente.regime_tributario === "1" ? "1 — Simples Nacional" : dados.emitente.regime_tributario === "2" ? "2 — Lucro Presumido" : "3 — Lucro Real"}</p>
    </div>
    <div class="qrcode">
      <img src="${qrCodeUrl}" width="100" height="100" alt="QR Code" onerror="this.style.display='none'">
      <div style="font-size:8px;color:#666;margin-top:2px">QR Code da Nota</div>
    </div>
  </div>
</div>
<script>window.onload = () => setTimeout(() => window.print(), 600);</script>
</body></html>`;
}

// ─── Função principal: abre janela com XML ou DANFE ───────────────────────────

export function visualizarXML(dados: DadosNFe): void {
  const xml = gerarXMLNFe(dados);
  const win = window.open("", "_blank", "width=900,height=700");
  if (!win) { alert("Permita popups para visualizar o XML"); return; }
  win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>XML ${dados.tipo.toUpperCase()}</title>
<style>
  body{font-family:monospace;font-size:11px;background:#1e1e1e;color:#d4d4d4;padding:16px;white-space:pre-wrap;word-break:break-all}
  .tag{color:#569cd6}.attr{color:#9cdcfe}.value{color:#ce9178}.comment{color:#6a9955;font-style:italic}
  .toolbar{position:fixed;top:0;right:0;padding:8px;display:flex;gap:8px}
  .btn{background:#007acc;color:white;border:none;padding:6px 12px;border-radius:4px;cursor:pointer;font-size:11px}
</style></head><body>
<div class="toolbar">
  <button class="btn" onclick="navigator.clipboard.writeText(document.querySelector('pre').textContent).then(()=>alert('Copiado!'))">📋 Copiar XML</button>
  <button class="btn" onclick="const b=new Blob([document.querySelector('pre').textContent],{type:'text/xml'});const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='nfe_${String(dados.numero).padStart(9,'0')}.xml';a.click()">💾 Baixar .xml</button>
</div>
<pre>${xml.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}</pre>
</body></html>`);
  win.document.close();
}

export function visualizarDANFE(dados: DadosNFe): void {
  const html = gerarDANFE(dados);
  const win = window.open("", "_blank", "width=900,height=700");
  if (!win) { alert("Permita popups para visualizar o DANFE"); return; }
  win.document.write(html);
  win.document.close();
}

// ─── Monta DadosNFe a partir da venda do PDV ─────────────────────────────────

export function montarDadosNFe(
  venda: any,
  loja: any,
  tipo: "nfe" | "nfce" = "nfce"
): DadosNFe {
  const proximo_numero = (loja?.ultimo_numero_nfce || 0) + 1;

  const itens: ItemNFe[] = (venda.itens || []).map((i: any, idx: number) => ({
    numero: idx + 1,
    codigo: i.codigo_barras || String(i.produto_id || idx + 1),
    descricao: i.nome_produto || i.nome,
    ncm: i.ncm || "00000000",
    cfop: i.cfop || (tipo === "nfce" ? "5102" : "5102"),
    unidade: i.unidade_medida || "UN",
    quantidade: Number(i.quantidade || 1),
    valor_unitario: Number(i.preco_unitario || i.preco || 0),
    valor_total: Number(i.total || 0),
    cst_icms: i.cst_icms || "400",    // Simples Nacional isento
    aliquota_icms: Number(i.aliquota_icms || 0),
    cst_pis: i.cst_pis || "07",       // Operação isenta
    aliquota_pis: Number(i.aliquota_pis || 0),
    cst_cofins: i.cst_cofins || "07",
    aliquota_cofins: Number(i.aliquota_cofins || 0),
  }));

  return {
    tipo,
    numero: proximo_numero,
    serie: loja?.serie_nfce || 1,
    ambiente: loja?.ambiente_nfe === "producao" ? "producao" : "homologacao",
    natureza_operacao: "VENDA AO CONSUMIDOR",
    data_emissao: venda.criado_em || new Date().toISOString(),
    forma_pagamento: venda.forma_pagamento || "dinheiro",
    valor_total: Number(venda.total || 0),
    valor_desconto: Number(venda.desconto_valor || 0),
    troco: Number(venda.troco || 0),
    emitente: {
      razao_social: loja?.razao_social || loja?.nome || "EMPRESA",
      cnpj: (loja?.cnpj || "00000000000000").replace(/\D/g,""),
      inscricao_estadual: loja?.inscricao_estadual || "ISENTO",
      logradouro: loja?.logradouro || "RUA NAO INFORMADA",
      numero: loja?.numero || "S/N",
      bairro: loja?.bairro || "CENTRO",
      cidade: loja?.cidade || "SAO PAULO",
      estado: loja?.estado || "SP",
      cep: (loja?.cep || "00000000").replace(/\D/g,""),
      telefone: loja?.telefone,
      email: loja?.email,
      regime_tributario: loja?.regime_tributario || "1",
    },
    destinatario: venda.cpf_nota || venda.cliente_nome ? {
      nome: venda.cliente_nome || "CONSUMIDOR FINAL",
      cpf: venda.cpf_nota?.replace(/\D/g,""),
    } : undefined,
    itens,
    informacoes_adicionais: `ASTIA PDV — Venda ${venda.numero || ""} — ${loja?.ambiente_nfe !== "producao" ? "DOCUMENTO DE HOMOLOGACAO SEM VALOR FISCAL" : "Obrigado pela preferencia!"}`,
  };
}
