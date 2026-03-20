/**
 * VYN CRM — API unificada v6.0
 * Funciona em 3 modos:
 *   1. Electron local (servidor): usa IPC via window.vyn
 *   2. Electron cliente (--client): usa HTTP para o servidor na rede
 *   3. Browser (http://IP:3567): usa HTTP direto (window.vyn não existe)
 */

declare global {
  interface Window {
    vyn: {
      invoke: (ch: string, d?: any) => Promise<{ ok: boolean; result?: any; error?: string }>;
      selecionarLogo: () => Promise<string | null>;
      selecionarCertificado: () => Promise<string | null>;
      backupExportar: () => Promise<void>;
      backupImportar: () => Promise<void>;
      abrirPastaDados: () => Promise<void>;
      getServerIP: () => Promise<string>;
      getMode: () => Promise<string>;
      licenseStatus: () => Promise<{ ok: boolean; result?: any; error?: string }>;
      licenseActivate: (payload: { licenseKey: string; serverUrl?: string }) => Promise<{ ok: boolean; result?: any; error?: string }>;
      licenseVerify: () => Promise<{ ok: boolean; result?: any; error?: string }>;
      on: (ch: string, cb: any) => () => void;
    };
  }
}

/** Detecta a URL base do servidor.
 *  - Se estamos no browser direto (IP:3567 ou localhost:3567): usa window.location
 *  - Se estamos no Electron servido via http://localhost:3567: usa window.location
 *  - Se o usuário configurou manualmente: usa localStorage
 */
function getServerURL(): string {
  if (typeof window === 'undefined') return 'http://localhost:3567';

  const port = window.location.port;
  const protocol = window.location.protocol;
  const host = window.location.hostname;

  // Já estamos sendo servidos pelo servidor VYN (porta 3567)
  if (port === '3567') {
    return `${protocol}//${host}:3567`;
  }

  // Salvo manualmente pelo usuário (modo cliente Electron apontando para IP remoto)
  const saved = localStorage.getItem('vyn_server_url');
  if (saved) return saved;

  // Padrão para dev local
  return 'http://localhost:3567';
}

/** 
 * Verdadeiro APENAS quando rodamos no Electron servidor local (porta 3567 local).
 * No cliente Electron, window.vyn existe mas o banco não — usa HTTP para o servidor remoto.
 */
function isElectronWithIPC(): boolean {
  if (typeof window === 'undefined') return false;
  if (!window.vyn) return false;
  // Se a página foi carregada de um servidor REMOTO (IP diferente de localhost),
  // estamos no modo cliente — deve usar HTTP mesmo tendo window.vyn
  const host = window.location.hostname;
  const port = window.location.port;
  const isLocalhost = host === 'localhost' || host === '127.0.0.1';
  const isCorrectPort = port === '3567';
  // Só usa IPC se for localhost:3567 (servidor local) ou data: / file: (dev)
  const protocol = window.location.protocol;
  if (protocol === 'data:' || protocol === 'file:') return false; // tela de conexão do cliente
  return isLocalhost && isCorrectPort;
}

async function httpCall(channel: string, data?: any): Promise<any> {
  const url = getServerURL() + '/api';
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel, data }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'Erro do servidor');
  return json.result;
}

async function httpJson(path: string, method: 'GET' | 'POST', body?: any): Promise<any> {
  const url = getServerURL() + path;
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: method === 'POST' ? JSON.stringify(body ?? {}) : undefined,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'Erro do servidor');
  return json.result;
}

async function ipcCall(channel: string, data?: any): Promise<any> {
  const r = await window.vyn.invoke(channel, data);
  if (!r.ok) throw new Error(r.error || 'Erro IPC');
  return r.result;
}

/** Chama diretamente um ipcMain.handle que não passa pelo dispatcher ipc:call */
async function directIpcCall(channel: string, data?: any): Promise<any> {
  return (window as any).vyn.directInvoke(channel, data);
}

function hasDirectIpc(): boolean {
  return typeof window !== 'undefined' && typeof (window as any).vyn?.directInvoke === 'function';
}

