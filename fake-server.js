'use strict';

// 中间人攻击的简单方法：每个 servername 开一个服务器，占用一个端口
// 已被 mitm-server 取代
// 简单示例，不考虑错误及性能

const https = require('https');
const requestHandler = require('./requestHandler');
const crtMgr = require('./crtMgr');

// return port
async function fakeServer(servername) {
  try {
    const { key, crt } = await new Promise((resolve, reject) => {
      crtMgr.getCertificate(servername, (err, key, crt) => {
        if (err) return reject(err);
        resolve({ key, crt });
      });
    });
    const server = https.createServer({ key, cert: crt });
    server.on('request', requestHandler);
    // 随机分配一个可用端口
    return await new Promise(resolve => {
      server.listen(0, () => {
        resolve(server.address().port);
      });
    });
  } catch (e) {
    console.log('FAKE SERVER Error:', e);
  }
}

module.exports = fakeServer;
