import { PassThrough, Readable, Writable } from 'stream';

// 关于 stream pipe 的用法
// 可以同时 pipe 至多个目的地
// 但是当 read end 之后再 pipe 就会失效
// 所以当需要在 end 之后再使用 read stream 时，有两种做法：
//   1. 将之前的 read stream 转为 buffer，后面直接用 buffer
//   2. 将之间的 read stream 通过 PassThrough stream, 后面 read PassThrough stream

{
    // pipe 至多个
    let readStream: Readable;
    let des1: Writable;
    let des2: Writable;

    readStream.on('end', () => {
        //
    });
    des1.on('finish', () => {
        //
    });

    readStream.pipe(des1);
    readStream.pipe(des2);
}

{
    // 1.
    let readStream: Readable;
    const someFn = (buf: any) => {
        //
    };
    const bufs = [];
    readStream.on('data', (buf) => { bufs.push(buf); });
    readStream.on('end', () => {
        someFn(bufs);

        // or
        // 耗费性能，如无必要，直接处理 bufs
        const allBuf = Buffer.concat(bufs);
        someFn(allBuf);
    });
}

{
    // 2.
    let readStream: Readable;
    const pass = new PassThrough();
    readStream.pipe(pass);

    // later
    let destination: Writable;
    pass.pipe(destination);
}

