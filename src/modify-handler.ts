import { FwProxy } from '.';
import { Interpolator, IRequest, IResponse } from './interpolator';
import { Logger } from './logger';

export class ModifyHandler {
    private fwproxy: FwProxy;
    private logger: Logger;

    constructor(fwproxy: FwProxy) {
        this.fwproxy = fwproxy;
        this.logger = new Logger('FwProxy ModifyHandler');
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
        return null;
    }

    public add(interpolator: Interpolator) {
        this.logger.show('添加 interpolator: %s', interpolator.name);
    }
}
