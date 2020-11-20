// 记录 HTTP/HTTPS 请求

import { EventEmitter } from 'events';
import { IncomingHttpHeaders } from 'http';
import { Readable, Writable } from 'stream';
import { URL } from 'url';
import { FwProxy } from '.';
import { IRequest } from './interpolator';
import { Logger } from './logger';

const logger = new Logger('FwProxy HTTPRecord');

export async function pipeStream(readable: Readable, destination?: Writable, end = true): Promise<void> {
    await new Promise((resolve, reject) => {
        readable.on('end', resolve);
        readable.on('error', reject);

        if (destination) {
            readable.pipe(destination, { end });
        }
    });
}

export async function bufferStream(readable: Readable): Promise<Array<Buffer>> {
    return await new Promise((resolve, reject) => {
        const bufs: Array<Buffer> = [];
        readable.on('data', chunk => {
            bufs.push(chunk);
        });
        readable.on('end', () => {
            resolve(bufs);
        });
        readable.on('error', reject);
    });
}

export interface IHTTPRecordMetaData {
    url: string;
    method: string;
    httpVersion: string;
    statusCode: number;
    remoteAddress: string;
    reqHeaders: IncomingHttpHeaders;
    reqBeginAt: Date;
    resHeaders: IncomingHttpHeaders;
    resEndAt: Date;
}

export interface IHTTPRecordSnapshot {
    info: IHTTPRecordMetaData;
    reqBodyBufs: Array<Buffer>;
    resBodyBufs: Array<Buffer>;
}

export declare interface HTTPRecord {
    on(event: 'reqBody', listener: (reqBody: Readable) => void): this;
    on(event: 'resBody', listener: (resBody: Readable) => void): this;
    on(event: 'finish', listener: () => void): this;
    on(event: string | symbol, listener: (...args: any[]) => void): this;

    emit(event: 'reqBody', reqBody: Readable): boolean;
    emit(event: 'resBody', resBody: Readable): boolean;
    emit(event: 'finish'): boolean;
    emit(event: string | symbol, ...args: any[]): boolean;
}

export class HTTPRecord extends EventEmitter {
    url: URL;
    method: string;
    httpVersion: string;
    statusCode: number;
    remoteAddress: string;

    reqHeaders: IncomingHttpHeaders;
    reqBody: Readable;
    reqBeginAt: Date;

    resHeaders: IncomingHttpHeaders;
    resBody: Readable;
    resEndAt: Date;

    private fwproxy: FwProxy;

    constructor(fwproxy: FwProxy) {
        super();
        this.fwproxy = fwproxy;

        this.on('resBody', resBody => {
            resBody.on('end', () => {
                this.resEndAt = new Date();
                this.emit('finish');
            });
        });
    }

    // 记录 HTTP 请求
    public init(reqInfo: IRequest) {
        this.url = new URL(reqInfo.url);
        this.method = reqInfo.method;
        this.httpVersion = reqInfo.httpVersion;
        this.reqHeaders = reqInfo.headers;
        this.reqBeginAt = new Date();

        this.fwproxy.emit('record', this);
        this.reqBody = reqInfo.body;
        this.emit('reqBody', this.reqBody);
    }

    public toJSON(): IHTTPRecordMetaData {
        return {
            url: this.url.toString(),
            method: this.method,
            httpVersion: this.httpVersion,
            statusCode: this.statusCode,
            remoteAddress: this.remoteAddress,
            reqHeaders: this.reqHeaders,
            reqBeginAt: this.reqBeginAt,
            resHeaders: this.resHeaders,
            resEndAt: this.resEndAt,
        };
    }

    // 获取全部信息的快捷方法
    public async snapshot(): Promise<IHTTPRecordSnapshot> {
        return await new Promise(resolve => {
            let reqBodyBufs: Array<Buffer> = [];
            let resBodyBufs: Array<Buffer> = [];

            let count = 0;

            this.on('reqBody', reqBody => {
                bufferStream(reqBody).then(bufs => {
                    reqBodyBufs = bufs;
                }).finally(() => {
                    if (++count === 2)
                        resolve({ info: this.toJSON(), reqBodyBufs, resBodyBufs });
                });
            });

            this.on('resBody', resBody => {
                bufferStream(resBody).then(bufs => {
                    resBodyBufs = bufs;
                }).finally(() => {
                    if (++count === 2)
                        resolve({ info: this.toJSON(), reqBodyBufs, resBodyBufs });
                });
            });
        });
    }
}
