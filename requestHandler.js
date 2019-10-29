'use strict';

const http = require('http');
const https = require('https');
const url = require('url');
const logger = require('./logger');
// const zlib = require('zlib');

const rp = {
  http,
  https,
};

function requestHandler(req, res) {
  const startTime = Date.now();

  const method = req.method;
  const headers = req.headers;

  // support https
  const host = req.headers.host;
  const protocol = (!!req.connection.encrypted && !(/^http:/).test(req.url)) ? 'https:' : 'http:';
  // const path = req.url;
  const path = protocol === 'http:' ? req.url : ('https://' + host + req.url);

  // logger then res.end
  const end = (body = '') => {
    logger.info(`${method} ${path} ${res.statusCode} ${Date.now() - startTime} ms - ${Buffer.byteLength(body)}`);

    // gunzip => bufferToString
    // TODO: 支持压缩
    // if (path === 'https://www.v2ex.com/?tab=hot') {
    //   console.log(String(zlib.gunzipSync(body)));
    // }

    res.end(body);
  };

  // 因为是代理服务器，所以需要接收完整URI
  // 如不是，直接报错
  if (!/^http/.test(path)) {
    res.statusCode = 404;
    end('404');
    return;
  }

  const urlObj = url.parse(path);
  // hostname 与 host 是有区别的
  // host === hostname:port
  const hostname = urlObj.hostname;
  const defaultPort = protocol === 'http:' ? 80 : 443;
  const port = urlObj.port || defaultPort;

  // 重写headers的host属性
  // headers.host = hostname;

  // 代理发出的客户端请求
  // also support https
  const proxyClient = rp[protocol.slice(0, -1)].request({
    protocol,
    hostname,
    port,
    method,
    path: urlObj.path,
    headers,
    timeout: 30000,
  }, (proxyRes) => {
    const statusCode = proxyRes.statusCode;
    const headers = proxyRes.headers;

    res.writeHead(statusCode, headers);

    let body = [];
    proxyRes.on('data', (chunk) => {
      body.push(chunk);
    });
    proxyRes.on('end', () => {
      body = Buffer.concat(body);
      end(body);
    });
    proxyRes.on('error', (e) => {
      logger.warn('proxyRes error: %s', e.message);
      logger.error(e);
      if (!res.finished) {
        end(`500 error ${e.message}`);
      }
    });
  });

  // timeout handler
  proxyClient.on('timeout', () => {
    // 主动终止连接
    // 如果此时还未连接成功，会触发 error 事件
    // error with an error with message Error: socket hang up and code ECONNRESET
    // 如果已经连接成功，则还是会触发 proxyRes 的 end 事件
    logger.warn('request timeout path: %s', path);
    proxyClient.abort();
  });

  // error handler
  proxyClient.on('error', (e) => {
    res.statusCode = 500;
    logger.warn('proxyClient error: %s', e.message);

    if (e.message === 'socket hang up') {
      end('500 error timeout');
      return;
    }

    logger.error(e);
    end(`500 error ${e.message}`);
  });

  // 传输数据，发出请求
  req.pipe(proxyClient);
}

module.exports = requestHandler;
