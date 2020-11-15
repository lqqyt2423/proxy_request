// 观察请求

import { PassThrough, Writable } from 'stream';
import { cloneReadStream, HTTPRecord, pipeStream } from '../record';
import { Logger } from '../logger';

const logger = new Logger('FwProxy Viewer');

export abstract class Viewer {
    public abstract view(record: HTTPRecord): void;

    public cloneStream(record: HTTPRecord) {
        const reqBody = cloneReadStream(record.reqBody);
        const resBody = cloneReadStream(record.resBody);
        return { reqBody, resBody };
    }
}

export class FileViewer extends Viewer {

    private output: Writable;

    constructor(output: Writable) {
        super();
        this.output = output;
    }

    public async view(record: HTTPRecord) {
        // 需要保证一开始就调用
        const { reqBody, resBody } = this.cloneStream(record);

        // 一条记录应该是一个整体，收集完成后批量写入 output
        const pass = new PassThrough();
        pass.write('==========\n');
        pass.write('record:\n');
        pass.write(JSON.stringify(record, null, 4));
        pass.write('\nrequest body:\n');
        await pipeStream(reqBody, pass, false);
        pass.write('\nresponse body:\n');
        await pipeStream(resBody, pass, false);
        pass.write('==========\n\n');

        // 一块写入
        pass.pipe(this.output);
    }
}
