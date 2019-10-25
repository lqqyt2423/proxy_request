'use strict';

// 参考
// https://github.com/digitalbazaar/forge
// https://github.com/joeferner/node-http-mitm-proxy/blob/master/lib/ca.js
// https://github.com/ottomao/node-easy-cert/blob/master/src/certGenerator.js

const path = require('path');
const mkdirp = require('mkdirp');

class CA {

  // folder: 传入保存证书的文件夹，如果是相对地址，则相对于 process.cwd()，默认为 $HOME/.proxy_request/
  constructor(folder) {
    if (!folder) folder = path.join(process.env.HOME, '.proxy_request');
    if (!path.isAbsolute(folder)) folder = path.join(process.cwd(), folder);
    mkdirp.sync(folder);

    this.folder = folder;
    this.rootCAName = 'root';
  }

  randomSerialNumber() {
    // generate random 16 bytes hex string
    let sn = '';
    for (var i = 0; i < 4; i++) {
      sn += ('00000000' + Math.floor(Math.random() * Math.pow(256, 4)).toString(16)).slice(-8);
    }
    return sn;
  }

  // 生成根证书，自签名
  generateRoot() {}

  // 生成服务器证书，用根证书签名
  generateServer(hosts) {}
}

module.exports = CA;
