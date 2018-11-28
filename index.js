'use strict';

const http = require('http');
const net = require('net');
const requestHandler = require('./requestHandler');
const mitmServer = require('./mitm-server');

const server = http.createServer();

// http 代理
server.on('request', requestHandler);

// ssl隧道
server.on('connect', (req, socket, head) => {
  const path = req.url;

  // 直接连接服务器
  // const { port, hostname } = url.parse('http://' + path);
  // const proxyClient = net.createConnection(port, hostname);

  // man in the middle
  const proxyClient = net.createConnection(8889, 'localhost');

  proxyClient.setTimeout(20000);

  proxyClient.on('connect', () => {
    // 代理客户端socket连接建立后
    // console.log('SSL proxyClient connect', path);

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
    // console.log('proxyClient timeout', path);
    // 需要用 destroy，因为有可能还未触发 connect 事件
    proxyClient.destroy();
    socket.end();
  });

  proxyClient.on('error', err => {
    console.log('SSL CONNECT Error:', path, err.message);
    socket.end();
  });

  // proxyClient.on('close', hadErr => {
  //   console.log('proxyClient close', path, 'hadError:', hadErr);
  // });
});

server.listen(8888);
mitmServer.listen(8889);
