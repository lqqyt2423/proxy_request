# Fwproxy

HTTP/HTTPS 代理服务，监测、篡改请求。

## 特点/关键词

- Node.js
- 性能高
- 中间人攻击

## 安装

暂未发布

```sh
npm i fwproxy -g
```

## 使用

参考 `src/bin/fwproxy.ts`

## 通过 curl 测试

启动此服务后，运行：

```sh
export http_proxy=http://127.0.0.1:7888
export https_proxy=http://127.0.0.1:7888
curl http://www.baidu.com/
curl https://www.baidu.com/
```

## TODO

- [x] 命令行生成根证书
- [x] to typescript
- [x] request handler 优化
- [x] 解决报错和性能的问题
- [x] 优化 Logger
- [x] 进程内通信，非 TCP 或 IPC
- [x] 测试
- [x] 暴露 api
- [ ] 解析头部 content-encoding
- [ ] content-length, Transfer-Encoding: chunked 等常见错误预防
- [ ] Agent
- [ ] README
- [ ] 兼容 anyproxy api
- [ ] HTTP2
- [ ] 生成证书格式跟 mitmproxy 一样
- [ ] bench
- [ ] web
- [ ] electron

## 和 anyproxy 对比

性能提升是毋庸置疑的，为什么呢？

anyproxy 代理 https 请求时，会为每个不同的域名创建一个单独的 https server 用于中间人攻击。一般情况下，当代理服务器运行时，肯定会创建很多 https server，中间带来的性能损失和资源占用肯定是不断扩大的，且这些资源（占用的端口、内存）并不能得到释放，将一直存在于进程中，直至进程退出或重启。

此 fwproxy 呢？

仅会在一开始创建一个 https server 用于中间人攻击，通过`服务器名称指示（server name indication, SNI）`技术。资源占用少。当新的域名请求过来时，并不需要新启动 https server，性能肯定会有所提升。

且此服务器并不会通过跨进程的 tcp 或 ipc 等方式沟通，而是在进程内部模拟发出请求，所有数据都是在同一进程内，所以性能肯定是有所提升的。
