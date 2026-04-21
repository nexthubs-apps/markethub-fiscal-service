const forge = require('node-forge');
const crypto = require('crypto');
const axios = require('axios');
const https = require('https');
const fs = require('fs');
const path = require('path');

/**
 * Emite NFC-e diretamente na SEFAZ-RJ
 * @param {Object} dados - Dados completos da NFC-e
 * @returns {Object} - Resultado da emissão
 */
async function emitirNFCe(dados) {
  const {
    ambiente = 'homologacao',
    uf = 'RJ',
    emitente,
    certificado,
    csc,
    nfce,
    callback
  } = dados;

  console.log(`[EMISSÃO] Iniciando NFC-e ${ambiente.toUpperCase()} para ${uf}`);
  console.log(`[EMISSÃO] Série: ${nfce.serie}, Número: ${nfce.numero}`);

  try {
    // 1. Baixa certificado do Storage (URL assinada temporária)
    console.log('[EMISSÃO] Baixando certificado...');
    const certPath = await baixarCertificado(certificado.url);
    
    // 2. Extrai chave privada do PFX
    console.log('[EMISSÃO] Extraindo chave privada do certificado...');
    const privateKey = extrairChavePrivada(certPath, certificado.password);
    
    // 3. Gera XML da NFC-e
    console.log('[EMISSÃO] Gerando XML...');
    const xmlNFCe = gerarXmlNFCe({ ambiente, uf, emitente, nfce, csc });
    
    // 4. Assina XML
    console.log('[EMISSÃO] Assinando XML...');
    const xmlAssinado = assinarXML(xmlNFCe, privateKey, emitente.cnpj);
    
    // 5. Envelopa SOAP
    console.log('[EMISSÃO] Preparando envelope SOAP...');
    const soapEnvelope = criarEnvelopeSOAP(xmlAssinado, 'NFeAutorizacao4');
    
    // 6. Envia para SEFAZ (mTLS)
    console.log('[EMISSÃO] Enviando para SEFAZ-RJ...');
    const respostaSEFAZ = await enviarParaSEFAZ(soapEnvelope, uf, ambiente, certPath, certificado.password);
    
    // 7. Processa resposta
    console.log('[EMISSÃO] Processando resposta SEFAZ...');
    const resultado = processarRespostaSEFAZ(respostaSEFAZ, xmlAssinado);
    
    // 8. Limpa certificado temporário
    limparCertificadoTemporario(certPath);
    
    console.log(`[EMISSÃO] ✅ Sucesso! Chave: ${resultado.chave}`);
    
    return {
      success: true,
      chave: resultado.chave,
      protocolo: resultado.protocolo,
      xml_autorizado: resultado.xmlAutorizado,
      sefaz_consulta_url: `https://www.fazenda.rj.gov.br/sefaz/services/nfceConsulta?chNFe=${resultado.chave}`,
      ambiente,
      timestamp: new Date().toISOString()
    };
    
  } catch (error) {
    console.error('[EMISSÃO] ❌ Erro:', error.message);
    
    // Tenta extrair código de erro da SEFAZ se disponível
    const sefazError = extrairErroSEFAZ(error.message);
    
    throw {
      error: sefazError?.mensagem || error.message,
      cStat: sefazError?.codigo || null,
      tipo: 'EMISSAO_ERROR',
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Baixa certificado de URL assinada temporária
 */
async function baixarCertificado(url) {
  try {
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 30000
    });
    
    const tempPath = path.join('/tmp', `cert_${Date.now()}.pfx`);
    fs.writeFileSync(tempPath, response.data);
    
    console.log(`[CERT] Baixado para ${tempPath} (${response.data.length} bytes)`);
    return tempPath;
  } catch (error) {
    throw new Error(`Falha ao baixar certificado: ${error.message}`);
  }
}

/**
 * Extrai chave privada do certificado PFX
 */
function extrairChavePrivada(certPath, password) {
  try {
    const pfxData = fs.readFileSync(certPath);
    const p12Asn1 = forge.asn1.fromDer(pfxData.toString('binary'));
    const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, password);
    
    // Extrai chave privada
    const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
    const keyBag = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag][0];
    const privateKey = forge.pki.privateKeyToPem(keyBag.key);
    
    console.log('[CERT] Chave privada extraída com sucesso');
    return privateKey;
  } catch (error) {
    throw new Error(`Falha ao extrair chave privada: ${error.message}`);
  }
}

