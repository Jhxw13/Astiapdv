/**
 * VYN CRM — Main Process v6.0
 * Corrigido: tela cinza em IP local, base '/' no vite, serve SPA corretamente
 */
const { app, BrowserWindow, ipcMain, dialog, Menu, shell } = require('electron');
let autoUpdater = null;
try { autoUpdater = require('electron-updater').autoUpdater; } catch {}
const path  = require('path');
const fs    = require('fs');
const os    = require('os');
const http  = require('http');
const { createLicenseManager } = require('./license');

const IS_CLIENT   = process.argv.includes('--client') 
  || process.env.VYN_MODE === 'client'
  || app.getName().toLowerCase().includes('cliente')
  || (app.isPackaged && require('path').basename(process.execPath).toLowerCase().includes('cliente'));
const SERVER_HOST = process.env.VYN_SERVER_HOST
  || process.argv.find(a => a.startsWith('--host='))?.replace('--host=','')
  || null;
const isDev = !app.isPackaged && process.env.NODE_ENV === 'development';

let mainWindow = null, httpServer = null, db = null;
let licenseManager = null;
const pendingApprovals = new Map();

// ── Cloudflare Tunnel (Quick Tunnel — sem conta, grátis) ──────────────────
let tunnelProcess  = null;
let tunnelURL      = null;   // URL pública atual
let tunnelStatus   = 'off';  // off | starting | active | error
let tunnelLog      = [];

const CLOUDFLARED_URLS = {
  win32:  { x64: 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe' },
  darwin: { x64: 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-amd64.tgz',
            arm64:'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-arm64.tgz' },
  linux:  { x64: 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64',
            arm64:'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64' },
};

function getCloudflaredPath() {
  const ext = process.platform === 'win32' ? '.exe' : '';
  return path.join(app.getPath('userData'), `cloudflared${ext}`);
}

async function downloadCloudflared() {
  const plat = process.platform;
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
  const url  = CLOUDFLARED_URLS[plat]?.[arch];
  if (!url) throw new Error(`Plataforma não suportada: ${plat}/${arch}`);

  const dest = getCloudflaredPath();
  tunnelLog.push(`Baixando cloudflared para ${plat}/${arch}...`);
  notifyTunnel();

  return new Promise((resolve, reject) => {
    const https  = require('https');
    const follow = (u, depth = 0) => {
      if (depth > 5) return reject(new Error('Muitos redirecionamentos'));
      https.get(u, { headers: { 'User-Agent': 'ASTIA-PDV' } }, res => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          return follow(res.headers.location, depth + 1);
        }
        if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));

        // Para .tgz no macOS, precisaria extrair — por ora, só Linux/Win
        const out = fs.createWriteStream(dest);
        res.pipe(out);
        out.on('finish', () => {
          out.close();
          if (process.platform !== 'win32') {
            fs.chmodSync(dest, 0o755);
          }
          tunnelLog.push('Download concluído.');
          notifyTunnel();
          resolve(dest);
        });
        out.on('error', reject);
      }).on('error', reject);
    };
    follow(url);
  });
}

function notifyTunnel() {
  mainWindow?.webContents?.send('tunnel:status', {
    status: tunnelStatus,
    url: tunnelURL,
    log: tunnelLog.slice(-20),
  });
}

