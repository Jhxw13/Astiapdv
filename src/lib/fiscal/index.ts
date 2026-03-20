/**
 * ASTIA PDV — Módulo Fiscal
 * Estrutura preparada para integração com Focus NF-e
 * 
 * Para ativar:
 *   1. Contratar Focus NF-e em focusnfe.com.br
 *   2. Configurar FOCUS_API_KEY e FOCUS_ENV nas Configurações → Fiscal
 *   3. Descomentar as chamadas em emitirNFCe() e emitirNFe()
 * 
 * Documentação Focus: https://focusnfe.com.br/doc/
 */

export interface DadosProdutoFiscal {
  nome: string;
  codigo: string;
  ncm: string;
  cfop: string;
  cst_icms: string;
  aliquota_icms: number;
  cst_pis: string;
  aliquota_pis: number;
  cst_cofins: string;
  aliquota_cofins: number;
  unidade: string;
  quantidade: number;
  valor_unitario: number;
  valor_total: number;
}

export interface DadosEmissao {
  // Configurações da loja (vêm de config_loja)
  cnpj_emitente: string;
  ie_emitente: string;
  regime_tributario: '1' | '2' | '3'; // 1=Simples, 2=Lucro Presumido, 3=Lucro Real
  ambiente: 'homologacao' | 'producao';
  
  // Dados da venda
  numero_pdv: number;
  serie: number;
  itens: DadosProdutoFiscal[];
  forma_pagamento: string;
  valor_total: number;
  valor_desconto?: number;
  troco?: number;
  
  // Destinatário (opcional na NFC-e, obrigatório na NF-e)
  cpf_cliente?: string;
  cnpj_cliente?: string;
  nome_cliente?: string;
}

// ── NFC-e (cupom fiscal eletrônico — para vendas no balcão) ───────────────────
export async function emitirNFCe(
  dados: DadosEmissao,
  focusApiKey: string
): Promise<{ sucesso: boolean; chave_acesso?: string; danfe_url?: string; erro?: string }> {
  
  // TODO: Implementar quando contratar Focus NF-e
  // Estrutura do payload já mapeada abaixo:
  
  /*
  const payload = {
    natureza_operacao: "VENDA AO CONSUMIDOR",
    forma_pagamento: mapearFormaPagamento(dados.forma_pagamento),
    regime_tributario: dados.regime_tributario,
    emitente: {
      cnpj: dados.cnpj_emitente,
      inscricao_estadual: dados.ie_emitente,
    },
    destinatario: dados.cpf_cliente ? {
      cpf: dados.cpf_cliente,
      nome: dados.nome_cliente || "CONSUMIDOR",
    } : undefined,
    itens: dados.itens.map((item, i) => ({
      numero_item: i + 1,
      codigo_produto: item.codigo,
      descricao: item.nome,
      ncm: item.ncm,
      cfop: item.cfop,
      unidade_comercial: item.unidade,
      quantidade_comercial: item.quantidade,
      valor_unitario_comercial: item.valor_unitario,
      valor_bruto: item.valor_total,
      icms_situacao_tributaria: item.cst_icms,
      icms_aliquota: item.aliquota_icms,
      pis_situacao_tributaria: item.cst_pis,
      cofins_situacao_tributaria: item.cst_cofins,
    })),
    formas_pagamento: [{
      forma_pagamento: mapearFormaPagamento(dados.forma_pagamento),
      valor: dados.valor_total,
    }],
  };

  const response = await fetch(
    `https://api.focusnfe.com.br/v2/nfce?ref=${gerarRef()}`,
    {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + btoa(focusApiKey + ':'),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }
  );
  const json = await response.json();
  if (json.status === 'autorizado') {
    return { sucesso: true, chave_acesso: json.chave_nfe, danfe_url: json.danfe };
  }
  return { sucesso: false, erro: json.mensagem_sefaz || json.erros?.[0]?.mensagem };
  */

  return { sucesso: false, erro: 'Módulo fiscal não ativado. Configure nas Configurações → Fiscal.' };
}

// ── NF-e (nota fiscal eletrônica — para vendas B2B) ──────────────────────────
export async function emitirNFe(
  dados: DadosEmissao,
  focusApiKey: string
): Promise<{ sucesso: boolean; chave_acesso?: string; danfe_url?: string; erro?: string }> {
  // Mesma estrutura, endpoint diferente: /v2/nfe
  return { sucesso: false, erro: 'Módulo fiscal não ativado. Configure nas Configurações → Fiscal.' };
}

// ── Importação de XML (entrada de nota do fornecedor) ─────────────────────────
export function lerXMLNFe(xmlString: string): {
  fornecedor: { cnpj: string; nome: string };
  numero: string;
  chave_acesso: string;
  itens: Array<{
    codigo: string;
    descricao: string;
    ncm: string;
    cfop: string;
    quantidade: number;
    valor_unitario: number;
    valor_total: number;
  }>;
} | null {
  try {
    const parser = new DOMParser();
    const xml = parser.parseFromString(xmlString, 'text/xml');
    
    const get = (tag: string) => xml.querySelector(tag)?.textContent || '';
    
    const itens = Array.from(xml.querySelectorAll('det')).map(det => ({
      codigo:        det.querySelector('cProd')?.textContent || '',
      descricao:     det.querySelector('xProd')?.textContent || '',
      ncm:           det.querySelector('NCM')?.textContent || '',
      cfop:          det.querySelector('CFOP')?.textContent || '',
      quantidade:    parseFloat(det.querySelector('qCom')?.textContent || '0'),
      valor_unitario:parseFloat(det.querySelector('vUnCom')?.textContent || '0'),
      valor_total:   parseFloat(det.querySelector('vProd')?.textContent || '0'),
    }));

    return {
      fornecedor: { cnpj: get('emit > CNPJ'), nome: get('emit > xNome') },
      numero:      get('nNF'),
      chave_acesso: get('chNFe'),
      itens,
    };
  } catch {
    return null;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function mapearFormaPagamento(forma: string): string {
  const mapa: Record<string, string> = {
    dinheiro: '01', credito: '03', debito: '04',
    pix: '17', voucher: '05', crediario: '99',
  };
  return mapa[forma] || '01';
}

function gerarRef(): string {
  return `ASTIA${Date.now()}`;
}
