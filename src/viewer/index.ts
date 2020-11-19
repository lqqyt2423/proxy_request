// 观察请求

import { PassThrough, Writable } from 'stream';
import { HTTPRecord } from '../record';
import { Logger } from '../logger';

const logger = new Logger('FwProxy Viewer');

export interface Viewer {
    name: string;
    view(record: HTTPRecord): void;
}

export class LogViewer implements Viewer {
    public name = 'LogViewer';
    public async view(record: HTTPRecord) {
        record.on('finish', () => {
            logger.info('%s %s %s - %s ms', record.method, record.url.toString(), record.statusCode, record.resEndAt.getTime() - record.reqBeginAt.getTime());
        });
    }
}

export class FileViewer implements Viewer {
    public name = 'FileViewer';
    private output: Writable;

    constructor(output: Writable) {
        this.output = output;
    }

    public async view(record: HTTPRecord) {
        const { info, resBodyBufs, reqBodyBufs } = await record.snapshot();

        // 一条记录应该是一个整体，收集完成后批量写入 output
        const pass = new PassThrough();
        pass.write('==========\n');
        pass.write('http record info:\n');
        pass.write(JSON.stringify(info, null, 4));
        pass.write('\nrequest body:\n');
        for (const buf of reqBodyBufs) {
            pass.write(buf);
        }
        pass.write('\nresponse body:\n');
        for (const buf of resBodyBufs) {
            pass.write(buf);
        }
        pass.write('==========\n\n');

        // 一块写入
        pass.pipe(this.output);
    }
}