/**
 * Gera XML da NFC-e conforme layout 4.00
 */
function gerarXmlNFCe({ ambiente, uf, emitente, nfce, csc }) {
  const { create } = require('xmlbuilder2');
  
  const tpAmb = ambiente === 'producao' ? '1' : '2';
  const cUF = getCodigoUF(uf);
  const dhEmi = new Date().toISOString();
  
  // Gera chave de acesso (44 posições)
  const chave = gerarChaveAcesso({
    cUF,
    dhEmi,
    cnpj: emitente.cnpj,
    mod: '65',
    serie: nfce.serie.toString().padStart(3, '0'),
    nNF: nfce.numero.toString().padStart(9, '0'),
    tpEmis: '1',
    cNF: Math.floor(Math.random() * 99999999).toString().padStart(8, '0')
  });
  
  const doc = create({ version: '1.0', encoding: 'UTF-8' })
    .ele('NFe', { xmlns: 'http://www.portalfiscal.inf.br/nfe' })
      .ele('infNFe', { Id: `NFe${chave}`, versao: '4.00' })
        // Identificação
        .ele('ide')
          .ele('cUF').txt(cUF).up()
          .ele('cNF').txt(chave.substring(35, 43)).up()
          .ele('natOp').txt(nfce.natureza_operacao || 'VENDA AO CONSUMIDOR').up()
          .ele('mod').txt('65').up()
          .ele('serie').txt(nfce.serie.toString()).up()
          .ele('nNF').txt(nfce.numero.toString()).up()
          .ele('dhEmi').txt(dhEmi).up()
          .ele('tpNF').txt('1').up()
          .ele('idDest').txt('1').up()
          .ele('cMunFG').txt(emitente.endereco.ibge_code || '3304557').up()
          .ele('tpImp').txt('4').up() // Danfe NFC-e
          .ele('tpEmis').txt('1').up() // Normal
          .ele('cDV').txt(chave.substring(43)).up()
          .ele('tpAmb').txt(tpAmb).up()
          .ele('finNFe').txt('1').up()
          .ele('indFinal').txt('1').up()
          .ele('indPres').txt('1').up()
          .ele('procEmi').txt('0').up()
          .ele('verProc').txt('MarketHub 2.17.0').up()
        .up() // /ide
        // Emitente
        .ele('emit')
          .ele('CNPJ').txt(emitente.cnpj.replace(/\D/g, '')).up()
          .ele('xNome').txt(limitarString(emitente.razao_social, 60)).up()
          .ele('xFant').txt(limitarString(emitente.razao_social, 60)).up()
          .ele('enderEmit')
            .ele('xLgr').txt(limitarString(emitente.endereco.logradouro, 60)).up()
            .ele('nro').txt('0').up()
            .ele('xBairro').txt('Centro').up()
            .ele('cMun').txt(emitente.endereco.ibge_code || '3304557').up()
            .ele('xMun').txt(limitarString(emitente.endereco.cidade, 60)).up()
            .ele('UF').txt(emitente.endereco.uf).up()
            .ele('CEP').txt(emitente.endereco.cep.replace(/\D/g, '')).up()
            .ele('cPais').txt('1058').up()
            .ele('xPais').txt('Brasil').up()
            .ele('fone').txt((emitente.telefone || '').replace(/\D/g, '')).up()
          .up()
          .ele('IE').txt(emitente.ie.replace(/\D/g, '')).up()
          .ele('CRT').txt(emitente.crt).up()
        .up() // /emit
        // Destinatário (consumidor não identificado = 9999999999999)
        .ele('dest')
          .ele('CPF').txt('99999999999').up()
          .ele('xNome').txt('CONSUMIDOR').up()
        .up()
        // Itens
        .ele('det')
          .ele('prod')
            .ele('cProd').txt('000001').up()
            .ele('cEAN').txt('SEM GTIN').up()
            .ele('xProd').txt('PRODUTO TESTE NFC-E').up()
            .ele('NCM').txt('99999999').up()
            .ele('CFOP').txt('5102').up()
            .ele('uCom').txt('UN').up()
            .ele('qCom').txt('1.0000').up()
            .ele('vUnCom').txt('10.00').up()
            .ele('vProd').txt('10.00').up()
            .ele('cEANTrib').txt('SEM GTIN').up()
            .ele('uTrib').txt('UN').up()
            .ele('qTrib').txt('1.0000').up()
            .ele('vUnTrib').txt('10.00').up()
            .ele('indTot').txt('1').up()
          .up()
          .ele('imposto')
            .ele('ICMS')
              .ele('ICMSSN102')
                .ele('orig').txt('0').up()
                .ele('CSOSN').txt('102').up()
              .up()
            .up()
            .ele('PIS')
              .ele('PISNT')
                .ele('CST').txt('99').up()
              .up()
            .up()
            .ele('COFINS')
              .ele('COFINSNT')
                .ele('CST').txt('99').up()
              .up()
            .up()
          .up()
        .up()
        // Total
        .ele('total')
          .ele('ICMSTot')
            .ele('vBC').txt('0.00').up()
            .ele('vICMS').txt('0.00').up()
            .ele('vICMSDeson').txt('0.00').up()
            .ele('vFCP').txt('0.00').up()
            .ele('vBCST').txt('0.00').up()
            .ele('vST').txt('0.00').up()
            .ele('vFCPST').txt('0.00').up()
            .ele('vFCPSTRet').txt('0.00').up()
            .ele('vProd').txt('10.00').up()
            .ele('vFrete').txt('0.00').up()
            .ele('vSeg').txt('0.00').up()
            .ele('vDesc').txt('0.00').up()
            .ele('vII').txt('0.00').up()
            .ele('vIPI').txt('0.00').up()
            .ele('vIPIDevol').txt('0.00').up()
            .ele('vPIS').txt('0.00').up()
            .ele('vCOFINS').txt('0.00').up()
            .ele('vOutro').txt('0.00').up()
            .ele('vNF').txt('10.00').up()
            .ele('vTotTrib').txt('0.00').up()
          .up()
        .up()
        // Pagamento
        .ele('pag')
          .ele('detPag')
            .ele('tPag').txt('01').up() // Dinheiro
            .ele('vPag').txt('10.00').up()
          .up()
        .up()
        // Informações adicionais
        .ele('infAdic')
          .ele('infCpl').txt('NFC-e emitida pelo MarketHub').up()
        .up()
        // QR Code
        .ele('infNFeSupl')
          .ele('qrCode')
            .txt(`https://www.sefaz.rs.gov.br/NFCE/NFCE-COM.aspx?p=${chave}|2|1|1|${calcularCRC16(chave + csc.token)}`)
          .up()
          .ele('urlChave').txt('https://www.sefaz.rs.gov.br').up()
        .up()
      .up() // /infNFe
    .up(); // /NFe
  
  return doc.end({ prettyPrint: true });
}