/** Roteia automaticamente entre IPC (Electron servidor) e HTTP (browser / cliente) */
const invoke = (channel: string, data?: any): Promise<any> =>
  isElectronWithIPC() ? ipcCall(channel, data) : httpCall(channel, data);

// ── AUTH ──────────────────────────────────────────────────────────────────────
export const authAPI = {
  login: (email: string, senha: string) => invoke('auth:login', { email, senha }),
  trocarSenha: (usuario_id: number, senhaAtual: string, novaSenha: string) =>
    invoke('auth:trocar-senha', { usuario_id, senhaAtual, novaSenha }),
  criarUsuario: (data: any) => invoke('auth:criar-usuario', data),
  primeiroAcessoStatus: () => invoke('auth:primeiro-acesso-status'),
  concluirPrimeiroAcesso: (data: { nome: string; email: string; senha: string }) =>
    invoke('auth:primeiro-acesso-concluir', data),
  listarUsuarios: () => invoke('auth:listar-usuarios'),
  ativarDesativar: (id: number, ativo: number) => invoke('auth:ativar-desativar', { id, ativo }),
};

// ── CONFIG ────────────────────────────────────────────────────────────────────
export const configAPI = {
  get: () => invoke('config:get'),
  update: (data: Record<string, any>) => invoke('config:update', data),
  selecionarLogo: () => window.vyn?.selecionarLogo() ?? Promise.resolve(null),
  selecionarCertificado: () => window.vyn?.selecionarCertificado() ?? Promise.resolve(null),
  lerCertificado: (caminho: string, senha: string) =>
    window.vyn?.lerCertificado({ caminho, senha }) ?? Promise.resolve({ ok: false, erro: 'Indisponível no modo web' }),
};

// ── CATEGORIAS ────────────────────────────────────────────────────────────────
export const categoriasAPI = {
  listar: () => invoke('categorias:listar'),
  criar: (d: any) => invoke('categorias:criar', d),
  atualizar: (id: number, d: any) => invoke('categorias:atualizar', { id, ...d }),
  deletar: (id: number) => invoke('categorias:deletar', id),
};

// ── PRODUTOS ──────────────────────────────────────────────────────────────────
export const produtosAPI = {
  listar: (f?: any) => invoke('produtos:listar', f),
  buscarPorCodigo: (codigo: string) => invoke('produtos:buscar-codigo', codigo),
  buscarPorCodigoInteligente: (codigo: string) => invoke('produtos:buscar-codigo-inteligente', codigo),
  buscarPorId: (id: number) => invoke('produtos:buscar-id', id),
  criar: (d: any) => invoke('produtos:criar', d),
  atualizar: (id: number, d: any) => invoke('produtos:atualizar', { id, ...d }),
  deletar: (id: number) => invoke('produtos:deletar', id),
  estoqueBaixo: () => invoke('produtos:estoque-baixo'),
};

// ── ESTOQUE ───────────────────────────────────────────────────────────────────
export const estoqueAPI = {
  listar: (produto_id: number) => invoke('estoque:listar', produto_id),
  ajustar: (produto_id: number, quantidade: number, motivo: string, usuario_id: number) =>
    invoke('estoque:ajustar', { produto_id, quantidade, motivo, usuario_id }),
  entrada: (produto_id: number, quantidade: number, preco_custo: number, motivo: string, usuario_id: number) =>
    invoke('estoque:entrada', { produto_id, quantidade, preco_custo, motivo, usuario_id }),
};

// ── CLIENTES ──────────────────────────────────────────────────────────────────
export const clientesAPI = {
  listar: (f?: any) => invoke('clientes:listar', f),
  buscarPorId: (id: number) => invoke('clientes:buscar-id', id),
  criar: (d: any) => invoke('clientes:criar', d),
  atualizar: (id: number, d: any) => invoke('clientes:atualizar', { id, ...d }),
  deletar: (id: number) => invoke('clientes:deletar', id),
  historico: (id: number) => invoke('clientes:historico', id),
};

