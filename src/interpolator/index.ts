// 用于修改 HTTP 流量

import * as http from 'http';
import { Readable } from 'stream';

interface IRequestMeta {
    method?: string;
    url?: string;
    httpVersion?: string;
    headers?: http.IncomingHttpHeaders;
}

export interface IRequestStream extends IRequestMeta {
    body?: Readable;
}

export interface IRequest extends IRequestMeta {
    body?: Readable | Buffer | string;
}

interface IResponseMeta {
    statusCode?: number;
    headers?: http.IncomingHttpHeaders;
    remoteAddress?: string;
}

export interface IResponseStream extends IResponseMeta {
    body?: Readable;
}

export interface IResponse extends IResponseMeta {
    body?: Readable | Buffer | string;
}

export interface Interpolator {

    name: string;

    // 是否解析 HTTPS 流量
    isParseSecure?: (url: string) => Promise<boolean>;

    // 不发送请求，直接返回结果
    directResponse?: (req: IRequestStream) => Promise<IResponse>;

    // 发送请求前修改请求
    changeRequest?: (req: IRequestStream) => Promise<IRequest>;

    // 远端响应前修改响应
    changeResponse?: (req: IRequestStream, rawRes: IResponseStream) => Promise<IResponse>;
}

export class SimpleInterpolator implements Interpolator {
    public name = 'SimpleInterpolator';
    private headerName = 'fwproxy';

    // 添加 fwproxy 头部
    public async changeResponse(req: IRequestStream, rawRes: IResponseStream) {
        const res = rawRes;
        res.headers['proxy-server'] = this.headerName;
        return res;
    }
}
