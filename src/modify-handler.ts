import { FwProxy } from '.';
import { Interpolator, IRequest, IResponse } from './interpolator';
import { Logger } from './logger';

export class ModifyHandler {
    private fwproxy: FwProxy;
    private logger: Logger;

    private changeResponseFns: Array<(req: IRequest, rawRes: IResponse) => Promise<IResponse>>;

    constructor(fwproxy: FwProxy) {
        this.fwproxy = fwproxy;
        this.logger = new Logger('FwProxy ModifyHandler');

        this.changeResponseFns = [];
    }

    public async isParseSecure(url: string): Promise<boolean> {
        return true;
    }

    public async directResponse(req: IRequest): Promise<{ reqInfo: IRequest, resInfo: IResponse }> {
        return null;
    }

    public async changeRequest(req: IRequest): Promise<IRequest> {
        return null;
    }

    public async changeResponse(req: IRequest, rawRes: IResponse): Promise<IResponse> {
        if (!this.changeResponseFns.length) return null;

        let res: IResponse = rawRes;
        for (let i = 0, len = this.changeResponseFns.length; i < len; i++) {
            res = await this.changeResponseFns[i](req, res);
        }

        return res;
    }

    public add(interpolator: Interpolator) {
        this.logger.show('添加 interpolator: %s', interpolator.name);

        if (interpolator.changeResponse) {
            this.changeResponseFns.push(interpolator.changeResponse.bind(interpolator));
        }
    }
}
