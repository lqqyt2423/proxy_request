import { PassThrough } from 'stream';
import { FwProxy } from '.';
import { Interpolator, IRequest, IResponse } from './interpolator';
import { Logger } from './logger';
import { FileViewer, LogViewer } from './viewer';

class TestInterpolator implements Interpolator {
    public name = 'TestInterpolator';

    public async directResponse(req: IRequest): Promise<IResponse> {
        if (req.url.includes('localhost')) {
            // 模拟读了 req 中的请求流
            // req.body.resume();

            const pass = new PassThrough();
            pass.end('hello world\n');
            return {
                statusCode: 200,
                headers: {
                    'proxy-interpolator': this.name,
                },
                body: pass,
            };
        }

        return null;
    }
}

const logger = new Logger('FwProxy example');

const fwproxy = new FwProxy({ interceptHttps: true, verbose: true });

fwproxy.addViewer(new LogViewer());
fwproxy.addViewer(new FileViewer(process.stdout));

fwproxy.addInterpolator(new TestInterpolator());

fwproxy.on('error', err => {
    logger.error(err);
});

fwproxy.on('ready', () => {
    logger.info('ready');
});

fwproxy.start();
