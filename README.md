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
- [x] 测试
- [x] 解决报错和性能的问题
- [ ] README
- [ ] ipc(unix domain) 或 更加性能高的方案
- [ ] 优化 Logger
- [ ] 暴露 api
- [ ] 兼容 anyproxy api
- [ ] HTTP2
- [ ] 生成证书格式跟 mitmproxy 一样
- [ ] bench
- [ ] web
- [ ] electron
