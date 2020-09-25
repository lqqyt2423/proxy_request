'use strict';

// 中间人攻击的简单方法：每个 servername 开一个服务器，占用一个端口
// 已被 mitm-server 取代
// 简单示例，不考虑错误及性能

const https = require('https');
const requestHandler = require('./requestHandler');
const ca = require('./ca');
const Logger = require('./logger');

const logger = new Logger(__filename);

// return port
async function fakeServer(servername) {
  try {
    const { pem, privateKey } = await ca.getServer(servername);
    const server = https.createServer({ key: privateKey, cert: pem });
    server.on('request', requestHandler);
    // 随机分配一个可用端口
    return await new Promise(resolve => {
      server.listen(0, () => {
        resolve(server.address().port);
      });
    });
  } catch (e) {
    logger.warn('FAKE SERVER Error: %s', e.message);
    logger.error(e);
  }
}

module.exports = fakeServer;
