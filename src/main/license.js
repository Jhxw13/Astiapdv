const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const TRIAL_DAYS_DEFAULT = Number(process.env.LICENSE_TRIAL_DAYS || 7);
const OFFLINE_GRACE_DAYS_DEFAULT = Number(process.env.LICENSE_OFFLINE_GRACE_DAYS || 3);
const CHECK_INTERVAL_HOURS_DEFAULT = Number(process.env.LICENSE_CHECK_INTERVAL_HOURS || 6);
const HARDCODED_PUBLIC_KEY_PEM = `
-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAIrtAry5qphVU9KqDnanLv489WmmLTmFrh9/P2jgpiwU=
-----END PUBLIC KEY-----
`.trim();
const DEFAULT_PUBLIC_KEY_PEM =
  process.env.LICENSE_PUBLIC_KEY_PEM ||
  (HARDCODED_PUBLIC_KEY_PEM.includes('COLE_AQUI_') ? '' : HARDCODED_PUBLIC_KEY_PEM);
const REVOKED_IDS = new Set(
  String(process.env.LICENSE_REVOKED_IDS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
);

function toISO(d) {
  return d ? new Date(d).toISOString() : null;
}

function addDays(baseDate, days) {
  const d = new Date(baseDate);
  d.setDate(d.getDate() + days);
  return d;
}

function parseDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function pickFirst(...values) {
  return values.find(v => v !== undefined && v !== null && v !== '');
}

function normalizeLicensePayload(raw) {
  const root = raw?.result || raw?.license || raw || {};
  return {
    status: (pickFirst(root.status, root.license_status, 'active') || 'active').toLowerCase(),
    plan: pickFirst(root.plan, root.plano, 'pro'),
    customerName: pickFirst(root.customerName, root.customer_name, root.customer, ''),
    validUntil: pickFirst(root.validUntil, root.valid_until, root.expiresAt, root.expires_at, null),
    offlineGraceDays: Number(pickFirst(root.offlineGraceDays, root.offline_grace_days, OFFLINE_GRACE_DAYS_DEFAULT)),
    checkIntervalHours: Number(pickFirst(root.checkIntervalHours, root.check_interval_hours, CHECK_INTERVAL_HOURS_DEFAULT)),
    notes: pickFirst(root.notes, root.message, ''),
  };
}

function b64urlToBuffer(input) {
  return Buffer.from(String(input || ''), 'base64url');
}

function parseSignedLicenseToken(token) {
  const t = String(token || '').trim();
  const parts = t.split('.');
  if (parts.length !== 3 || parts[0] !== 'ASTIA1') {
    throw new Error('Formato de licença inválido');
  }
  const payloadRaw = b64urlToBuffer(parts[1]).toString('utf-8');
  const payload = JSON.parse(payloadRaw);
  return { header: parts[0], payloadPart: parts[1], sigPart: parts[2], payload };
}

function verifySignedLicenseToken(token, publicKeyPem) {
  if (!publicKeyPem) throw new Error('Chave pública de licença não configurada');
  const parsed = parseSignedLicenseToken(token);
  const data = Buffer.from(`${parsed.header}.${parsed.payloadPart}`, 'utf-8');
  const sig = b64urlToBuffer(parsed.sigPart);
  const ok = crypto.verify(null, data, publicKeyPem, sig);
  if (!ok) throw new Error('Assinatura da licença inválida');
  return parsed.payload;
}

async function postJSON(baseUrl, paths, payload) {
  const cleanBase = String(baseUrl || '').replace(/\/+$/, '');
  let lastErr = null;
  for (const p of paths) {
    try {
      const r = await fetch(`${cleanBase}${p}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await r.json().catch(() => ({}));
      if (!r.ok || json?.ok === false) {
        const msg = json?.error || json?.message || `HTTP ${r.status}`;
        throw new Error(msg);
      }
      return json;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error('Falha ao validar licença');
}

function createLicenseManager({ app, db }) {
  let timer = null;
  let currentStatus = null;

  function getDeviceId() {
    const file = path.join(app.getPath('userData'), 'license-device.json');
    try {
      if (fs.existsSync(file)) {
        const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
        if (data?.deviceId) return data.deviceId;
      }
    } catch {}

    const seed = [
      os.hostname(),
      os.platform(),
      os.arch(),
      os.userInfo()?.username || '',
      app.getPath('userData'),
    ].join('|');
    const hash = crypto.createHash('sha256').update(seed).digest('hex').slice(0, 24).toUpperCase();
    const deviceId = `ASTIA-${hash}`;

    try {
      fs.writeFileSync(file, JSON.stringify({ deviceId }, null, 2), 'utf-8');
    } catch {}
    return deviceId;
  }

  function computeStatus() {
    const cfg = db.licenseStore.get();
    const now = new Date();
    const nowMs = now.getTime();

    const deviceId = cfg.deviceId || getDeviceId();
    if (!cfg.deviceId) {
      db.licenseStore.update({ license_device_id: deviceId });
    }

    const trialStart = parseDate(cfg.trialStartedAt) || now;
    const trialUntil = addDays(trialStart, TRIAL_DAYS_DEFAULT);
    const validUntil = parseDate(cfg.validUntil);
    const graceUntil = parseDate(cfg.offlineGraceUntil);
    const hasKey = !!cfg.licenseKey;
    const status = (cfg.status || 'trial').toLowerCase();
    const isLifetime = String(cfg.plan || '').toLowerCase() === 'lifetime';

    if (!hasKey) {
      const trialActive = nowMs <= trialUntil.getTime();
      return {
        mode: trialActive ? 'trial' : 'expired',
        status: trialActive ? 'trial' : 'expired',
        accessAllowed: trialActive,
        reason: trialActive ? 'Período de avaliação ativo' : 'Trial expirado',
        deviceId,
        plan: cfg.plan || 'trial',
        validUntil: toISO(trialUntil),
        trialStartedAt: toISO(trialStart),
        daysRemaining: Math.max(0, Math.ceil((trialUntil.getTime() - nowMs) / 86400000)),
        lastCheck: cfg.lastCheck || null,
        serverUrl: cfg.serverUrl || process.env.LICENSE_SERVER_URL || '',
      };
    }

    if (isLifetime && status !== 'blocked' && status !== 'revoked') {
      return {
        mode: 'licensed',
        status: 'active',
        accessAllowed: true,
        reason: 'Licença lifetime ativa',
        deviceId,
        plan: 'lifetime',
        validUntil: null,
        lastCheck: cfg.lastCheck || null,
        serverUrl: cfg.serverUrl || process.env.LICENSE_SERVER_URL || '',
      };
    }

    if (status === 'blocked' || status === 'revoked') {
      return {
        mode: 'blocked',
        status,
        accessAllowed: false,
        reason: 'Licença bloqueada',
        deviceId,
        plan: cfg.plan || 'pro',
        validUntil: cfg.validUntil || null,
        lastCheck: cfg.lastCheck || null,
        serverUrl: cfg.serverUrl || process.env.LICENSE_SERVER_URL || '',
      };
    }

    if (validUntil && nowMs <= validUntil.getTime()) {
      return {
        mode: 'licensed',
        status: 'active',
        accessAllowed: true,
        reason: 'Licença ativa',
        deviceId,
        plan: cfg.plan || 'pro',
        validUntil: toISO(validUntil),
        lastCheck: cfg.lastCheck || null,
        serverUrl: cfg.serverUrl || process.env.LICENSE_SERVER_URL || '',
      };
    }

    if (graceUntil && nowMs <= graceUntil.getTime()) {
      return {
        mode: 'offline_grace',
        status: 'offline_grace',
        accessAllowed: true,
        reason: 'Sem validação recente, usando tolerância offline',
        deviceId,
        plan: cfg.plan || 'pro',
        validUntil: cfg.validUntil || null,
        offlineGraceUntil: toISO(graceUntil),
        lastCheck: cfg.lastCheck || null,
        serverUrl: cfg.serverUrl || process.env.LICENSE_SERVER_URL || '',
      };
    }

    return {
      mode: 'expired',
      status: 'expired',
      accessAllowed: false,
      reason: 'Licença expirada',
      deviceId,
      plan: cfg.plan || 'pro',
      validUntil: cfg.validUntil || null,
      lastCheck: cfg.lastCheck || null,
      serverUrl: cfg.serverUrl || process.env.LICENSE_SERVER_URL || '',
    };
  }

  function getStatus() {
    currentStatus = computeStatus();
    return currentStatus;
  }

  function persistServerResponse(payload, serverUrl, keyUsed) {
    const now = new Date();
    const offlineGraceUntil = addDays(now, payload.offlineGraceDays || OFFLINE_GRACE_DAYS_DEFAULT);
    db.licenseStore.update({
      chave_licenca: keyUsed,
      plano: payload.plan || 'pro',
      validade_licenca: payload.validUntil || null,
      license_status: payload.status || 'active',
      license_last_check: toISO(now),
      license_offline_grace_until: toISO(offlineGraceUntil),
      license_activated_at: toISO(now),
      license_customer_name: payload.customerName || null,
      license_server_url: serverUrl || null,
      license_notes: payload.notes || null,
      license_device_id: getDeviceId(),
    });
  }

  async function activate({ licenseKey, serverUrl }) {
    const key = String(licenseKey || '').trim();
    if (!key) throw new Error('Informe a chave da licença');

    const deviceId = getDeviceId();

    // 1) Primeiro tenta licença local offline assinada
    try {
      const payload = verifySignedLicenseToken(key, DEFAULT_PUBLIC_KEY_PEM);
      const licenseId = String(payload.id || payload.licenseId || '').trim();
      const plan = String(payload.plan || 'pro').toLowerCase();
      const validUntil = payload.expiresAt || payload.validUntil || payload.expires_at || null;
      const boundDeviceId = payload.deviceId || payload.device_id || null;
      const status = String(payload.status || 'active').toLowerCase();

      if (licenseId && REVOKED_IDS.has(licenseId)) {
        throw new Error('Licença revogada');
      }
      if (boundDeviceId && boundDeviceId !== deviceId) {
        throw new Error(`Licença vinculada a outro dispositivo (${boundDeviceId})`);
      }
      if (status === 'revoked' || status === 'blocked') {
        throw new Error('Licença bloqueada');
      }
      if (plan !== 'lifetime' && validUntil) {
        const d = parseDate(validUntil);
        if (!d || d.getTime() < Date.now()) {
          throw new Error('Licença expirada');
        }
      }

      db.licenseStore.update({
        chave_licenca: key,
        plano: plan || 'pro',
        validade_licenca: plan === 'lifetime' ? null : validUntil,
        license_status: 'active',
        license_last_check: toISO(new Date()),
        license_offline_grace_until: toISO(addDays(new Date(), 3650)),
        license_activated_at: toISO(new Date()),
        license_customer_name: payload.customer || payload.customerName || null,
        license_server_url: null,
        license_notes: payload.notes || 'Licença ativada localmente',
        license_device_id: deviceId,
      });
      return getStatus();
    } catch (localErr) {
      // Continua para validação online opcional, se houver servidor.
      const finalServerUrl = String(serverUrl || process.env.LICENSE_SERVER_URL || db.licenseStore.get().serverUrl || '').trim();
      if (!finalServerUrl) {
        throw localErr;
      }

      const payload = {
        licenseKey: key,
        deviceId,
        appId: app.getName(),
        appVersion: app.getVersion(),
        host: os.hostname(),
      };

      const response = await postJSON(finalServerUrl, ['/api/licenses/activate', '/licenses/activate'], payload);
      const normalized = normalizeLicensePayload(response);
      persistServerResponse(normalized, finalServerUrl, key);
      return getStatus();
    }
  }

  async function verifyNow() {
    const cfg = db.licenseStore.get();
    if (!cfg.licenseKey) return getStatus();

    // 1) Licença offline assinada (sem custo de servidor)
    try {
      const payload = verifySignedLicenseToken(cfg.licenseKey, DEFAULT_PUBLIC_KEY_PEM);
      const licenseId = String(payload.id || payload.licenseId || '').trim();
      const plan = String(payload.plan || cfg.plan || 'pro').toLowerCase();
      const validUntil = payload.expiresAt || payload.validUntil || payload.expires_at || null;
      const boundDeviceId = payload.deviceId || payload.device_id || null;
      const deviceId = getDeviceId();

      if (licenseId && REVOKED_IDS.has(licenseId)) throw new Error('Licença revogada');
      if (boundDeviceId && boundDeviceId !== deviceId) throw new Error('Licença vinculada a outro dispositivo');
      if (plan !== 'lifetime' && validUntil) {
        const d = parseDate(validUntil);
        if (!d || d.getTime() < Date.now()) throw new Error('Licença expirada');
      }

      db.licenseStore.update({
        plano: plan || 'pro',
        validade_licenca: plan === 'lifetime' ? null : validUntil,
        license_status: 'active',
        license_last_check: toISO(new Date()),
        license_offline_grace_until: toISO(addDays(new Date(), 3650)),
        license_notes: payload.notes || cfg.notes || null,
      });
      return getStatus();
    } catch (localErr) {
      const serverUrl = String(cfg.serverUrl || process.env.LICENSE_SERVER_URL || '').trim();
      if (!serverUrl) {
        db.licenseStore.update({
          license_status: 'blocked',
          license_notes: `Licença inválida: ${localErr.message}`,
          license_last_check: toISO(new Date()),
        });
        return getStatus();
      }
    }

    try {
      const payload = {
        licenseKey: cfg.licenseKey,
        deviceId: getDeviceId(),
        appId: app.getName(),
        appVersion: app.getVersion(),
        host: os.hostname(),
      };
      const response = await postJSON(serverUrl, ['/api/licenses/verify', '/licenses/verify'], payload);
      const normalized = normalizeLicensePayload(response);
      persistServerResponse(normalized, serverUrl, cfg.licenseKey);
      return getStatus();
    } catch (err) {
      // Se falhar validação remota, ativa tolerância offline.
      db.licenseStore.update({
        license_status: 'offline_grace',
        license_notes: `Falha de validação: ${err.message}`,
        license_last_check: toISO(new Date()),
        license_offline_grace_until: toISO(addDays(new Date(), OFFLINE_GRACE_DAYS_DEFAULT)),
      });
      return getStatus();
    }
  }

  function startBackgroundChecks() {
    if (timer) clearInterval(timer);
    timer = setInterval(() => {
      verifyNow().catch(() => {});
    }, CHECK_INTERVAL_HOURS_DEFAULT * 60 * 60 * 1000);
  }

  function init() {
    getStatus();
    setTimeout(() => { verifyNow().catch(() => {}); }, 7000);
    startBackgroundChecks();
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  function clearLicense() {
    db.licenseStore.update({
      chave_licenca: '',
      plano: 'basico',
      validade_licenca: null,
      license_status: 'trial',
      license_last_check: null,
      license_offline_grace_until: null,
      license_activated_at: null,
      license_customer_name: null,
      license_notes: null,
    });
    return getStatus();
  }

  return {
    init,
    stop,
    getStatus,
    activate,
    verifyNow,
    clearLicense,
    isAccessAllowed: () => getStatus().accessAllowed,
  };
}

module.exports = { createLicenseManager };
