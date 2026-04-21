/**
 * Inutilização de numeração de NFC-e na SEFAZ-RJ
 */
async function inutilizarNFCe(dados) {
  const {
    ambiente = 'homologacao',
    uf = 'RJ',
    ano,
    cnpj,
    serie,
    numeroInicial,
    numeroFinal,
    justificativa,
    certificado
  } = dados;

  console.log(`[INUTILIZACAO] Inutilizando série ${serie}, números ${numeroInicial}-${numeroFinal}`);

  try {
    // Validações
    if (!justificativa || justificativa.length < 15) {
      throw new Error('Justificativa deve ter no mínimo 15 caracteres');
    }

    if (numeroFinal < numeroInicial) {
      throw new Error('Número final deve ser maior ou igual ao inicial');
    }

    const quantidade = numeroFinal - numeroInicial + 1;
    if (quantidade > 1000) {
      throw new Error('Limite máximo de 1000 números por inutilização');
    }

    // Gera XML de inutilização
    const xmlInutilizacao = gerarXmlInutilizacao({
      ambiente,
      uf,
      ano: ano || new Date().getFullYear(),
      cnpj,
      serie,
      numeroInicial,
      numeroFinal,
      justificativa
    });

    // Assina XML
    const xmlAssinado = assinarXMLInutilizacao(xmlInutilizacao, certificado);

    // Envia para SEFAZ
    const resposta = await enviarInutilizacaoSEFAZ(xmlAssinado, uf, ambiente, certificado);

    return {
      success: true,
      serie,
      numeroInicial,
      numeroFinal,
      quantidade,
      protocolo: resposta.protocolo,
      status: 'INUTILIZADA',
      xmlInutilizacao: resposta.xml,
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    console.error('[INUTILIZACAO] Erro:', error.message);
    throw {
      error: error.message,
      serie,
      numeroInicial,
      numeroFinal,
      tipo: 'INUTILIZACAO_ERROR',
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Gera XML de inutilização
 */
function gerarXmlInutilizacao(dados) {
  const { create } = require('xmlbuilder2');
  const { ambiente, uf, ano, cnpj, serie, numeroInicial, numeroFinal, justificativa } = dados;
  
  const tpAmb = ambiente === 'producao' ? '1' : '2';
  const cOrgao = getCodigoUF(uf);
  const cnpjLimpo = cnpj.replace(/\D/g, '');
  
  // ID da inutilização: ID + tpInut + cOrgao + ano + CNPJ + mod + serie + nNFIni + nNFFin
  const idInutilizacao = `ID${cOrgao}${ano.toString().substring(2)}${cnpjLimpo}65${serie.toString().padStart(3, '0')}${numeroInicial.toString().padStart(9, '0')}${numeroFinal.toString().padStart(9, '0')}`;
  
  const doc = create({ version: '1.0', encoding: 'UTF-8' })
    .ele('inutNFe', { xmlns: 'http://www.portalfiscal.inf.br/nfe', versao: '4.00' })
      .ele('infInut', { Id: idInutilizacao })
        .ele('tpAmb').txt(tpAmb).up()
        .ele('xServ').txt('INUTILIZAR').up()
        .ele('cUF').txt(cOrgao).up()
        .ele('ano').txt(ano.toString().substring(2)).up()
        .ele('CNPJ').txt(cnpjLimpo).up()
        .ele('mod').txt('65').up()
        .ele('serie').txt(serie.toString()).up()
        .ele('nNFIni').txt(numeroInicial.toString()).up()
        .ele('nNFFin').txt(numeroFinal.toString()).up()
        .ele('xJust').txt(limitarString(justificativa, 255)).up()
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
  return ufs[uf.toUpperCase()] || 33;
}

/**
 * Limita tamanho da string
 */
function limitarString(str, maxLength) {
  if (!str) return '';
  return str.substring(0, maxLength);
}

module.exports = { inutilizarNFCe };