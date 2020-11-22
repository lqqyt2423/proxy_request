import * as net from 'net';
import * as http from 'http';
import * as https from 'https';
import * as tls from 'tls';
import * as url from 'url';
import { Logger } from './logger';
import { ca } from './ca';
import { RequestHandler } from './handler';
import { FwProxy } from '.';
import { createPipes } from './tools/pipes';

export interface ICodeError extends Error {
    code: string;
}

export const errInfo = (err: ICodeError) => {
    return `[message: ${err.message}, code: ${err.code}]`;
};

export class HttpServer {
    private logger: Logger;
    private server: http.Server;
    private port: number;
    private fwproxy: FwProxy;

    private connectSockets: Set<net.Socket>;

    constructor(port: number, requestHandler: RequestHandler, fwproxy: FwProxy) {
        this.logger = new Logger('FwProxy HttpServer');
        this.port = port;
        this.fwproxy = fwproxy;
        this.server = http.createServer();
        this.connectSockets = new Set<net.Socket>();

        this.server.on('clientError', (err: ICodeError, socket: net.Socket) => {
            if (err.code === 'ECONNRESET' || !socket.writable) {
                return;
            }
            this.logger.warn('clientError: %s', errInfo(err));
            socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
        });

        this.server.on('error', (err: ICodeError) => {
            if (err.code === 'EADDRINUSE') {
                this.logger.error('中间人服务器启动失败，%s 端口被占用', this.port);
                process.exit(1);
            }
            this.logger.error(errInfo(err));
        });

        this.server.on('request', requestHandler.register('http'));
        this.handleHttps();
    }

    public async start() {
        await new Promise(resolve => {
            this.server.listen(this.port, () => {
                this.logger.info('server listen at: %s', this.port);
                resolve();
            });
        });
    }

    public close(done: (err?: Error) => void) {
        for (const socket of this.connectSockets) {
            socket.destroy();
        }
        this.server.close(done);
    }

    // 直接 ssl tunnel 转发 https 流量
    // 或解析 https 流量
    public handleHttps() {
        // 1. 收到 connect 请求
        this.server.on('connect', async (req: http.IncomingMessage, socket: net.Socket, head: Buffer) => {

            this.connectSockets.add(socket);
            socket.on('close', () => {
                this.connectSockets.delete(socket);
            });

            let proxyClient: net.Socket;

            // 出错时尝试释放资源
            const tryDestroy = () => {
                if (!socket.destroyed) {
                    socket.destroy();
                }
                if (proxyClient && !proxyClient.destroyed) {
                    proxyClient.destroy();
                }
            };

            socket.on('error', (err: ICodeError) => {
                if (err.code === 'ECONNRESET') {
                    tryDestroy();
                    return;
                }

                this.logger.warn('connect socket error %s when %s', errInfo(err), req.url);
                tryDestroy();
            });

            // 是否解析 HTTPS 流量
            let interceptHttps = this.fwproxy.interceptHttps;
            if (!interceptHttps) {
                interceptHttps = await this.fwproxy.modifyHandler.isParseSecure(req.url);
            }

            // 2. 创建远端连接或连接至中间人服务器
            // 中间人攻击 man in the middle
            if (interceptHttps) {
                proxyClient = this.fwproxy.mitmServer.mockConnect();
            }
            // 直接转发 https 流量
            else {
                this.logger.info('ssl tunnel: %s', req.url);
                const { port, hostname } = url.parse('http://' + req.url);
                proxyClient = net.createConnection({ port: parseInt(port), host: hostname });
            }

            proxyClient.on('error', (err: ICodeError) => {
                if (err.code === 'ECONNRESET') {
                    tryDestroy();
                    return;
                }

                if (err.code === 'EPIPE') {
                    tryDestroy();
                    return;
                }

                this.logger.warn('connect proxyClient socket url: %s, error: %s', req.url, errInfo(err));
                tryDestroy();
            });

            proxyClient.on('timeout', () => {
                this.logger.warn('connect proxyClient timeout: %s', req.url);
                tryDestroy();
            });

            proxyClient.on('connect', () => {
                // 3. 远端连接成功，告诉原始请求方
                socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
                proxyClient.write(head);

                // 4. 数据交换：原始请求方 <=> 远端
                proxyClient.pipe(socket);
                socket.pipe(proxyClient);
            });
        });
    }
}


export class MitmServer {
    private logger: Logger;
    private server: https.Server;
    private fwproxy: FwProxy;

    constructor(requestHandler: RequestHandler, fwproxy: FwProxy) {
        ca.init();
        this.logger = new Logger('FwProxy MitmServer');
        this.fwproxy = fwproxy;

        // 经过测试，此 https server 无需 key 和 cert 也可以，SNI 才是关键
        // A function that will be called if the client supports SNI TLS extension
        // 服务器名称指示（server name indication, SNI）
        // 为客户端提供一种机制，可告知服务器希望与之建立连接的服务器的名称
        // 为安全虚拟主机提供支持，可在一个 IP 部署多个证书
        this.server = https.createServer({
            SNICallback: async (servername, callback) => {
                this.logger.debug('SNICallback servername: %s', servername);
                try {
                    const { pem, privateKey } = await ca.getServer(servername);
                    const ctx = tls.createSecureContext({ key: privateKey, cert: pem });
                    callback(null, ctx);
                } catch (err) {
                    this.logger.warn('SNICallback error: %s', err.message);
                    callback(err, null);
                }
            }
        });

        this.server.on('tlsClientError', (err: ICodeError) => {
            this.logger.warn('tlsClientError: %s', errInfo(err));
        });

        this.server.on('error', (err: ICodeError) => {
            this.logger.error(errInfo(err));
        });

        this.server.on('request', requestHandler.register('https'));
    }

    public async start() {
        this.logger.info('mock server start');
    }

    public close(done: (err?: Error) => void) {
        done();
    }

    // 模拟请求，数据仅在此进程内传输，提高性能
    public mockConnect(): net.Socket {
        const [pipe1, pipe2] = createPipes();

        process.nextTick(() => {
            this.server.emit('connection', pipe2);
            pipe1.emit('connect');
        });

        return pipe1 as net.Socket;
    }
}
