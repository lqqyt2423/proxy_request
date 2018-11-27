'use strict';

const fs = require('fs');
const https = require('https');
const tls = require('tls');
const path = require('path');
const requestHandler = require('./requestHandler');
const { getPath } = require('./utils');
const crtMgr = require('./crtMgr');
// const constants = require('constants');

const certPath = getPath('certificates');

async function SNIPrepareCert(servername, cb) {
  console.log('SNIPrepareCert servername:', servername);

  try {
    const { key, crt } = await new Promise((resolve, reject) => {
      crtMgr.getCertificate(servername, (err, key, crt) => {
        if (err) return reject(err);
        resolve({ key, crt });
      });
    });
    const ctx = tls.createSecureContext({ key, cert: crt });
    cb(null, ctx);
  } catch(e) {
    console.log('SNIPrepareCert Error:', e);
    cb(e, null);
  }
}

// host: anyproxy_internal_https_server
const server = https.createServer({
  // secureOptions: constants.SSL_OP_NO_SSLv3 || constants.SSL_OP_NO_TLSv1,

  // 假设已经存在了 localhost.key 和 localhost.crt
  // 所以需先运行 crtMgr.getCertificate('localhost') 来生成证书
  key: fs.readFileSync(path.join(certPath, 'localhost.key')),
  cert: fs.readFileSync(path.join(certPath, 'localhost.crt')),

  // A function that will be called if the client supports SNI TLS extension
  // 服务器名称指示（server name indication, SNI）
  // 为客户端提供一种机制，可告知服务器希望与之建立连接的服务器的名称
  // 为安全虚拟主机提供支持，可在一个 IP 部署多个证书
  SNICallback: SNIPrepareCert,
});

server.on('request', requestHandler);

module.exports = server;
