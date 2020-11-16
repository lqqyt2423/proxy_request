import * as http from 'http';
import * as https from 'https';
import * as tls from 'tls';
import * as path from 'path';
import { CA } from '../ca';
import { Logger } from '../logger';

// 思路
// 1. 本地启动一个 https server 用于模拟远端的域名
// 2. 客户端测试前通过修改 /etc/hosts 将 host 关联的 ip 都变成本地
// 3. 客户端发请求时忽略证书校验步骤 或 将此测试服务器的根证书加入信任列表

const logger = new Logger('FwProxy server-for-test');
const ca = new CA(path.join(__dirname, '.fwproxy-server-for-test'));
ca.init();
const content = Buffer.allocUnsafe(1024 * 256).fill('0');

const handler: http.RequestListener = (req, res) => {
    logger.info('%s %s %s %s', req.socket.localPort === 443 ? 'HTTPS' : 'HTTP', req.method, req.url, 200);
    res.end(content);
};

http.createServer(handler).listen(80);

https.createServer({
    SNICallback: async (servername, callback) => {
        try {
            const { pem, privateKey } = await ca.getServer(servername);
            const ctx = tls.createSecureContext({ key: privateKey, cert: pem });
            callback(null, ctx);
        } catch (err) {
            logger.warn('SNICallback error: %s', err.message);
            callback(err, null);
        }
    },
}, handler).listen(443);
