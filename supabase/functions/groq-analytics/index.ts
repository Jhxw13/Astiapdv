import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AnalyticsData {
  vendas: any[];
  produtos: any[];
  clientes: any[];
  movimentacoes: any[];
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const groqApiKey = Deno.env.get('GROQ_API_KEY');
    if (!groqApiKey) {
      throw new Error('GROQ_API_KEY não configurada');
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    );

    const { period = 'month' } = await req.json();

    // Buscar dados dos últimos 30 dias
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    console.log('Buscando dados para análise...', { period, thirtyDaysAgo });

    // Buscar vendas
    const { data: vendas } = await supabaseClient
      .from('vendas')
      .select('*')
      .gte('created_at', thirtyDaysAgo.toISOString());

    // Buscar produtos
    const { data: produtos } = await supabaseClient
      .from('produtos')
      .select('*');

    // Buscar clientes
    const { data: clientes } = await supabaseClient
      .from('clientes')
      .select('*');

    // Buscar movimentações financeiras
    const { data: movimentacoes } = await supabaseClient
      .from('movimentacoes_financeiras')
      .select('*')
      .gte('created_at', thirtyDaysAgo.toISOString());

    const analyticsData: AnalyticsData = {
      vendas: vendas || [],
      produtos: produtos || [],
      clientes: clientes || [],
      movimentacoes: movimentacoes || []
    };

    console.log('Dados coletados:', {
      vendas: analyticsData.vendas.length,
      produtos: analyticsData.produtos.length,
      clientes: analyticsData.clientes.length,
      movimentacoes: analyticsData.movimentacoes.length
    });

    // Preparar dados para análise
    const totalVendas = analyticsData.vendas.reduce((acc, venda) => acc + Number(venda.total_final), 0);
    const produtosBaixoEstoque = analyticsData.produtos.filter(p => p.estoque <= p.estoque_minimo);
    const receitaTotal = analyticsData.movimentacoes
      .filter(m => m.tipo === 'receita')
      .reduce((acc, m) => acc + Number(m.valor), 0);
    const despesaTotal = analyticsData.movimentacoes
      .filter(m => m.tipo === 'despesa')
      .reduce((acc, m) => acc + Number(m.valor), 0);

    const prompt = `
    Você é um consultor de negócios especializado em análise de dados empresariais. Analise os seguintes dados de uma empresa e forneça insights acionáveis sobre onde a empresa pode melhorar:

    DADOS FINANCEIROS (últimos 30 dias):
    - Total de vendas: R$ ${totalVendas.toLocaleString('pt-BR')}
    - Número de vendas: ${analyticsData.vendas.length}
    - Receita total: R$ ${receitaTotal.toLocaleString('pt-BR')}
    - Despesas totais: R$ ${despesaTotal.toLocaleString('pt-BR')}
    - Lucro líquido: R$ ${(receitaTotal - despesaTotal).toLocaleString('pt-BR')}

    DADOS OPERACIONAIS:
    - Total de produtos cadastrados: ${analyticsData.produtos.length}
    - Produtos com estoque baixo: ${produtosBaixoEstoque.length}
    - Total de clientes: ${analyticsData.clientes.length}
    - Ticket médio: R$ ${analyticsData.vendas.length > 0 ? (totalVendas / analyticsData.vendas.length).toLocaleString('pt-BR') : '0'}

    PRODUTOS COM ESTOQUE BAIXO:
    ${produtosBaixoEstoque.map(p => `- ${p.nome}: ${p.estoque} unidades (mínimo: ${p.estoque_minimo})`).join('\n')}

    Por favor, forneça:
    1. ANÁLISE GERAL da situação financeira e operacional
    2. PONTOS FORTES identificados
    3. PRINCIPAIS PROBLEMAS encontrados
    4. RECOMENDAÇÕES PRIORITÁRIAS (máximo 5 ações concretas)
    5. METAS SUGERIDAS para os próximos 30 dias

    Seja específico, prático e focado em resultados. Use dados quantitativos quando possível.
    `;

    console.log('Enviando para Groq...', { promptLength: prompt.length });

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${groqApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [
          {
            role: 'system',
            content: 'Você é um consultor empresarial experiente especializado em análise de dados e melhoria de processos de negócios. Suas análises são sempre práticas, específicas e focadas em resultados mensuráveis.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 2000
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Erro na API Groq:', errorText);
      throw new Error(`Erro na API Groq: ${response.status} - ${errorText}`);
    }

    const groqResponse = await response.json();
    console.log('Resposta do Groq recebida');

    const analysis = groqResponse.choices[0].message.content;

    return new Response(JSON.stringify({ 
      analysis,
      data: {
        totalVendas,
        numeroVendas: analyticsData.vendas.length,
        receitaTotal,
        despesaTotal,
        lucroLiquido: receitaTotal - despesaTotal,
        produtosBaixoEstoque: produtosBaixoEstoque.length,
        totalClientes: analyticsData.clientes.length,
        ticketMedio: analyticsData.vendas.length > 0 ? totalVendas / analyticsData.vendas.length : 0
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Erro na função groq-analytics:', error);
    return new Response(JSON.stringify({ 
      error: error.message,
      analysis: 'Erro ao processar análise. Verifique se a chave API do Groq está configurada corretamente.'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});