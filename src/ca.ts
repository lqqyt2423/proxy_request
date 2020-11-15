// 参考
// https://github.com/digitalbazaar/forge
// https://github.com/joeferner/node-http-mitm-proxy/blob/master/lib/ca.js
// https://github.com/ottomao/node-easy-cert/blob/master/src/certGenerator.js

import * as path from 'path';
import * as mkdirp from 'mkdirp';
import * as forge from 'node-forge';
import { promisify } from 'util';
import * as fs from 'fs';
import * as LRU from 'lru-cache';
import { Logger } from './logger';
import { once } from './once';

const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);
const pki = forge.pki;
const logger = new Logger('FwProxy CA');

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

interface IServerCert {
    pem: string | Buffer;
    privateKey: string | Buffer;
}

export class CA {

    private folder: string;
    private rootCAFileName: string;
    private serverCache: LRU<string, IServerCert>;

    private rootCA: forge.pki.Certificate;
    private rootPublicKey: forge.pki.rsa.PublicKey;
    private rootPrivateKey: forge.pki.rsa.PrivateKey;

    public rootCAPemPathname: string;

    // folder: 传入保存证书的文件夹，如果是相对地址，则相对于 process.cwd()，默认为 $HOME/.fwproxy/
    constructor(folder?: string) {
        if (!folder) folder = path.join(process.env.HOME, '.fwproxy');
        if (!path.isAbsolute(folder)) folder = path.join(process.cwd(), folder);
        mkdirp.sync(folder);

        this.folder = folder;
        this.rootCAFileName = 'root';
        this.rootCAPemPathname = path.join(this.folder, this.rootCAFileName + '.pem');
        this.serverCache = new LRU(100);
    }

    public async init() {
        return await this.getRoot()
            .then(resp => {
                if (resp.generate) {
                    logger.show('已生成根证书，请手动信任: %s', resp.pemFilename);
                }

                return resp;
            })
            .catch(e => {
                logger.error('获取根证书错误: ');
                logger.error(e);
                process.exit(1);
            });
    }

    // generate random 16 bytes hex string
    public randomSerialNumber() {
        let sn = '';
        for (let i = 0; i < 4; i++) {
            sn += ('00000000' + Math.floor(Math.random() * Math.pow(256, 4)).toString(16)).slice(-8);
        }
        return sn;
    }

    public async generateKeyPair(): Promise<forge.pki.rsa.KeyPair> {
        return await new Promise((resolve, reject) => {
            pki.rsa.generateKeyPair({ bits: 2048 }, (err, keypair) => {
                if (err) return reject(err);
                resolve(keypair);
            });
        });
    }

    // 生成根证书，自签名
    // 生成的证书需要系统信任
    public async generateRoot() {
        const keypair = await this.generateKeyPair();
        const cert = pki.createCertificate();
        cert.publicKey = keypair.publicKey;
        cert.serialNumber = this.randomSerialNumber();
        cert.validity.notBefore = new Date();
        cert.validity.notBefore.setDate(cert.validity.notBefore.getDate() - 1);
        cert.validity.notAfter = new Date();
        cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 10);
        cert.setSubject(CAattrs);
        cert.setIssuer(CAattrs);
        cert.setExtensions(CAextensions);
        cert.sign(keypair.privateKey, forge.md.sha256.create());

        return {
            ca: cert,
            publicKey: keypair.publicKey,
            privateKey: keypair.privateKey,
        };
    }

    // 获取根证书
    public async getRoot() {
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
            const [caStr, publicKeyStr, privateKeyStr] = await Promise.all([
                readFile(pemFilename, 'utf8'),
                readFile(publicKeyFilename, 'utf8'),
                readFile(privateKeyFilename, 'utf8')
            ]);
            const ca = pki.certificateFromPem(caStr);
            const publicKey = pki.publicKeyFromPem(publicKeyStr);
            const privateKey = pki.privateKeyFromPem(privateKeyStr);
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
    public async generateServer(hostname: string) {
        const keypair = await this.generateKeyPair();
        const cert = pki.createCertificate();
        cert.publicKey = keypair.publicKey;
        cert.serialNumber = this.randomSerialNumber();
        cert.validity.notBefore = new Date();
        cert.validity.notBefore.setDate(cert.validity.notBefore.getDate() - 1);
        cert.validity.notAfter = new Date();
        cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 2);
        const attrsServer = ServerAttrs.slice();
        attrsServer.unshift({ name: 'commonName', value: hostname });
        cert.setSubject(attrsServer);
        cert.setIssuer(this.rootCA.issuer.attributes);
        cert.setExtensions((ServerExtensions as any).concat({
            name: 'subjectAltName',
            altNames: [hostname].map(host => {
                if (/^[\d.]+$/.test(host)) {
                    return { type: 7, ip: host };
                }
                return { type: 2, value: host };
            })
        }));
        cert.sign(this.rootPrivateKey, forge.md.sha256.create());

        return {
            name: hostname,
            ca: cert,
            pem: pki.certificateToPem(cert),
            publicKey: pki.publicKeyToPem(keypair.publicKey),
            privateKey: pki.privateKeyToPem(keypair.privateKey),
        };
    }

    // 获取服务器证书
    public async getServer(hostname: string): Promise<IServerCert> {
        // 先从缓存中获取
        let res = this.serverCache.get(hostname);
        if (res) return res;

        res = await once.run(`load_server_${hostname}`, async () => {
            return await this.loadServer(hostname);
        });

        this.serverCache.set(hostname, res);
        return res;
    }

    // 尝试从本地获取服务端证书或第一次生成
    private async loadServer(hostname: string): Promise<IServerCert> {
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
        const res: IServerCert = { pem, privateKey };
        logger.debug('server %s ca generated', hostname);
        return res;
    }
}

export const ca = new CA();
