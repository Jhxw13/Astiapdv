/**
 * ASTIA PDV — Integração Focus NF-e
 *
 * SWITCH DE ATIVAÇÃO:
 *   - config.focus_nfe_habilitado = 0  → usa XML simulado (modo teste)
 *   - config.focus_nfe_habilitado = 1  → envia para Focus NF-e API (real)
 *
 * Para ativar por cliente:
 *   1. Cliente paga → você vai em Configurações → Fiscal → Focus NF-e
 *   2. Cola a API Key do cliente (obtida em app.focusnfe.com.br)
 *   3. Liga o switch "Emissão fiscal ativa"
 *   4. Pronto — as próximas NF-e/NFC-e são emitidas de verdade
 *
 * Documentação Focus: https://focusnfe.com.br/doc/
 */

import { montarDadosNFe, gerarXMLNFe, visualizarDANFE, visualizarXML } from "./nfe";

// ─── Resultado da emissão ─────────────────────────────────────────────────────
export interface ResultadoEmissao {
  sucesso: boolean;
  modo: "simulado" | "focus_homologacao" | "focus_producao";
  chave_acesso?: string;
  numero?: number;
  serie?: number;
  xml?: string;
  danfe_url?: string;
  protocolo?: string;
  mensagem?: string;
  erro?: string;
}

// ─── Mapeamento de forma de pagamento → código Focus ─────────────────────────
function tPagFocus(forma: string): string {
  const m: Record<string, string> = {
    dinheiro: "01", credito: "03", debito: "04",
    pix: "17", voucher: "05", crediario: "99",
  };
  return m[forma] || "01";
}

// ─── Gera referência única para a nota na Focus ───────────────────────────────
function gerarRef(cnpj: string, numero: number, tipo: "nfe" | "nfce"): string {
  const clean = cnpj.replace(/\D/g, "").slice(0, 8);
  return `ASTIA${tipo.toUpperCase()}${clean}${String(numero).padStart(9, "0")}`;
}

// ─── Monta payload JSON para a Focus NF-e ────────────────────────────────────
function montarPayloadFocus(venda: any, loja: any, tipo: "nfe" | "nfce") {
  const dados = montarDadosNFe(venda, loja, tipo);

  const itens = dados.itens.map((i, idx) => ({
    numero_item: idx + 1,
    codigo_produto: i.codigo,
    descricao: i.descricao,
    ncm: i.ncm.replace(/\D/g, "").padStart(8, "0"),
    cfop: i.cfop,
    unidade_comercial: i.unidade || "UN",
    quantidade_comercial: i.quantidade,
    valor_unitario_comercial: i.valor_unitario,
    valor_bruto: i.valor_total,
    // Tributação — Simples Nacional (CST/CSOSN)
    icms_situacao_tributaria: i.cst_icms || "400",
    icms_modalidade_base_calculo: 3,
    icms_base_calculo: i.aliquota_icms > 0 ? i.valor_total : 0,
    icms_aliquota: i.aliquota_icms || 0,
    icms_valor: i.valor_total * (i.aliquota_icms || 0) / 100,
    pis_situacao_tributaria: i.cst_pis || "07",
    pis_base_calculo: 0,
    pis_aliquota_percentual: i.aliquota_pis || 0,
    pis_valor: i.valor_total * (i.aliquota_pis || 0) / 100,
    cofins_situacao_tributaria: i.cst_cofins || "07",
    cofins_base_calculo: 0,
    cofins_aliquota_percentual: i.aliquota_cofins || 0,
    cofins_valor: i.valor_total * (i.aliquota_cofins || 0) / 100,
  }));

  const payload: any = {
    natureza_operacao: dados.natureza_operacao,
    forma_pagamento: 0,           // 0=À vista
    regime_tributario: dados.emitente.regime_tributario,
    emitente: {
      cnpj: dados.emitente.cnpj,
      nome_fantasia: dados.emitente.razao_social,
      inscricao_estadual: dados.emitente.inscricao_estadual,
      logradouro: dados.emitente.logradouro,
      numero: dados.emitente.numero,
      bairro: dados.emitente.bairro,
      municipio: dados.emitente.cidade,
      uf: dados.emitente.estado,
      cep: dados.emitente.cep,
      telefone: dados.emitente.telefone,
    },
    itens,
    formas_pagamento: [{
      forma_pagamento: tPagFocus(dados.forma_pagamento),
      valor: dados.valor_total,
      ...(dados.troco && dados.troco > 0 ? { troco: dados.troco } : {}),
    }],
    informacoes_adicionais_contribuinte: dados.informacoes_adicionais,
  };

  // Destinatário (obrigatório na NF-e, opcional na NFC-e com CPF)
  if (dados.destinatario) {
    payload.destinatario = {
      ...(dados.destinatario.cpf   ? { cpf:  dados.destinatario.cpf }  : {}),
      ...(dados.destinatario.cnpj  ? { cnpj: dados.destinatario.cnpj } : {}),
      nome: dados.destinatario.nome,
      indicador_inscricao_estadual: 9, // 9=não contribuinte
      ...(dados.destinatario.email ? { email: dados.destinatario.email } : {}),
    };
  }

  return { payload, dados };
}