// ── CAIXA ─────────────────────────────────────────────────────────────────────
export const caixaAPI = {
  abrir: (d: any) => invoke('caixa:abrir', d),
  fechar: (d: any) => invoke('caixa:fechar', d),
  buscarAberto: (pdv?: number) => invoke('caixa:buscar-aberto', pdv ?? 1),
  suprimento: (d: any) => invoke('caixa:suprimento', d),
  sangria: (d: any) => invoke('caixa:sangria', d),
  calcularTotais: (caixa_id: number) => invoke('caixa:totais', caixa_id),
  movimentacoes: (caixa_id: number) => invoke('caixa:movimentacoes', caixa_id),
  historico: () => invoke('caixa:historico'),
};

// ── VENDAS ────────────────────────────────────────────────────────────────────
export type ItemVenda = {
  produto_id: number; nome_produto: string; codigo_barras?: string;
  quantidade: number; preco_unitario: number; preco_custo?: number;
  desconto_valor?: number; desconto_percentual?: number; total: number;
};
export type Pagamento = { forma: string; valor: number; parcelas?: number };

export const vendasAPI = {
  criar: (d: any) => invoke('vendas:criar', d),
  cancelar: (id: number, motivo: string, usuario_id: number) =>
    invoke('vendas:cancelar', { id, motivo, usuario_id }),
  buscar: (id: number) => invoke('vendas:buscar', id),
  itens: (id: number) => invoke('vendas:itens', id),
  pagamentos: (id: number) => invoke('vendas:pagamentos', id),
  listar: (f?: any) => invoke('vendas:listar', f),
};

// ── PEDIDOS ───────────────────────────────────────────────────────────────────
export const pedidosAPI = {
  criar: (d: any) => invoke('pedidos:criar', d),
  buscar: (id: number) => invoke('pedidos:buscar', id),
  itens: (id: number) => invoke('pedidos:itens', id),
  listar: (f?: any) => invoke('pedidos:listar', f),
  atualizarStatus: (id: number, status: string) => invoke('pedidos:atualizar-status', { id, status }),
  converterEmVenda: (pedido_id: number, d: any) => invoke('pedidos:converter-venda', { pedido_id, ...d }),
};

// ── CONFERÊNCIA ───────────────────────────────────────────────────────────────
export const conferenciaAPI = {
  dadosSistema: (data: string, pdv?: number) => invoke('conferencia:dados-sistema', { data, pdv: pdv ?? 1 }),
  salvar: (d: any) => invoke('conferencia:salvar', d),
  listar: (f?: { mes?: number; ano?: number; inicio?: string; fim?: string; pdv?: number }) =>
    invoke('conferencia:listar', f || {}),
  pdvsAtivos: () => invoke('conferencia:pdvs-ativos', null),
};

// ── RELATÓRIOS ────────────────────────────────────────────────────────────────
export const relatoriosAPI = {
  resumo: (inicio: string, fim: string) => invoke('relatorios:resumo', { inicio, fim }),
  vendasPorDia: (inicio: string, fim: string) => invoke('relatorios:vendas-por-dia', { inicio, fim }),
  vendasPorMes: (ano: number) => invoke('relatorios:vendas-por-mes', { ano }),
  topProdutos: (inicio: string, fim: string, limite?: number) =>
    invoke('relatorios:top-produtos', { inicio, fim, limite }),
  formaPagamento: (inicio: string, fim: string) => invoke('relatorios:forma-pagamento', { inicio, fim }),
  estoqueCritico: () => invoke('relatorios:estoque-critico'),
  fluxoCaixa: (inicio: string, fim: string) => invoke('relatorios:fluxo-caixa', { inicio, fim }),
};

// ── FINANCEIRO ────────────────────────────────────────────────────────────────
export const financeiroAPI = {
  listar: (f?: any) => invoke('financeiro:listar', f),
  criar: (d: any) => invoke('financeiro:criar', d),
  baixar: (id: number, valor_pago: number, forma: string, data: string) =>
    invoke('financeiro:baixar', { id, valor_pago, forma, data }),
};

