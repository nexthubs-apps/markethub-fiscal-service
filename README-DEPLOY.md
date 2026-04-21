# markethub-fiscal-service

Microserviço fiscal do MarketHub - Emissão direta de NFC-e na SEFAZ-RJ

## Deploy Rápido no Fly.io

```bash
# 1. Clone este repositório
git clone https://github.com/seu-usuario/markethub-fiscal-service.git
cd markethub-fiscal-service

# 2. Instale o Fly CLI e faça login
curl -L https://fly.io/install.sh | sh
fly auth login

# 3. Crie o app (só na primeira vez)
fly launch --name markethub-fiscal --region gru --no-deploy

# 4. Configure o secret HMAC (obrigatório!)
# Use o mesmo valor do SUPABASE_SERVICE_ROLE_KEY do seu projeto MarketHub
fly secrets set HMAC_SECRET="sua_chave_aqui"

# 5. Deploy
fly deploy

# 6. Verifique se está rodando
fly status
fly logs
```

## Configuração no MarketHub

1. Acesse **Fiscal → Configurações** no MarketHub
2. Em "Microserviço Fiscal", cole:
   - **URL**: `https://markethub-fiscal.fly.dev` (sua URL do Fly.io)
   - **Token**: Mesmo valor do `HMAC_SECRET` configurado acima
3. Clique em **"Testar Conexão"**

## Documentação

Veja o [README completo](README.md) para detalhes técnicos completos.

## Suporte

- Email: suporte@markethub.com.br
- Documentação: https://docs.markethub.com.br