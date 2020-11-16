import * as fs from 'fs';
import * as http from 'http';
import * as https from 'https';
import * as tls from 'tls';
import * as net from 'net';
import * as path from 'path';
import { Logger } from '../logger';
import { SSLTunnelAgent } from '../agent';

// 并行消费

export class TaskRunner {
    private parallel: number;
    private running: number;
    private tasks: Array<(...args: any[]) => Promise<void>>;

    private count: number;
    private finish: number;
    private onFinish: () => void;

    constructor(parallel: number) {
        this.parallel = parallel;
        this.running = 0;
        this.tasks = [];
        this.count = 0;
        this.finish = 0;
    }

    private trigger() {
        if (this.count > 0 && this.count === this.finish) {
            if (this.onFinish) this.onFinish();
            return;
        }

        let runFn: (...args: any[]) => Promise<void>;
        while (this.running < this.parallel && (runFn = this.tasks.shift())) {
            this.running++;
            runFn().finally(() => {
                this.running--;
                this.finish++;
                this.trigger();
            });
        }
    }

    public add(fn: (...args: any[]) => Promise<void>) {
        this.tasks.push(fn);
        this.count++;
        this.trigger();
    }

    public async wait() {
        if (this.count > 0 && this.count === this.finish) return;
        await new Promise(resolve => {
            this.onFinish = resolve;
        });
    }
}

// 仅测试 https 代理

const logger = new Logger('FwProxy client-for-test');

// 如果启动了测试代理服务器，也需要信任此根证书，从环境变量传入
// export NODE_EXTRA_CA_CERTS=pemfilename
// ts-node src/bin/fwproxy.ts -i

const rootCertificates: Array<string|Buffer> = tls.rootCertificates.slice();
const rootCAForDirect = rootCertificates.concat([fs.readFileSync(path.join(__dirname, '.fwproxy-server-for-test', 'root.pem'))]);
const rootCAForProxy = rootCertificates.concat([fs.readFileSync(path.join(process.env.HOME, '.fwproxy', 'root.pem'))]);


// 100个测试域名
// 运行前确认修改了 /etc/hosts
const hostsForTest: Array<string> = [];
for (let i = 1; i <= 100; i++) {
    hostsForTest.push(`www.${i}.com`);
}
// 请求并发
const parallel = 100;
const loop = 10;

const directAgent = new https.Agent({ ca: rootCAForDirect });
const sslTunnelAgent = new SSLTunnelAgent({
    proxyHost: '127.0.0.1',
    proxyPort: 7888,
    tlsOptions: {
        ca: rootCAForProxy,
    }
});

async function request(host: string, agent: http.Agent): Promise<number> {
    return await new Promise((resolve, reject) => {
        let bytes = 0;

        let req: http.ClientRequest;
        if (agent instanceof SSLTunnelAgent) {
            req = http.request({ host, agent });
        } else {
            req = https.request({ host, agent });
        }

        req
            .on('response', (res) => {
                res.on('data', buf => {
                    bytes += Buffer.byteLength(buf);
                });

                res.resume()
                    .on('end', () => {
                        resolve(bytes);
                    });
            })
            .on('error', err => {
                reject(err);
            });
        req.end();
    });
}

// 先第一次跑起来，生成所用的证书
async function warm() {
    await Promise.all(hostsForTest.map(host => request(host, directAgent)));
}

// 100 个 host，每个 host 跑 loop 次
async function benchmark(agent: http.Agent) {
    const beginAt = Date.now();
    let bytes = 0;
    let success = 0;
    let fail = 0;

    const taskRunner = new TaskRunner(parallel);
    for (const host of hostsForTest) {
        for (let i = 0; i < loop; i++) {
            taskRunner.add(async () => {
                await request(host, agent)
                    .then(bs => {
                        success++;
                        bytes += bs;
                    })
                    .catch(() => {
                        fail++;
                    });
            });
        }
    }
    await taskRunner.wait();

    const cost = Date.now() - beginAt;

    // mb/s
    const mb = (bytes / 1024 / 1024).toFixed(2);
    const speed = ((bytes / 1024 / 1024) / (cost / 1000)).toFixed(2);
    logger.info('总耗时: %s ms, 成功: %s, 失败: %s, 总传输: %s mb, 传输速度: %s mb/s', cost, success, fail, mb, speed);
}

async function run() {
    logger.info('单个请求body长度：256 kb');
    logger.info('并发: %s', parallel);

    logger.info('开始热身');
    await warm();

    logger.info('开始 benchmark');

    logger.info('benchmark: 直接请求');
    await benchmark(directAgent);

    logger.info('benchmark: fwproxy 代理请求');
    await benchmark(sslTunnelAgent);
}

run().then(() => {
    logger.info('done');
    process.exit();
}).catch(err => {
    logger.error(err);
    process.exit(1);
});
