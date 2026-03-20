# Como gerar os instaladores ASTIA PDV

## Pré-requisitos
- Node.js 18+
- PowerShell como **Administrador**

## Primeira vez (nova pasta)
```powershell
npm install
npm run rebuild
```

## Gerar instalador Servidor (.exe com banco de dados)
```powershell
npm run build:servidor
```
Saída: `release/servidor/ASTIA PDV Servidor Setup 1.0.0.exe`

## Gerar instalador Cliente (.exe sem banco de dados)
```powershell
npm run build:cliente
```
Saída: `release/cliente/ASTIA PDV Cliente Setup 1.0.0.exe`

## O que o instalador faz automaticamente
1. Verifica se o Visual C++ Redistributable 2015-2022 já está instalado
2. Se não estiver, instala silenciosamente (sem nenhuma janela extra)
3. Instala o ASTIA PDV

## Banco de dados
O banco fica em: `%APPDATA%\ASTIA PDV\vyncrm.db`
Para limpar dados de teste: apague esse arquivo antes de distribuir.
