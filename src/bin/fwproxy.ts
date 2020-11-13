#!/usr/bin/env node

import { program } from 'commander';
import { Logger } from '../logger';
import { FwProxy } from '../';
import { ca } from '../ca';

const pkg = require('../../package.json');

const logger = new Logger('FwProxy cmd');

program
    .version(pkg.version)
    .description(pkg.description)
    .option('--no-verbose', 'don\'t show log')
    .option('-v --verbose', 'show verbose log', true)
    .option('-p --port <number>', 'define proxy server port', '7888')
    .option('-i --intercept', 'intercept(decrypt) https requests', false)
    .option('--genRootCA', 'generate root certificate', false)
    .parse();

const { verbose, port, intercept, genRootCA } = program;

if (genRootCA) {
    ca.init()
        .then(resp => {
            if (!resp.generate) {
                logger.show('根证书已存在: %s', resp.pemFilename);
            }
        });
}

else {
    const fwproxy = new FwProxy({ port: parseInt(port), verbose, interceptHttps: intercept });

    fwproxy.on('error', err => {
        logger.error(err);
    });

    fwproxy.on('ready', () => {
        logger.show('fwproxy is ready');
    });

    fwproxy.start();
}
