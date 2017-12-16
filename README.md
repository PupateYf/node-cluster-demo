# node-cluster-demo
demo of ndoe cluster usage

## Introduction
node是单线程的，单独的nodejs进程无法利用多核，为了能充分利用服务器的多核cpu，可以使用cluster模块开启多进程

## 多进程
多进程中，分为master主控进程和worker子进程

其中master主控进程负责启动worker子进程