/**
 * Gera chave de acesso da NFC-e (44 posições)
 */
function gerarChaveAcesso({ cUF, dhEmi, cnpj, mod, serie, nNF, tpEmis, cNF }) {
  const anoMes = dhEmi.substring(2, 4) + dhEmi.substring(5, 7); // AAMM
  const cnpjLimpo = cnpj.replace(/\D/g, '').padStart(14, '0');
  
  // Chave sem dígito verificador
  const chaveSemDV = `${cUF}${anoMes}${cnpjLimpo}${mod}${serie.padStart(3, '0')}${nNF.padStart(9, '0')}${tpEmis}${cNF}`;
  
  // Calcula dígito verificador
  const dv = calcularDVNFe(chaveSemDV);
  
  return chaveSemDV + dv;
}

/**
 * Calcula dígito verificador da chave de acesso
 */
function calcularDVNFe(chave) {
  let peso = 2;
  let soma = 0;
  
  for (let i = chave.length - 1; i >= 0; i--) {
    soma += parseInt(chave[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  
  const resto = soma % 11;
  const dv = resto < 2 ? 0 : 11 - resto;
  
  return dv.toString();
}

/**
 * Calcula CRC-16 para QR Code
 */
function calcularCRC16(str) {
  let crc = 0xFFFF;
  
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
    }
  }
  
  return (crc & 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
}

/**
 * Limita string ao tamanho máximo
 */
function limitarString(str, maxLength) {
  if (!str) return '';
  return str.substring(0, maxLength);
}

module.exports = { emitirNFCe };