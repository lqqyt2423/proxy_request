'use strict';

const url = require('url');
const http = require('http');

class BaseHandler {
  constructor(proxy) {
    this.proxy = proxy;
    this.logger = this.proxy.logger;
  }

  handle(req, res) {
    // should receive complete url because of this is proxy server
    if (!/^http/.test(req.url)) {
      res.statusCode = 400;
      res.end();
      return;
    }

    let proxyClient;

    const tryDestroy = () => {
      if (res.socket && !res.socket.destroyed) res.socket.destroy();
      if (proxyClient && !proxyClient.aborted) proxyClient.abort();
    };

    const urlObj = url.parse(req.url);

    proxyClient = http.request({
      hostname: urlObj.hostname,
      port: urlObj.port || 80,
      method: req.method,
      path: urlObj.path,
      headers: req.headers,
      timeout: this.proxy.timeout,
    }, (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
    });

    proxyClient.on('error', e => {
      this.logger.warn('[handler] proxy client %s %s error: %s', req.method, req.url, e.message);
      tryDestroy();
    });

    proxyClient.on('timeout', () => {
      this.logger.warn('[handler] proxy client %s %s', req.method, req.url);
      tryDestroy();
    });

    this.logger.info('[http] %s to %s', req.method, req.url);
    req.pipe(proxyClient);
  }
}

module.exports = BaseHandler;
