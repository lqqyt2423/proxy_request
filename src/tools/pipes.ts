import { Duplex, DuplexOptions } from 'stream';
import { Logger } from '../logger';

const logger = new Logger('FwProxy PipeDuplex');

interface Pointer<T> {
    val: T;
}

class PipeDuplex extends Duplex {
    private to: Pointer<Duplex>;

    constructor(to: Pointer<Duplex>, opts?: DuplexOptions) {
        super(opts);
        this.to = to;
    }

    _read() {
        // do nothing
    }

    _write(chunk: any, encoding: BufferEncoding, callback: (error?: Error | null) => void) {
        this.to.val.push(chunk, encoding);
        callback();
    }

    _final(callback: (error?: Error | null) => void) {
        this.to.val.push(null);
        callback();
    }

    _destroy(error: Error | null, callback: (error: Error | null) => void) {
        callback(null);
    }
}

export function createPipes(): [Duplex, Duplex] {
    const pipe1Ptr: Pointer<Duplex> = { val: null };
    const pipe2Ptr: Pointer<Duplex> = { val: null };

    pipe1Ptr.val = new PipeDuplex(pipe2Ptr);
    pipe2Ptr.val = new PipeDuplex(pipe1Ptr);

    return [pipe1Ptr.val, pipe2Ptr.val];
}