// ── SISTEMA ───────────────────────────────────────────────────────────────────
export const sistemaAPI = {
  backupExportar: () => window.vyn?.backupExportar(),
  backupImportar: () => window.vyn?.backupImportar(),
  abrirPastaDados: () => window.vyn?.abrirPastaDados(),
  getServerIP: (): Promise<string> => {
    // Always returns just the IP address (not full URL)
    if (window.vyn) return window.vyn.getServerIP();
    return Promise.resolve(window.location.hostname);
  },
  getMode: (): Promise<string> =>
    window.vyn?.getMode() ?? Promise.resolve('client'),
  setServerURL: (url: string) => { localStorage.setItem('vyn_server_url', url); },
  getServerURL,
};

// ── Logo da loja (acessível na rede) ────────────────────────────────────────
/** Retorna URL da logo que funciona tanto no servidor quanto nos clientes da rede */
export function getLogoURL(): string {
  return getServerURL() + '/api/logo';
}
export const relatoriosAvancadosAPI = {
  curvaABC: (inicio: string, fim: string) => invoke('relatorios:curva-abc', { inicio, fim }),
  vendasPorPDV: (inicio: string, fim: string) => invoke('relatorios:vendas-pdv', { inicio, fim }),
  rankingClientes: (inicio: string, fim: string, limite?: number) =>
    invoke('relatorios:ranking-clientes', { inicio, fim, limite }),
  lucroPeriodo: (inicio: string, fim: string) => invoke('relatorios:lucro-periodo', { inicio, fim }),
  lucroRealMes: (mes: number, ano: number) => invoke('relatorios:lucro-real-mes', { mes, ano }),
};

// ── DESPESAS ──────────────────────────────────────────────────────────────────
export const despesasAPI = {
  listar: (mes?: number, ano?: number) => invoke('despesas:listar', { mes, ano }),
  criar: (d: any) => invoke('despesas:criar', d),
  atualizar: (id: number, d: any) => invoke('despesas:atualizar', { id, ...d }),
  deletar: (id: number) => invoke('despesas:deletar', id),
  categorias: () => invoke('despesas:categorias'),
};

// ── TROCAS ────────────────────────────────────────────────────────────────────
export const trocasAPI = {
  buscarVendaPorNumero: (numero: string) => invoke('trocas:buscar-venda', numero),
  criar: (d: any) => invoke('trocas:criar', d),
  buscar: (id: number) => invoke('trocas:buscar', id),
  listar: (f?: any) => invoke('trocas:listar', f),
  extornoAssinar: (troca_id: number) => invoke('trocas:extorno-assinar', troca_id),
  defeitosListar: (f?: any) => invoke('trocas:defeitos-listar', f),
  defeitoStatus: (id: number, status: string, obs?: string) =>
    invoke('trocas:defeito-status', { id, status, observacoes: obs }),
  creditosCliente: (cliente_id: number) => invoke('trocas:creditos-cliente', cliente_id),
  usarCredito: (credito_id: number, valor_usar: number, venda_id?: number) =>
    invoke('trocas:usar-credito', { credito_id, valor_usar, venda_id }),
  buscarVoucher: (codigo: string) => invoke('trocas:buscar-voucher', codigo),
  usarVoucher: (codigo: string, valor_usar: number, venda_id?: number) =>
    invoke('trocas:usar-voucher', { codigo, valor_usar, venda_id }),
};

// ── FORNECEDORES ──────────────────────────────────────────────────────────────
export const fornecedoresAPI = {
  listar:      (f?: any)               => invoke('fornecedores:listar', f),
  buscarPorId: (id: number)            => invoke('fornecedores:buscar-id', id),
  criar:       (d: any)                => invoke('fornecedores:criar', d),
  atualizar:   (id: number, d: any)    => invoke('fornecedores:atualizar', { id, ...d }),
  deletar:     (id: number)            => invoke('fornecedores:deletar', id),
};