async function startTunnel() {
  if (IS_CLIENT) return;
  if (tunnelProcess) return; // já rodando

  tunnelStatus = 'starting';
  tunnelURL    = null;
  tunnelLog    = ['Iniciando túnel Cloudflare...'];
  notifyTunnel();

  try {
    // Garante que cloudflared existe
    const cfPath = getCloudflaredPath();
    if (!fs.existsSync(cfPath)) {
      await downloadCloudflared();
    }

    const { spawn } = require('child_process');
    tunnelProcess = spawn(cfPath, ['tunnel', '--url', 'http://localhost:3567'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const parseURL = (chunk) => {
      const text = chunk.toString();
      tunnelLog.push(...text.split('\n').filter(l => l.trim()));
      // Cloudflared imprime a URL no stderr no formato: https://xxxx.trycloudflare.com
      const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
      if (match && !tunnelURL) {
        tunnelURL   = match[0];
        tunnelStatus = 'active';
        tunnelLog.push(`✅ Túnel ativo: ${tunnelURL}`);
        // Salva no banco para o prompt do GPT Maker usar
        try { db?.configLoja?.set?.('tunnel_url', tunnelURL); } catch {}
      }
      notifyTunnel();
    };

    tunnelProcess.stdout.on('data', parseURL);
    tunnelProcess.stderr.on('data', parseURL);

    tunnelProcess.on('close', (code) => {
      tunnelProcess = null;
      tunnelURL     = null;
      tunnelStatus  = code === 0 ? 'off' : 'error';
      tunnelLog.push(code === 0 ? 'Túnel encerrado.' : `Túnel encerrado com erro (código ${code})`);
      notifyTunnel();
    });

    tunnelProcess.on('error', (err) => {
      tunnelStatus = 'error';
      tunnelLog.push(`Erro: ${err.message}`);
      notifyTunnel();
    });

  } catch (err) {
    tunnelStatus = 'error';
    tunnelLog.push(`Erro ao iniciar túnel: ${err.message}`);
    notifyTunnel();
  }
}

function stopTunnel() {
  if (tunnelProcess) {
    tunnelProcess.kill();
    tunnelProcess = null;
  }
  tunnelURL    = null;
  tunnelStatus = 'off';
  tunnelLog.push('Túnel desativado.');
  notifyTunnel();
}

function getDbPath()   { return path.join(app.getPath('userData'), 'vyncrm.db'); }
function getDistPath() {
  if (app.isPackaged) {
    // dist is in asarUnpack, so it lands in app.asar.unpacked/dist
    // This is accessible by Node's regular fs (not patched Electron fs)
    const unpackedDist = path.join(process.resourcesPath, 'app.asar.unpacked', 'dist');
    if (fs.existsSync(unpackedDist)) return unpackedDist;
    // Fallback for older builder versions
    const legacyDist = path.join(process.resourcesPath, 'app', 'dist');
    if (fs.existsSync(legacyDist)) return legacyDist;
    return unpackedDist; // return best guess even if not found yet
  }
  return path.join(__dirname, '..', '..', 'dist');
}
function getLocalIP() {
  const ifaces = os.networkInterfaces();
  const candidates = [];
  for (const name of Object.keys(ifaces)) {
    // Ignora interfaces virtuais comuns (VMware, VirtualBox, WSL, Docker)
    if (/vmware|virtualbox|vethernet|docker|wsl|loopback/i.test(name)) continue;
    for (const i of ifaces[name]) {
      if (i.family === 'IPv4' && !i.internal) {
        // Prioriza faixas de rede local típicas
        if (i.address.startsWith('192.168.') || i.address.startsWith('10.') || i.address.startsWith('172.')) {
          candidates.unshift(i.address); // maior prioridade
        } else {
          candidates.push(i.address);
        }
      }
    }
  }
  return candidates[0] || '127.0.0.1';
}

// ── Dispatcher de canais do banco ─────────────────────────────────────────────
function handleDBCall(channel, data) {
  if (!db) throw new Error('Banco nao inicializado');
  const h = {
    'auth:login':                 () => db.auth.login(data.email, data.senha),
    'auth:trocar-senha':          () => db.auth.trocarSenha(data.usuario_id, data.senhaAtual, data.novaSenha),
    'auth:criar-usuario':         () => db.auth.criarUsuario(data),
    'auth:listar-usuarios':       () => db.auth.listarUsuarios(),
    'auth:ativar-desativar':      () => db.auth.ativarDesativar(data.id, data.ativo),
    'config:get':                 () => db.configLoja.get(),
    'config:update':              () => { db.configLoja.update(data); return true; },
    'categorias:listar':          () => db.categorias.listar(),
    'categorias:criar':           () => db.categorias.criar(data),
    'categorias:atualizar':       () => db.categorias.atualizar(data.id, data),
    'categorias:deletar':         () => db.categorias.deletar(data),
    'produtos:listar':            () => db.produtos.listar(data),
    'produtos:buscar-codigo':     () => db.produtos.buscarPorCodigo(data),
    'produtos:buscar-id':         () => db.produtos.buscarPorId(data),
    'produtos:criar':             () => db.produtos.criar(data),
    'produtos:atualizar':         () => db.produtos.atualizar(data.id, data),
    'produtos:deletar':           () => db.produtos.deletar(data),
    'produtos:estoque-baixo':     () => db.produtos.estoqueBaixo(),
    'estoque:listar':             () => db.estoque.listar(data),
    'estoque:ajustar':            () => db.estoque.ajustar(data.produto_id, data.quantidade, data.motivo, data.usuario_id),
    'estoque:entrada':            () => db.estoque.entrada(data.produto_id, data.quantidade, data.preco_custo, data.motivo, data.usuario_id),
    'clientes:listar':            () => db.clientes.listar(data),
    'clientes:buscar-id':         () => db.clientes.buscarPorId(data),
    'clientes:criar':             () => db.clientes.criar(data),
    'clientes:atualizar':         () => db.clientes.atualizar(data.id, data),
    'clientes:deletar':           () => db.clientes.deletar(data),
    'clientes:historico':         () => db.clientes.historico(data),
    'caixa:abrir':                () => db.caixa.abrir(data),
    'caixa:fechar':               () => db.caixa.fechar(data),
    'caixa:buscar-aberto':        () => db.caixa.buscarAberto(data),
    'caixa:suprimento':           () => db.caixa.suprimento(data),
    'caixa:sangria':              () => db.caixa.sangria(data),
    'caixa:totais':               () => db.caixa.calcularTotais(data),
    'caixa:movimentacoes':        () => db.caixa.movimentacoes(data),
    'caixa:historico':            () => db.caixa.historico(),
    'vendas:criar':               () => db.vendas.criar(data),
    'vendas:cancelar':            () => db.vendas.cancelar(data.id, data.motivo, data.usuario_id),
    'vendas:buscar':              () => db.vendas.buscar(data),
    'vendas:itens':               () => db.vendas.itens(data),
    'vendas:pagamentos':          () => db.vendas.pagamentos(data),
    'vendas:listar':              () => db.vendas.listar(data),
    'pedidos:criar':              () => db.pedidos.criar(data),
    'pedidos:buscar':             () => db.pedidos.buscar(data),
    'pedidos:itens':              () => db.pedidos.itens(data),
    'pedidos:listar':             () => db.pedidos.listar(data),
    'pedidos:atualizar-status':   () => db.pedidos.atualizarStatus(data.id, data.status),
    'pedidos:converter-venda':    () => db.pedidos.converterEmVenda(data.pedido_id, data),
    'conferencia:dados-sistema':  () => db.conferencia.dadosSistema(data.data, data.pdv),
    'conferencia:salvar':         () => db.conferencia.salvar(data),
    'conferencia:listar':         () => db.conferencia.listar(data),
    'conferencia:pdvs-ativos':    () => db.conferencia.pdvsAtivos(),
    'relatorios:resumo':          () => db.relatorios.resumo(data.inicio, data.fim),
    'relatorios:vendas-por-dia':  () => db.relatorios.vendasPorDia(data.inicio, data.fim),
    'relatorios:vendas-por-mes':  () => db.relatorios.vendasPorMes(data.ano),
    'relatorios:top-produtos':    () => db.relatorios.topProdutos(data.inicio, data.fim, data.limite),
    'relatorios:forma-pagamento': () => db.relatorios.formaPagamento(data.inicio, data.fim),
    'relatorios:estoque-critico': () => db.relatorios.estoqueCritico(),
    'relatorios:fluxo-caixa':     () => db.relatorios.fluxoCaixa(data.inicio, data.fim),
    'financeiro:listar':          () => db.financeiro.listar(data),
    'financeiro:criar':           () => db.financeiro.criar(data),
    'financeiro:baixar':          () => db.financeiro.baixar(data.id, data.valor_pago, data.forma, data.data),
    'relatorios:curva-abc':       () => db.relatorios.curvaABC(data.inicio, data.fim),
    'relatorios:vendas-pdv':      () => db.relatorios.vendasPorPDV(data.inicio, data.fim),
    'relatorios:ranking-clientes':() => db.relatorios.rankingClientes(data.inicio, data.fim, data.limite),
    'relatorios:lucro-periodo':   () => db.relatorios.lucroPeriodo(data.inicio, data.fim),
    'relatorios:lucro-real-mes':  () => db.relatorios.lucroRealMes(data.mes, data.ano),
    'despesas:listar':            () => db.despesas.listar(data?.mes, data?.ano),
    'despesas:criar':             () => db.despesas.criar(data),
    'despesas:atualizar':         () => db.despesas.atualizar(data.id, data),
    'despesas:deletar':           () => db.despesas.deletar(data),
    'despesas:categorias':        () => db.despesas.categorias(),
    'trocas:buscar-venda':        () => db.trocas.buscarVendaPorNumero(data),
    'trocas:criar':               () => db.trocas.criar(data),
    'trocas:buscar':              () => db.trocas.buscar(data),
    'trocas:listar':              () => db.trocas.listar(data),
    'trocas:extorno-assinar':     () => db.trocas.marcarExtornoAssinado(data),
    'trocas:defeitos-listar':     () => db.trocas.listarDefeitos(data),
    'trocas:defeito-status':      () => db.trocas.atualizarStatusDefeito(data.id, data.status, data.observacoes),
    'trocas:creditos-cliente':    () => db.trocas.creditosCliente(data),
    'trocas:usar-credito':        () => db.trocas.usarCredito(data.credito_id, data.valor_usar, data.venda_id),
    'trocas:buscar-voucher':      () => db.trocas.buscarVoucher(data),
    'trocas:usar-voucher':        () => db.trocas.usarVoucher(data.codigo, data.valor_usar, data.venda_id),
    // ── Fornecedores ──────────────────────────────────────────────────────────
    'fornecedores:listar':        () => db.fornecedores.listar(data),
    'fornecedores:buscar-id':     () => db.fornecedores.buscarPorId(data),
    'fornecedores:criar':         () => db.fornecedores.criar(data),
    'fornecedores:atualizar':     () => db.fornecedores.atualizar(data.id, data),
    'fornecedores:deletar':       () => db.fornecedores.deletar(data),
    // ── Compras ───────────────────────────────────────────────────────────────
    'compras:listar':             () => db.compras.listar(data),
    'compras:buscar':             () => db.compras.buscar(data),
    'compras:itens':              () => db.compras.itens(data),
    'compras:criar':              () => db.compras.criar(data),
    'compras:cancelar':           () => db.compras.cancelar(data.id, data.motivo, data.usuario_id),
    'compras:resumo':             () => db.compras.resumo(data?.inicio, data?.fim),
    // ── Representantes ────────────────────────────────────────────────────────
    'representantes:listar':      () => db.representantes.listar(data),
    'representantes:buscar-id':   () => db.representantes.buscarPorId(data),
    'representantes:criar':       () => db.representantes.criar(data),
    'representantes:atualizar':   () => db.representantes.atualizar(data.id, data),
    'representantes:deletar':     () => db.representantes.deletar(data),
    // ── Comissões ─────────────────────────────────────────────────────────────
    'comissoes:gerar':            () => db.comissoes.gerarParaVenda(data.venda_id, data.representante_id),
    'comissoes:listar':           () => db.comissoes.listar(data),
    'comissoes:pagar':            () => db.comissoes.pagar(data.ids, data.data_pagamento),
    'comissoes:resumo':           () => db.comissoes.resumoPorRepresentante(data?.inicio, data?.fim),
    // ── E-commerce (pedidos online — SEPARADO do PDV) ─────────────────────────
    'ecommerce:pedidos-listar':     () => db.pedidosOnline.listar(data),
    'ecommerce:pedido-buscar':      () => db.pedidosOnline.buscar(data),
    'ecommerce:pedido-itens':       () => db.pedidosOnline.itens(data),
    'ecommerce:pedido-importar':    () => db.pedidosOnline.importarDoSupabase(data),
    'ecommerce:pedido-status':      () => db.pedidosOnline.atualizarStatus(data.id, data.status),
    'ecommerce:relatorio':          () => db.pedidosOnline.relatorio(data?.inicio, data?.fim),
    'ecommerce:produtos-online':    () => db.pedidosOnline.produtosOnline(data),
    'ecommerce:marcar-produto':     () => db.pedidosOnline.marcarProduto(data.produto_id, data),
    // ── Flyers & Promoções ────────────────────────────────────────────────────
    'flyers:perto-validade':  () => db.flyers.perto_validade(data?.dias ?? 7),
    'flyers:estoque-alto':    () => db.flyers.estoque_alto(data?.minimo ?? 20),
    'flyers:buscar-produtos': () => db.flyers.buscar(data?.busca ?? ''),
    'flyers:listar-todos':    () => db.flyers.listarTodos(),
    'flyers:salvar':          () => db.flyers.salvar(data),
  };
  const fn = h[channel];
  if (!fn) throw new Error(`Canal desconhecido: ${channel}`);
  return fn();
}

function isLicenseFreeChannel(channel) {
  return [
    'auth:login',
    'config:get',
  ].includes(channel);
}

function assertLicenseForChannel(channel) {
  if (!licenseManager) return;
  if (isLicenseFreeChannel(channel)) return;
  const st = licenseManager.getStatus();
  if (!st.accessAllowed) {
    throw new Error(`LICENCA_BLOQUEADA: ${st.reason || 'Licença inativa'}`);
  }
}

// ── Servidor HTTP ─────────────────────────────────────────────────────────────
function startHTTPServer() {
  const PORT = 3567;
  const MIME = {
    '.html':'text/html;charset=utf-8', '.js':'text/javascript;charset=utf-8',
    '.css':'text/css;charset=utf-8', '.png':'image/png', '.jpg':'image/jpeg',
    '.jpeg':'image/jpeg', '.ico':'image/x-icon', '.svg':'image/svg+xml',
    '.woff2':'font/woff2', '.woff':'font/woff', '.ttf':'font/ttf',
    '.json':'application/json', '.webp':'image/webp', '.map':'application/json',
    '.gz':'application/gzip',
  };

  httpServer = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin','*');
    res.setHeader('Access-Control-Allow-Methods','POST,GET,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers','Content-Type');
    if (req.method==='OPTIONS'){res.writeHead(204);res.end();return;}

    // ── /ping ──────────────────────────────────────────────────────────────────
    if (req.url==='/ping'){
      res.writeHead(200,{'Content-Type':'application/json'});
      res.end(JSON.stringify({ok:true,ip:getLocalIP(),version:'6.0'}));
      return;
    }

    // ── /api/scanner — recebe código lido pelo celular ────────────────────────
    if (req.url==='/api/scanner' && req.method==='POST'){
      let body='';
      req.on('data',c=>{body+=c;});
      req.on('end',()=>{
        try{
          const {codigo, produto_id} = JSON.parse(body);
          if(mainWindow && mainWindow.webContents){
            mainWindow.webContents.send('scanner:codigo', { codigo, produto_id });
          }
          res.writeHead(200,{'Content-Type':'application/json'});
          res.end(JSON.stringify({ok:true,codigo}));
        }catch(err){
          res.writeHead(200,{'Content-Type':'application/json'});
          res.end(JSON.stringify({ok:false,error:err.message}));
        }
      });
      return;
    }

    // ── /scanner — página standalone do scanner mobile ────────────────────────
    // Serve HTML puro com câmera. Headers especiais permitem camera em HTTP local.
    if (req.url==='/scanner' || req.url==='/scanner/'){
      const serverIp = getLocalIP();
      const lojaNome = (() => { try { return db?.configLoja?.get?.()?.nome || 'ASTIA PDV'; } catch { return 'ASTIA PDV'; } })();
      const scannerHtml = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no"/>
<meta name="mobile-web-app-capable" content="yes"/>
<meta name="apple-mobile-web-app-capable" content="yes"/>
<title>Scanner — ${lojaNome}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box;}
body{background:#0a0a0a;color:#f0f0f0;font-family:system-ui,sans-serif;min-height:100vh;display:flex;flex-direction:column;align-items:center;}
h1{font-size:20px;font-weight:800;padding:16px;text-align:center;letter-spacing:-0.02em;}
h1 span{color:#7c5cfc;}
.modos{display:flex;gap:8px;padding:0 16px 12px;width:100%;}
.modo-btn{flex:1;padding:10px;border-radius:12px;border:2px solid #333;background:transparent;color:#aaa;font-size:13px;font-weight:600;cursor:pointer;transition:all 0.2s;}
.modo-btn.ativo{border-color:#7c5cfc;background:#7c5cfc22;color:#a78bfa;}
#viewport{position:relative;width:100%;max-width:480px;aspect-ratio:4/3;background:#111;overflow:hidden;}
#video{width:100%;height:100%;object-fit:cover;display:block;}
#overlay{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;}
.mira{width:65%;aspect-ratio:1;border:2px solid rgba(124,92,252,0.7);border-radius:12px;box-shadow:0 0 0 9999px rgba(0,0,0,0.45);position:relative;}
.mira::before,.mira::after,.mira .c2,.mira .c3{content:'';position:absolute;width:22px;height:22px;border-color:#7c5cfc;border-style:solid;}
.mira::before{top:-2px;left:-2px;border-width:3px 0 0 3px;border-radius:10px 0 0 0;}
.mira::after{top:-2px;right:-2px;border-width:3px 3px 0 0;border-radius:0 10px 0 0;}
.mira .c2{bottom:-2px;left:-2px;border-width:0 0 3px 3px;border-radius:0 0 0 10px;}
.mira .c3{bottom:-2px;right:-2px;border-width:0 3px 3px 0;border-radius:0 0 10px 0;}
.scan-line{position:absolute;left:8px;right:8px;height:2px;background:linear-gradient(90deg,transparent,#7c5cfc,transparent);animation:scan 2s ease-in-out infinite;}
@keyframes scan{0%{top:10%;}100%{top:88%;}}
#resultado{width:100%;max-width:480px;margin:12px 16px;padding:14px;border-radius:14px;border:2px solid #333;background:#111;display:none;}
#resultado.ok{border-color:#22c55e44;background:#052e16;}
#resultado.erro{border-color:#ef444444;background:#450a0a;}
#res-codigo{font-size:11px;color:#666;font-family:monospace;margin-bottom:4px;}
#res-nome{font-size:16px;font-weight:700;margin-bottom:4px;}
#res-preco{font-size:24px;font-weight:900;color:#22c55e;}
#res-msg{font-size:14px;color:#ef4444;}
#btn-camera{margin:12px 16px;padding:14px 32px;border-radius:14px;background:#7c5cfc;color:white;border:none;font-size:16px;font-weight:700;cursor:pointer;width:calc(100% - 32px);max-width:480px;transition:opacity 0.2s;}
#btn-camera:disabled{opacity:0.5;cursor:not-allowed;}
#status{font-size:12px;color:#666;padding:4px 16px;text-align:center;}
#historico{width:100%;max-width:480px;padding:0 16px 16px;}
#historico h3{font-size:12px;color:#555;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.05em;}
.hist-item{display:flex;align-items:center;gap:10px;padding:8px 10px;background:#111;border-radius:10px;margin-bottom:6px;border:1px solid #222;}
.hist-cod{font-family:monospace;font-size:10px;color:#555;flex:1;overflow:hidden;text-overflow:ellipsis;}
.hist-nome{font-size:12px;font-weight:600;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.hist-preco{font-size:12px;font-weight:700;color:#7c5cfc;white-space:nowrap;}
#permissao-aviso{max-width:480px;margin:20px 16px;padding:20px;background:#111;border:2px solid #f59e0b44;border-radius:14px;text-align:center;display:none;}
#permissao-aviso h3{color:#f59e0b;margin-bottom:8px;}
#permissao-aviso p{font-size:13px;color:#888;line-height:1.6;}
#permissao-aviso ol{text-align:left;font-size:13px;color:#888;margin:10px 0;padding-left:20px;line-height:2;}
</style>
</head>
<body>
<h1>ASTIA <span>Scanner</span></h1>

<div class="modos">
  <button class="modo-btn ativo" id="btn-consulta" onclick="setModo('consulta')">🔍 Consulta de Preço</button>
  <button class="modo-btn" id="btn-pdv" onclick="setModo('pdv')">🛒 Enviar para PDV</button>
</div>

<div id="viewport" style="display:none">
  <video id="video" autoplay playsinline muted></video>
  <canvas id="canvas" style="display:none"></canvas>
  <div id="overlay"><div class="mira"><div class="c2"></div><div class="c3"></div><div class="scan-line"></div></div></div>
</div>

<div id="resultado">
  <div id="res-codigo"></div>
  <div id="res-nome"></div>
  <div id="res-preco"></div>
  <div id="res-msg"></div>
</div>

<button id="btn-camera" onclick="toggleCamera()">📷 Ativar Scanner</button>
<div id="status"></div>

<div id="permissao-aviso">
  <h3>⚠️ Câmera bloqueada</h3>
  <p>Seu navegador bloqueou o acesso à câmera. Para resolver:</p>
  <ol>
    <li>Toque no ícone de cadeado/câmera na barra do navegador</li>
    <li>Selecione <strong>"Permitir"</strong> para câmera</li>
    <li>Recarregue a página</li>
  </ol>
  <p style="margin-top:8px;font-size:12px;color:#555">Ou acesse pelo Chrome e permita câmera quando solicitado.</p>
</div>

<div id="historico" style="display:none"><h3>Últimas leituras</h3><div id="hist-lista"></div></div>

<script>
const SERVER = 'http://${serverIp}:3567';
let modo = 'consulta';
let stream = null;
let scanning = false;
let loopId = null;
let ultimoCodigo = '';
let ultimoTempo = 0;
let historico = [];

function setModo(m) {
  modo = m;
  document.getElementById('btn-consulta').className = 'modo-btn' + (m==='consulta'?' ativo':'');
  document.getElementById('btn-pdv').className = 'modo-btn' + (m==='pdv'?' ativo':'');
  setStatus(m==='pdv' ? '📡 Modo PDV: código enviado ao computador' : '🔍 Modo Consulta: veja o preço na tela');
}

function setStatus(msg) { document.getElementById('status').textContent = msg; }

async function toggleCamera() {
  if (stream) { pararCamera(); return; }
  await iniciarCamera();
}

async function iniciarCamera() {
  const btn = document.getElementById('btn-camera');
  btn.disabled = true;
  btn.textContent = 'Abrindo câmera...';
  setStatus('');
  document.getElementById('permissao-aviso').style.display = 'none';

  try {
    // Tenta câmera traseira primeiro
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }
    });
  } catch(e1) {
    try {
      // Fallback: qualquer câmera
      stream = await navigator.mediaDevices.getUserMedia({ video: true });
    } catch(e2) {
      btn.disabled = false;
      btn.textContent = '📷 Tentar novamente';
      document.getElementById('permissao-aviso').style.display = 'block';
      setStatus('❌ Sem acesso à câmera — veja as instruções abaixo');
      return;
    }
  }

  const video = document.getElementById('video');
  video.srcObject = stream;
  await video.play();
  document.getElementById('viewport').style.display = 'block';
  btn.disabled = false;
  btn.textContent = '⏹ Parar Scanner';
  setStatus('📷 Scanner ativo — aponte para o código');
  scanning = true;
  iniciarScan();

  // Solicita vibração para confirmar que está ativo
  navigator.vibrate && navigator.vibrate(50);
}

function pararCamera() {
  scanning = false;
  cancelAnimationFrame(loopId);
  if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
  document.getElementById('viewport').style.display = 'none';
  const btn = document.getElementById('btn-camera');
  btn.textContent = '📷 Ativar Scanner';
  setStatus('');
}

function iniciarScan() {
  const video = document.getElementById('video');
  const canvas = document.getElementById('canvas');
  
  const tick = async () => {
    if (!scanning) return;
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);

      // jsQR
      if (window.jsQR) {
        const qr = window.jsQR(imgData.data, imgData.width, imgData.height, { inversionAttempts: 'dontInvert' });
        if (qr?.data) { await processarCodigo(qr.data); return; }
      }

      // BarcodeDetector nativo (Chrome Android)
      if ('BarcodeDetector' in window) {
        try {
          const det = new BarcodeDetector({ formats: ['ean_13','ean_8','code_128','code_39','qr_code','upc_a','upc_e'] });
          const codes = await det.detect(canvas);
          if (codes.length > 0) { await processarCodigo(codes[0].rawValue); return; }
        } catch {}
      }
    }
    loopId = requestAnimationFrame(tick);
  };
  loopId = requestAnimationFrame(tick);
}

async function processarCodigo(codigo) {
  const agora = Date.now();
  if (codigo === ultimoCodigo && agora - ultimoTempo < 3000) {
    loopId = requestAnimationFrame(iniciarScan);
    return;
  }
  ultimoCodigo = codigo;
  ultimoTempo = agora;
  
  // Pausa scan por 2s
  scanning = false;
  navigator.vibrate && navigator.vibrate([50, 30, 50]);

  const divRes = document.getElementById('resultado');
  divRes.style.display = 'block';
  divRes.className = '';
  document.getElementById('res-codigo').textContent = codigo;
  document.getElementById('res-nome').textContent = 'Buscando...';
  document.getElementById('res-preco').textContent = '';
  document.getElementById('res-msg').textContent = '';
  setStatus('🔍 Buscando produto...');

  try {
    // Busca produto no servidor
    const res = await fetch(SERVER + '/api', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel: 'produtos:buscar-codigo', data: codigo })
    });
    const json = await res.json();
    const produto = json.result;

    if (produto) {
      divRes.className = 'ok';
      document.getElementById('res-codigo').textContent = codigo;
      document.getElementById('res-nome').textContent = produto.nome;
      const preco = produto.promocao_ativa && produto.preco_promocional > 0 
        ? produto.preco_promocional : produto.preco_venda;
      document.getElementById('res-preco').textContent = 'R$ ' + Number(preco).toFixed(2).replace('.', ',');
      document.getElementById('res-msg').textContent = '';
      setStatus('✅ ' + produto.nome);
      
      // Adiciona ao histórico
      historico.unshift({ codigo, nome: produto.nome, preco });
      if (historico.length > 8) historico.pop();
      renderHistorico();

      // Modo PDV: envia para o computador
      if (modo === 'pdv') {
        await fetch(SERVER + '/api/scanner', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ codigo, produto_id: produto.id })
        });
        setStatus('📡 Enviado para o PDV: ' + produto.nome);
      }
    } else {
      divRes.className = 'erro';
      document.getElementById('res-nome').textContent = '';
      document.getElementById('res-preco').textContent = '';
      document.getElementById('res-msg').textContent = 'Produto não encontrado';
      setStatus('❌ Código não encontrado: ' + codigo);
      navigator.vibrate && navigator.vibrate([100, 50, 100]);
    }
  } catch(e) {
    divRes.className = 'erro';
    document.getElementById('res-msg').textContent = 'Erro de conexão com o servidor';
    setStatus('❌ Erro de conexão');
  }

  // Retoma scan após 2.5s
  setTimeout(() => {
    if (stream) { scanning = true; iniciarScan(); }
  }, 2500);
}

function renderHistorico() {
  const lista = document.getElementById('hist-lista');
  if (!historico.length) { document.getElementById('historico').style.display = 'none'; return; }
  document.getElementById('historico').style.display = 'block';
  lista.innerHTML = historico.slice(0,6).map(h => \`
    <div class="hist-item">
      <span class="hist-cod">\${h.codigo}</span>
      <span class="hist-nome">\${h.nome}</span>
      <span class="hist-preco">R$ \${Number(h.preco).toFixed(2).replace('.', ',')}</span>
    </div>
  \`).join('');
}

// Carrega jsQR
(function(){
  const s = document.createElement('script');
  s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jsQR/1.4.0/jsQR.min.js';
  document.head.appendChild(s);
})();

// Verifica se câmera está disponível
window.addEventListener('load', () => {
  if (!navigator.mediaDevices?.getUserMedia) {
    document.getElementById('btn-camera').disabled = true;
    document.getElementById('btn-camera').textContent = '❌ Câmera não suportada neste navegador';
    document.getElementById('permissao-aviso').style.display = 'block';
  }
});
</script>
</body>
</html>`;

      // Headers especiais que permitem câmera em HTTP local
      res.writeHead(200, {
        'Content-Type': 'text/html;charset=utf-8',
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp',
        'Permissions-Policy': 'camera=*, microphone=()',
        'Feature-Policy': 'camera *',
        'Cache-Control': 'no-cache',
      });
      res.end(scannerHtml);
      return;
    }

    // ── /api/logo (serve logo da loja para clientes na rede) ──────────────────
    if (req.url==='/api/logo'){
      try {
        const cfg = db?.configLoja?.get?.() || {};
        const logoPath = cfg.logo_path;
        if (logoPath && logoPath.startsWith('data:')) {
          const matches = logoPath.match(/^data:([^;]+);base64,(.+)$/);
          if (matches) {
            const buf = Buffer.from(matches[2], 'base64');
            res.writeHead(200, { 'Content-Type': matches[1], 'Cache-Control': 'public, max-age=3600' });
            res.end(buf); return;
          }
        } else if (logoPath && fs.existsSync(logoPath)) {
          const ext = path.extname(logoPath).toLowerCase();
          const mimeMap = { '.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif' };
          res.writeHead(200, { 'Content-Type': mimeMap[ext]||'image/png', 'Cache-Control': 'public, max-age=3600' });
          fs.createReadStream(logoPath).pipe(res); return;
        }
        res.writeHead(204); res.end();
      } catch { res.writeHead(204); res.end(); }
      return;
    }

    // ── /api (chamadas ao banco) ────────────────────────────────────────────────
    if (req.url==='/api' && req.method==='POST'){
      let body='';
      req.on('data',c=>{body+=c;});
      req.on('end',()=>{
        try{
          const {channel,data}=JSON.parse(body);
          assertLicenseForChannel(channel);
          const result=handleDBCall(channel,data);
          res.writeHead(200,{'Content-Type':'application/json'});
          res.end(JSON.stringify({ok:true,result}));
        }catch(err){
          res.writeHead(200,{'Content-Type':'application/json'});
          res.end(JSON.stringify({ok:false,error:err.message}));
        }
      });
      return;
    }

    // ── /api/license/status ────────────────────────────────────────────────────
    if (req.url === '/api/license/status' && req.method === 'GET') {
      const st = licenseManager?.getStatus?.() || { accessAllowed: true, status: 'unknown' };
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, result: st }));
      return;
    }

    // ── /api/license/activate ─────────────────────────────────────────────────
    if (req.url === '/api/license/activate' && req.method === 'POST') {
      let body = '';
      req.on('data', c => { body += c; });
      req.on('end', async () => {
        try {
          const { licenseKey, serverUrl } = JSON.parse(body || '{}');
          if (!licenseManager) throw new Error('Licenciamento indisponível');
          const st = await licenseManager.activate({ licenseKey, serverUrl });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, result: st }));
        } catch (err) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: err.message }));
        }
      });
      return;
    }

    // ── /api/license/verify ───────────────────────────────────────────────────
    if (req.url === '/api/license/verify' && req.method === 'POST') {
      let body = '';
      req.on('data', c => { body += c; });
      req.on('end', async () => {
        try {
          if (!licenseManager) throw new Error('Licenciamento indisponível');
          const st = await licenseManager.verifyNow();
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, result: st }));
        } catch (err) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: err.message }));
        }
      });
      return;
    }

    // ── /api/liberacao (autorização via QR) ────────────────────────────────────
    if (req.url==='/api/liberacao/criar' && req.method==='POST'){
      let body='';
      req.on('data',c=>{body+=c;});
      req.on('end',()=>{
        try{
          const {descricao}=JSON.parse(body);
          const token=Math.random().toString(36).slice(2)+Date.now().toString(36);
          pendingApprovals.set(token,{status:'pendente',descricao:descricao||'Liberacao solicitada',expira:Date.now()+300000,usuario:null,criadoEm:Date.now()});
          setTimeout(()=>pendingApprovals.delete(token),300000);
          const url=`http://${getLocalIP()}:${PORT}/liberar?token=${token}`;
          res.writeHead(200,{'Content-Type':'application/json'});
          res.end(JSON.stringify({ok:true,token,url}));
        }catch(err){
          res.writeHead(200,{'Content-Type':'application/json'});
          res.end(JSON.stringify({ok:false,error:err.message}));
        }
      });
      return;
    }

    // Lista todas as solicitações pendentes (gerente usa para ver no sistema)
    if (req.url==='/api/liberacao/pendentes' && req.method==='GET'){
      const agora = Date.now();
      const lista = [];
      for (const [token, p] of pendingApprovals.entries()) {
        if (agora > p.expira) { pendingApprovals.delete(token); continue; }
        lista.push({ token, status: p.status, descricao: p.descricao, usuario: p.usuario, criadoEm: p.criadoEm || agora });
      }
      res.writeHead(200,{'Content-Type':'application/json'});
      res.end(JSON.stringify({ok:true,result:lista}));
      return;
    }

    // Gerente aprova diretamente (autenticado pelo sistema, sem precisar de senha extra)
    if (req.url==='/api/liberacao/aprovar' && req.method==='POST'){
      let body='';
      req.on('data',c=>{body+=c;});
      req.on('end',()=>{
        try{
          const {token, nomeGerente} = JSON.parse(body);
          const p = pendingApprovals.get(token);
          if(!p){ res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({ok:false,error:'Token não encontrado ou expirado'})); return; }
          if(Date.now()>p.expira){ pendingApprovals.delete(token); res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({ok:false,error:'Token expirado'})); return; }
          p.status='aprovado';
          p.usuario=nomeGerente||'Gerente';
          res.writeHead(200,{'Content-Type':'application/json'});
          res.end(JSON.stringify({ok:true,msg:`Aprovado por ${p.usuario}`}));
        }catch(err){
          res.writeHead(200,{'Content-Type':'application/json'});
          res.end(JSON.stringify({ok:false,error:err.message}));
        }
      });
      return;
    }

    if (req.url.startsWith('/api/liberacao/') && req.method==='GET'){
      const token=req.url.split('/').pop();
      const p=pendingApprovals.get(token);
      if(!p){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:false,status:'inexistente'}));return;}
      if(Date.now()>p.expira){pendingApprovals.delete(token);res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:false,status:'expirado'}));return;}
      res.writeHead(200,{'Content-Type':'application/json'});
      res.end(JSON.stringify({ok:true,status:p.status,usuario:p.usuario,descricao:p.descricao}));
      return;
    }

    if (req.url==='/api/liberacao' && req.method==='POST'){
      let body='';
      req.on('data',c=>{body+=c;});
      req.on('end',()=>{
        try{
          const {email,senha,token}=JSON.parse(body);
          if(!email||!senha||!token){res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:false,error:'Campos obrigatorios'}));return;}
          const usuario=db.auth.login(email,senha);
          if(!usuario||!['admin','gerente'].includes(usuario.cargo)){
            res.writeHead(200,{'Content-Type':'application/json'});
            res.end(JSON.stringify({ok:false,error:'Credenciais invalidas ou sem permissao'}));
            return;
          }
          const p=pendingApprovals.get(token);
          if(!p){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:false,error:'Token expirado ou invalido'}));return;}
          p.status='aprovado';p.usuario=usuario.nome;
          res.writeHead(200,{'Content-Type':'application/json'});
          res.end(JSON.stringify({ok:true,msg:`Aprovado por ${usuario.nome}`}));
        }catch(err){
          res.writeHead(200,{'Content-Type':'application/json'});
          res.end(JSON.stringify({ok:false,error:err.message}));
        }
      });
      return;
    }

    // ── /liberar (página de autorização para o gerente) ────────────────────────
    if (req.url.startsWith('/liberar')){
      let token='';
      try{token=new URL('http://x'+req.url).searchParams.get('token')||'';}catch{}
      res.writeHead(200,{'Content-Type':'text/html;charset=utf-8','Cache-Control':'no-cache'});
      res.end(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Autorizacao VYN CRM</title>
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:system-ui,sans-serif;background:#0f172a;color:#f1f5f9;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:16px}
.card{background:#1e293b;border:1px solid #334155;border-radius:16px;padding:28px;width:100%;max-width:380px}h1{font-size:20px;font-weight:700;margin-bottom:4px;color:#60a5fa}
.sub{color:#94a3b8;font-size:14px;margin-bottom:20px}label{display:block;font-size:13px;font-weight:600;margin-bottom:6px;color:#cbd5e1}
input{width:100%;padding:10px 14px;border:1px solid #475569;border-radius:8px;background:#0f172a;color:#f1f5f9;font-size:14px;margin-bottom:16px;outline:none}
input:focus{border-color:#60a5fa}button{width:100%;padding:12px;border:none;border-radius:8px;background:linear-gradient(135deg,#3b82f6,#8b5cf6);color:white;font-size:15px;font-weight:600;cursor:pointer}
button:disabled{opacity:.5;cursor:not-allowed}.msg{padding:12px;border-radius:8px;margin-top:16px;font-size:14px;text-align:center}
.ok{background:#166534;color:#bbf7d0}.err{background:#7f1d1d;color:#fecaca}.desc{background:#1e3a5f;border:1px solid #2563eb;border-radius:8px;padding:12px;margin-bottom:20px;font-size:14px;color:#93c5fd}
</style></head><body><div class="card"><h1>Autorizacao VYN CRM</h1><p class="sub">Solicitacao do operador:</p>
<div class="desc" id="desc">Carregando...</div>
<label>E-mail do gerente</label><input type="email" id="email" placeholder="gerente@loja.com" autocomplete="username">
<label>Senha</label><input type="password" id="senha" placeholder="..." autocomplete="current-password" onkeydown="if(event.key==='Enter')autorizar()">
<button id="btn" onclick="autorizar()">Autorizar</button><div id="msg"></div></div>
<script>const TOKEN='${token}';
async function carregar(){try{const r=await fetch('/api/liberacao/'+TOKEN).then(r=>r.json());const el=document.getElementById('desc');
if(r.status==='aprovado'){el.textContent='Ja aprovado por '+r.usuario;document.getElementById('btn').disabled=true;}
else if(!r.ok){el.textContent='Token expirado ou invalido';}else el.textContent=r.descricao||'Liberacao solicitada';}catch(e){document.getElementById('desc').textContent='Erro ao carregar';}}
carregar();
async function autorizar(){const email=document.getElementById('email').value;const senha=document.getElementById('senha').value;const btn=document.getElementById('btn');const msg=document.getElementById('msg');
if(!email||!senha){msg.innerHTML='<div class="err">Preencha todos os campos</div>';return;}btn.disabled=true;btn.textContent='Verificando...';
try{const r=await fetch('/api/liberacao',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,senha,token:TOKEN})}).then(r=>r.json());
if(r.ok){msg.innerHTML='<div class="ok">'+r.msg+'</div>';btn.textContent='Aprovado!';}
else{msg.innerHTML='<div class="err">'+(r.error||'Erro')+'</div>';btn.disabled=false;btn.textContent='Autorizar';}}
catch(e){msg.innerHTML='<div class="err">Erro de conexao</div>';btn.disabled=false;btn.textContent='Autorizar';}}
</script></body></html>`);
      return;
    }

    // ── Arquivos estáticos + SPA fallback ──────────────────────────────────────
    const distPath = getDistPath();
    let urlPath = req.url.split('?')[0].replace(/\/+/g,'/');
    if (urlPath.includes('..')){res.writeHead(400);res.end('Bad request');return;}

    // Rotas do SPA (sem extensão) → sempre servir index.html
    const ext = path.extname(urlPath).toLowerCase();
    const isAsset = ext && ext !== '.html';

    let filePath;
    if (isAsset) {
      filePath = path.join(distPath, urlPath);
    } else {
      filePath = path.join(distPath, 'index.html');
    }

    if (fs.existsSync(filePath) && !fs.statSync(filePath).isDirectory()){
      const fileExt = path.extname(filePath).toLowerCase();
      const mimeType = MIME[fileExt] || 'application/octet-stream';
      // Assets JS/CSS têm cache longo; HTML nunca tem cache (SPA)
      const cacheControl = fileExt === '.html' ? 'no-cache, no-store, must-revalidate' : 'public, max-age=31536000, immutable';
      res.writeHead(200, { 'Content-Type': mimeType, 'Cache-Control': cacheControl });
      fs.createReadStream(filePath).pipe(res);
    } else {
      // dist não foi gerado ainda
      res.writeHead(503,{'Content-Type':'text/html;charset=utf-8'});
      res.end(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>VYN CRM</title>
<style>body{font-family:monospace;background:#0f172a;color:#f1f5f9;padding:40px;margin:0;display:flex;justify-content:center;align-items:center;min-height:100vh}
.card{background:#1e293b;border:1px solid #334155;border-radius:16px;padding:32px;max-width:500px;width:100%}
h2{color:#f87171;margin-bottom:12px}pre{background:#0f172a;padding:12px;border-radius:8px;margin-top:8px;font-size:13px;color:#94a3b8}
p{color:#94a3b8;margin-bottom:8px}</style></head><body><div class="card">
<h2>⚙️ Build pendente</h2>
<p>O frontend ainda não foi compilado. Execute no terminal:</p>
<pre>cd pasta_do_projeto
npm install
npm run rebuild
npm run build:web
npm start</pre>
<p style="margin-top:16px;color:#64748b;font-size:12px">Dist esperado: ${distPath}</p>
</div></body></html>`);
    }
  });

  httpServer.on('error', err => {
    console.error('[VYN] Erro HTTP:', err.message);
    if(err.code==='EADDRINUSE') dialog.showErrorBox('Porta em uso', 'A porta 3567 já está em uso.\nFeche outra instância do VYN CRM e tente novamente.');
  });

  httpServer.listen(PORT, '0.0.0.0', () => {
    const ip = getLocalIP();
    console.log(`[VYN] Servidor: http://localhost:${PORT} | Rede: http://${ip}:${PORT}`);
    console.log(`[VYN] Dist: ${getDistPath()} | OK: ${fs.existsSync(path.join(getDistPath(),'index.html'))}`);
  });
}

