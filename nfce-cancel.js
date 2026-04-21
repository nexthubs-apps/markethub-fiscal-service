/**
 * Cancelamento de NFC-e na SEFAZ-RJ
 */
async function cancelarNFCe(dados) {
  const {
    ambiente = 'homologacao',
    uf = 'RJ',
    chaveAcesso,
    protocolo,
    justificativa,
    certificado,
    emitente
  } = dados;

  console.log(`[CANCELAMENTO] Iniciando cancelamento NFC-e ${chaveAcesso}`);

  try {
    // Valida justificativa (mínimo 15 caracteres)
    if (!justificativa || justificativa.length < 15) {
      throw new Error('Justificativa deve ter no mínimo 15 caracteres');
    }

    // Gera XML de evento de cancelamento
    const xmlEvento = gerarXmlEventoCancelamento({
      ambiente,
      uf,
      chaveAcesso,
      protocolo,
      justificativa,
      emitente
    });

    // Assina XML
    const xmlAssinado = assinarXMLEvento(xmlEvento, certificado);

    // Envia para SEFAZ
    const resposta = await enviarEventoSEFAZ(xmlAssinado, uf, ambiente, certificado);

    return {
      success: true,
      chaveAcesso,
      protocoloCancelamento: resposta.protocolo,
      status: 'CANCELADA',
      xmlCancelamento: resposta.xml,
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    console.error('[CANCELAMENTO] Erro:', error.message);
    throw {
      error: error.message,
      chaveAcesso,
      tipo: 'CANCELAMENTO_ERROR',
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Gera XML do evento de cancelamento
 */
function gerarXmlEventoCancelamento(dados) {
  const { create } = require('xmlbuilder2');
  const { ambiente, uf, chaveAcesso, protocolo, justificativa, emitente } = dados;
  
  const tpAmb = ambiente === 'producao' ? '1' : '2';
  const cOrgao = getCodigoUF(uf);
  
  const doc = create({ version: '1.0', encoding: 'UTF-8' })
    .ele('envEvento', { xmlns: 'http://www.portalfiscal.inf.br/nfe', versao: '1.00' })
      .ele('idLote').txt('1').up()
      .ele('evento', { versao: '1.00' })
        .ele('infEvento', { Id: `ID110111${chaveAcesso}01` })
          .ele('cOrgao').txt(cOrgao).up()
          .ele('tpAmb').txt(tpAmb).up()
          .ele('CNPJ').txt(emitente.cnpj.replace(/\D/g, '')).up()
          .ele('chNFe').txt(chaveAcesso).up()
          .ele('dhEvento').txt(new Date().toISOString()).up()
          .ele('tpEvento').txt('110111').up() // Cancelamento
          .ele('nSeqEvento').txt('1').up()
          .ele('verEvento').txt('1.00').up()
          .ele('detEvento')
            .ele('descEvento').txt('Cancelamento').up()
            .ele('nProt').txt(protocolo).up()
            .ele('xJust').txt(limitarString(justificativa, 255)).up()
          .up()
        .up()
      .up()
    .up();
  
  return doc.end({ prettyPrint: true });
}

/**
 * Retorna código da UF
 */
function getCodigoUF(uf) {
  const ufs = {
    'RO': 11, 'AC': 12, 'AM': 13, 'RR': 14, 'PA': 15, 'AP': 16, 'TO': 17,
    'MA': 21, 'PI': 22, 'CE': 23, 'RN': 24, 'PB': 25, 'PE': 26, 'AL': 27, 'SE': 28, 'BA': 29,
    'MG': 31, 'ES': 32, 'RJ': 33, 'SP': 35, 'PR': 41, 'SC': 42, 'RS': 43,
    'MS': 50, 'MT': 51, 'GO': 52, 'DF': 53
  };
  return ufs[uf.toUpperCase()] || 33; // Default RJ
}

/**
 * Limita tamanho da string
 */
function limitarString(str, maxLength) {
  if (!str) return '';
  return str.substring(0, maxLength);
}

module.exports = { cancelarNFCe };