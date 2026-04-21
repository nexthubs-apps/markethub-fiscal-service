# Dockerfile para deploy no Fly.io
FROM node:20-alpine

# Instala dependências necessárias para compilação nativa
RUN apk add --no-cache python3 make g++

# Cria diretório da aplicação
WORKDIR /app

# Copia package.json e instala dependências
COPY package*.json ./
RUN npm ci --only=production

# Copia código fonte
COPY . .

# Cria diretório temporário para certificados
RUN mkdir -p /tmp && chmod 777 /tmp

# Expõe porta
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => r.statusCode === 200 ? process.exit(0) : process.exit(1))"

# Comando de inicialização
CMD ["node", "server.js"]