# Certificado Digital de Teste — ASTIA PDV

## Arquivo
- **PFX**: `certificado_teste_SP.pfx`  
- **Senha**: `teste123`

## Dados do certificado
| Campo | Valor |
|-------|-------|
| Empresa | EMPRESA TESTE LTDA |
| Estado | SP — São Paulo |
| Tipo | Autoassinado (desenvolvimento) |
| Validade | 2 anos a partir da geração |
| Fingerprint SHA1 | 17:69:01:B4:3A:D4:BD:D9:F8:58:03:0E:C1:B3:A6:A2:A1:23:8A:B7 |

## Como usar no ASTIA PDV
1. Abra **Configurações → Fiscal / NF-e**
2. Clique em **Selecionar Arquivo** e escolha `certificado_teste_SP.pfx`
3. Digite a senha: `teste123`
4. Clique em **Testar e verificar certificado**
5. O sistema exibirá os dados e a validade

## ⚠️ Importante
Este certificado é **autoassinado** e serve apenas para:
- Testar o fluxo de configuração do sistema
- Desenvolvimento e homologação local
- Verificar que o sistema lê e valida corretamente os dados

**NÃO pode** ser usado para emitir NF-e real (a SEFAZ rejeitará).

## Para produção
Adquira um certificado A1 válido em:
- **Certisign**: certisign.com.br
- **Serasa**: serasa.com.br  
- **Valid**: valid.com.br
- **Soluti**: soluti.com.br

Custo aproximado: R$150–250/ano por CNPJ.
