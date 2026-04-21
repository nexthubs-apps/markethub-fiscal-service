/**
 * Funções utilitárias para comunicação com SEFAZ
 */
const https = require('https');
const forge = require('node-forge');
const fs = require('fs');

/**
 * URLs dos WebServices SEFAZ por UF e ambiente
 */
const SEFAZ_URLS = {
  'RJ': {
    homologacao: {
      autorizacao: 'https://homologacao.nfce.fazenda.rj.gov.br/nfce/services/NFeAutorizacao4?wsdl',
      retAutorizacao: 'https://homologacao.nfce.fazenda.rj.gov.br/nfce/services/NFeRetAutorizacao4?wsdl',
      consulta: 'https://homologacao.nfce.fazenda.rj.gov.br/nfce/services/NFeConsulta4?wsdl',
      status: 'https://homologacao.nfce.fazenda.rj.gov.br/nfce/services/NFeStatusServico4?wsdl',
      recepcaoEvento: 'https://homologacao.nfce.fazenda.rj.gov.br/nfce/services/NFeRecepcaoEvento4?wsdl'
    },
    producao: {
      autorizacao: 'https://nfce.fazenda.rj.gov.br/nfce/services/NFeAutorizacao4?wsdl',
      retAutorizacao: 'https://nfce.fazenda.rj.gov.br/nfce/services/NFeRetAutorizacao4?wsdl',
      consulta: 'https://nfce.fazenda.rj.gov.br/nfce/services/NFeConsulta4?wsdl',
      status: 'https://nfce.fazenda.rj.gov.br/nfce/services/NFeStatusServico4?wsdl',
      recepcaoEvento: 'https://nfce.fazenda.rj.gov.br/nfce/services/NFeRecepcaoEvento4?wsdl'
    }
  }
};

/**
 * Envia requisição SOAP para SEFAZ com mTLS
 */
function enviarSOAP(url, soapEnvelope, certificadoPath, certificadoSenha) {
  return new Promise((resolve, reject) => {
    // Extrai certificado e chave do PFX
    const pfxData = fs.readFileSync(certificadoPath);
    const p12Asn1 = forge.asn1.fromDer(pfxData.toString('binary'));
    const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, certificadoSenha);
    
    // Extrai certificado
    const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
    const cert = certBags[forge.pki.oids.certBag][0].cert;
    const certPem = forge.pki.certificateToPem(cert);
    
    // Extrai chave privada
    const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
    const keyBag = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag][0];
    const privateKey = forge.pki.privateKeyToPem(keyBag.key);
    
    // Prepara opções HTTPS com mTLS
    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction': ''
      },
      cert: certPem,
      key: privateKey,
      rejectUnauthorized: false // SEFAZ usa certificados específicos
    };
    
    const req = https.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    
    req.on('error', reject);
    req.write(soapEnvelope);
    req.end();
  });
}

/**
 * Processa resposta XML da SEFAZ
 */
function processarRespostaSEFAZ(xmlResposta) {
  // Implementação simplificada - em produção usar parser XML completo
  const extrairValor = (xml, tag) => {
    const match = xml.match(new RegExp(`<${tag}>([^<]+)</${tag}>`));
    return match ? match[1] : null;
  };
  
  const cStat = extrairValor(xmlResposta, 'cStat');
  const xMotivo = extrairValor(xmlResposta, 'xMotivo');
  const nProt = extrairValor(xmlResposta, 'nProt');
  const chNFe = extrairValor(xmlResposta, 'chNFe');
  
  // cStat 100 = Autorizado
  // cStat 101 = Cancelado
  const sucesso = cStat && (cStat.startsWith('10') || cStat === '128');
  
  return {
    sucesso,
    cStat,
    xMotivo,
    protocolo: nProt,
    chave: chNFe,
    xml: xmlResposta
  };
}

module.exports = {
  SEFAZ_URLS,
  enviarSOAP,
  processarRespostaSEFAZ
};