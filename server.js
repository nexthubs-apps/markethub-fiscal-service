const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const crypto = require('crypto');
const { emitirNFCe } = require('./lib/nfce-emitter');
const { cancelarNFCe } = require('./lib/nfce-cancel');
const { inutilizarNFCe } = require('./lib/nfce-inutilizar');

const app = express();
const PORT = process.env.PORT || 3000;

// HMAC Secret (deve ser igual ao SUPABASE_SERVICE_ROLE_KEY do MarketHub)
const HMAC_SECRET = process.env.HMAC_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!HMAC_SECRET) {
  console.error('[ERRO] HMAC_SECRET ou SUPABASE_SERVICE_ROLE_KEY devem estar definidos');
  process.exit(1);
}

// Middleware de segurança
app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'X-Timestamp', 'X-Signature']
}));
app.use(express.json({ limit: '10mb' }));

// Middleware de autenticação HMAC
function verifyHMAC(req, res, next) {
  const timestamp = req.headers['x-timestamp'];
  const signature = req.headers['x-signature'];
  
  if (!timestamp || !signature) {
    return res.status(401).json({ 
      error: 'Autenticação HMAC necessária',
      code: 'HMAC_MISSING'
    });
  }
  
  // Anti-replay: rejeita requests com timestamp > 30s
  const now = Date.now();
  const reqTime = parseInt(timestamp);
  if (isNaN(reqTime) || Math.abs(now - reqTime) > 30000) {
    return res.status(401).json({ 
      error: 'Timestamp inválido ou expirado',
      code: 'TIMESTAMP_INVALID'
    });
  }
  
  // Verifica assinatura
  const bodyStr = JSON.stringify(req.body);
  const expectedSig = crypto
    .createHmac('sha256', HMAC_SECRET)
    .update(timestamp + bodyStr)
    .digest('hex');
  
  if (!crypto.timingSafeEqual(
    Buffer.from(signature, 'hex'),
    Buffer.from(expectedSig, 'hex')
  )) {
    return res.status(401).json({ 
      error: 'Assinatura HMAC inválida',
      code: 'HMAC_INVALID'
    });
  }
  
  next();
}

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Teste de conexão SEFAZ (sem emitir nota)
app.post('/sefaz/test', verifyHMAC, async (req, res) => {
  try {
    const { uf = 'RJ' } = req.body;
    
    // Aqui faria um teste de conectividade com os webservices SEFAZ
    // Por enquanto retorna sucesso simulado
    res.json({
      success: true,
      message: `Conexão com SEFAZ-${uf} configurada`,
      webservices: {
        autorizacao: `https://nfce-${uf.toLowerCase()}.svrs.rs.gov.br/ws/NfeAutorizacao/NFeAutorizacao4.asmx`,
        retAutorizacao: `https://nfce-${uf.toLowerCase()}.svrs.rs.gov.br/ws/NfeRetAutorizacao/NFeRetAutorizacao4.asmx`
      }
    });
  } catch (error) {
    console.error('[ERRO] Teste SEFAZ:', error);
    res.status(500).json({
      error: 'Erro ao testar conexão SEFAZ',
      details: error.message
    });
  }
});

// Emissão de NFC-e
app.post('/nfce/emit', verifyHMAC, async (req, res) => {
  try {
    const result = await emitirNFCe(req.body);
    res.json(result);
  } catch (error) {
    console.error('[ERRO] Emissão NFC-e:', error);
    res.status(500).json({
      error: 'Erro interno na emissão',
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Cancelamento de NFC-e
app.post('/nfce/cancel', verifyHMAC, async (req, res) => {
  try {
    const result = await cancelarNFCe(req.body);
    res.json(result);
  } catch (error) {
    console.error('[ERRO] Cancelamento NFC-e:', error);
    res.status(500).json({
      error: 'Erro interno no cancelamento',
      details: error.message
    });
  }
});

// Inutilização de numeração
app.post('/nfce/inutilizar', verifyHMAC, async (req, res) => {
  try {
    const result = await inutilizarNFCe(req.body);
    res.json(result);
  } catch (error) {
    console.error('[ERRO] Inutilização NFC-e:', error);
    res.status(500).json({
      error: 'Erro interno na inutilização',
      details: error.message
    });
  }
});

// Tratamento de erros global
app.use((err, req, res, next) => {
  console.error('[ERRO GLOBAL]', err);
  res.status(500).json({
    error: 'Erro interno do servidor',
    code: 'INTERNAL_ERROR'
  });
});

// Inicia servidor
app.listen(PORT, () => {
  console.log(`[MARKETHUB FISCAL SERVICE] Rodando na porta ${PORT}`);
  console.log(`[AMBIENTE] ${process.env.NODE_ENV || 'development'}`);
  console.log(`[HMAC] ${HMAC_SECRET ? 'Configurado' : 'NÃO CONFIGURADO - ERRO!'}`);
});

module.exports = app;