import Zeroconf from 'react-native-zeroconf';
import TcpSocket from 'react-native-tcp-socket';
import EventEmitter from 'events';
import { p2pService } from './p2pService';
import { webrtcManager } from './webrtcManager';

class SignalingManager extends EventEmitter {
    private zeroconf = new Zeroconf();
    private myId: string = '';
    private server: any;
    private clients: Map<string, any> = new Map();
    private port: number = 45678;
    private readonly BASE_PORT = 45678;
    private readonly MAX_PORT_RETRIES = 5;

    constructor() {
        super();
        this.zeroconf.on('start', () => console.log('[Zeroconf] 已启动'));
        this.zeroconf.on('stop', () => console.log('[Zeroconf] 已停止'));
        this.zeroconf.on('found', (name) => console.log('[Zeroconf] 发现服务:', name));

        this.zeroconf.on('resolved', (service: any) => {
            console.log('[Zeroconf] 解析服务成功:', service);
            this.handleDiscoveredPeer(service);
        });

        this.zeroconf.on('error', (err) => {
            console.log('[Zeroconf] 运行阶段错误(忽略):', err);
            // 不要在此时 scan()，否则会造成无限循环
        });

        p2pService.on('signal', (data) => {
            this.sendSignal(data.to, data);
        });

        // 监听 WebRTC 信号并发送
        webrtcManager.on('signal', (data) => {
            this.sendSignal(data.to, data);
        });
    }

    private handleDiscoveredPeer(service: any) {
        if (service.name && service.name.startsWith('pulsechat_') && service.name !== `pulsechat_${this.myId}`) {
            const peerId = service.name.replace('pulsechat_', '');
            const host = (service.addresses && service.addresses[0]) || service.host;
            const port = service.port;

            if (host && port) {
                console.log('[Zeroconf] 尝试建立信令连接:', peerId, host, port);
                this.connectToPeerSignaling(peerId, host, port);
            }
        }
    }

    private async startServer(retryCount = 0): Promise<void> {
        if (this.server) return;
        const tryPort = this.BASE_PORT + retryCount;

        try {
            await new Promise<void>((resolve, reject) => {
                this.server = TcpSocket.createServer((socket) => {
                    let buffer = '';
                    socket.on('data', (data) => {
                        buffer += data.toString();
                        // 处理可能粘在一起的 JSON 对象
                        let boundary = buffer.lastIndexOf('}');
                        if (boundary === -1) return;

                        const content = buffer.substring(0, boundary + 1);
                        buffer = buffer.substring(boundary + 1);

                        // 简单的分割逻辑：按 } 后的 { 分割
                        const parts = content.split('}{').map((p, i, a) => {
                            if (a.length === 1) return p;
                            if (i === 0) return p + '}';
                            if (i === a.length - 1) return '{' + p;
                            return '{' + p + '}';
                        });

                        parts.forEach(part => {
                            try {
                                const msg = JSON.parse(part);
                                if (msg.type === 'identify') {
                                    this.clients.set(msg.id, socket);
                                    this.emit('peerFound', { id: msg.id, name: msg.name || 'Peer' });
                                    webrtcManager.makeOffer(msg.id);
                                } else {
                                    p2pService.handleSignal(msg.from, msg);
                                }
                            } catch (e) {
                                console.error('[SignalingManager] 分段解析错误:', e, part);
                            }
                        });
                    });
                    socket.on('error', (err) => console.log('[SignalingManager] Socket 错误:', err));
                });

                this.server.on('error', (err: any) => {
                    this.server = null;
                    reject(err);
                });

                this.server.listen({ port: tryPort, host: '0.0.0.0' }, () => {
                    this.port = tryPort;
                    console.log(`[SignalingManager] TCP 信令服务器端口: ${this.port}`);
                    resolve();
                });
            });
        } catch (error) {
            if (retryCount < this.MAX_PORT_RETRIES) {
                return this.startServer(retryCount + 1);
            }
            throw error;
        }
    }

    private connectToPeerSignaling(peerId: string, host: string, port: number) {
        if (this.clients.has(peerId)) return;

        const client = TcpSocket.createConnection({ port, host }, () => {
            client.write(JSON.stringify({ type: 'identify', id: this.myId, name: 'Peer' }));
            this.clients.set(peerId, client);
            this.emit('peerFound', { id: peerId, name: 'Peer' });
            // 被动等待对方发起 Offer 或我主动发起
            webrtcManager.makeOffer(peerId);
        });

        client.on('data', (data) => {
            try {
                const msg = JSON.parse(data.toString());
                webrtcManager.handleSignal(msg.from, msg);
            } catch (e) {
                console.error('[SignalingManager] 客户端解析错误:', e);
            }
        });

        client.on('error', (err) => {
            this.clients.delete(peerId);
        });
    }

    private sendSignal(peerId: string, signal: any) {
        const client = this.clients.get(peerId);
        if (client) {
            client.write(JSON.stringify({ ...signal, from: this.myId }));
        }
    }

    async start(myId: string) {
        this.myId = myId;
        try {
            await this.startServer();
            try {
                this.zeroconf.publishService('http', 'tcp', 'local.', `pulsechat_${myId}`, this.port);
                this.zeroconf.scan('http', 'tcp', 'local.');
            } catch (e) { }
        } catch (error) { }
    }

    stop() {
        try {
            this.zeroconf.stop();
            this.zeroconf.unpublishService(`pulsechat_${this.myId}`);
        } catch (e) { }

        if (this.server) {
            this.server.close();
            this.server = null;
        }

        this.clients.forEach(client => {
            try { client.destroy(); } catch (e) { }
        });
        this.clients.clear();
    }
}

export const signalingManager = new SignalingManager();
