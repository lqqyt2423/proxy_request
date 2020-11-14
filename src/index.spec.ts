import * as http from 'http';
import * as https from 'https';
import { describe } from 'mocha';
import { Logger } from './logger';
import * as assert from 'assert';

const logger = new Logger('index.spec.ts');

describe('index.spec.ts', () => {
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

    // BUG
    it.skip('应成功代理 HTTPS 请求', (done) => {
        const req = http.request({
            host: '127.0.0.1',
            port: 7888,
            method: 'CONNECT',
            path: 'www.baidu.com:443'
        });

        req.on('connect', (res, socket, head) => {
            socket.unref();
            if (res.statusCode === 200) {
                https.get({
                    host: 'www.baidu.com',
                    createConnection: () => socket,
                    agent: false,
                    path: '/'
                }, (resp) => {
                    assert.strictEqual(resp.statusCode, 200);
                    // resp.resume();
                    resp.on('data', data => {
                        console.log(String(data));
                    });
                    resp.on('end', () => {
                        // socket.end();
                        done();
                    });
                });
            }
        });

        req.end();
    });
});

