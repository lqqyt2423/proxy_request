import { PassThrough } from 'stream';
import { FwProxy } from '.';
import { Interpolator, IRequest, IResponse } from './interpolator';
import { Logger } from './logger';

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
        return true;
    }

    public async directResponse(req: IRequest): Promise<{ reqInfo: IRequest, resInfo: IResponse }> {
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

        // 假如用户添加了多个 directResponse 方法，且再第一个方法中消耗了请求流，则后面几个方法中请求流为空
        let resInfo: IResponse;
        for (let i = 0, len = targetInterps.length; i < len; i++) {
            resInfo = await targetInterps[i].directResponse(req);
            if (resInfo) break;
        }

        if (pass) {
            this.logger.debug('directResponse 拷贝流');
            req.body = pass;
        } else {
            this.logger.debug('directResponse 保留流');
            req.body.removeListener('resume', resumeCallback);
        }

        return { reqInfo: req, resInfo };
    }

    public async changeRequest(req: IRequest): Promise<IRequest> {
        return null;
    }

    public async changeResponse(req: IRequest, rawRes: IResponse): Promise<IResponse> {
        if (!this.interps.length) return null;

        let res: IResponse = rawRes;
        for (let i = 0, len = this.interps.length; i < len; i++) {
            if (this.interps[i].changeResponse) {
                res = await this.interps[i].changeResponse(req, res);
            }
        }

        return res;
    }

    public add(interpolator: Interpolator) {
        this.logger.show('添加 interpolator: %s', interpolator.name);
        this.interps.push(interpolator);
    }
}
