import * as net from 'net';
import * as http from 'http';
import * as https from 'https';
import * as tls from 'tls';
import * as url from 'url';
import { Logger } from './logger';
import { ca } from './ca';
import { RequestHandler } from './handler';
import { FwProxy } from '.';

export class HttpServer {
    private logger: Logger;
    private server: http.Server;
    private port: number;
    private fwproxy: FwProxy;

    constructor(port: number, requestHandler: RequestHandler, fwproxy: FwProxy) {
        this.logger = new Logger('FwProxy HttpServer');
        this.port = port;
        this.fwproxy = fwproxy;
        this.server = http.createServer();

        this.server.on('clientError', (err, socket: net.Socket) => {
            this.logger.warn('clientError: %s', err.message);
            if (err.code === 'ECONNRESET' || !socket.writable) {
                return;
            }
            socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
        });

        this.server.on('error', (err: any) => {
            if (err.code === 'EADDRINUSE') {
                this.logger.error('中间人服务器启动失败，%s 端口被占用', this.port);
                process.exit(1);
            }
            this.logger.warn('error', err.message);
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

    // 直接 ssl tunnel 转发 https 流量
    // 或解析 https 流量
    public handleHttps() {
        // 1. 收到 connect 请求
        this.server.on('connect', async (req: http.IncomingMessage, socket: net.Socket, head: Buffer) => {

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

            socket.on('error', (err: any) => {
                if (err.code === 'ECONNRESET') {
                    this.logger.warn('socket ECONNRESET');
                    return;
                }

                this.logger.warn('connect socket error: %s %s', err.message, err.code);
                tryDestroy();
            });

            // 2. 创建远端连接或连接至中间人服务器
            // 中间人攻击 man in the middle
            if (this.fwproxy.interceptHttps) {
                proxyClient = net.createConnection({ port: this.fwproxy.interceptServerPort, host: 'localhost' });
            }
            // 直接转发 https 流量
            else {
                this.logger.info('ssl tunnel: %s', req.url);
                const { port, hostname } = url.parse('http://' + req.url);
                proxyClient = net.createConnection({ port: parseInt(port), host: hostname });
            }

            // 并不理解的含义，先注释掉
            // proxyClient.setTimeout(this.fwproxy.connTimeout);

            proxyClient.on('error', (err: any) => {
                if (err.code === 'ECONNRESET') {
                    this.logger.info('proxyClient ECONNRESET');
                    return;
                }

                if (err.code === 'EPIPE') {
                    this.logger.info('proxyClient EPIPE');
                    return;
                }

                this.logger.warn('connect proxyClient socket error: %s %s', err.message, err.code);
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
    private port: number;
    private fwproxy: FwProxy;

    constructor(port: number, requestHandler: RequestHandler, fwproxy: FwProxy) {
        ca.init();
        this.logger = new Logger('FwProxy MitmServer');
        this.port = port;
        this.fwproxy = fwproxy;

        // 经过测试，此 https server 无需 key 和 cert 也可以，SNI 才是关键
        // A function that will be called if the client supports SNI TLS extension
        // 服务器名称指示（server name indication, SNI）
        // 为客户端提供一种机制，可告知服务器希望与之建立连接的服务器的名称
        // 为安全虚拟主机提供支持，可在一个 IP 部署多个证书
        this.server = https.createServer({
            SNICallback: async (servername, callback) => {
                // this.logger.debug('SNICallback servername: %s', servername);
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

        this.server.on('tlsClientError', (err: any) => {
            this.logger.warn('tlsClientError: %s %s', err.message, err.code);
        });

        this.server.on('error', (err: any) => {
            if (err.code === 'EADDRINUSE') {
                this.logger.error('中间人服务器启动失败，%s 端口被占用', this.port);
                process.exit(1);
            }
            this.logger.warn('error', err.message);
        });

        this.server.on('request', requestHandler.register('https'));
    }

    public async start() {
        await new Promise(resolve => {
            this.server.listen(this.port, () => {
                this.logger.info('server listen at: %s', this.port);
                resolve();
            });
        });

    }
}
