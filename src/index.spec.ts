// 模拟通过环境变量传入
// 代理可以信任目标服务器根证书
import * as path from 'path';
const testServerCaPath = path.join(__dirname, './tools/.fwproxy-server-for-test/root.pem');
process.env['FW_PROXY_EXTRA_CA_CERTS'] = testServerCaPath;

import * as fs from 'fs';
import * as http from 'http';
import * as https from 'https';
import * as tls from 'tls';
import { describe } from 'mocha';
import { Logger } from './logger';
import * as assert from 'assert';
import { SSLTunnelAgent } from './agent';
import { FwProxy } from '.';
import { echoHandler, TestServer } from './tools/server-for-test';
import { Viewer } from './viewer';
import { Interpolator, IRequest, IResponse, SimpleInterpolator } from './interpolator';
import { bufferStream } from './record';

const logger = new Logger('index.spec.ts');

const port = 20080;
const securePort = 20443;
let echoServer: TestServer;

const proxyPort = 7888;
let fwproxy: FwProxy;
const viewer: Viewer = {
    name: 'test viewer',
    view(record) {
        //
    }
};

// 相当于信任生成的根证书
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
        echoServer = new TestServer(port, securePort, echoHandler);
        echoServer.on('ready', tryDone);
        echoServer.start();

        // 启动代理服务
        fwproxy = new FwProxy({ interceptHttps: true, verbose: true });
        fwproxy.addViewer(viewer);
        fwproxy.addInterpolator(new SimpleInterpolator());
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

    it('观察者 viewer 可以正常使用', done => {
        viewer.view = async record => {
            const resp = await record.snapshot();
            assert.strictEqual(resp.info.method, 'POST');
            assert.strictEqual(resp.info.url, `https://localhost:${securePort}/`);
            assert.strictEqual(resp.info.statusCode, 200);
            assert.strictEqual(Buffer.concat(resp.resBodyBufs).toString(), 'hello world');
            done();
            viewer.view = () => { /** */ };
        };

        const req = http.request({
            host: 'localhost',
            port: securePort,
            method: 'POST',
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
                res.resume();
            });

        req.end('hello world');
    });

    it('可自由添加或删除修改者', (done) => {
        const testInterpolator: Interpolator = {
            name: 'testInterpolator',
        };
        const len = (fwproxy.modifyHandler as any).interps.length;
        fwproxy.addInterpolator(testInterpolator);
        assert.strictEqual((fwproxy.modifyHandler as any).interps.length, len + 1);
        assert(fwproxy.removeInterpolator(testInterpolator));
        assert((fwproxy.modifyHandler as any).interps.length, len);

        done();
    });

    it('修改者可修改流量', done => {
        const interp: Interpolator = {
            name: '修改者可修改流量',
            async changeRequest(req) {
                const changedReq: IRequest = req;
                changedReq.body = 'hi world';
                changedReq.headers['content-length'] = '8';
                return changedReq;
            }
        };
        fwproxy.addInterpolator(interp);

        const req = http.request({
            host: 'localhost',
            port: securePort,
            method: 'POST',
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
                // 添加了头部
                assert.strictEqual(res.headers['proxy-server'], 'fwproxy');
                bufferStream(res).then(bufs => {
                    assert.strictEqual(Buffer.concat(bufs).toString(), 'hi world');
                    fwproxy.removeInterpolator(interp);
                    done();
                });
            });

        req.end('hello world');
    });

    it('修改者可修改流量2', done => {
        const interp: Interpolator = {
            name: '修改者可修改流量2',
            async changeResponse(req, res) {
                const changedRes: IResponse = res;
                changedRes.body = 'hi world';
                return res;
            },
        };
        fwproxy.addInterpolator(interp);

        const req = http.request({
            host: 'localhost',
            port: securePort,
            method: 'POST',
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
                // 添加了头部
                assert.strictEqual(res.headers['proxy-server'], 'fwproxy');
                bufferStream(res).then(bufs => {
                    assert.strictEqual(Buffer.concat(bufs).toString(), 'hi world');
                    fwproxy.removeInterpolator(interp);
                    done();
                });
            });

        req.end('hello world');
    });

    it('修改者修改后的流量观察者可看到', done => {
        viewer.view = async record => {
            const resp = await record.snapshot();
            assert.strictEqual(resp.info.method, 'POST');
            assert.strictEqual(resp.info.url, `https://localhost:${securePort}/`);
            assert.strictEqual(resp.info.statusCode, 200);
            assert.strictEqual(resp.info.resHeaders['proxy-server'], 'fwproxy');
            assert.strictEqual(Buffer.concat(resp.resBodyBufs).toString(), 'hi world');
            done();
            viewer.view = () => { /** */ };
        };

        const interp: Interpolator = {
            name: '修改者修改后的流量观察者可看到',
            async changeResponse(req, res) {
                const changedRes: IResponse = res;
                changedRes.body = 'hi world';
                return res;
            },
        };
        fwproxy.addInterpolator(interp);

        const req = http.request({
            host: 'localhost',
            port: securePort,
            method: 'POST',
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
                // 添加了头部
                assert.strictEqual(res.headers['proxy-server'], 'fwproxy');
                bufferStream(res).then(bufs => {
                    assert.strictEqual(Buffer.concat(bufs).toString(), 'hi world');
                    fwproxy.removeInterpolator(interp);
                });
            });

        req.end('hello world');
    });
});
