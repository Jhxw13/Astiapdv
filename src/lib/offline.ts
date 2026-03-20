/**
 * VYN CRM — Modo Offline v1.0
 *
 * Quando o servidor está inacessível, as vendas são salvas localmente
 * no IndexedDB e sincronizadas automaticamente quando a conexão volta.
 *
 * Fluxo:
 *   1. PDV tenta criar venda → servidor inacessível → salva na fila offline
 *   2. Banner avisa o operador
 *   3. Quando servidor volta → sincroniza automaticamente
 *   4. Vendas sincronizadas somem da fila
 */

const DB_NAME    = 'vyncrm_offline';
const DB_VERSION = 1;
const STORE_VENDAS    = 'vendas_pendentes';
const STORE_STATUS    = 'status';

// ── Tipos ─────────────────────────────────────────────────────────────────────
export interface VendaOffline {
  id: string;                // UUID local
  criado_em: string;         // ISO timestamp
  dados: any;                // payload completo para vendas:criar
  sincronizado: boolean;
  tentativas: number;
  erro_ultimo?: string;
}

export type StatusConexao = 'online' | 'offline' | 'verificando';

// ── Listeners ─────────────────────────────────────────────────────────────────
type ConexaoListener = (status: StatusConexao) => void;
const listeners: ConexaoListener[] = [];
let statusAtual: StatusConexao = 'verificando';

export function onStatusConexao(fn: ConexaoListener): () => void {
  listeners.push(fn);
  fn(statusAtual); // emite imediatamente
  return () => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); };
}

function emitirStatus(s: StatusConexao) {
  statusAtual = s;
  listeners.forEach(fn => fn(s));
}

export function getStatusConexao(): StatusConexao {
  return statusAtual;
}

// ── IndexedDB ─────────────────────────────────────────────────────────────────
function abrirDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = e => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_VENDAS)) {
        const store = db.createObjectStore(STORE_VENDAS, { keyPath: 'id' });
        store.createIndex('sincronizado', 'sincronizado');
        store.createIndex('criado_em',    'criado_em');
      }
      if (!db.objectStoreNames.contains(STORE_STATUS)) {
        db.createObjectStore(STORE_STATUS, { keyPath: 'chave' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

async function tx<T>(
  storeName: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  const db = await abrirDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(storeName, mode);
    const store = t.objectStore(storeName);
    const req = fn(store);
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

// ── Fila de vendas ─────────────────────────────────────────────────────────────
export async function enfileirarVenda(dados: any): Promise<VendaOffline> {
  const venda: VendaOffline = {
    id: `off_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    criado_em: new Date().toISOString(),
    dados,
    sincronizado: false,
    tentativas: 0,
  };
  await tx(STORE_VENDAS, 'readwrite', s => s.put(venda));
  console.log('[Offline] Venda enfileirada:', venda.id);
  return venda;
}

export async function listarPendentes(): Promise<VendaOffline[]> {
  const db = await abrirDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE_VENDAS, 'readonly');
    const store = t.objectStore(STORE_VENDAS);
    const idx = store.index('sincronizado');
    const req = idx.getAll(IDBKeyRange.only(false));
    req.onsuccess = () => resolve(req.result ?? []);
    req.onerror   = () => reject(req.error);
  });
}

export async function contarPendentes(): Promise<number> {
  const db = await abrirDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE_VENDAS, 'readonly');
    const store = t.objectStore(STORE_VENDAS);
    const idx = store.index('sincronizado');
    const req = idx.count(IDBKeyRange.only(false));
    req.onsuccess = () => resolve(req.result ?? 0);
    req.onerror   = () => reject(req.error);
  });
}

async function marcarSincronizado(id: string) {
  const db = await abrirDB();
  return new Promise<void>((resolve, reject) => {
    const t = db.transaction(STORE_VENDAS, 'readwrite');
    const store = t.objectStore(STORE_VENDAS);
    const get = store.get(id);
    get.onsuccess = () => {
      const v = get.result as VendaOffline;
      if (v) { v.sincronizado = true; store.put(v); }
      resolve();
    };
    get.onerror = () => reject(get.error);
  });
}

async function registrarErro(id: string, erro: string) {
  const db = await abrirDB();
  return new Promise<void>((resolve, reject) => {
    const t = db.transaction(STORE_VENDAS, 'readwrite');
    const store = t.objectStore(STORE_VENDAS);
    const get = store.get(id);
    get.onsuccess = () => {
      const v = get.result as VendaOffline;
      if (v) { v.tentativas++; v.erro_ultimo = erro; store.put(v); }
      resolve();
    };
    get.onerror = () => reject(get.error);
  });
}

// ── Verificação de conexão ─────────────────────────────────────────────────────
let verificandoConexao = false;

export async function verificarConexao(serverURL: string): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 3000);
    const res = await fetch(`${serverURL}/ping`, { signal: ctrl.signal, cache: 'no-store' });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}

// ── Sincronização ──────────────────────────────────────────────────────────────
let sincronizando = false;

export async function sincronizarPendentes(
  serverURL: string,
  onProgresso?: (atual: number, total: number, venda: VendaOffline) => void
): Promise<{ ok: number; erro: number }> {
  if (sincronizando) return { ok: 0, erro: 0 };
  sincronizando = true;

  const pendentes = await listarPendentes();
  let ok = 0, erro = 0;

  for (let i = 0; i < pendentes.length; i++) {
    const venda = pendentes[i];
    onProgresso?.(i + 1, pendentes.length, venda);
    try {
      const res = await fetch(`${serverURL}/api`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: 'vendas:criar', data: venda.dados }),
      });
      const json = await res.json();
      if (json.ok) {
        await marcarSincronizado(venda.id);
        ok++;
        console.log(`[Offline] Sincronizado: ${venda.id} → venda #${json.result?.numero}`);
      } else {
        await registrarErro(venda.id, json.error);
        erro++;
      }
    } catch (e: any) {
      await registrarErro(venda.id, e.message);
      erro++;
    }
  }

  sincronizando = false;
  return { ok, erro };
}

// ── Monitor de conexão (loop automático) ───────────────────────────────────────
let monitorInterval: ReturnType<typeof setInterval> | null = null;
let serverURLMonitor = '';

export function iniciarMonitor(serverURL: string, onSincronizado?: (ok: number) => void) {
  serverURLMonitor = serverURL;
  if (monitorInterval) return; // já rodando

  const checar = async () => {
    if (verificandoConexao) return;
    verificandoConexao = true;
    try {
      const online = await verificarConexao(serverURLMonitor);
      const novoStatus: StatusConexao = online ? 'online' : 'offline';

      if (novoStatus !== statusAtual) {
        emitirStatus(novoStatus);
        if (novoStatus === 'online') {
          // Voltou! Sincronizar pendentes
          const pendentes = await contarPendentes();
          if (pendentes > 0) {
            console.log(`[Offline] Servidor voltou — sincronizando ${pendentes} vendas...`);
            const result = await sincronizarPendentes(serverURLMonitor);
            if (result.ok > 0) onSincronizado?.(result.ok);
          }
        }
      }
    } finally {
      verificandoConexao = false;
    }
  };

  checar(); // primeira verificação imediata
  monitorInterval = setInterval(checar, 8000); // a cada 8 segundos
}

export function pararMonitor() {
  if (monitorInterval) { clearInterval(monitorInterval); monitorInterval = null; }
}