// ── Janela Electron ───────────────────────────────────────────────────────────
// ── Cliente: varredura de rede no processo principal ─────────────────────────

async function descobrirServidor() {
  const http = require('http');
  const os   = require('os');

  // Pega todos os prefixos de rede local desta máquina
  const prefixes = new Set();
  Object.values(os.networkInterfaces()).flat().forEach(iface => {
    if (iface && iface.family === 'IPv4' && !iface.internal) {
      const parts = iface.address.split('.');
      prefixes.add(parts.slice(0,3).join('.'));
    }
  });
  // Fallback se não achou nenhum
  if (prefixes.size === 0) ['192.168.1','192.168.0','10.0.0'].forEach(p => prefixes.add(p));

  // Testa um IP na porta 3567 com timeout de 800ms
  const testar = (ip) => new Promise(resolve => {
    const req = http.get({ host: ip, port: 3567, path: '/api/status', timeout: 800 }, res => {
      resolve(res.statusCode < 500 ? ip : null);
      res.resume();
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });

  for (const prefix of prefixes) {
    // Varre 1-254 em lotes de 30 paralelos
    const todos = Array.from({length:254}, (_,i) => prefix + '.' + (i+1));
    const resultados = [];
    for (let i = 0; i < todos.length; i += 30) {
      const lote = todos.slice(i, i+30);
      const res  = await Promise.all(lote.map(testar));
      res.filter(Boolean).forEach(ip => resultados.push(ip));
    }
    if (resultados.length > 0) return resultados; // retorna logo que acha
  }
  return [];
}

function mostrarTelaConexao() {
  const cfgPath = path.join(app.getPath('userData'), 'server_ip.json');
  let savedIP = '';
  try { savedIP = JSON.parse(fs.readFileSync(cfgPath, 'utf8')).ip || ''; } catch {}

  // IPC: renderer pede para conectar
  ipcMain.removeAllListeners('client:conectar');
  ipcMain.on('client:conectar', (_, url) => {
    try {
      const ip = url.replace(/^https?:\/\//, '').replace(/:.*/, '');
      fs.writeFileSync(cfgPath, JSON.stringify({ ip }));
    } catch {}
    mainWindow.loadURL(url);
  });

  // IPC: renderer pede varredura — feita aqui no main process (Node.js real)
  ipcMain.removeAllListeners('client:varrer');
  ipcMain.handle('client:varrer', async () => {
    return await descobrirServidor();
  });

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:system-ui,sans-serif;background:#0f172a;color:#f1f5f9;
     display:flex;align-items:center;justify-content:center;min-height:100vh}
.card{background:#1e293b;border:1px solid #334155;border-radius:20px;
      padding:36px;width:440px;box-shadow:0 25px 50px rgba(0,0,0,.5)}
h1{font-size:24px;font-weight:900;color:#a78bfa;letter-spacing:2px;margin-bottom:4px}
.sub{color:#64748b;font-size:13px;margin-bottom:28px}
label{display:block;font-size:10px;color:#64748b;font-weight:700;
      letter-spacing:1.5px;text-transform:uppercase;margin-bottom:8px}
input{width:100%;padding:13px 16px;background:#0f172a;border:2px solid #334155;
      border-radius:10px;color:#f1f5f9;font-size:16px;font-family:monospace;
      outline:none;transition:border .2s;margin-bottom:4px}
input:focus{border-color:#7c3aed}
.btn{width:100%;padding:14px;border:none;border-radius:10px;font-size:14px;
     font-weight:700;cursor:pointer;transition:opacity .2s;margin-top:8px;display:block}
.btn-primary{background:linear-gradient(135deg,#7c3aed,#6d28d9);color:#fff}
.btn-scan{background:#1e293b;color:#60a5fa;border:1px solid #1e40af}
.btn:hover:not(:disabled){opacity:.85}
.btn:disabled{opacity:.4;cursor:not-allowed}
.msg{margin-top:12px;font-size:12px;text-align:center;min-height:20px}
.err{color:#f87171}.ok{color:#4ade80}.info{color:#94a3b8}
.sep{display:flex;align-items:center;gap:8px;margin:16px 0;
     color:#334155;font-size:11px}
.sep::before,.sep::after{content:'';flex:1;border-top:1px solid #334155}
.found{margin-top:12px}
.found-item{padding:11px 14px;background:#0f172a;border:1px solid #334155;
            border-radius:8px;cursor:pointer;margin-bottom:6px;
            font-family:monospace;font-size:13px;transition:border .2s}
.found-item:hover{border-color:#7c3aed;color:#a78bfa}
</style></head><body>
<div class="card">
  <h1>ASTIA PDV</h1>
  <div class="sub">Cliente de caixa — conecte ao servidor da rede local</div>

  <button class="btn btn-scan" id="scanBtn" onclick="varrer()">
    🔍 Detectar servidor automaticamente
  </button>
  <div id="found" class="found"></div>

  <div class="sep">ou informe manualmente</div>

  <label>IP do Servidor</label>
  <input type="text" id="ip" placeholder="192.168.1.10" value="${savedIP}">
  <div class="msg" id="msg"></div>
  <button class="btn btn-primary" id="btnConn" onclick="conectar()">
    Conectar ao Servidor
  </button>
</div>
<script>
  document.getElementById('ip').addEventListener('keydown', e => {
    if (e.key === 'Enter') conectar();
  });

  // Auto-varre ao abrir se não tiver IP salvo
  if (!document.getElementById('ip').value) {
    setTimeout(varrer, 400);
  }

  async function varrer() {
    const btn  = document.getElementById('scanBtn');
    const msg  = document.getElementById('msg');
    const list = document.getElementById('found');
    btn.disabled = true;
    btn.textContent = '🔍 Varrendo rede...';
    msg.className = 'msg info';
    msg.textContent = 'Procurando servidor ASTIA PDV na rede local...';
    list.innerHTML = '';

    // Varredura feita pelo processo principal via IPC (Node.js real)
    const ips = await window.vyn.varrerRede();

    btn.disabled = false;
    btn.textContent = '🔍 Detectar servidor automaticamente';

    if (!ips || ips.length === 0) {
      msg.className = 'msg err';
      msg.textContent = 'Nenhum servidor encontrado. Verifique se o Servidor está ligado e na mesma rede Wi-Fi/cabo.';
      return;
    }

    msg.className = 'msg ok';
    msg.textContent = ips.length === 1
      ? '✅ Servidor encontrado!'
      : ips.length + ' servidores encontrados — clique para conectar:';

    ips.forEach(ip => {
      const d = document.createElement('div');
      d.className = 'found-item';
      d.textContent = '⚡ ' + ip + ':3567';
      d.onclick = () => {
        document.getElementById('ip').value = ip;
        conectar();
      };
      list.appendChild(d);
    });

    // Conecta automaticamente se achou só um
    if (ips.length === 1) {
      document.getElementById('ip').value = ips[0];
      setTimeout(conectar, 700);
    }
  }

  function conectar() {
    let raw = document.getElementById('ip').value.trim()
      .replace(/^https?:\\/\\//, '')
      .split('/')[0]
      .split(':')[0];
    if (!raw) {
      const m = document.getElementById('msg');
      m.className = 'msg err';
      m.textContent = 'Digite o IP do servidor';
      return;
    }
    const url = 'http://' + raw + ':3567';
    document.getElementById('msg').className = 'msg info';
    document.getElementById('msg').textContent = 'Conectando a ' + url + '...';
    document.getElementById('btnConn').disabled = true;
    // IPC → processo principal faz o loadURL
    window.vyn.conectarServidor(url);
  }
</script>
</body></html>`;

  mainWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
}

function createWindow(){
  mainWindow = new BrowserWindow({
    width:1366, height:768, minWidth:1024, minHeight:600,
    show:false, center:true,
    title: IS_CLIENT ? 'ASTIA PDV - Cliente' : 'ASTIA PDV',
    icon: path.join(__dirname, '..', '..', 'public', 'icon.png'),
    webPreferences:{
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      devTools: true,
      // Permite que o Electron carregue recursos de http://localhost:3567
      // e que clientes na rede façam fetch para http://IP:3567 sem bloqueio CORS
      webSecurity: false,
      allowRunningInsecureContent: true,
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.maximize();
    mainWindow.show();
    if(isDev && process.env.OPEN_DEVTOOLS==='true') mainWindow.webContents.openDevTools();
  });

  // Bloqueia DevTools em produção (Ctrl+Shift+I)
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if(!isDev && input.control && input.shift && input.key==='I') event.preventDefault();
  });

  if(IS_CLIENT){
    if(SERVER_HOST){
      // Modo cliente com servidor configurado
      mainWindow.loadURL(`http://${SERVER_HOST}:3567`);
    } else {
      // Cliente sem servidor — mostra tela de configuração
      mostrarTelaConexao();
    }
  } else if(isDev){
    // Desenvolvimento: Vite dev server
    mainWindow.loadURL('http://localhost:5173');
  } else {
    // Produção servidor: sempre via HTTP local (base '/' funciona corretamente)
    const distIndex = path.join(getDistPath(), 'index.html');
    if(!fs.existsSync(distIndex)){
      // Build não encontrado — mostrar mensagem útil
      mainWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(`
<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
body{font-family:system-ui,sans-serif;background:#0f172a;color:#f1f5f9;padding:40px;margin:0;display:flex;justify-content:center;align-items:center;min-height:100vh}
.card{background:#1e293b;border:1px solid #334155;border-radius:16px;padding:32px;max-width:500px;width:100%}
h2{color:#f87171;margin-bottom:12px}code{background:#0f172a;padding:2px 6px;border-radius:4px;font-family:monospace}
pre{background:#0f172a;padding:16px;border-radius:8px;margin-top:12px;font-size:13px;color:#94a3b8;line-height:1.6}
p{color:#94a3b8;margin-bottom:8px}
</style></head><body><div class="card">
<h2>⚙️ Build não encontrado</h2>
<p>O frontend ainda não foi compilado. Abra o terminal na pasta do projeto e execute:</p>
<pre>npm install
npm run rebuild
npm run build:web
npm start</pre>
</div></body></html>`));
    } else {
      // Aguarda o servidor HTTP iniciar antes de carregar (retry por até 10s)
      let tentativas = 0;
      const tryLoad = () => {
        tentativas++;
        const req = http.get('http://localhost:3567', (res) => {
          res.resume();
          mainWindow.loadURL('http://localhost:3567');
        });
        req.on('error', () => { if (tentativas < 50) setTimeout(tryLoad, 200); else mainWindow.loadURL('http://localhost:3567'); });
        req.setTimeout(200, () => { req.destroy(); });
      };
      tryLoad();
    }
  }

  mainWindow.on('closed', () => { mainWindow = null; });
}

// ── Menu ──────────────────────────────────────────────────────────────────────
function buildMenu(){
  const tpl = isDev ? [
    { label:'Dev', submenu:[{role:'reload'},{role:'forceReload'},{role:'toggleDevTools'},{type:'separator'},{label:'Backup DB',click:backupDB}] },
    { label:'Rede', submenu:[{label:'Info da rede',click:showNetworkInfo}] },
  ] : [
    { label:'Sistema', submenu:[
      ...(!IS_CLIENT ? [{label:'Backup',click:backupDB},{label:'Restaurar',click:restoreDB},{type:'separator'}] : []),
      {label:'Pasta de dados', click:()=>shell.openPath(app.getPath('userData'))},
      {type:'separator'},{label:'Sair',role:'quit'},
    ]},
    { label:'Rede', submenu:[{label:'Info da rede',click:showNetworkInfo}] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(tpl));
}

function showNetworkInfo(){
  const ip=getLocalIP(), dist=getDistPath();
  const ok=fs.existsSync(path.join(dist,'index.html'));
  const msg = IS_CLIENT
    ? `CLIENTE\nServidor: ${SERVER_HOST||'não configurado'}:3567`
    : `SERVIDOR\nIP local: ${ip}\nPorta: 3567\n\nOutros dispositivos acessam:\nhttp://${ip}:3567\n\nBuild: ${ok?'✅ OK':'❌ Pendente — rode npm run build:web'}`;
  dialog.showMessageBox(mainWindow, {type:'info', title:'VYN CRM — Rede', message:'Informações da Rede', detail:msg});
}

async function backupDB(){
  const r = await dialog.showSaveDialog(mainWindow, {
    title:'Salvar backup',
    defaultPath:`vyncrm-backup-${new Date().toISOString().split('T')[0]}.db`,
    filters:[{name:'SQLite',extensions:['db']}]
  });
  if(!r.canceled){ fs.copyFileSync(getDbPath(),r.filePath); dialog.showMessageBox(mainWindow,{type:'info',message:'Backup salvo!',detail:r.filePath}); }
}

async function restoreDB(){
  const c = await dialog.showMessageBox(mainWindow,{type:'warning',buttons:['Cancelar','Restaurar'],defaultId:0,message:'Restaurar backup?',detail:'Os dados atuais serão substituídos. Esta ação não pode ser desfeita.'});
  if(c.response!==1) return;
  const r = await dialog.showOpenDialog(mainWindow,{filters:[{name:'SQLite',extensions:['db']}],properties:['openFile']});
  if(!r.canceled){
    try{ db?.getDB?.()?.close(); }catch{}
    fs.copyFileSync(r.filePaths[0], getDbPath());
    db = require('./db');
    db.initDB(getDbPath());
    mainWindow?.webContents.reload();
    dialog.showMessageBox(mainWindow,{type:'info',message:'Backup restaurado com sucesso!'});
  }
}

// ── IPC handlers ──────────────────────────────────────────────────────────────
function registerIPC(){
  // Chamada principal ao banco (servidor local via IPC)
  ipcMain.handle('ipc:call', (_, {channel, data}) => {
    try{
      assertLicenseForChannel(channel);
      return {ok:true, result:handleDBCall(channel,data)};
    }
    catch(e){ return {ok:false, error:e.message}; }
  });

  ipcMain.handle('license:status', () => {
    try { return { ok: true, result: licenseManager?.getStatus?.() || { accessAllowed: true, status: 'unknown' } }; }
    catch (e) { return { ok: false, error: e.message }; }
  });

  ipcMain.handle('license:activate', async (_, { licenseKey, serverUrl }) => {
    try {
      if (!licenseManager) throw new Error('Licenciamento indisponível');
      const st = await licenseManager.activate({ licenseKey, serverUrl });
      return { ok: true, result: st };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle('license:verify', async () => {
    try {
      if (!licenseManager) throw new Error('Licenciamento indisponível');
      const st = await licenseManager.verifyNow();
      return { ok: true, result: st };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle('config:selecionar-logo', async () => {
    const r = await dialog.showOpenDialog({filters:[{name:'Imagem',extensions:['png','jpg','jpeg','webp']}],properties:['openFile']});
    return r.canceled ? null : r.filePaths[0];
  });
  // ── Certificado Digital ──────────────────────────────────────────────────────
  ipcMain.handle('config:selecionar-certificado', async () => {
    const r = await dialog.showOpenDialog({
      title: 'Selecionar Certificado Digital A1',
      filters: [{ name: 'Certificado PKCS#12', extensions: ['pfx','p12'] }],
      properties: ['openFile']
    });
    return r.canceled ? null : r.filePaths[0];
  });

  ipcMain.handle('config:ler-certificado', async (_, { caminho, senha }) => {
    try {
      const fs = require('fs');
      const tls = require('tls');
      const crypto = require('crypto');

      if (!fs.existsSync(caminho)) {
        return { ok: false, erro: 'Arquivo nao encontrado: ' + caminho };
      }

      const pfxBuf = fs.readFileSync(caminho);

      // Valida senha e carrega usando Node.js nativo (sem openssl externo)
      let ctx;
      try {
        ctx = tls.createSecureContext({ pfx: pfxBuf, passphrase: senha || '' });
      } catch (e) {
        if (/mac verify|bad decrypt|PKCS12|password|wrong/i.test(e.message)) {
          return { ok: false, erro: 'Senha incorreta ou arquivo corrompido' };
        }
        return { ok: false, erro: 'Nao foi possivel ler o certificado: ' + e.message.slice(0,120) };
      }

      // Extrai certificado DER do contexto TLS
      const certDer = ctx.context.getCertificate();
      if (!certDer || !Buffer.isBuffer(certDer)) {
        return { ok: false, erro: 'Nao foi possivel extrair o certificado do PFX' };
      }

      // Parseia X.509 com classe nativa Node.js (Node 16+ / Electron 13+)
      const x509 = new crypto.X509Certificate(certDer);

      const parseSubject = (raw) => {
        const obj = {};
        raw.split('\n').forEach(line => {
          const idx = line.indexOf('=');
          if (idx > 0) obj[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
        });
        return obj;
      };

      const subj = parseSubject(x509.subject);
      const razao_social = subj['O'] || subj['CN'] || 'Nao identificado';

      let cnpj = '';
      if (subj['serialNumber']) {
        cnpj = subj['serialNumber'].replace('CNPJ:', '').trim();
      } else if (subj['CN'] && subj['CN'].includes(':')) {
        cnpj = subj['CN'].split(':').pop().trim();
      }

      const hoje = new Date();
      const vencimento = new Date(x509.validTo);
      const inicio = new Date(x509.validFrom);
      const diasRestantes = Math.floor((vencimento - hoje) / 86400000);
      const vencido = diasRestantes < 0;
      const fmtData = (d) => new Date(d).toLocaleDateString('pt-BR');

      return {
        ok: true,
        razao_social,
        cnpj,
        estado: subj['ST'] || '',
        cidade: subj['L'] || '',
        email: subj['emailAddress'] || '',
        validade_inicio: fmtData(inicio),
        validade_fim: fmtData(vencimento),
        dias_restantes: diasRestantes,
        vencido,
        caminho,
        serial: x509.serialNumber,
        autoassinado: x509.issuer === x509.subject,
      };
    } catch (e) {
      return { ok: false, erro: 'Erro inesperado: ' + e.message.slice(0, 150) };
    }
  });
    ipcMain.handle('backup:exportar', () => backupDB());
  ipcMain.handle('backup:importar', () => restoreDB());
  ipcMain.handle('app:abrir-pasta-dados', () => shell.openPath(app.getPath('userData')));
  ipcMain.handle('app:get-server-ip', () => getLocalIP());
  ipcMain.handle('app:get-mode', () => IS_CLIENT ? 'client' : 'server');

  // ── Logo em base64 para uso no flyer ──────────────────────────────────────
  ipcMain.handle('app:logo-base64', async () => {
    try {
      const cfg = db?.configLoja?.get();
      if (!cfg?.logo_path) return null;
      const p = cfg.logo_path;
      if (p.startsWith('data:')) return p; // já é base64
      if (!fs.existsSync(p)) return null;
      const ext = path.extname(p).toLowerCase().replace('.', '');
      const mime = ext === 'png' ? 'image/png' : ext === 'svg' ? 'image/svg+xml' : 'image/jpeg';
      const buf = fs.readFileSync(p);
      return `data:${mime};base64,${buf.toString('base64')}`;
    } catch { return null; }
  });

  // ── Tunnel Cloudflare ────────────────────────────────────────────────────
  ipcMain.handle('tunnel:start',  async () => { await startTunnel(); return { status: tunnelStatus, url: tunnelURL }; });
  ipcMain.handle('tunnel:stop',   () => { stopTunnel(); return { status: 'off' }; });
  ipcMain.handle('tunnel:status', () => ({ status: tunnelStatus, url: tunnelURL, log: tunnelLog.slice(-20) }));
  ipcMain.handle('tunnel:download', async () => {
    try { await downloadCloudflared(); return { ok: true }; }
    catch (e) { return { ok: false, erro: e.message }; }
  });
  ipcMain.handle('flyer:gerar-pdf', async (_, { html, nomeArquivo }) => {
    const tmpFile = path.join(app.getPath('temp'), `flyer_astia_${Date.now()}.html`);
    try {
      // Salva HTML em arquivo temporário (mais confiável que data: URL)
      fs.writeFileSync(tmpFile, html, 'utf-8');
    } catch (e) {
      return { ok: false, erro: 'Erro ao criar arquivo temporário: ' + e.message };
    }

    return new Promise((resolve) => {
      const flyerWin = new BrowserWindow({
        width: 794, height: 1123,
        show: false,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          webSecurity: false, // permite carregar fontes externas e base64
          allowRunningInsecureContent: true,
        },
      });

      flyerWin.loadFile(tmpFile);

      flyerWin.webContents.once('did-finish-load', async () => {
        // Aguarda fontes Google carregarem (aumentado para 3s)
        await new Promise(r => setTimeout(r, 3000));
        try {
          const pdfBuffer = await flyerWin.webContents.printToPDF({
            pageSize: 'A4',
            printBackground: true,
            margins: { marginType: 'none' },
            landscape: false,
          });

          const { canceled, filePath } = await dialog.showSaveDialog({
            title: 'Salvar Flyer como PDF',
            defaultPath: path.join(app.getPath('desktop'), nomeArquivo || 'flyer_astia.pdf'),
            filters: [{ name: 'PDF', extensions: ['pdf'] }],
          });

          if (!canceled && filePath) {
            fs.writeFileSync(filePath, pdfBuffer);
            shell.openPath(filePath);
            resolve({ ok: true, caminho: filePath });
          } else {
            resolve({ ok: false, cancelado: true });
          }
        } catch (err) {
          resolve({ ok: false, erro: String(err.message || err) });
        } finally {
          flyerWin.destroy();
          try { fs.unlinkSync(tmpFile); } catch {}
        }
      });

      flyerWin.webContents.on('did-fail-load', (_, errCode, errDesc) => {
        flyerWin.destroy();
        try { fs.unlinkSync(tmpFile); } catch {}
        resolve({ ok: false, erro: `Falha ao carregar HTML: ${errDesc} (${errCode})` });
      });

      // Timeout de segurança — 30s
      setTimeout(() => {
        if (!flyerWin.isDestroyed()) {
          flyerWin.destroy();
          try { fs.unlinkSync(tmpFile); } catch {}
          resolve({ ok: false, erro: 'Timeout ao gerar PDF (30s). Tente novamente.' });
        }
      }, 30000);
    });
  });
}

// ── Auto-Updater ──────────────────────────────────────────────────────────────
function setupAutoUpdater() {
  // Auto-updater desativado até configurar servidor de updates
  // Para ativar: configure "publish" no electron-builder yml e descomente
  return;
  /*
  if (!autoUpdater || IS_CLIENT) return;
  try {

  // Não checar em desenvolvimento
  if (isDev) {
    console.log('[Updater] Modo dev — updates desativados');
    return;
  }

  // Configura o updater
  autoUpdater.autoDownload         = true;  // Baixa automaticamente
  autoUpdater.autoInstallOnAppQuit = true;  // Instala ao fechar

  // Log de eventos
  autoUpdater.on('checking-for-update', () => {
    console.log('[Updater] Verificando atualizações...');
  });

  autoUpdater.on('update-available', (info) => {
    console.log(`[Updater] Nova versão disponível: ${info.version}`);
    // Notifica a janela que tem update disponível
    mainWindow?.webContents.send('update:disponivel', {
      versao: info.version,
      notas: info.releaseNotes || '',
    });
  });

  autoUpdater.on('update-not-available', () => {
    console.log('[Updater] Sistema atualizado.');
    mainWindow?.webContents.send('update:atualizado', {});
  });

  autoUpdater.on('download-progress', (progress) => {
    const pct = Math.round(progress.percent);
    console.log(`[Updater] Baixando: ${pct}%`);
    mainWindow?.webContents.send('update:progresso', {
      percent: pct,
      bytesPerSecond: progress.bytesPerSecond,
      transferred: progress.transferred,
      total: progress.total,
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log(`[Updater] Versão ${info.version} baixada — instalando em 5 segundos...`);
    // Notifica a janela (exibe aviso brevemente)
    mainWindow?.webContents.send('update:baixado', {
      versao: info.version,
      notas: info.releaseNotes || '',
    });
    // Instala automaticamente após 5 segundos
    // Dá tempo do usuário ver o aviso e salvar o que estiver fazendo
    setTimeout(() => {
      autoUpdater.quitAndInstall(false, true);
    }, 5000);
  });

  autoUpdater.on('error', (err) => {
    console.error('[Updater] Erro:', err.message);
    // Silencioso — não incomoda o cliente com erros de update
  });

  // Verifica ao iniciar (com delay para não impactar a abertura)
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(() => {});
  }, 8000);

  // Verifica a cada 4 horas
  setInterval(() => {
    autoUpdater.checkForUpdates().catch(() => {});
  }, 4 * 60 * 60 * 1000);

  } catch(e) { console.error('[Updater] Erro ao inicializar:', e.message); }
  */
}

// IPC: cliente pede para instalar o update agora
ipcMain.on('update:instalar', () => {
  autoUpdater?.quitAndInstall(false, true);
});

// IPC: cliente pede para verificar agora
ipcMain.handle('update:verificar', async () => {
  if (!autoUpdater || IS_CLIENT || isDev) return { modo: 'dev' };
  try {
    const result = await autoUpdater.checkForUpdates();
    return { versao: result?.updateInfo?.version };
  } catch (e) {
    return { erro: e.message };
  }
});

// ── Lifecycle ─────────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  setupAutoUpdater();
  if(!IS_CLIENT){
    try{
      db = require('./db');
      db.initDB(getDbPath());
      licenseManager = createLicenseManager({ app, db });
      licenseManager.init();
      startHTTPServer();
    } catch(err){
      console.error('[VYN] Erro crítico:', err);
      dialog.showErrorBox('Erro ao inicializar VYN CRM',
        err.message + '\n\nVerifique se o Node.js e as dependências estão instalados:\nnpm install\nnpm run rebuild');
    }
  }
  registerIPC();
  buildMenu();
  createWindow();
  app.on('activate', () => { if(BrowserWindow.getAllWindows().length===0) createWindow(); });
});

app.on('window-all-closed', () => { if(process.platform!=='darwin') app.quit(); });
app.on('quit', () => {
  stopTunnel();
  if(httpServer) httpServer.close();
  licenseManager?.stop?.();
  try{ db?.getDB?.()?.close(); }catch{}
});
