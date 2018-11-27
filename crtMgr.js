'use strict';

// 参考 AnyProxy 中 certMgr.js
// 使用现成的库管理 TLS 相关证书生成、认证等逻辑
const EasyCert = require('node-easy-cert');
const { getPath } = require('./utils');

const options = {
  rootDirPath: getPath('certificates'),
  defaultCertAttrs: [
    { name: 'countryName', value: 'CN' },
    { name: 'organizationName', value: 'ProxyRequest' },
    { shortName: 'ST', value: 'SH' },
    { shortName: 'OU', value: 'ProxyRequest SSL Proxy' }
  ]
};

const easyCert = new EasyCert(options);

// 引用
const generateRootCA = easyCert.generateRootCA;
const crtMgr = easyCert;
// const crtMgr = util.merge({}, easyCert);

// rename function
crtMgr.ifRootCAFileExists = easyCert.isRootCAFileExists;

// 需要先调用此方法生成根证书
// 然后要信任此证书
// TODO: cli command
crtMgr.generateRootCA = function(cb) {
  doGenerate(false);

  // set default common name of the cert
  function doGenerate(overwrite) {
    const rootOptions = {
      commonName: 'ProxyRequest',
      overwrite: !!overwrite
    };

    generateRootCA(rootOptions, (error, keyPath, crtPath) => {
      if (typeof cb === 'function') cb(error, keyPath, crtPath);
    });
  }
};

crtMgr.getCAStatus = async function() {
  const result = { exist: false };
  const ifExist = easyCert.isRootCAFileExists();
  if (!ifExist) return result;
  result.exist = true;
  if (!/^win/.test(process.platform)) {
    await new Promise(resolve => {
      easyCert.ifRootCATrusted((err, trusted) => {
        if (!err) result.trusted = trusted;
        resolve();
      });
    });
  }
  return result;
};

module.exports = crtMgr;
