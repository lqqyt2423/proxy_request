// 用户发起代理请求

import * as http from 'http';
import * as tls from 'tls';
import * as net from 'net';

interface ISSLTunnelAgentOptions extends http.AgentOptions {
    proxyHost: string;
    proxyPort: number;
    tlsOptions?: tls.ConnectionOptions;
}

// TODO: 可能存在问题
export class SSLTunnelAgent extends http.Agent {
    private proxyHost: string;
    private proxyPort: number;
    private tlsOptions?: tls.ConnectionOptions;

    constructor(opts: ISSLTunnelAgentOptions) {
        super(opts);

        this.proxyHost = opts.proxyHost;
        this.proxyPort = opts.proxyPort;
        this.tlsOptions = opts.tlsOptions;
    }

    createConnection(options: net.TcpNetConnectOpts, callback: (err: Error, socket: net.Socket) => void): net.Socket {
        const hostForConnect = `${options.host}:${options.port || 443}`;
        const req = http.request({
            host: this.proxyHost,
            port: this.proxyPort,
            method: 'CONNECT',
            path: hostForConnect,
            headers: {
                Host: hostForConnect
            },
            agent: false,
        });

        req.on('connect', (res, socket) => {
            if (res.statusCode === 200) {
                const tlsSocket = tls.connect({
                    ...this.tlsOptions,
                    ...options,
                    servername: options.host,
                    socket,
                });
                callback(null, tlsSocket);
            } else {
                callback(new Error('connect error'), null);
            }
        });

        req.end();
        return null;
    }

    getName() {
        return `${this.proxyHost}:${this.proxyPort}`;
    }
}
