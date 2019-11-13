'use strict';

const http = require('http');
const net = require('net');
const EventEmitter = require('events');
const requestHandler = require('./requestHandler');
const mitmServer = require('./mitm-server');
const logger = require('./logger');

const SERVER_PORT = 7888;
const MITM_SERVER_PORT = 7889;

// const url = require('url');
// const fakeServer = require('./fake-server');

class Proxy extends EventEmitter {
  constructor(options = {}) {
    super();
    const {
      httpPort = SERVER_PORT,
      httpsPort = MITM_SERVER_PORT,
    } = options;

    this.httpPort = httpPort;
    this.httpsPort = httpsPort;
    const handler = requestHandler.create(this);

    this.server = http.createServer();
    // http 代理
    this.server.on('request', handler);
    this.server.on('error', err => {
      logger.error(err);
      this.emit('error', err);
    });
    // ssl隧道
    this.server.on('connect', async (req, socket, head) => {
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
      const proxyClient = net.createConnection(this.httpsPort, 'localhost');

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

    this.mitmServer = mitmServer.create();
    this.mitmServer.on('request', handler);
    this.mitmServer.on('error', err => {
      logger.error(err);
      this.emit('error', err);
    });
  }

  async start() {
    await new Promise((resolve, reject) => {
      this.server.listen(this.httpPort, (err) => {
        if (err) {
          logger.error(err);
          this.emit('error', err);
          return reject(err);
        }
        logger.info('server listen at %s', this.httpPort);
        resolve();
      });
    });

    await new Promise((resolve, reject) => {
      this.mitmServer.listen(this.httpsPort, (err) => {
        if (err) {
          logger.error(err);
          this.emit('error', err);
          return reject(err);
        }
        logger.info('mitm server listen at %s', this.httpsPort);
        resolve();
      });
    });

    this.emit('init');
  }
}


module.exports = Proxy;

// process.on('uncaughtException', (e, origin) => {
//   logger.warn('uncaughtException origin %s', origin);
//   logger.error(e);
// });

// process.on('unhandledRejection', (reason, promise) => {
//   logger.error('unhandledRejection at:', promise, 'reason:', reason);
// });
