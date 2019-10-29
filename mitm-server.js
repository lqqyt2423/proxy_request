'use strict';

const https = require('https');
const tls = require('tls');
const requestHandler = require('./requestHandler');
const logger = require('./logger');
const ca = require('./ca');

async function SNIPrepareCert(servername, cb) {
  logger.debug('SNIPrepareCert servername:', servername);
  try {
    const { pem, privateKey } = await ca.getServer(servername);
    const ctx = tls.createSecureContext({ key: privateKey, cert: pem });
    cb(null, ctx);
  } catch (e) {
    logger.error(e);
    cb(e, null);
  }
}

// man in the middle server
const server = https.createServer({
  // secureOptions: constants.SSL_OP_NO_SSLv3 || constants.SSL_OP_NO_TLSv1,

  // 经过测试，此 https server 无需 key 和 cert 也可以，SNI 才是关键

  // A function that will be called if the client supports SNI TLS extension
  // 服务器名称指示（server name indication, SNI）
  // 为客户端提供一种机制，可告知服务器希望与之建立连接的服务器的名称
  // 为安全虚拟主机提供支持，可在一个 IP 部署多个证书
  SNICallback: SNIPrepareCert,
});

server.on('request', requestHandler);

module.exports = server;