// ── COMPRAS ───────────────────────────────────────────────────────────────────
export const comprasAPI = {
  listar:   (f?: any)                                        => invoke('compras:listar', f),
  buscar:   (id: number)                                     => invoke('compras:buscar', id),
  itens:    (id: number)                                     => invoke('compras:itens', id),
  criar:    (d: any)                                         => invoke('compras:criar', d),
  cancelar: (id: number, motivo: string, usuario_id: number) => invoke('compras:cancelar', { id, motivo, usuario_id }),
  resumo:   (inicio?: string, fim?: string)                  => invoke('compras:resumo', { inicio, fim }),
};

// ── REPRESENTANTES ────────────────────────────────────────────────────────────
export const representantesAPI = {
  listar:      (f?: any)            => invoke('representantes:listar', f),
  buscarPorId: (id: number)         => invoke('representantes:buscar-id', id),
  criar:       (d: any)             => invoke('representantes:criar', d),
  atualizar:   (id: number, d: any) => invoke('representantes:atualizar', { id, ...d }),
  deletar:     (id: number)         => invoke('representantes:deletar', id),
};

// ── COMISSÕES ─────────────────────────────────────────────────────────────────
export const comissoesAPI = {
  gerar:   (venda_id: number, representante_id: number) =>
    invoke('comissoes:gerar', { venda_id, representante_id }),
  listar:  (f?: any)                              => invoke('comissoes:listar', f),
  pagar:   (ids: number[], data_pagamento: string) => invoke('comissoes:pagar', { ids, data_pagamento }),
  resumo:  (inicio?: string, fim?: string)         => invoke('comissoes:resumo', { inicio, fim }),
};

