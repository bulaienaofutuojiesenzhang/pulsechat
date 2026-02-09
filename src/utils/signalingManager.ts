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
    private discoveredPeerIds: Set<string> = new Set();

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
        if (service.name && service.name.startsWith('pulsechat_')) {
            // 鲁棒性提取：ID 是 32 位 Hex 字符串，后面可能有 (2) 等 Zeroconf 自动添加的后缀
            const match = service.name.match(/pulsechat_([0-9a-f]{32})/);
            if (!match) return;
            const peerId = match[1];

            if (peerId === this.myId) return;

            // 仲裁机制：只有 ID 较小的节点负责发起主动连接
            if (this.myId < peerId) {
                const host = (service.addresses && service.addresses[0]) || service.host;
                const port = service.port;

                if (host && port) {
                    console.log('[Zeroconf] 我是发起方，尝试建立信令连接:', peerId, host, port);
                    this.connectToPeerSignaling(peerId, host, port);
                }
            } else {
                console.log('[Zeroconf] 我是接收方，等待对方连接:', peerId);
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
                                    if (!this.discoveredPeerIds.has(msg.id)) {
                                        this.discoveredPeerIds.add(msg.id);
                                        const defaultName = `Node-${msg.id.substring(msg.id.length - 8)}`;
                                        this.emit('peerFound', { id: msg.id, name: msg.name || defaultName });
                                    }
                                    // 服务器端在收到身份后，不主动发 offer，等待对方发
                                } else if (['offer', 'answer', 'candidate'].includes(msg.type)) {
                                    webrtcManager.handleSignal(msg.from, msg);
                                } else {
                                    p2pService.receivePayload(msg.from, msg);
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
            const myDefaultName = `Node-${this.myId.substring(this.myId.length - 8)}`;
            client.write(JSON.stringify({ type: 'identify', id: this.myId, name: myDefaultName }));
            this.clients.set(peerId, client);
            if (!this.discoveredPeerIds.has(peerId)) {
                this.discoveredPeerIds.add(peerId);
                const defaultName = `Node-${peerId.substring(peerId.length - 8)}`;
                this.emit('peerFound', { id: peerId, name: defaultName });
            }
            // 被动等待对方发起 Offer 或我主动发起
            webrtcManager.makeOffer(peerId);
        });

        let buffer = '';
        client.on('data', (data) => {
            buffer += data.toString();
            let boundary = buffer.lastIndexOf('}');
            if (boundary === -1) return;
            const content = buffer.substring(0, boundary + 1);
            buffer = buffer.substring(boundary + 1);
            const parts = content.split('}{').map((p, i, a) => {
                if (a.length === 1) return p;
                if (i === 0) return p + '}';
                if (i === a.length - 1) return '{' + p;
                return '{' + p + '}';
            });

            parts.forEach(part => {
                try {
                    const msg = JSON.parse(part);
                    if (['offer', 'answer', 'candidate'].includes(msg.type)) {
                        webrtcManager.handleSignal(msg.from, msg);
                    } else {
                        p2pService.receivePayload(msg.from, msg);
                    }
                } catch (e) {
                    console.error('[SignalingManager] 客户端分段解析错误:', e);
                }
            });
        });

        client.on('error', (err) => {
            this.clients.delete(peerId);
        });
    }

    private sendSignal(peerId: string, signal: any) {
        const client = this.clients.get(peerId);
        if (client) {
            console.log(`[SignalingManager] 通过 TCP 发送数据给 ${peerId}:`, signal.type);
            client.write(JSON.stringify({ ...signal, from: this.myId }));
        } else {
            console.log(`[SignalingManager] 发送失败: 找不到节点 ${peerId} 的 TCP 连接`);
            this.emit('error', { type: 'CONNECTION_FAILED', peerId });
        }
    }

    async start(myId: string) {
        this.myId = myId;
        this.discoveredPeerIds.clear();
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
        this.discoveredPeerIds.clear();
    }
}

export const signalingManager = new SignalingManager();
