import { EventEmitter } from 'events';
import { Logger } from './logger';
import { RequestHandler } from './handler';
import { HttpServer, MitmServer } from './mitm-server';

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
    }

    public async start() {
        await this.httpServer.start();
        if (this.mitmServer) await this.mitmServer.start();

        this.emit('ready');
    }
}