// ─── Polling do status da nota na Focus ──────────────────────────────────────
async function aguardarAutorizacao(
  baseUrl: string,
  headers: Record<string, string>,
  ref: string,
  tipo: "nfe" | "nfce",
  tentativas = 10,
  intervalo = 2000
): Promise<{ status: string; chave?: string; protocolo?: string; danfe_url?: string; xml?: string }> {
  const endpoint = tipo === "nfce" ? "nfce" : "nfe";
  for (let i = 0; i < tentativas; i++) {
    await new Promise(r => setTimeout(r, intervalo));
    try {
      const resp = await fetch(`${baseUrl}/v2/${endpoint}?ref=${ref}`, { headers });
      const json = await resp.json();
      if (json.status === "autorizado") {
        return {
          status: "autorizado",
          chave: json.chave_nfe,
          protocolo: json.protocolo,
          danfe_url: json.caminho_danfe || json.danfe_url,
          xml: json.caminho_xml_nota_fiscal,
        };
      }
      if (json.status === "erro" || json.status === "rejeitado" || json.status === "cancelado") {
        return { status: json.status };
      }
      // processando, autorizado_em_contingencia, etc — continua polling
    } catch {}
  }
  return { status: "timeout" };
}

// ─── Função principal de emissão ─────────────────────────────────────────────
export async function emitirNota(
  venda: any,
  loja: any,
  tipo: "nfe" | "nfce"
): Promise<ResultadoEmissao> {

  const habilitado = !!(loja?.focus_nfe_habilitado && loja?.focus_api_key);

  // ── MODO SIMULADO (Focus desabilitado ou sem API key) ──────────────────────
  if (!habilitado) {
    const dados = montarDadosNFe(venda, loja, tipo);
    const xml = gerarXMLNFe(dados);
    return {
      sucesso: true,
      modo: "simulado",
      chave_acesso: undefined,
      numero: dados.numero,
      serie: dados.serie,
      xml,
      mensagem: "XML gerado localmente — Focus NF-e não está ativado. " +
                "Ative em Configurações → Fiscal → Focus NF-e para emissão real.",
    };
  }

  // ── MODO REAL — Focus NF-e ────────────────────────────────────────────────
  const { payload, dados } = montarPayloadFocus(venda, loja, tipo);
  const cnpjLimpo = (loja.cnpj || "").replace(/\D/g, "");
  const numero = tipo === "nfce"
    ? (loja.ultimo_numero_nfce || 0) + 1
    : (loja.ultimo_numero_nfe  || 0) + 1;
  const ref = gerarRef(cnpjLimpo, numero, tipo);

  const isProducao = loja.ambiente_nfe === "producao";
  const baseUrl = isProducao
    ? "https://api.focusnfe.com.br"
    : "https://homologacao.focusnfe.com.br";
  const endpoint = tipo === "nfce" ? "nfce" : "nfe";

  // Credenciais Focus: Basic Auth com API key como usuário, senha vazia
  const token = btoa(`${loja.focus_api_key}:`);
  const headers = {
    "Authorization": `Basic ${token}`,
    "Content-Type": "application/json",
  };

  try {
    // Envia a nota
    const resp = await fetch(`${baseUrl}/v2/${endpoint}?ref=${ref}`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ mensagem_sefaz: resp.statusText }));
      return {
        sucesso: false,
        modo: isProducao ? "focus_producao" : "focus_homologacao",
        erro: err?.erros?.[0]?.mensagem || err?.mensagem_sefaz || `HTTP ${resp.status}`,
      };
    }

    const json = await resp.json();

    // Se já autorizou na hora
    if (json.status === "autorizado") {
      return {
        sucesso: true,
        modo: isProducao ? "focus_producao" : "focus_homologacao",
        chave_acesso: json.chave_nfe,
        numero,
        serie: dados.serie,
        protocolo: json.protocolo,
        danfe_url: json.caminho_danfe,
        xml: json.caminho_xml_nota_fiscal,
        mensagem: `${tipo.toUpperCase()} autorizada pela SEFAZ`,
      };
    }

    // Nota em processamento — faz polling
    if (json.status === "processando_autorizacao" || json.status === "recebido") {
      const resultado = await aguardarAutorizacao(baseUrl, headers, ref, tipo);
      if (resultado.status === "autorizado") {
        return {
          sucesso: true,
          modo: isProducao ? "focus_producao" : "focus_homologacao",
          chave_acesso: resultado.chave,
          numero,
          serie: dados.serie,
          protocolo: resultado.protocolo,
          danfe_url: resultado.danfe_url,
          xml: resultado.xml,
          mensagem: `${tipo.toUpperCase()} autorizada pela SEFAZ`,
        };
      }
      return {
        sucesso: false,
        modo: isProducao ? "focus_producao" : "focus_homologacao",
        erro: `SEFAZ retornou status: ${resultado.status}. Consulte o painel Focus NF-e.`,
      };
    }

    // Erro/rejeição imediata
    return {
      sucesso: false,
      modo: isProducao ? "focus_producao" : "focus_homologacao",
      erro: json.erros?.[0]?.mensagem || json.mensagem_sefaz || json.status || "Erro desconhecido",
    };

  } catch (e: any) {
    return {
      sucesso: false,
      modo: isProducao ? "focus_producao" : "focus_homologacao",
      erro: "Falha na conexão com Focus NF-e: " + e.message,
    };
  }
}

