# MarketHub Fiscal Service

Microserviço Node.js para emissão direta de NFC-e (Nota Fiscal do Consumidor Eletrônica) na SEFAZ-RJ, sem provedores pagos intermediários.

## 🎯 Objetivo

Emitir NFC-e modelo 65 diretamente na SEFAZ-RJ com **custo zero** de provedor fiscal. Você só paga o Certificado Digital A1 (obrigatório por lei).

## 🏗️ Arquitetura

```
[MarketHub] → [Edge Function] → [Este Microserviço] → [SEFAZ-RJ]
                                      ↓
                              Assina XML + mTLS
```

## 💰 Custos

| Item | Custo | Observação |
|------|-------|------------|
| Certificado A1 | ~R$ 180/ano | Você já tem |
| CSC SEFAZ-RJ | R$ 0 | Gratuito no portal |
| Fly.io | R$ 0 | Free tier sempre-on |
| **Total mensal** | **R$ 0,00** | |

## 🚀 Deploy no Fly.io (10 minutos)

### 1. Instalar Fly CLI

```bash
# macOS/Linux
curl -L https://fly.io/install.sh | sh

# Windows (PowerShell)
iwr https://fly.io/install.ps1 -useb | iex
```

### 2. Login na Fly.io

```bash
fly auth signup  # Se não tiver conta (grátis, sem cartão)
fly auth login   # Se já tiver conta
```

### 3. Deploy do Microserviço

```bash
# Clone ou baixe este repositório
cd markethub-fiscal-service

# Cria app no Fly.io (só na primeira vez)
fly launch --name markethub-fiscal --region gru --no-deploy

# Configura secrets (obrigatório!)
fly secrets set HMAC_SECRET="sua_chave_secreta_aqui"

# Deploy
fly deploy

# Verifica se está rodando
fly status
```

### 4. Configurar no MarketHub

1. Copie a URL do app: `fly apps list` ou `fly status`
2. No MarketHub, vá em **Fiscal → Configurações**
3. Cole a URL em "URL do Microserviço"
4. Cole o mesmo `HMAC_SECRET` em "Token de Autenticação"
5. Clique em "Testar Conexão"

## 🔧 Configuração

### Variáveis de Ambiente

| Variável | Obrigatório | Descrição |
|----------|-------------|-----------|
| `HMAC_SECRET` | Sim | Mesma chave do SUPABASE_SERVICE_ROLE_KEY |
| `PORT` | Não | Porta do servidor (padrão: 3000) |
| `NODE_ENV` | Não | development/production |
| `ALLOWED_ORIGINS` | Não | Origens CORS permitidas |

### Estrutura de Arquivos

```
markethub-fiscal-service/
├── server.js              # Servidor Express principal
├── lib/
│   ├── nfce-emitter.js    # Lógica de emissão
│   ├── nfce-cancel.js     # Cancelamento
│   ├── nfce-inutilizar.js # Inutilização
│   └── sefaz-client.js    # Cliente SEFAZ (mTLS)
├── package.json
├── Dockerfile
├── fly.toml
└── README.md
```

## 📡 Endpoints

### Health Check
```bash
GET /health
```

### Testar Conexão SEFAZ
```bash
POST /sefaz/test
Headers:
  X-Timestamp: <timestamp>
  X-Signature: <hmac_signature>
Body:
  { "uf": "RJ", "ambiente": "homologacao" }
```

### Emitir NFC-e
```bash
POST /nfce/emit
Headers:
  X-Timestamp: <timestamp>
  X-Signature: <hmac_signature>
Body:
  {
    "ambiente": "homologacao",
    "uf": "RJ",
    "emitente": { ... },
    "certificado": { "url": "...", "password": "..." },
    "csc": { "id": "...", "token": "..." },
    "nfce": { ... }
  }
```

### Cancelar NFC-e
```bash
POST /nfce/cancel
Headers:
  X-Timestamp: <timestamp>
  X-Signature: <hmac_signature>
```

### Inutilizar Numeração
```bash
POST /nfce/inutilizar
Headers:
  X-Timestamp: <timestamp>
  X-Signature: <hmac_signature>
```

## 🔐 Segurança

### Autenticação HMAC

Todas as requisições devem incluir:
- `X-Timestamp`: Timestamp em milissegundos
- `X-Signature`: HMAC-SHA256 de `timestamp + body`

```javascript
const signature = crypto
  .createHmac('sha256', HMAC_SECRET)
  .update(timestamp + JSON.stringify(body))
  .digest('hex');
```

### Certificado

- Certificado A1 (.pfx) baixado via URL assinada temporária (5 min)
- Senha criptografada no banco do MarketHub
- Certificado nunca é persistido em disco (apenas temporariamente em /tmp)

### mTLS

Comunicação com SEFAZ usa:
- Certificado do contribuinte (A1)
- Chave privada extraída do PFX
- Verificação de certificado do servidor SEFAZ

## 🐛 Troubleshooting

### Erro: "HMAC inválido"
- Verifique se `HMAC_SECRET` está igual ao `SUPABASE_SERVICE_ROLE_KEY` do MarketHub
- Confira se timestamp está em milissegundos
- Verifique se o body não está sendo modificado

### Erro: "Certificado inválido"
- Verifique se o arquivo .pfx não está corrompido
- Confirme se a senha está correta
- Certifique-se de que é um certificado A1 (não A3)

### Erro: "SEFAZ rejeitou"
- Verifique o código de erro específico na mensagem
- Códigos comuns:
  - 215: Falha no schema XML
  - 225: Falha de assinatura
  - 236: Chave de acesso inválida
  - 254: Duplicidade de NFC-e

### Fly.io: "App não inicia"
```bash
# Ver logs
fly logs

# Verifica status
fly status

# Reinicia
fly restart
```

## 📄 Licença

MIT License - Livre para uso comercial e modificação.

## 🤝 Suporte

Para suporte técnico:
- Email: suporte@markethub.com.br
- Documentação: https://docs.markethub.com.br/fiscal

---

**Desenvolvido com ❤️ pela equipe MarketHub**