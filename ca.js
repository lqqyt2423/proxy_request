'use strict';

// 参考
// https://github.com/digitalbazaar/forge
// https://github.com/joeferner/node-http-mitm-proxy/blob/master/lib/ca.js
// https://github.com/ottomao/node-easy-cert/blob/master/src/certGenerator.js

const path = require('path');
const mkdirp = require('mkdirp');
const forge = require('node-forge');
const pki = forge.pki;
const { promisify } = require('util');
const fs = require('fs');
const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);
const LRU = require('lru-cache');
const Logger = require('./logger');
const once = require('./once');

const logger = new Logger(__filename);

const CAattrs = [
  {
    name: 'commonName',
    value: 'fwproxy'
  },
  {
    name: 'organizationName',
    value: 'fwproxy'
  },
];

const CAextensions = [
  {
    name: 'basicConstraints',
    cA: true
  },
  {
    name: 'keyUsage',
    keyCertSign: true,
    digitalSignature: true,
    nonRepudiation: true,
    keyEncipherment: true,
    dataEncipherment: true
  },
  {
    name: 'extKeyUsage',
    serverAuth: true,
    clientAuth: true,
    codeSigning: true,
    emailProtection: true,
    timeStamping: true
  },
  {
    name: 'nsCertType',
    client: true,
    server: true,
    email: true,
    objsign: true,
    sslCA: true,
    emailCA: true,
    objCA: true
  },
  {
    name: 'subjectKeyIdentifier'
  }
];

const ServerAttrs = [
  {
    name: 'organizationName',
    value: 'fwproxy'
  },
];

const ServerExtensions = [
  {
    name: 'basicConstraints',
    cA: false
  },
  {
    name: 'keyUsage',
    keyCertSign: false,
    digitalSignature: true,
    nonRepudiation: false,
    keyEncipherment: true,
    dataEncipherment: true
  },
  {
    name: 'extKeyUsage',
    serverAuth: true,
    clientAuth: true,
    codeSigning: false,
    emailProtection: false,
    timeStamping: false
  },
  {
    name: 'nsCertType',
    client: true,
    server: true,
    email: false,
    objsign: false,
    sslCA: false,
    emailCA: false,
    objCA: false
  },
  {
    name: 'subjectKeyIdentifier'
  }
];


class CA {

  // folder: 传入保存证书的文件夹，如果是相对地址，则相对于 process.cwd()，默认为 $HOME/.fwproxy/
  constructor(folder) {
    if (!folder) folder = path.join(process.env.HOME, '.fwproxy');
    if (!path.isAbsolute(folder)) folder = path.join(process.cwd(), folder);
    mkdirp.sync(folder);

    this.folder = folder;
    this.rootCAFileName = 'root';
    this.serverCache = new LRU(50);
  }

  async init() {
    return await this.getRoot()
      .then(resp => {
        if (resp.generate) {
          logger.info('已生成根证书，请手动信任: %s', resp.pemFilename);
        }

        return resp;
      })
      .catch(e => {
        logger.warn('获取根证书错误: ');
        logger.error(e);
        process.exit(1);
      });
  }

  randomSerialNumber() {
    // generate random 16 bytes hex string
    let sn = '';
    for (var i = 0; i < 4; i++) {
      sn += ('00000000' + Math.floor(Math.random() * Math.pow(256, 4)).toString(16)).slice(-8);
    }
    return sn;
  }

  async generateKeyPair() {
    return await new Promise((resolve, reject) => {
      pki.rsa.generateKeyPair(2048, (err, keys) => {
        if (err) return reject(err);
        resolve(keys);
      });
    });
  }

  // 生成根证书，自签名
  // 生成的证书需要系统信任
  async generateRoot() {
    const keys = await this.generateKeyPair();
    const cert = pki.createCertificate();
    cert.publicKey = keys.publicKey;
    cert.serialNumber = this.randomSerialNumber();
    cert.validity.notBefore = new Date();
    cert.validity.notBefore.setDate(cert.validity.notBefore.getDate() - 1);
    cert.validity.notAfter = new Date();
    cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 10);
    cert.setSubject(CAattrs);
    cert.setIssuer(CAattrs);
    cert.setExtensions(CAextensions);
    cert.sign(keys.privateKey, forge.md.sha256.create());

