'use strict';

const http = require('http');
const net = require('net');
const requestHandler = require('./requestHandler');
const mitmServer = require('./mitm-server');
const logger = require('./logger');

const SERVER_PORT = 7888;
const MITM_SERVER_PORT = 7889;

// const url = require('url');
// const fakeServer = require('./fake-server');

const server = http.createServer();

// http 代理
server.on('request', requestHandler);

// ssl隧道
server.on('connect', async (req, socket, head) => {
  socket.on('error', e => {
    logger.warn('socket error: %s', e.message);
    // logger.error(e);
  });

  const path = req.url;

  // 直接连接服务器
  // const { port, hostname } = url.parse('http://' + path);
  // const proxyClient = net.createConnection(port, hostname);

  // simple test, not recommend
  // let { port, hostname } = url.parse('http://' + path);
  // port = await fakeServer(hostname);
  // const proxyClient = net.createConnection(port, 'localhost');

  // man in the middle
  const proxyClient = net.createConnection(MITM_SERVER_PORT, 'localhost');

  proxyClient.setTimeout(30000);

  proxyClient.on('connect', () => {
    // 代理客户端socket连接建立后
    logger.debug('SSL proxyClient connect', path);

    socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');

    // 交换数据
    proxyClient.write(head);
    proxyClient.pipe(socket);
    socket.pipe(proxyClient);

    // 交换数据方法二
    // proxyClient.write(head);
    // socket.on('data', data => {
    //   proxyClient.write(data);
    // });
    // proxyClient.on('data', data => {
    //   socket.write(data);
    // });
  });

  proxyClient.on('timeout', () => {
    logger.warn('connect timeout', path);
    // 需要用 destroy，因为有可能还未触发 connect 事件
    proxyClient.destroy();
    socket.end();
  });

  proxyClient.on('error', err => {
    logger.error(err);
    socket.end();
  });

  // proxyClient.on('close', hadErr => {
  //   console.log('proxyClient close', path, 'hadError:', hadErr);
  // });
});

server.listen(SERVER_PORT, () => {
  logger.info('server listen at %s', SERVER_PORT);
});
mitmServer.listen(MITM_SERVER_PORT, () => {
  logger.info('mitm server listen at %s', MITM_SERVER_PORT);
});

server.on('error', err => {
  logger.error(err);
});
mitmServer.on('error', err => {
  logger.error(err);
});

process.on('uncaughtException', (e, origin) => {
  logger.warn('uncaughtException origin %s', origin);
  logger.error(e);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('unhandledRejection at:', promise, 'reason:', reason);
});
