# VYN CRM v6 — Leia Primeiro

## Credenciais padrão
```
E-mail: admin@vyncrm.com
Senha:  admin123
```

---

## Instalação (servidor — seu PC)

**Pré-requisito:** Node.js 20 LTS → https://nodejs.org/ (marque "Add to PATH")

Abra o **PowerShell** ou **CMD** na pasta `vyncrm_v5`:

```powershell
npm install
npm run rebuild
npm run build:web
npm start
```

Só na primeira vez. Depois, apenas `npm start`.

---

## Outros dispositivos (celular / outro PC)

1. No servidor, abra o menu **Rede → Info da rede** para ver o IP (ex: `192.168.1.15`)
2. No outro dispositivo, abra o navegador e acesse: `http://192.168.1.15:3567`
3. Faça login normalmente ✅

**Firewall Windows** (execute uma vez como Administrador):
```powershell
netsh advfirewall firewall add rule name="VYN CRM" dir=in action=allow protocol=TCP localport=3567
```

---

## Gerar .exe para distribuição

```powershell
npm run build:servidor   # → release/servidor/VYN CRM Servidor Setup.exe
npm run build:cliente    # → release/cliente/VYN CRM Cliente.exe (portátil)
```

---

## Resetar senha do admin

```powershell
node setup-usuario.js
# Reseta para: admin@vyncrm.com / admin123
```

---

## O que foi corrigido nesta versão

- ✅ **Tela cinza corrigida** — `base: '/'` no Vite + Electron carrega via HTTP
- ✅ **Outros dispositivos conectam** — SPA servido corretamente com fallback
- ✅ **Vendas registram** — transação SQLite com baixa de estoque e pagamentos
- ✅ **API detecta modo automaticamente** — browser, Electron servidor e cliente
- ✅ **Ícones atualizados** — design VYN CRM
- ✅ **Sem .bat** — tudo via npm