    return {
      ca: cert,
      publicKey: keys.publicKey,
      privateKey: keys.privateKey,
    };
  }

  // 获取根证书
  async getRoot() {
    const pemFilename = path.join(this.folder, this.rootCAFileName + '.pem');
    const publicKeyFilename = path.join(this.folder, this.rootCAFileName + '.public.key');
    const privateKeyFilename = path.join(this.folder, this.rootCAFileName + '.private.key');

    if (this.rootCA) {
      return {
        ca: this.rootCA,
        publicKey: this.rootPublicKey,
        privateKey: this.rootPrivateKey,

        generate: false, // 是否是刚生成
        pemFilename,
        publicKeyFilename,
        privateKeyFilename,
      };
    }

    // 根证书已经保存在本地
    try {
      let [ca, publicKey, privateKey] = await Promise.all([
        readFile(pemFilename),
        readFile(publicKeyFilename),
        readFile(privateKeyFilename)
      ]);
      ca = pki.certificateFromPem(ca);
      publicKey = pki.publicKeyFromPem(publicKey);
      privateKey = pki.privateKeyFromPem(privateKey);
      this.rootCA = ca;
      this.rootPublicKey = publicKey;
      this.rootPrivateKey = privateKey;
      return { ca, publicKey, privateKey, generate: false, pemFilename, publicKeyFilename, privateKeyFilename };
    } catch (e) {
      // do nothing
    }

    // 第一次生成根证书
    const { ca, publicKey, privateKey } = await this.generateRoot();
    this.rootCA = ca;
    this.rootPublicKey = publicKey;
    this.rootPrivateKey = privateKey;
    await Promise.all([
      writeFile(pemFilename, pki.certificateToPem(ca)),
      writeFile(publicKeyFilename, pki.publicKeyToPem(publicKey)),
      writeFile(privateKeyFilename, pki.privateKeyToPem(privateKey)),
    ]);
    return { ca, publicKey, privateKey, generate: true, pemFilename, publicKeyFilename, privateKeyFilename };
  }

  // 生成服务器证书，用根证书签名
  async generateServer(hosts) {
    if (typeof hosts === 'string') hosts = [hosts];
    const mainHost = hosts[0];
    const keys = await this.generateKeyPair();
    const cert = pki.createCertificate();
    cert.publicKey = keys.publicKey;
    cert.serialNumber = this.randomSerialNumber();
    cert.validity.notBefore = new Date();
    cert.validity.notBefore.setDate(cert.validity.notBefore.getDate() - 1);
    cert.validity.notAfter = new Date();
    cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 2);
    const attrsServer = ServerAttrs.slice();
    attrsServer.unshift({ name: 'commonName', value: mainHost });
    cert.setSubject(attrsServer);
    cert.setIssuer(this.rootCA.issuer.attributes);
    cert.setExtensions(ServerExtensions.concat({
      name: 'subjectAltName',
      altNames: hosts.map(host => {
        if (/^[\d.]+$/.test(host)) {
          return { type: 7, ip: host };
        }
        return { type: 2, value: host };
      })
    }));
    cert.sign(this.rootPrivateKey, forge.md.sha256.create());

    return {
      name: mainHost,
      ca: cert,
      pem: pki.certificateToPem(cert),
      publicKey: pki.publicKeyToPem(keys.publicKey),
      privateKey: pki.privateKeyToPem(keys.privateKey),
    };
  }

  // 获取服务器证书
  async getServer(hostname) {
    // 先从缓存中获取
    let res = this.serverCache.get(hostname);
    if (res) return res;

    res = await once.run('load_server', async () => {
      return await this.loadServer(hostname);
    });

    return res;
  }

  // 尝试从本地获取服务端证书或第一次生成
  async loadServer(hostname) {
    // 从本地文件获取
    try {
      const [pem, privateKey] = await Promise.all([
        readFile(path.join(this.folder, hostname + '.pem')),
        readFile(path.join(this.folder, hostname + '.key')),
      ]);
      logger.debug('server %s ca loaded', hostname);
      return { pem, privateKey };
    } catch (e) {
      // do nothing
    }

    // 第一次生成
    const { pem, privateKey } = await this.generateServer(hostname);
    await Promise.all([
      writeFile(path.join(this.folder, hostname + '.pem'), pem),
      writeFile(path.join(this.folder, hostname + '.key'), privateKey),
    ]);
    const res = { pem, privateKey };
    this.serverCache.set(hostname, res);
    logger.debug('server %s ca generated', hostname);
    return res;
  }
}

module.exports = new CA();
