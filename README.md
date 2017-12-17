## Introduction

线程是cpu调度的一个基本单位，一个cpu同时只能执行一个线程的任务，同样一个线程任务也只能在一个cpu上执行

单独的nodejs实例运行在单一的线程中，而无法利用多核，为了能充分利用服务器的多核cpu，可以使用cluster模块开启多进程

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

## 重启进程

```js
cluster.on('exit', (worker, code, signal) => {
  console.log('worker %d died (%s). restarting...',
              worker.process.pid, signal || code);
  cluster.fork();
})
```

## 负载均衡

The first one (and the default one on all platforms except Windows), is the round-robin approach, where the master process listens on a port, accepts new connections and distributes them across the workers in a round-robin fashion, with some built-in smarts to avoid overloading a worker process.

第一种方式round-robin，当前默认的负载均衡模式是round-robin(除Windows),master主控进程负责监听端口，接收到新的连接后通过round-robin内置的策略（能避免某个worker进程超负荷，也即确保worker之间负责的运算等能够相对均衡）分发给workers

The second approach is where the master process creates the listen socket and sends it to interested workers. The workers then accept incoming connections directly.

The second approach should, in theory, give the best performance. In practice however, distribution tends to be very unbalanced due to operating system scheduler vagaries. Loads have been observed where over 70% of all connections ended up in just two processes, out of a total of eight.

第二种方式是master主控进程创建一个监听socket并将它发给某几个workers，理论上，这种方式在性能表现上更好。而实际上，这种分发机制对于进程的负载是很不均衡的，这是由于操作系统时间片是经常变动的。据观察，70%的连接通常只会被两个进程所处理而此时全局总共有8个进程在运行。

## 主控进程与子进程之间的区别

由于`server.listen()`将大量的工作交给了主控进程，所以以下三项导致了子进程有别于普通进程
- `server.listen({fd: 7})` 由于这个消息传递给了主控进程，文件描述符7 将会在父进程中被监听，而句柄将交给worker进程。而不是父进程去监听worker进程关于文件描述符7的引用所产生的消息。
- `server.listen(handle)` 监听handle(object类型,可以是server,socket或者是拥有fd属性的object)会令到worker直接使用该handle而不是去告知主控进程
- `server.listen(0)` 一般情况下，这会使得server监听一个随机的端口。然而，在一个子进程中，每个worker每当他们执行listen(0)将会接收到同一个随机端口号。本质上来说，这个端口号在第一次调用listen(0)时候确实是随机的，但在之后都是固定的同一个(端口仅由master进程中的内部TCP服务器监听了一次)。如果要每个worker监听唯一的端口号，那么就应该以worker id的纬度来生成并监听端口号。

## cluster & child_process

在`node/lib/internal/cluster/master.js`中可以看到
```js
const { fork } = require('child_process');
//...

function createWorkerProcess(){
  //...
  return fork({
    //...
  })
}
```
可以发现 cluster 是引用了`child_process`模块，每个worker都是使用`child_process.fork()`函数创建的。因此worker与master之间通过IPC进行通信。

## 关于`app.listen(port)`

代码中每个cluster都监听了同一个端口，但没有报端口错误。

`app.listen`方法定义在`node/lib/net.js`中
```js
Server.prototype.listen = function(...args) {
    //...
    listenInCluster()
}

function listenInCluster(){
    //...
    cluster._getServer()
}
```
在`node/lib/internal/cluster/child.js`中，定义了`cluster._getServer`方法
```js
cluster._getServer = function(){
    //...
    rr()
}

function rr(){
    function listen(){
        return 0
    }
    const handle = { listen }
    handles[key] = handle
}
```
可以发现，`listen`方法被重写，不再执行监听端口的操作

参照这里的[说法](https://cnodejs.org/topic/56e84480833b7c8a0492e20c)
- 端口仅由master进程中的内部TCP服务器监听了一次
- 不会出现端口被重复监听报错，是由于，worker进程中，最后执行监听端口操作的方法，已被cluster模块主动hack
## 关于master主控进程传递请求到worker进程

通过监听master中创建的TCP服务器`connection`事件，由`round-robin`选出worker，向其发送`newconn`事件，worker监听该事件，用接收到的cb处理该请求并返回

 `newconn`事件在`node/lib/internal/cluster/round_robin_handle.js`中发布
 
```js
RoundRobinHandle.prototype.handoff = function(worker) {
    const message = { act: 'newconn', key: this.key }
    sendHelper(worker.process, message, handle, (reply) => {
        //...
    })
}
```

在`node/lib/internal/cluster/child.js`中被捕获

```js
cluster._setupWorker = function() {
    function onmessage(message, handle) {
        if (message.act === 'newconn')
        onconnection(message, handle);
        //...
  }
}
```
## IPC
进度程间的通讯(IPC (Inter-process communication)
- 数据传输：一个进程需要将它的数据发送给另一个进程，发送的数据量在一个字节到几M字节之间
- 共享数据：多个进程想要操作共享数据，一个进程对共享数据的修改，别的进程应该立刻看到。
- 通知事件：一个进程需要向另一个或一组进程发送消息，通知它（它们）发生了某种事件（如进程终止时要通知父进程）。
- 资源共享：多个进程之间共享同样的资源。为了作到这一点，需要内核提供锁和同步机制。
- 进程控制：有些进程希望完全控制另一个进程的执行（如Debug进程），此时控制进程希望能够拦截另一个进程的所有陷入和异常，并能够及时知道它的状态改变。