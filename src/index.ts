import { EventEmitter } from 'events';
import { Logger } from './logger';
import { RequestHandler } from './handler';
import { HttpServer, MitmServer } from './mitm-server';
import { HTTPRecord } from './record';

interface IFwProxyOptions {
    port?: number;
    interceptHttps?: boolean;
    verbose?: boolean;
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

    // 存在此方法时，需要记录请求体和返回体，用于用户查看
    // 以后如果接入 web 或提供修改 body 的 api，则应该需要此方法
    // 通过 onRecord 方法注册此方法
    public emitRecordFn: (record: HTTPRecord) => void;

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

        this.emitRecordFn = null;
    }

    // 用户调用，仅能调用一次，用于注册一个回调方法，每次一个请求完成后调用此回调方法
    // 注意用户需要自己管理请求流和响应流，一定确认使用或释放，避免内存泄漏
    public onRecord(callback: (record: HTTPRecord) => void) {
        if (this.emitRecordFn) throw new Error('onRecord方法仅能调用一次');

        this.emitRecordFn = callback;
        this.logger.show('已开启 HTTP/HTTPS 请求监听');
    }

    public async start() {
        await this.httpServer.start();
        if (this.mitmServer) await this.mitmServer.start();

        this.emit('ready');
    }
}
