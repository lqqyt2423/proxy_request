import * as http from 'http';
import * as https from 'https';
import * as tls from 'tls';
import * as path from 'path';
import { CA } from '../ca';
import { Logger } from '../logger';
import { EventEmitter } from 'events';

// 思路
// 1. 本地启动一个 https server 用于模拟远端的域名
// 2. 客户端测试前通过修改 /etc/hosts 将 host 关联的 ip 都变成本地
// 3. 客户端发请求时忽略证书校验步骤 或 将此测试服务器的根证书加入信任列表

const logger = new Logger('FwProxy server-for-test');

export const logHandler: http.RequestListener = (req, res) => {
    logger.info('%s %s %s %s', req.socket.localPort, req.method, req.url, 200);
    res.end();
};

export const echoHandler: http.RequestListener = (req, res) => {
    req.pipe(res);
};

export declare interface TestServer {
    on(event: 'ready', listener: () => void): this;
    on(event: 'close', listener: (err?: Error) => void): this;
    on(event: string | symbol, listener: (...args: any[]) => void): this;

    emit(event: 'ready'): boolean;
    emit(event: 'close', err?: Error): boolean;
    emit(event: string | symbol, ...args: any[]): boolean;
}

export class TestServer extends EventEmitter {
    private logger: Logger;
    private handler: http.RequestListener;
    private server: http.Server;
    private secureServer: https.Server;
    private port: number;
    private securePort: number;

    constructor(port: number, securePort: number, handler?: http.RequestListener) {
        super();

        this.logger = new Logger('FwProxy TestServer');
        this.handler = handler || echoHandler;
        this.port = port;
        this.securePort = securePort;

        const ca = new CA(path.join(__dirname, '.fwproxy-server-for-test'));
        ca.init();

        this.server = http.createServer(this.handler);
        this.secureServer = https.createServer({
            SNICallback: async (servername, callback) => {
                try {
                    const { pem, privateKey } = await ca.getServer(servername);
                    const ctx = tls.createSecureContext({ key: privateKey, cert: pem });
                    callback(null, ctx);
                } catch (err) {
                    this.logger.warn('SNICallback error: %s', err.message);
                    callback(err, null);
                }
            },
        }, this.handler);
    }

    start() {
        let count = 0;
        const done = () => {
            if (++count === 2) this.emit('ready');
        };

        this.server.listen(this.port, done);
        this.secureServer.listen(this.securePort, done);
    }

    close() {
        let count = 0;
        let resErr: Error;
        const done = (err?: Error) => {
            if (err) resErr = err;
            if (++count === 2) this.emit('close', resErr);
        };

        this.server.close(done);
        this.secureServer.close(done);
    }
}

if (process.argv[1] === __filename) {
    const echoServer = new TestServer(20080, 20443);
    echoServer.on('ready', () => {
        logger.info('echoServer ready');
    });
    echoServer.start();
}
