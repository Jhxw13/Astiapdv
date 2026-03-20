# VYN CRM — Rede Local

Sistema de gestão comercial com banco de dados SQLite local, funcionando em rede local (sem internet).

## Arquitetura

```
[PC Servidor] ←— rede local —→ [PC Cliente 1]
   Electron                         Electron portable
   SQLite                      [PC Cliente 2]
   HTTP :3567                       Electron portable
```

- **Servidor**: roda o banco de dados SQLite + servidor HTTP na porta 3567
- **Clientes**: abrem o Electron apontando para o IP do servidor

## Credenciais padrão

```
E-mail: admin@vyncrm.com
Senha:  admin123
```

## Desenvolvimento

```bash
npm install
npm run dev         # Inicia Vite + Electron (modo servidor)
```

## Builds

### Instalar dependências
```bash
npm install
npm run rebuild     # Recompila better-sqlite3 para Electron
```

### Build do Servidor (instalador .exe)
```bash
npm run build:servidor
# Gera: release/servidor/VYN CRM Servidor Setup.exe
```

### Build do Cliente (portable .exe)
```bash
npm run build:cliente
# Gera: release/cliente/VYN CRM Cliente.exe
```

## Instalação em produção

### 1. No PC Servidor
1. Instalar `VYN CRM Servidor Setup.exe`
2. Abrir o VYN CRM — ele inicia o banco e o servidor HTTP automaticamente
3. Ir em **Rede → Informações da Rede** para ver o IP (ex: `192.168.1.10`)

### 2. Nos PCs Clientes
1. Copiar `VYN CRM Cliente.exe` (portable, sem instalação)
2. Executar e na tela de login clicar em **"Configurar servidor da rede"**
3. Informar o IP do servidor: `http://192.168.1.10:3567`
4. Fazer login normalmente

## Portas de rede
- **3567** — HTTP (API + frontend) — deve estar liberada no firewall do servidor

## Backup
- No servidor, acessar **Configurações → Banco de Dados → Exportar Backup**
- O arquivo `.db` pode ser restaurado a qualquer momento
