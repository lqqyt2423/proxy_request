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
- [ ] 测试
- [ ] Interpolator
- [ ] Agent
- [ ] README
- [ ] ipc(unix domain) 或 更加性能高的方案
- [ ] 暴露 api
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

现在这一版本，仅会在一开始创建一个 https server 用于中间人攻击，通过`服务器名称指示（server name indication, SNI）`技术。资源占用少。当新的域名请求过来时，并不需要新启动 https server，性能肯定会有所提升。

下一步的优化点？

其实这个用于中间人攻击的服务并不用真正的监听某一个端口。因为代理的转发和中间人攻击所处与同一进程，所以当代理请求来临时，请求流数据直接在进程内处理解析拦截等，无需通过 socket 或 ipc 等跨进程方式沟通，那性能肯定会有所提升。

如何实现呢？实现一个 mock 的 https server，当请求至中间人攻击环节时，mock 一个 socket 进行下一步的操作。
