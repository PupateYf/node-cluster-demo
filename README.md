## Introduction
node是单线程的，单独的nodejs进程无法利用多核，为了能充分利用服务器的多核cpu，可以使用cluster模块开启多进程

## cluster
多进程中，分为master主控进程和worker子进程

其中master主控进程负责启动worker子进程
```js
var cluster = require('cluster')
var os = require('os')
var http = require('http')

const cpuLength = os.cpus().length
if (cluster.isMaster) {
    for(let i = 0; i < cpuLength; i++){
        cluster.fork()
    }
} else {
    http.createServer((req,res) => {
        res.writeHead(200)
        res.end('Hey guys')
    }).listen(8080)
}
```

## 负载均衡

The first one (and the default one on all platforms except Windows), is the round-robin approach, where the master process listens on a port, accepts new connections and distributes them across the workers in a round-robin fashion, with some built-in smarts to avoid overloading a worker process.

第一种方式round-robin，当前默认的负载均衡模式是round-robin(除Windows),master主控进程负责监听端口，接收到新的连接后通过round-robin内置的策略（能避免某个worker进程超负荷，也即确保worker之间负责的运算等能够相对均衡）分发给workers

The second approach is where the master process creates the listen socket and sends it to interested workers. The workers then accept incoming connections directly.

The second approach should, in theory, give the best performance. In practice however, distribution tends to be very unbalanced due to operating system scheduler vagaries. Loads have been observed where over 70% of all connections ended up in just two processes, out of a total of eight.

第二种方式是master主控进程创建一个监听socket并将它发给某几个workers，理论上，这种方式在性能表现上更好。而实际上，这种分发机制对于进程的负载是很不均衡的，这是由于操作系统时间片是经常变动的。据观察，70%的连接通常只会被两个进程所处理而此时全局总共有8个进程在运行。