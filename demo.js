const http = require('http')
const os = require('os')
const cluster = require('cluster')

var cpusLength = os.cpus().length

if (cluster.isMaster) {
    for (let i = 0; i < cpusLength; i++) {
        cluster.fork()
    }
} else {
    console.log(`Run here`)
    http.createServer((req, res) => {
        res.writeHead(200)
        res.end('Hey guys')
        console.log(`worker id is ${cluster.worker.id}`)
    }).listen(3333)
}