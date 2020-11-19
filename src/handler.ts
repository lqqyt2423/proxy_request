import { URL } from 'url';
import * as http from 'http';
import * as https from 'https';
import { FwProxy } from '.';
import { Logger } from './logger';
import { errInfo, ICodeError } from './mitm-server';
import { HTTPRecord } from './record';

type NetProtocol = 'http' | 'https';

export class RequestHandler {
    private fwproxy: FwProxy;
    private logger: Logger;

    constructor(fwproxy: FwProxy) {
        this.fwproxy = fwproxy;
        this.logger = new Logger('FwProxy RequestHandler');
    }

    public register(protocol: NetProtocol) {
        return (req: http.IncomingMessage, res: http.ServerResponse) => {
            this.handle(req, res, protocol);
        };
    }

    public handle(req: http.IncomingMessage, res: http.ServerResponse, protocol: NetProtocol) {

        // 代理服务器收到的请求 url 必须是完整的
        if (protocol === 'http' && !/^http/.test(req.url)) {
            res.statusCode = 400;
            res.end();
            return;
        }

        const record = new HTTPRecord(this.fwproxy);
        let proxyClient: http.ClientRequest;

        // 出错时尝试释放资源
        const tryDestroy = () => {
            if (res.socket && !res.socket.destroyed) {
                res.socket.destroy();
            }
            if (proxyClient && !proxyClient.aborted) {
                proxyClient.abort();
            }
        };

        let remoteUrl = req.url;
        if (!/^http/.test(remoteUrl)) {
            remoteUrl = `${protocol}://${req.headers.host}${remoteUrl}`;
        }
        const url = new URL(remoteUrl);

        const reqOptions: http.RequestOptions = {
            hostname: url.hostname,
            port: url.port || (protocol === 'https' ? 443 : 80),
            method: req.method,
            path: url.pathname + url.search,
            headers: req.headers,

            // 不设置超时
            // timeout: this.fwproxy.connTimeout,
        };

        // 2. 远端响应 => 代理服务器响应
        const reqCallback = (proxyRes: http.IncomingMessage) => {
            res.writeHead(proxyRes.statusCode, proxyRes.headers);
            proxyRes.pipe(res);

            // 2. 记录请求
            record.httpVersion = proxyRes.httpVersion;
            record.statusCode = proxyRes.statusCode;
            record.remoteAddress = `${proxyRes.socket.remoteAddress}:${proxyRes.socket.remotePort}`;
            record.resHeaders = proxyRes.headers;

            record.resBody = proxyRes;
            record.emit('resBody', record.resBody);
        };

        if (protocol === 'https') {
            proxyClient = https.request(reqOptions, reqCallback);
        } else {
            proxyClient = http.request(reqOptions, reqCallback);
        }

        proxyClient.on('error', (err: ICodeError) => {
            this.logger.warn('proxyClient error %s when %s %s', errInfo(err), req.method, remoteUrl);
            tryDestroy();
        });

        proxyClient.on('timeout', () => {
            this.logger.warn('proxyClient timeout when %s %s', req.method, remoteUrl);
            tryDestroy();
        });

        // 1. 记录请求
        record.url = url;
        record.method = req.method;
        record.reqHeaders = req.headers;
        record.reqBeginAt = new Date();

        this.fwproxy.emit('record', record);
        record.reqBody = req;
        record.emit('reqBody', record.reqBody);

        // 1. 代理服务器收到的请求 => 请求远端
        req.pipe(proxyClient);
    }
}
