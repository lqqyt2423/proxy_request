import { EventEmitter } from 'events';
import { Logger } from './logger';
import { RequestHandler } from './handler';
import { HttpServer, MitmServer } from './mitm-server';
import { HTTPRecord } from './record';
import { Viewer } from './viewer';
import { Interpolator } from './interpolator';
import { ModifyHandler } from './modify-handler';

interface IFwProxyOptions {
    port?: number;
    interceptHttps?: boolean;
    verbose?: boolean;
}

export declare interface FwProxy {
    on(event: 'ready', listener: () => void): this;
    on(event: 'close', listener: (err?: Error) => void): this;
    on(event: 'record', listener: (record: HTTPRecord) => void): this;
    on(event: string | symbol, listener: (...args: any[]) => void): this;

    emit(event: 'ready'): boolean;
    emit(event: 'close', err?: Error): boolean;
    emit(event: 'record', record: HTTPRecord): boolean;
    emit(event: string | symbol, ...args: any[]): boolean;
}

export class FwProxy extends EventEmitter {
    public verbose: boolean;
    public logger: Logger;
    public port: number;
    public interceptServerPort: number;
    public interceptHttps: boolean;
    public connTimeout: number;

    public requestHandler: RequestHandler;
    public httpServer: HttpServer;
    public mitmServer: MitmServer;

    public modifyHandler: ModifyHandler;

    constructor(options: IFwProxyOptions = {}) {
        super();

        this.verbose = options.verbose || false;
        Logger.silent = !this.verbose;
        this.logger = new Logger('FwProxy');
        this.port = options.port || 7888;

        // 如果这个端口被占用了，先直接报错，后期如果需要再加上额外判断逻辑
        this.interceptServerPort = 7889;
        // 是否强制解析 https
        this.interceptHttps = options.interceptHttps || false;

        // 请求最大时长，超过直接关闭连接，没有使用
        // 所有的超时都用系统自带的 ETIMEDOUT
        this.connTimeout = 1000 * 30;

        this.requestHandler = new RequestHandler(this);
        this.httpServer = new HttpServer(this.port, this.requestHandler, this);

        if (this.interceptHttps) {
            this.mitmServer = new MitmServer(this.interceptServerPort, this.requestHandler, this);
        }

        this.modifyHandler = new ModifyHandler(this);
    }

    public addViewer(viewer: Viewer) {
        this.logger.info('添加 viewer: %s', viewer.name);
        this.on('record', record => {
            viewer.view(record);
        });
    }

    public addInterpolator(interpolator: Interpolator) {
        this.modifyHandler.add(interpolator);
    }

    public removeInterpolator(interpolator: Interpolator): boolean {
        return this.modifyHandler.remove(interpolator);
    }

    public async start() {
        await this.httpServer.start();
        if (this.mitmServer) await this.mitmServer.start();

        this.emit('ready');
    }

    public close() {
        let count = 0;
        let resErr: Error;
        const done = (err?: Error) => {
            if (err) resErr = err;
            if (++count === 2) this.emit('close', resErr);
        };

        this.httpServer.close(done);
        this.mitmServer.close(done);
    }
}