// ── E-COMMERCE ────────────────────────────────────────────────────────────────
// Pedidos online SEPARADOS do PDV — nunca mistura com vendasAPI
export const ecommerceAPI = {
  // Pedidos
  pedidos:          (f?: any)                        => invoke('ecommerce:pedidos-listar', f),
  buscarPedido:     (id: number)                     => invoke('ecommerce:pedido-buscar', id),
  itensPedido:      (id: number)                     => invoke('ecommerce:pedido-itens', id),
  importarPedido:   (pedido: any)                    => invoke('ecommerce:pedido-importar', pedido),
  atualizarStatus:  (id: number, status: string)     => invoke('ecommerce:pedido-status', { id, status }),
  // Relatório exclusivo e-commerce
  relatorio:        (inicio?: string, fim?: string)  => invoke('ecommerce:relatorio', { inicio, fim }),
  // Produtos online
  produtosOnline:   (f?: any)                        => invoke('ecommerce:produtos-online', f),
  marcarProduto:    (produto_id: number, dados: any) => invoke('ecommerce:marcar-produto', { produto_id, ...dados }),

  // Sincronização com Supabase (chamada HTTP direta — não passa pelo IPC)
  sincronizarSupabase: async (supabaseUrl: string, supabaseKey: string) => {
    if (!supabaseUrl || !supabaseKey) throw new Error('Configure o Supabase nas configurações da loja online');

    const headers = {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json',
    };

    // 1. Busca pedidos não sincronizados do Supabase
    const resPedidos = await fetch(
      `${supabaseUrl}/rest/v1/pedidos_online?astia_sincronizado=eq.false&select=*,itens_pedido_online(*)`,
      { headers }
    );
    if (!resPedidos.ok) throw new Error('Erro ao buscar pedidos do Supabase');
    const pedidosSupabase = await resPedidos.json();

    let importados = 0;
    for (const p of pedidosSupabase) {
      const itens = (p.itens_pedido_online || []).map((i: any) => ({
        astia_produto_id: i.astia_produto_id,
        nome_produto:     i.nome_produto,
        quantidade:       i.quantidade,
        preco_unitario:   i.preco_unitario,
        total:            i.total,
      }));
      await invoke('ecommerce:pedido-importar', {
        supabase_id:          p.id,
        numero:               p.numero,
        cliente_nome:         p.cliente_nome,
        cliente_telefone:     p.cliente_telefone,
        cliente_email:        p.cliente_email,
        tipo_entrega:         p.tipo_entrega,
        endereco_bairro:      p.endereco_bairro,
        endereco_rua:         p.endereco_rua,
        endereco_numero:      p.endereco_numero,
        endereco_complemento: p.endereco_complemento,
        subtotal:             p.subtotal,
        frete:                p.frete,
        total:                p.total,
        status:               p.status,
        observacoes:          p.observacoes,
        itens,
      });

      // Marca como sincronizado no Supabase
      await fetch(`${supabaseUrl}/rest/v1/pedidos_online?id=eq.${p.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ astia_sincronizado: true }),
      });
      importados++;
    }

    // 2. Envia produtos marcados para o Supabase
    const produtosLocais = await invoke('ecommerce:produtos-online', {});
    for (const prod of produtosLocais) {
      await fetch(`${supabaseUrl}/rest/v1/produtos_online?astia_id=eq.${prod.id}`, {
        method: 'UPSERT' as any,
        headers: { ...headers, 'Prefer': 'resolution=merge-duplicates' },
        body: JSON.stringify({
          astia_id:       prod.id,
          nome:           prod.nome,
          descricao:      prod.online_descricao || prod.descricao || '',
          preco:          prod.preco_venda,
          foto_url:       prod.online_foto_url || null,
          categoria_nome: prod.categoria_nome || '',
          estoque:        prod.estoque_atual || 0,
          ativo:          prod.ativo === 1,
          destaque:       prod.online_destaque === 1,
          atualizado_em:  new Date().toISOString(),
        }),
      });
    }

    // 3. Atualiza config da loja no Supabase
    const config = await invoke('config:get', undefined);
    if (config) {
      await fetch(`${supabaseUrl}/rest/v1/loja_config?id=neq.null`, {
        method: 'PATCH',
        headers: { ...headers, 'Prefer': 'return=minimal' },
        body: JSON.stringify({ astia_ultimo_sync: new Date().toISOString() }),
      });
    }

    return { importados, produtos_enviados: produtosLocais.length };
  },
};

// ── FLYERS & PROMOÇÕES ────────────────────────────────────────────────────
export const flyersAPI = {
  pertoValidade:    (dias = 7)      => invoke('flyers:perto-validade', { dias }),
  estoqueAlto:      (minimo = 20)   => invoke('flyers:estoque-alto', { minimo }),
  buscarProdutos:   (busca: string) => invoke('flyers:buscar-produtos', { busca }),
  listarTodos:      ()              => invoke('flyers:listar-todos', {}),
  salvar:           (dados: any)    => invoke('flyers:salvar', dados),
  // gerarPDF e logoBase64 têm ipcMain.handle próprio — chamada direta, sem passar pelo dispatcher ipc:call
  gerarPDF: (html: string, nomeArquivo: string) =>
    hasDirectIpc()
      ? directIpcCall('flyer:gerar-pdf', { html, nomeArquivo })
      : Promise.resolve({ ok: false, erro: 'Só disponível no app desktop' }),
  logoBase64: (): Promise<string | null> =>
    hasDirectIpc()
      ? directIpcCall('app:logo-base64', {})
      : Promise.resolve(null),
};

export const licenseAPI = {
  status: async () => {
    if (window.vyn?.licenseStatus) {
      const r = await window.vyn.licenseStatus();
      if (!r.ok) throw new Error(r.error || 'Erro ao consultar licença');
      return r.result;
    }
    return httpJson('/api/license/status', 'GET');
  },
  activate: async (licenseKey: string, serverUrl?: string) => {
    if (window.vyn?.licenseActivate) {
      const r = await window.vyn.licenseActivate({ licenseKey, serverUrl });
      if (!r.ok) throw new Error(r.error || 'Erro ao ativar licença');
      return r.result;
    }
    return httpJson('/api/license/activate', 'POST', { licenseKey, serverUrl });
  },
  verify: async () => {
    if (window.vyn?.licenseVerify) {
      const r = await window.vyn.licenseVerify();
      if (!r.ok) throw new Error(r.error || 'Erro ao validar licença');
      return r.result;
    }
    return httpJson('/api/license/verify', 'POST', {});
  },
};
