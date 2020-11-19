// 用于修改 HTTP 流量

import * as http from 'http';
import { Readable } from 'stream';

export interface IChangeRequest {
    method?: string;
    path?: string;
    headers?: http.IncomingHttpHeaders;
    body?: Readable;
}

export interface IResponse {
    statusCode?: number;
    headers?: http.IncomingHttpHeaders;
    body?: Readable;
}

export interface Interpolator {
    // 是否解析 HTTPS 流量
    isParseSecure?: (url: string) => Promise<boolean>;

    // 发送请求前修改请求
    changeRequest?: (req: http.IncomingMessage) => Promise<IChangeRequest>;

    // 不发送请求，直接返回结果
    directResponse?: (req: http.IncomingMessage) => Promise<IResponse>;

    // 远端响应前修改响应
    changeResponse?: (req: http.IncomingMessage, rawRes: IResponse) => Promise<IResponse>;
}