// ─── Cancela nota já autorizada ───────────────────────────────────────────────
export async function cancelarNota(
  loja: any,
  chaveAcesso: string,
  justificativa: string
): Promise<{ sucesso: boolean; erro?: string }> {
  if (!loja?.focus_api_key || !loja?.focus_nfe_habilitado) {
    return { sucesso: false, erro: "Focus NF-e não configurado" };
  }
  const isProducao = loja.ambiente_nfe === "producao";
  const baseUrl = isProducao
    ? "https://api.focusnfe.com.br"
    : "https://homologacao.focusnfe.com.br";
  try {
    const resp = await fetch(`${baseUrl}/v2/nfe/${chaveAcesso}`, {
      method: "DELETE",
      headers: {
        "Authorization": `Basic ${btoa(`${loja.focus_api_key}:`)}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ justificativa }),
    });
    const json = await resp.json();
    if (json.status === "cancelado") return { sucesso: true };
    return { sucesso: false, erro: json.erros?.[0]?.mensagem || "Não foi possível cancelar" };
  } catch (e: any) {
    return { sucesso: false, erro: e.message };
  }
}

// ─── Verifica se Focus está configurado e ativo ───────────────────────────────
export function focusAtivo(loja: any): boolean {
  return !!(loja?.focus_nfe_habilitado && loja?.focus_api_key?.trim());
}

export function focusStatus(loja: any): {
  ativo: boolean; ambiente: string; apiKeyConfigurada: boolean; mensagem: string
} {
  const ativo = focusAtivo(loja);
  const ambiente = loja?.ambiente_nfe === "producao" ? "Produção" : "Homologação (Teste)";
  return {
    ativo,
    ambiente,
    apiKeyConfigurada: !!(loja?.focus_api_key?.trim()),
    mensagem: ativo
      ? `✅ Focus NF-e ativo — ${ambiente}`
      : loja?.focus_api_key
        ? "⚠️ API Key configurada mas emissão desabilitada"
        : "📋 Focus NF-e não configurado — usando modo simulado",
  };
}
