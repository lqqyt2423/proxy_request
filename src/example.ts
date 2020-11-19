import { FwProxy } from '.';
import { Logger } from './logger';
import { LogViewer } from './viewer';

const logger = new Logger('FwProxy example');

const fwproxy = new FwProxy({ interceptHttps: true, verbose: true });

fwproxy.addViewer(new LogViewer());

// TODO
fwproxy.addInterpolator({});

fwproxy.on('error', err => {
    logger.error(err);
});

fwproxy.on('ready', () => {
    logger.info('ready');
});

fwproxy.start();
