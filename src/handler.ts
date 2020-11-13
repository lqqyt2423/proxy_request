import * as url from 'url';
import * as http from 'http';
import * as https from 'https';
import { FwProxy } from '.';
import { Logger } from './logger';

export class RequestHandler {
    private fwproxy: FwProxy;
    private logger: Logger;

    constructor(fwproxy: FwProxy) {
        this.fwproxy = fwproxy;
        this.logger = new Logger('FwProxy RequestHandler');
    }

    public register() {
        return (req: http.IncomingMessage, res: http.ServerResponse) => {
            this.handle(req, res);
        };
    }

    public handle(req: http.IncomingMessage, res: http.ServerResponse) {

        // 代理服务器收到的请求 url 必须是完整的
        if (!/^http/.test(req.url)) {
            res.statusCode = 400;
            res.end();
            return;
        }

        let proxyClient: http.ClientRequest;

        // 出错时尝试释放资源
        const tryDestroy = () => {
            if (res.socket && !res.socket.destroyed) res.socket.destroy();
            if (proxyClient && !proxyClient.aborted) proxyClient.abort();
        };

        const urlObj = url.parse(req.url);
        const reqOptions: http.RequestOptions = {
            hostname: urlObj.hostname,
            port: urlObj.port || 80,
            method: req.method,
            path: urlObj.path,
            headers: req.headers,
            timeout: this.fwproxy.connTimeout,
        };

        // 2. 远端响应 => 代理服务器响应
        const reqCallback = (proxyRes: http.IncomingMessage) => {
            res.writeHead(proxyRes.statusCode, proxyRes.headers);
            proxyRes.pipe(res);
        };

        if (urlObj.protocol === 'https') {
            proxyClient = https.request(reqOptions, reqCallback);
        } else {
            proxyClient = http.request(reqOptions, reqCallback);
        }

        proxyClient.on('error', e => {
            this.logger.warn('proxyClient error %s %s error: %s', req.method, req.url, e.message);
            tryDestroy();
        });

        proxyClient.on('timeout', () => {
            this.logger.warn('proxyClient timeout %s %s', req.method, req.url);
            tryDestroy();
        });

        this.logger.info('%s %s %s', urlObj.protocol, req.method, req.url);

        // 1. 代理服务器收到的请求 => 请求远端
        req.pipe(proxyClient);
    }
}
