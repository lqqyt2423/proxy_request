import * as fs from 'fs';
import { URL } from 'url';
import * as http from 'http';
import * as https from 'https';
import * as tls from 'tls';
import { FwProxy } from '.';
import { Logger } from './logger';
import { errInfo, ICodeError } from './mitm-server';
import { HTTPRecord } from './record';
import { IRequest, IResponse } from './interpolator';

// 可通过环境变量传入需要信任的根证书，方便测试
const trustCas: Array<string|Buffer> = tls.rootCertificates.slice();
if (process.env['FW_PROXY_EXTRA_CA_CERTS']) {
    try {
        const data = fs.readFileSync(process.env['FW_PROXY_EXTRA_CA_CERTS']);
        trustCas.push(data);
    } catch (err) {
        //
    }
}

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

    public async handle(req: http.IncomingMessage, res: http.ServerResponse, protocol: NetProtocol) {

        // 代理服务器收到的请求 url 必须是完整的
        if (protocol === 'http' && !/^http/.test(req.url)) {
            res.statusCode = 400;
            res.end();
            return;
        }

        // 代理请求远端
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

        // HTTP 记录
        const record = new HTTPRecord(this.fwproxy);

        // end: 响应客户端
        const responseToClient = (resInfo: IResponse) => {
            res.writeHead(resInfo.statusCode, resInfo.headers);
            resInfo.body.pipe(res);

            // end: 记录请求
            record.statusCode = resInfo.statusCode;
            record.remoteAddress = resInfo.remoteAddress;
            record.resHeaders = resInfo.headers;

            record.resBody = resInfo.body;
            record.emit('resBody', record.resBody);
        };

        let remoteUrl = req.url;
        if (!/^http/.test(remoteUrl)) {
            remoteUrl = `${protocol}://${req.headers.host}${remoteUrl}`;
        }

        // 定义请求信息
        let reqInfo: IRequest = {
            method: req.method,
            url: remoteUrl,
            httpVersion: req.httpVersion,
            headers: req.headers,
            body: req,
        };
        let resInfo: IResponse;

        // hook 1: 可能直接响应，不请求远端
        try {
            const directResp = await this.fwproxy.modifyHandler.directResponse(reqInfo);
            if (directResp) {
                if (directResp.reqInfo) reqInfo = directResp.reqInfo;
                if (directResp.resInfo) resInfo = directResp.resInfo;
            }
        } catch (err) {
            this.logger.warn('modifyHandler.directResponse error: %s', err.message);
            this.logger.debug(err);
            tryDestroy();
            return;
        }

        if (resInfo) {
            // 1. 记录请求
            record.init(reqInfo);

            responseToClient(resInfo);
            return;
        }

        // hook 2: 修改请求
        try {
            const changedReqInfo = await this.fwproxy.modifyHandler.changeRequest(reqInfo);
            if (changedReqInfo) reqInfo = changedReqInfo;
        } catch (err) {
            this.logger.warn('modifyHandler.changeRequest error: %s', err.message);
            this.logger.debug(err);
            tryDestroy();
            return;
        }

        // 1. 记录请求
        record.init(reqInfo);

        const reqOptions: http.RequestOptions = {
            hostname: record.url.hostname,
            port: record.url.port || (protocol === 'https' ? 443 : 80),
            method: req.method,
            path: record.url.pathname + record.url.search,
            headers: req.headers,

            // 不设置超时
            // timeout: this.fwproxy.connTimeout,
        };

        // 2. 远端响应 => 代理服务器响应
        const reqCallback = async (proxyRes: http.IncomingMessage) => {
            resInfo = {
                statusCode: proxyRes.statusCode,
                headers: proxyRes.headers,
                body: proxyRes,
                remoteAddress: `${proxyRes.socket.remoteAddress}:${proxyRes.socket.remotePort}`,
            };

            // hook 3: 修改响应
            try {
                const changedResInfo = await this.fwproxy.modifyHandler.changeResponse(reqInfo, resInfo);
                if (changedResInfo) resInfo = changedResInfo;
            } catch (err) {
                this.logger.warn('modifyHandler.changeResponse error: %s', err.message);
                this.logger.debug(err);
                tryDestroy();
                return;
            }

            responseToClient(resInfo);
        };

        if (protocol === 'https') {
            proxyClient = https.request({ ...reqOptions, ca: trustCas }, reqCallback);
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

        // 1. HTTP 请求 => 请求远端
        reqInfo.body.pipe(proxyClient);
    }
}
