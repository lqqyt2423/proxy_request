# Fwproxy

## TODO

- [ ] 中文 README
- [ ] 优化 Logger
- [x] 命令行生成根证书
- [ ] 生成证书格式跟 mitmproxy 一样
- [ ] request handler 优化
- [ ] 暴露 api
- [ ] to typescript
- [ ] 测试
- [ ] bench
- [ ] web
- [ ] electron

Simple forword http/https proxy server.

## Install

```sh
npm i fwproxy -g
```

## Usage

```sh
fwproxy
```

Direct start a forward proxy listen at 7888 port.

## Help

```sh
fwproxy -h
```

```
Usage: fwproxy [options]

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
const Proxy = require('fwproxy');
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
