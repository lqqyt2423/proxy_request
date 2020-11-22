#!/usr/bin/env node

import { program } from 'commander';
import { Logger } from '../logger';
import { FwProxy } from '../';
import { ca } from '../ca';
import { LogViewer } from '../viewer';
import { SimpleInterpolator } from '../interpolator';

const pkg = require('../../package.json');

const logger = new Logger('FwProxy cmd');

program
    .version(pkg.version)
    .description(pkg.description)
    .option('-s --silent', 'don\'t show verbose log', false)
    .option('-v --verbose', 'show verbose log', true)
    .option('-p --port <number>', 'define proxy server port', '7888')
    .option('-i --intercept', 'intercept(decrypt) https requests', false)
    .option('--genRootCA', 'generate root certificate', false)
    .parse();

const { silent, verbose, port, intercept, genRootCA } = program;

if (genRootCA) {
    ca.init()
        .then(resp => {
            if (!resp.generate) {
                logger.show('根证书已存在: %s', resp.pemFilename);
            }
        });
}

else {
    const showLog = silent ? false : verbose;
    const fwproxy = new FwProxy({ port: parseInt(port), verbose: showLog, interceptHttps: intercept });

    fwproxy.on('error', err => {
        logger.error(err);
    });

    fwproxy.on('ready', () => {
        logger.show('fwproxy is ready');
    });

    fwproxy.addViewer(new LogViewer());
    fwproxy.addInterpolator(new SimpleInterpolator());

    fwproxy.start();
}
