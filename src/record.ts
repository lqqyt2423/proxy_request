// 记录 HTTP/HTTPS 请求

import { IncomingHttpHeaders } from 'http';
import { PassThrough, Readable, Writable } from 'stream';
import { URL } from 'url';
import { FwProxy } from '.';
import { Logger } from './logger';

const logger = new Logger('FwProxy HTTPRecord');

export class HTTPRecord {
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
        this.fwproxy = fwproxy;
    }

    public setReqBody(reqBody: Readable) {
        if (!this.fwproxy.emitRecordFn) {
            this.reqBody = null;
            return;
        }

        const pass = new PassThrough();
        reqBody.pipe(pass);
        this.reqBody = pass;
    }

    public setResBody(resBody: Readable) {
        resBody.on('end', () => {
            this.finish();
        });

        if (!this.fwproxy.emitRecordFn) {
            this.resBody = null;
            return;
        }

        const pass = new PassThrough();
        resBody.pipe(pass);
        this.resBody = pass;
    }

    // 如果有流，一定要确保消耗掉，防止内存泄漏
    public finish() {
        this.resEndAt = new Date();

        logger.info('%s %s %s - %s ms', this.method, this.url.toString(), this.statusCode, this.resEndAt.getTime() - this.reqBeginAt.getTime());
        if (this.fwproxy.emitRecordFn) this.fwproxy.emitRecordFn(this);
    }

    public toJSON() {
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

    // 测试
    public async showDetail(destination?: Writable) {
        if (!destination) destination = process.stdout;

        destination.write('\nreqBody: \n');
        await this.pipeReqBodyTo(destination, false);
        destination.write('\nresBod: \n');
        await this.pipeResBodyTo(destination, false);
        destination.write('\n');
    }

    // 消耗请求 body
    public async pipeReqBodyTo(destination?: Writable, end = true) {
        if (!this.reqBody) return;

        await new Promise(resolve => {
            this.reqBody.on('end', resolve);

            if (destination) {
                this.reqBody.pipe(destination, { end });
            } else {
                this.reqBody.resume();
            }
        });
    }

    // 消耗响应 body
    public async pipeResBodyTo(destination?: Writable, end = true) {
        if (!this.resBody) return;

        await new Promise(resolve => {
            this.resBody.on('end', resolve);

            if (destination) {
                this.resBody.pipe(destination, { end });
            } else {
                this.reqBody.resume();
            }
        });
    }
}
