// 目前需要启动代理服务器后才能跑此测试

import * as fs from 'fs';
import * as http from 'http';
import * as https from 'https';
import * as tls from 'tls';
import * as path from 'path';
import { describe } from 'mocha';
import { Logger } from './logger';
import * as assert from 'assert';
import { SSLTunnelAgent } from './agent';
import { FwProxy } from '.';
import { TestServer } from './tools/server-for-test';

const logger = new Logger('index.spec.ts');

const port = 20080;
const securePort = 20443;
let echoServer: TestServer;

const proxyPort = 7888;
let fwproxy: FwProxy;

// 相当于信任生成的根证书
const testServerCaPath = path.join(__dirname, './tools/.fwproxy-server-for-test/root.pem');
const testServerCa: Array<string|Buffer> = tls.rootCertificates.slice();
testServerCa.push(fs.readFileSync(testServerCaPath));

const proxyCaPath = path.join(process.env.HOME, '.fwproxy', 'root.pem');
const proxyCa: Array<string|Buffer> = tls.rootCertificates.slice();
proxyCa.push(fs.readFileSync(proxyCaPath));

const sslTunnelAgent = new SSLTunnelAgent({
    proxyHost: '127.0.0.1',
    proxyPort: 7888,
    tlsOptions: {
        ca: proxyCa,
    },
});

describe('index.spec.ts', () => {

    before(done => {
        let count = 0;
        const tryDone = () => {
            if (++count === 2) done();
        };

        // 启动目标服务器
        echoServer = new TestServer(port, securePort);
        echoServer.on('ready', tryDone);
        echoServer.start();

        // 启动代理服务
        fwproxy = new FwProxy({ interceptHttps: true, verbose: true });
        fwproxy.on('ready', tryDone);
        fwproxy.start();
    });

    after(done => {
        let count = 0;
        const tryDone = () => {
            if (++count === 2) done();
        };

        echoServer.on('close', tryDone);
        echoServer.close();
        fwproxy.on('close', tryDone);
        fwproxy.close();
    });

    it('正常 HTTP 请求', (done) => {
        http.get({
            host: 'localhost',
            path: '/',
            port,
        })
            .on('response', (res) => {
                assert.strictEqual(res.statusCode, 200);
                res.resume()
                    .on('end', done);
            })
            .on('error', err => {
                done(err);
            });
    });

    it('正常 HTTPS 请求', (done) => {
        https.get({
            host: 'localhost',
            path: '/',
            port: securePort,
            ca: testServerCa,
        })
            .on('response', (res) => {
                assert.strictEqual(res.statusCode, 200);
                res.resume()
                    .on('end', done);
            })
            .on('error', err => {
                done(err);
            });
    });

    it('代理 HTTP 请求', (done) => {
        http.get({
            host: '127.0.0.1',
            port: proxyPort,
            method: 'GET',
            path: `http://localhost:${port}/`,
            headers: {
                Host: 'localhost'
            }
        })
            .on('response', res => {
                assert.strictEqual(res.statusCode, 200);
                res.resume()
                    .on('end', done);
            });
    });

    it('代理 HTTPS 请求', (done) => {
        const req = http.request({
            host: 'localhost',
            port: securePort,
            method: 'GET',
            path: `https://localhost:${securePort}/`,
            headers: {
                Host: 'localhost'
            },

            agent: sslTunnelAgent,
        })
            .on('error', err => {
                done(err);
            })
            .on('response', res => {
                assert.strictEqual(res.statusCode, 200);
                res.resume()
                    .on('end', done);
            });

        req.end();
    });
});
