import Zeroconf from 'react-native-zeroconf';
import TcpSocket from 'react-native-tcp-socket';
import EventEmitter from 'events';
import { p2pService } from './p2pService';
import { webrtcManager } from './webrtcManager';

class SignalingManager extends EventEmitter {
    private zeroconf = new Zeroconf();
    private myId: string = '';
    private myName: string = '';
    private server: any;
    private clients: Map<string, any> = new Map();
    private clientStatus: Map<string, 'connecting' | 'connected' | 'disconnected'> = new Map();
    private heartbeats: Map<string, number> = new Map();
    private heartbeatInterval: any = null;
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

        // 防止未监听 error 事件导致的 crash
        this.on('error', () => { });
    }

    private handleDiscoveredPeer(service: any) {
        if (service.name && service.name.startsWith('pulsechat_')) {
            // 鲁棒性提取：ID 是 32 位 Hex 字符串，后面可能有 (2) 等 Zeroconf 自动添加的后缀
            const match = service.name.match(/pulsechat_([0-9a-f]{32})/);
            if (!match) return;
            const peerId = match[1];

            if (peerId === this.myId) return;

            // 提取地址：优先使用 IPv4 地址
            const host = (service.addresses && service.addresses.find((a: string) => a.includes('.') && !a.startsWith('127.')))
                || (service.addresses && service.addresses[0])
                || service.host;
            const port = service.port;

            if (!host || !port) return;

            // 仲裁机制：只有 ID 较小的节点负责发起主动连接
            if (this.myId < peerId) {
                // 如果已经有连接且状态不是 disconnected，则跳过
                const currentStatus = this.clientStatus.get(peerId);
                if (currentStatus === 'connected' || currentStatus === 'connecting') {
                    console.log(`[SignalingManager] 节点 ${peerId} 已有连接状态 ${currentStatus}，跳过主动握手`);
                    return;
                }

                console.log('[Zeroconf] 我是发起方，尝试建立信令连接:', peerId, host, port);
                this.connectToPeerSignaling(peerId, host, port);
            } else {
                console.log('[Zeroconf] 我是接收方，记录发现的节点信息并等待:', peerId, host);
                // 虽然是接收方，但也记录下状态，方便 UI 显示“连接中”
                if (!this.clientStatus.has(peerId)) {
                    this.clientStatus.set(peerId, 'connecting');
                    this.emit('statusChange', { peerId, status: 'connecting' });
                }
            }

            // 无论身份，只要发现就通知 UI (用于更新列表)
            const defaultName = `Node-${peerId.substring(peerId.length - 8)}`;
            // 绝不直接使用 service.name (pulsechat_XXXX)，因为它不是易读的用户名
            this.emit('peerFound', { id: peerId, name: defaultName });
            if (!this.discoveredPeerIds.has(peerId)) {
                this.discoveredPeerIds.add(peerId);
            }
        }
    }

    /**
     * 手动触发重新扫描
     */
    public scanPeers() {
        console.log('[SignalingManager] 主动触发局域网扫描...');
        try {
            this.zeroconf.stop();
            setTimeout(() => {
                this.zeroconf.scan('http', 'tcp', 'local.');
            }, 500);
        } catch (e) {
            console.error('[SignalingManager] 扫描触发失败:', e);
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
                                    this.clientStatus.set(msg.id, 'connected');
                                    this.emit('statusChange', { peerId: msg.id, status: 'connected' });

                                    // 服务器端向客户端回发 identify，告诉对方自己的身份
                                    socket.write(JSON.stringify({ type: 'identify', id: this.myId, name: this.myName }));

                                    if (!this.discoveredPeerIds.has(msg.id)) {
                                        this.discoveredPeerIds.add(msg.id);
                                        const defaultName = `Node-${msg.id.substring(msg.id.length - 8)}`;
                                        this.emit('peerFound', { id: msg.id, name: msg.name || defaultName });
                                    } else {
                                        // 如果已经发现过，但这次带了名字，也更新一下
                                        const defaultName = `Node-${msg.id.substring(msg.id.length - 8)}`;
                                        this.emit('peerFound', { id: msg.id, name: msg.name || defaultName });
                                    }
                                    // 服务器端在收到身份后，不主动发 offer，等待对方发
                                } else if (msg.type === 'ping') {
                                    this.heartbeats.set(msg.id || msg.from, Date.now());
                                    socket.write(JSON.stringify({ type: 'pong', id: this.myId }));
                                } else if (msg.type === 'pong') {
                                    this.heartbeats.set(msg.id || msg.from, Date.now());
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
                    socket.on('close', () => {
                        this.clients.forEach((val, key) => {
                            if (val === socket) {
                                this.clients.delete(key);
                                this.clientStatus.set(key, 'disconnected');
                                this.emit('statusChange', { peerId: key, status: 'disconnected' });
                            }
                        });
                    });
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
        // 如果已经有这个节点的连接，先物理销毁它，迎接新连接
        if (this.clients.has(peerId)) {
            console.log(`[SignalingManager] 销毁存量连接以备重连: ${peerId}`);
            const oldClient = this.clients.get(peerId);
            try { oldClient.destroy(); } catch (e) { }
            this.clients.delete(peerId);
        }

        const client = TcpSocket.createConnection({ port, host }, () => {
            // 如果已经有这个节点的连接，先关闭旧的
            if (this.clients.has(peerId)) {
                const oldSocket = this.clients.get(peerId);
                try { oldSocket.destroy(); } catch (e) { }
            }

            client.write(JSON.stringify({ type: 'identify', id: this.myId, name: this.myName }));
            this.clients.set(peerId, client);
            this.clientStatus.set(peerId, 'connected');
            this.heartbeats.set(peerId, Date.now());
            this.emit('statusChange', { peerId, status: 'connected' });
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
                    if (msg.type === 'identify') {
                        // 客户端收到服务器的身份，更新名称
                        this.emit('peerFound', { id: msg.id, name: msg.name });
                        this.heartbeats.set(msg.id, Date.now());
                    } else if (msg.type === 'ping') {
                        this.heartbeats.set(msg.id || msg.from, Date.now());
                        client.write(JSON.stringify({ type: 'pong', id: this.myId }));
                    } else if (msg.type === 'pong') {
                        this.heartbeats.set(msg.id || msg.from, Date.now());
                    } else if (['offer', 'answer', 'candidate'].includes(msg.type)) {
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
            console.log(`[SignalingManager] 与 ${peerId} 连接错误:`, err.message);
            this.clients.delete(peerId);
            this.clientStatus.set(peerId, 'disconnected');
            this.emit('statusChange', { peerId, status: 'disconnected' });
        });

        client.on('close', () => {
            console.log(`[SignalingManager] 与 ${peerId} 连接关闭`);
            this.clients.delete(peerId);
            this.clientStatus.set(peerId, 'disconnected');
            this.emit('statusChange', { peerId, status: 'disconnected' });
        });
    }

    getConnectionStatus(peerId: string) {
        return this.clientStatus.get(peerId) || 'disconnected';
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

    async start(myId: string, myName: string = '') {
        this.myId = myId;
        this.myName = myName;
        this.discoveredPeerIds.clear();

        // 启动心跳检查
        if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
        this.heartbeatInterval = setInterval(() => {
            const now = Date.now();
            this.clients.forEach((client, peerId) => {
                // 发送 Ping
                try {
                    client.write(JSON.stringify({ type: 'ping', from: this.myId }));
                } catch (e) { }

                // 检查超时 (10秒没心跳则断开)
                const last = this.heartbeats.get(peerId) || 0;
                if (now - last > 10000) {
                    console.log(`[SignalingManager] 与 ${peerId} 心跳超时，关闭连接`);
                    try { client.destroy(); } catch (e) { }
                    this.clients.delete(peerId);
                    this.clientStatus.set(peerId, 'disconnected');
                    this.emit('statusChange', { peerId, status: 'disconnected' });
                }
            });
        }, 4000);

        try {
            await this.startServer();
            try {
                this.zeroconf.publishService('http', 'tcp', 'local.', `pulsechat_${myId}`, this.port);
                this.zeroconf.scan('http', 'tcp', 'local.');
            } catch (e) { }
        } catch (error) { }
    }

    stop() {
        if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
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
