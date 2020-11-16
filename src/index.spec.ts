// 目前需要启动代理服务器后才能跑此测试

import * as fs from 'fs';
import * as http from 'http';
import * as https from 'https';
import * as tls from 'tls';
import { describe } from 'mocha';
import { Logger } from './logger';
import * as assert from 'assert';
import { ca } from './ca';
import { SSLTunnelAgent } from './agent';

const logger = new Logger('index.spec.ts');

// 相当于信任生成的根证书
const rootCertificates: Array<string|Buffer> = tls.rootCertificates.slice();
rootCertificates.push(fs.readFileSync(ca.rootCAPemPathname));

const sslTunnelAgent = new SSLTunnelAgent({
    proxyHost: '127.0.0.1',
    proxyPort: 7888,
    tlsOptions: {
        ca: rootCertificates,
    },
});

describe('index.spec.ts', () => {
    it('正常请求', (done) => {
        https.get({
            host: 'www.baidu.com',
            path: '/',
            ca: rootCertificates,
        })
            .on('response', (res) => {
                assert.strictEqual(res.statusCode, 200);
                res.resume()
                    .on('end', done);
            });
    });

    it('应成功代理 HTTP 请求', (done) => {
        http.get({
            host: '127.0.0.1',
            port: 7888,
            method: 'GET',
            path: 'http://www.baidu.com/',
            headers: {
                Host: 'www.baidu.com'
            }
        })
            .on('response', res => {
                assert.strictEqual(res.statusCode, 200);
                res.resume()
                    .on('end', done);
            });
    });

    it('应成功代理 HTTPS 请求', (done) => {
        const req = http.request({
            host: 'www.baidu.com',
            port: '443',
            method: 'GET',
            path: '/',
            headers: {
                Host: 'www.baidu.com'
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
