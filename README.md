# Fwproxy

## TODO

- [x] 命令行生成根证书
- [x] to typescript
- [x] request handler 优化
- [ ] HTTP2
- [ ] 解决报错和性能的问题（需要再看下标准库 http,https,tls,net 理解 agent,reusesocket 等相关概念）
- [ ] 中文 README
- [ ] 优化 Logger
- [ ] 生成证书格式跟 mitmproxy 一样
- [ ] 暴露 api
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
