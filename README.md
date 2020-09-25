# Proxy_request

Simple forword proxy http/https server.

## Install

```sh
npm i proxy_request -g
```

## Usage

```sh
proxy_request
```

Direct start a forward proxy listen at 7888 port.

## Help

```sh
proxy_request -h
```

```
Usage: proxy_request [options]

simple forword proxy http/https server

Options:
  -V, --version       output the version number
  --no-verbose        don't show log
  -v --verbose        show verbose log (default: true)
  -p --port <number>  define proxy server port (default: 7888)
  -h, --help          display help for command
```

## As library

```javascript
const Proxy = require('proxy_request');
const proxy = new Proxy({ port: 7888, verbose: true });

proxy.on('error', e => {
  console.error(e);
});

proxy.run((err) => {
  if (err) {
    console.error(err);
    return;
  }

  console.info('proxy started');
});
```

## Test by curl

After start proxy server, then run below commands at a new shell.

```sh
export http_proxy=http://127.0.0.1:7888
export https_proxy=http://127.0.0.1:7888
curl http://www.baidu.com/
curl https://www.baidu.com/
```
