// 用于修改 HTTP 流量

import * as http from 'http';
import { Readable } from 'stream';

export interface IRequest {
    method?: string;
    url?: string;
    httpVersion?: string;
    headers?: http.IncomingHttpHeaders;
    body?: Readable;
}

export interface IResponse {
    statusCode?: number;
    headers?: http.IncomingHttpHeaders;
    body?: Readable;
    remoteAddress?: string;
}

export interface Interpolator {

    name: string;

    // 是否解析 HTTPS 流量
    isParseSecure?: (url: string) => Promise<boolean>;

    // 不发送请求，直接返回结果
    directResponse?: (req: IRequest) => Promise<IResponse>;

    // 发送请求前修改请求
    changeRequest?: (req: IRequest) => Promise<IRequest>;

    // 远端响应前修改响应
    changeResponse?: (req: IRequest, rawRes: IResponse) => Promise<IResponse>;
}

export class SimpleInterpolator implements Interpolator {
    public name = 'SimpleInterpolator';
    private headerName = 'fwproxy';

    // 添加 fwproxy 头部
    public async changeResponse(req: IRequest, rawRes: IResponse) {
        const res = rawRes;
        res.headers['proxy-server'] = this.headerName;
        return res;
    }
}
