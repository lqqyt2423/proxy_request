'use strict';

const http = require('http');
const net = require('net');
const EventEmitter = require('events');
const url = require('url');
const RequestHandler = require('./handler');
const requestHandler = require('./requestHandler');
const Logger = require('./logger');

class Proxy extends EventEmitter {
  constructor(options = {}) {
    super();

    const {
      port = 7888,
      interceptServerPost = 7889,
      interceptHttps = false, // 是否拦截解析 https 请求
      verbose = false,
    } = options;

    this.logger = new Logger('proxy', !verbose);
    this.port = port;
    this.interceptServerPost = interceptServerPost;
    this.interceptHttps = interceptHttps;
    this.timeout = 1000 * 30;

    const handler = new RequestHandler(this);

    // http 代理服务
    this.server = http.createServer();
    this.server.on('clientError', (err, socket) => {
      if (err.code === 'ECONNRESET' || !socket.writable) {
        return;
      }
      socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
    });
    this.server.on('request', (req, res) => {
      handler.handle(req, res);
    });

    // ssl 隧道
    this.server.on('connect', async (req, socket, head) => {
      this.logger.info('[connect] req url: %s', req.url);

      let proxyClient;

      // try destory socket and proxyClient socket when error
      const tryDestory = () => {
        if (!socket.destroyed) socket.destroy();
        if (proxyClient && !proxyClient.destroyed) proxyClient.destroy();
      };

      socket.on('error', e => {
        this.logger.warn('[connect] socket error: %s', e.message);
        tryDestory();
      });

      // man in the middle
      if (this.interceptHttps) {
        proxyClient = net.createConnection(this.interceptServerPost, 'localhost');
      }
      // 直接转发 https 流量至目标服务器
      else {
        const { port, hostname } = url.parse('http://' + req.url);
        proxyClient = net.createConnection(port, hostname);
      }

      proxyClient.setTimeout(this.timeout);

      proxyClient.on('error', err => {
        this.logger.warn('[connect] proxy client socket error: %s', err.message);
        tryDestory();
      });

      proxyClient.on('timeout', () => {
        this.logger.warn('[connect] proxy client timeout: %s', req.url);
        tryDestory();
      });

      proxyClient.on('connect', () => {
        this.logger.info('[connect] proxy client connected: %s', req.url);

        socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        proxyClient.write(head);
        proxyClient.pipe(socket);
        socket.pipe(proxyClient);
      });
    });

    // man in the middle intercept server
    if (this.interceptHttps) {
      this.mitmServer = require('./mitm-server').create();
      this.mitmServer.on('error', err => {
        this.logger.warn('mitmServer error: %s', err.message);
      });
      this.mitmServer.on('request', requestHandler.create(this));
    }
  }

  run(callback = () => {}) {
    this.server.listen(this.port, err => {
      if (err) return callback(err);
      this.logger.info('proxy server listen at %s', this.port);
      if (this.interceptHttps) {
        this.mitmServer.listen(this.interceptServerPost, err => {
          if (err) return callback(err);
          this.logger.info('https intercept server listen at %s', this.interceptServerPost);
          callback(null);
        });
      } else {
        callback(null);
      }
    });
  }
}

module.exports = Proxy;
