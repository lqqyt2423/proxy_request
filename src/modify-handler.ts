import { PassThrough, Readable } from 'stream';
import { FwProxy } from '.';
import { Interpolator, IResponse, IRequestStream, IResponseStream } from './interpolator';
import { Logger } from './logger';

export function transformToStream(input: Readable | Buffer | string): Readable {
    if (input instanceof Readable) return input;
    const pass = new PassThrough();
    pass.end(input);
    return pass;
}

export class ModifyHandler {
    private fwproxy: FwProxy;
    private logger: Logger;

    private interps: Array<Interpolator>;

    constructor(fwproxy: FwProxy) {
        this.fwproxy = fwproxy;
        this.logger = new Logger('FwProxy ModifyHandler');

        this.interps = [];
    }

    public async isParseSecure(url: string): Promise<boolean> {
        if (!this.interps.length) return false;

        const targetInterps = this.interps.filter(interp => !!interp.isParseSecure);
        if (!targetInterps.length) return false;

        for (let i = 0, len = targetInterps.length; i < len; i++) {
            try {
                if ((await targetInterps[i].isParseSecure(url))) return true;
            } catch (err) {
                this.logger.error('isParseSecure', err);
            }
        }

        return false;
    }

    public async directResponse(req: IRequestStream): Promise<{ reqInfo: IRequestStream, resInfo: IResponseStream }> {
        if (!this.interps.length) return null;

        const targetInterps = this.interps.filter(interp => !!interp.directResponse);
        if (!targetInterps.length) return null;

        // 监测用户端是否消耗了请求流 req.body，如果消耗了则需要拷贝请求流
        let pass: PassThrough;
        const resumeCallback = () => {
            pass = new PassThrough();
            req.body.pipe(pass);
        };
        req.body.once('resume', resumeCallback);

        // TODO: 假如用户添加了多个 directResponse 方法，且再第一个方法中消耗了请求流，则后面几个方法中请求流为空
        let resInfo: IResponse;
        for (let i = 0, len = targetInterps.length; i < len; i++) {
            try {
                resInfo = await targetInterps[i].directResponse(req);
                if (resInfo) break;
            } catch (err) {
                this.logger.error('directResponse', err);
            }
        }

        if (pass) {
            this.logger.debug('directResponse 拷贝流');
            req.body = pass;
        } else {
            this.logger.debug('directResponse 保留流');
            req.body.removeListener('resume', resumeCallback);
        }

        return { reqInfo: req, resInfo: { ...resInfo, body: transformToStream(resInfo.body) } };
    }

    public async changeRequest(req: IRequestStream): Promise<IRequestStream> {
        if (!this.interps.length) return null;

        const targetInterps = this.interps.filter(interp => !!interp.changeRequest);
        if (!targetInterps.length) return null;

        const rawReqBody = req.body;
        let changedReq = req;
        for (let i = 0, len = targetInterps.length; i < len; i++) {
            try {
                const tmpChangedReq = await targetInterps[i].changeRequest(changedReq);
                if (tmpChangedReq) changedReq = { ...tmpChangedReq, body: transformToStream(tmpChangedReq.body) };
            } catch (err) {
                this.logger.error('changeRequest', err);
            }
        }

        // 若请求流变化，主动消耗原始请求流，防止内存泄漏
        if (changedReq.body !== rawReqBody) {
            this.logger.debug('rawReqBody resume');
            rawReqBody.resume();
        }
        return changedReq;
    }

    public async changeResponse(req: IRequestStream, rawRes: IResponseStream): Promise<IResponseStream> {
        if (!this.interps.length) return null;

        const targetInterps = this.interps.filter(interp => !!interp.changeResponse);
        if (!targetInterps.length) return null;

        const rawResBody = rawRes.body;
        let res = rawRes;
        for (let i = 0, len = targetInterps.length; i < len; i++) {
            try {
                const tmpRes = await targetInterps[i].changeResponse(req, res);
                if (tmpRes) res = { ...tmpRes, body: transformToStream(tmpRes.body) };
            } catch (err) {
                this.logger.error('changeResponse', err);
            }
        }

        // 若响应流变化，主动消耗原始响应流，防止内存泄漏
        if (res.body !== rawResBody) {
            this.logger.debug('rawResBody resume');
            rawResBody.resume();
        }
        return res;
    }

    // TODO: validate
    public add(interpolator: Interpolator) {
        this.logger.info('添加 interpolator: %s', interpolator.name);
        this.interps.push(interpolator);
    }

    public remove(interpolator: Interpolator): boolean {
        const index = this.interps.indexOf(interpolator);
        if (index === -1) return false;

        this.logger.info('删除 interpolator: %s', interpolator.name);
        this.interps.splice(index, 1);
        return true;
    }
}
