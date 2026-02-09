import Zeroconf from 'react-native-zeroconf';
import TcpSocket from 'react-native-tcp-socket';
import EventEmitter from 'events';
import { p2pService } from './p2pService';

class SignalingManager extends EventEmitter {
    private zeroconf = new Zeroconf();
    private myId: string = '';
    private server: any;
    private clients: Map<string, any> = new Map();
    private port: number = 45678; // 使用不常用端口
    private readonly BASE_PORT = 45678;
    private readonly MAX_PORT_RETRIES = 5;

    constructor() {
        super();
        this.zeroconf.on('start', () => console.log('[Zeroconf] 已启动'));
        this.zeroconf.on('stop', () => console.log('[Zeroconf] 已停止'));
        this.zeroconf.on('error', (err) => {
            console.log('[Zeroconf] 错误:', err);
            // Zeroconf 错误不影响手动连接功能
        });
        this.zeroconf.on('found', (name) => console.log('[Zeroconf] 发现服务:', name));
        this.zeroconf.on('resolved', (service: any) => {
            console.log('[Zeroconf] 解析服务:', service);
            if (service.name && service.name.startsWith('pulsechat_') && service.name !== `pulsechat_${this.myId}`) {
                const peerId = service.name.replace('pulsechat_', '');
                const host = service.addresses && service.addresses[0];
                const port = service.port;
                if (host && port) {
                    console.log('[Zeroconf] 连接到节点:', peerId, host, port);
                    this.connectToPeerSignaling(peerId, host, port);
                }
            }
        });

        p2pService.on('signal', (data) => {
            this.sendSignal(data.to, data);
        });
    }

    private async startServer(retryCount = 0): Promise<void> {
        if (this.server) return;

        const tryPort = this.BASE_PORT + retryCount;

        try {
            await new Promise<void>((resolve, reject) => {
                this.server = TcpSocket.createServer((socket) => {
                    socket.on('data', (data) => {
                        try {
                            const msg = JSON.parse(data.toString());
                            if (msg.type === 'identify') {
                                this.clients.set(msg.id, socket);
                                this.emit('peerFound', { id: msg.id, name: msg.name || 'Peer' });
                            } else {
                                p2pService.handleSignal(msg.from, msg);
                            }
                        } catch (e) {
                            console.error('[SignalingManager] 解析消息错误:', e);
                        }
                    });
                    socket.on('error', (err) => console.log('[SignalingManager] Socket 错误:', err));
                });

                this.server.on('error', (err: any) => {
                    console.log(`[SignalingManager] 端口 ${tryPort} 启动失败:`, err);
                    this.server = null;
                    reject(err);
                });

                this.server.listen({ port: tryPort, host: '0.0.0.0' }, () => {
                    this.port = tryPort;
                    console.log(`[SignalingManager] TCP 服务器已启动,端口: ${this.port}`);
                    resolve();
                });
            });
        } catch (error) {
            // 端口被占用,尝试下一个端口
            if (retryCount < this.MAX_PORT_RETRIES) {
                console.log(`[SignalingManager] 尝试备用端口 ${this.BASE_PORT + retryCount + 1}`);
                return this.startServer(retryCount + 1);
            } else {
                console.error('[SignalingManager] 所有端口都被占用,TCP 服务器启动失败');
                throw error;
            }
        }
    }

    private connectToPeerSignaling(peerId: string, host: string, port: number) {
        if (this.clients.has(peerId)) return;

        const client = TcpSocket.createConnection({ port, host }, () => {
            client.write(JSON.stringify({ type: 'identify', id: this.myId, name: 'Peer' }));
            this.clients.set(peerId, client);
            this.emit('peerFound', { id: peerId, name: 'Peer' });
        });

        client.on('data', (data) => {
            try {
                const msg = JSON.parse(data.toString());
                p2pService.handleSignal(msg.from, msg);
            } catch (e) {
                console.error('[SignalingManager] 客户端解析错误:', e);
            }
        });

        client.on('error', (err) => {
            console.log('[SignalingManager] 客户端连接错误:', peerId, err);
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
        console.log('[SignalingManager] 启动,ID:', myId);

        try {
            await this.startServer();

            // 尝试发布 Zeroconf 服务(可选,失败不影响手动连接)
            try {
                this.zeroconf.publishService('http', 'tcp', 'local.', `pulsechat_${myId}`, this.port);
                console.log('[SignalingManager] 发布服务: pulsechat_' + myId);
                this.zeroconf.scan('http', 'tcp', 'local.');
                console.log('[SignalingManager] 开始扫描节点');
            } catch (zeroconfError) {
                console.warn('[SignalingManager] Zeroconf 启动失败(不影响手动连接):', zeroconfError);
            }
        } catch (error) {
            console.error('[SignalingManager] 启动失败:', error);
            throw error;
        }
    }

    stop() {
        try {
            this.zeroconf.stop();
            this.zeroconf.unpublishService(`pulsechat_${this.myId}`);
        } catch (e) {
            console.warn('[SignalingManager] Zeroconf 停止失败:', e);
        }

        if (this.server) {
            this.server.close();
            this.server = null;
        }

        this.clients.forEach(client => {
            try {
                client.destroy();
            } catch (e) {
                console.warn('[SignalingManager] 关闭客户端连接失败:', e);
            }
        });
        this.clients.clear();
    }
}

export const signalingManager = new SignalingManager();
