'use strict';

const http = require('http');
const https = require('https');
const net = require('net');
const url = require('url');

const rp = {
  http,
  https,
};

const server = http.createServer();

server.on('request', (req, res) => {
  const method = req.method;
  const headers = req.headers;
  const path = req.url;
  const startTime = Date.now();

  // logger then res.end
  const end = (body = '') => {
    console.log(`${method} ${path} ${res.statusCode} ${Date.now() - startTime} ms - ${Buffer.byteLength(body)}`);
    res.end(body);
  };

  // 因为是代理服务器，所以需要接收完整URI
  // 如不是，直接报错
  if (!/^http/.test(path)) {
    res.statusCode = 404;
    end('404\n');
    return;
  }

  // console.log('method', method);
  // console.log('headers', headers);
  // console.log('path', path);
  // console.log('status', res.statusCode);
  // console.log('url', url.parse(path));

  const {
    protocol = 'http:',
    hostname,
    port = 80,
  } = url.parse(path);

  // 重写headers的host属性
  headers.host = hostname;

  // 代理发出的客户端请求
  // 防止接收到https请求，也做了处理
  const proxyClient = rp[protocol.slice(0, -1)].request({
    protocol,
    hostname,
    port,
    method,
    headers,
  }, (proxyRes) => {
    const statusCode = proxyRes.statusCode;
    const headers = proxyRes.headers;

    // console.log('statusCode', statusCode);
    // console.log('headers', headers);

    res.writeHead(statusCode, headers);

    let body = [];
    proxyRes.on('data', (chunk) => {
      body.push(chunk);
    });
    proxyRes.on('end', () => {
      body = Buffer.concat(body);
      end(body);
    });
  });

  // timeout 10s handler
  proxyClient.setTimeout(10000, () => {
    res.statusCode = 500;
    end('500 timeout\n');
  });

  // error handler
  proxyClient.on('error', (e) => {
    res.statusCode = 500;
    end(`500 error\n${e.message}\n`);
  });

  // 传输数据，发出请求
  req.pipe(proxyClient);
});


// ssl隧道
server.on('connect', (req, socket, head) => {
  const path = req.url;
  // console.log('path', path);

  const { port, hostname } = url.parse('http://' + path);

  const proxyClient = net.createConnection(port, hostname, () => {
    // 代理客户端socket连接建立后
    console.log('ssl proxyClient connect', path);

    socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');

    // 交换数据
    proxyClient.write(head);
    proxyClient.pipe(socket);
    socket.pipe(proxyClient);
  });
});

server.listen(8888);
