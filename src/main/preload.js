/**
 * VYN CRM - Preload Script
 * Expõe window.vyn para o renderer (funciona em Electron local e em browser via HTTP)
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('vyn', {
  // Chamada ao banco via dispatcher ipc:call
  invoke: (channel, data) => ipcRenderer.invoke('ipc:call', { channel, data }),

  // Chamada direta a handlers ipcMain.handle por nome de canal
  directInvoke: (channel, data) => ipcRenderer.invoke(channel, data),

  // Handlers nativos
  selecionarLogo: ()       => ipcRenderer.invoke('config:selecionar-logo'),
  conectarServidor: (url) => ipcRenderer.send('client:conectar', url),
  varrerRede: () => ipcRenderer.invoke('client:varrer'),
  // Auto-updater
  updateInstalar: () => ipcRenderer.send('update:instalar'),
  updateVerificar: () => ipcRenderer.invoke('update:verificar'),
  onUpdate: (channel, cb) => ipcRenderer.on(channel, (_, data) => cb(data)),
  offUpdate: (channel) => ipcRenderer.removeAllListeners(channel),
  selecionarCertificado: ()=> ipcRenderer.invoke('config:selecionar-certificado'),
  lerCertificado: (params)=> ipcRenderer.invoke('config:ler-certificado', params),
  backupExportar: ()       => ipcRenderer.invoke('backup:exportar'),
  backupImportar: ()       => ipcRenderer.invoke('backup:importar'),
  abrirPastaDados: ()      => ipcRenderer.invoke('app:abrir-pasta-dados'),
  getServerIP: ()          => ipcRenderer.invoke('app:get-server-ip'),
  getMode: ()              => ipcRenderer.invoke('app:get-mode'),

  // Tunnel Cloudflare
  tunnelStart:    ()  => ipcRenderer.invoke('tunnel:start'),
  tunnelStop:     ()  => ipcRenderer.invoke('tunnel:stop'),
  tunnelStatus:   ()  => ipcRenderer.invoke('tunnel:status'),
  tunnelDownload: ()  => ipcRenderer.invoke('tunnel:download'),

  // Licenciamento
  licenseStatus:   () => ipcRenderer.invoke('license:status'),
  licenseActivate: (payload) => ipcRenderer.invoke('license:activate', payload),
  licenseVerify:   () => ipcRenderer.invoke('license:verify'),

  // Eventos do processo principal (ex: navegação via menu)
  on: (channel, cb) => {
    ipcRenderer.on(channel, (_, ...args) => cb(...args));
    return () => ipcRenderer.removeAllListeners(channel);
  },
});
