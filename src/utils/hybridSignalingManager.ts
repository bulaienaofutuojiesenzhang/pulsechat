import EventEmitter from 'events';
import { signalingManager } from './signalingManager';
import { internetSignalingManager } from './internetSignalingManager';
import { webrtcManager } from './webrtcManager';
import { p2pService } from './p2pService';
import { COMMUNICATION_MODE } from '../config';

type CommunicationMode = typeof COMMUNICATION_MODE[keyof typeof COMMUNICATION_MODE];

/**
 * 混合信令协调器
 * 智能选择局域网或互联网通信模式
 */
class HybridSignalingManager extends EventEmitter {
    private currentMode: CommunicationMode = COMMUNICATION_MODE.LAN;
    private myUserId: string = '';
    private myName: string = '';
    private isStarted: boolean = false;
    private peerChannelPreference: Map<string, CommunicationMode> = new Map();

    constructor() {
        super();
        // 添加空监听器防止未捕获的 error 事件引发 Unhandled error 报错
        this.on('error', () => { });
        this.setupEventForwarding();
    }

    /**
     * 启动混合信令服务
     */
    async start(userId: string, userName: string = ''): Promise<void> {
        this.myUserId = userId;
        this.myName = userName;
        this.isStarted = true;

        console.log('[HybridSignaling] 启动混合信令服务');

        // 1. 优先启动局域网模式
        try {
            await signalingManager.start(userId, userName);
            this.currentMode = COMMUNICATION_MODE.LAN;
            console.log('[HybridSignaling] 局域网模式已启动');
        } catch (error) {
            console.warn('[HybridSignaling] 局域网模式启动失败:', error);
        }

        // 2. 同时启动互联网模式作为备份
        try {
            await internetSignalingManager.start(userId);
            console.log('[HybridSignaling] 互联网模式已启动');

            // 请求在线用户列表
            setTimeout(() => {
                internetSignalingManager.getOnlineUsers();
            }, 1000);
        } catch (error) {
            console.warn('[HybridSignaling] 互联网模式启动失败:', error);
        }
    }

    /**
     * 停止服务
     */
    stop(): void {
        this.isStarted = false;
        signalingManager.stop();
        internetSignalingManager.stop();
        console.log('[HybridSignaling] 已停止所有信令服务');
    }

    /**
     * 发送信令
     * 优先使用局域网,失败时降级到互联网
     */
    sendSignal(peerId: string, signal: any): void {
        // 获取该节点的首选模式 (基于之前的交互)
        const preferredMode = this.peerChannelPreference.get(peerId);
        const lanStatus = signalingManager.getConnectionStatus(peerId);
        const internetReady = internetSignalingManager.isReady();

        // 策略 1: 如果首选是互联网，且互联网就绪，直接走互联网 (避免等待局域网超时)
        if (preferredMode === COMMUNICATION_MODE.INTERNET && internetReady) {
            console.log(`[HybridSignaling] 为节点 ${peerId} 优先选择互联网通道 (行为偏好)`);
            internetSignalingManager.sendSignal(peerId, signal);
            return;
        }

        // 策略 2: 优先尝试局域网 (默认为局域网，除非明确偏好互联网)
        if (lanStatus === 'connected') {
            console.log(`[HybridSignaling] 使用局域网发送信令给 ${peerId}`);
            signalingManager['sendSignal'](peerId, signal);
            return;
        }

        // 策略 3: 降级到互联网
        if (internetReady) {
            console.log(`[HybridSignaling] 使用互联网发送信令给 ${peerId}`);

            // 启发式发现：如果我们被迫使用互联网发信令，说明局域网暂不可用
            if (lanStatus === 'disconnected') {
                this.throttleDiscovery();
            }

            internetSignalingManager.sendSignal(peerId, signal);
            return;
        }

        console.error(`[HybridSignaling] 无可用通道发送信令给 ${peerId}`);
        this.emit('error', { type: 'NO_AVAILABLE_CHANNEL', peerId });
    }

    /**
     * 获取节点连接状态
     */
    getConnectionStatus(peerId: string): 'connected' | 'disconnected' | 'connecting' {
        const lanStatus = signalingManager.getConnectionStatus(peerId);
        if (lanStatus === 'connected') {
            return 'connected';
        }

        // 检查互联网模式的状态
        if (internetSignalingManager.isUserOnline(peerId)) {
            return 'connected';
        }

        return 'disconnected';
    }

    /**
     * 获取当前通信模式
     */
    getCurrentMode(peerId?: string): CommunicationMode {
        if (peerId) {
            const lanStatus = signalingManager.getConnectionStatus(peerId);
            return lanStatus === 'connected' ? COMMUNICATION_MODE.LAN : COMMUNICATION_MODE.INTERNET;
        }
        return this.currentMode;
    }

    /**
     * 设置事件转发
     */
    private setupEventForwarding(): void {
        // 转发局域网事件
        signalingManager.on('peerFound', (peer) => {
            this.emit('peerFound', { ...peer, mode: COMMUNICATION_MODE.LAN });

            // 策略：每当发现局域网节点，我们尝试刷新一次互联网连接（带节流）
            // 以免互联网连接还在旧的 IP/接口上徘徊
            this.throttleInternetRefresh();
        });

        signalingManager.on('statusChange', (data) => {
            this.emit('statusChange', data);

            // 如果局域网断开,主动检查互联网状态. 如果怀疑网络发生切换，执行刷新
            if (data.status === 'disconnected') {
                console.log(`[HybridSignaling] 局域网节点 ${data.peerId} 已断开，自检互联网备份路径`);

                // 检查是否所有局域网节点都断开了，如果是，可能是离开了当前 WiFi
                const connectedLanPeers = Array.from((signalingManager as any).peerNodes?.keys() || []);
                if (connectedLanPeers.length === 0) {
                    console.log('[HybridSignaling] 执行网络环境自适应切换...');
                    webrtcManager.resetAll();
                    internetSignalingManager.refresh().catch(() => {
                        // 静默处理刷新失败，healthCheck 会继续尝试
                    });
                } else {
                    if (internetSignalingManager.isReady()) {
                        internetSignalingManager.getOnlineUsers();
                    }
                }
            }
        });

        signalingManager.on('error', (error) => {
            this.emit('error', { ...error, source: 'lan' });
        });

        // 转发互联网事件
        internetSignalingManager.on('peer-online', (peer) => {
            this.emit('peerFound', { ...peer, mode: COMMUNICATION_MODE.INTERNET });
            this.emit('statusChange', { peerId: peer.id, status: 'connected' });
        });

        internetSignalingManager.on('peer-offline', (data) => {
            this.emit('statusChange', { peerId: data.id, status: 'disconnected' });
        });

        internetSignalingManager.on('online-users', (users: string[]) => {
            // 过滤掉自己,然后通知发现新节点
            users.filter(id => id !== this.myUserId).forEach(userId => {
                this.emit('peerFound', {
                    id: userId,
                    name: `User-${userId.substring(0, 8)}`,
                    mode: COMMUNICATION_MODE.INTERNET
                });
                this.emit('statusChange', { peerId: userId, status: 'connected' });
            });
        });

        internetSignalingManager.on('signal', (signal) => {
            console.log(`[HybridSignaling] 从互联网渠道收到来自 ${signal.from} 的信令，更新偏好为互联网`);
            this.peerChannelPreference.set(signal.from, COMMUNICATION_MODE.INTERNET);

            // 根据信号类型判断是 WebRTC 握手还是 P2P 降级数据
            if (['offer', 'answer', 'candidate'].includes(signal.type)) {
                webrtcManager.handleSignal(signal.from, signal);
            } else {
                p2pService.receivePayload(signal.from, signal);
            }
        });

        // 如果局域网收到信令，也更新偏好
        signalingManager.on('statusChange', (data) => {
            if (data.status === 'connected') {
                console.log(`[HybridSignaling] 局域网节点 ${data.peerId} 已连接，更新偏好为局域网`);
                this.peerChannelPreference.set(data.peerId, COMMUNICATION_MODE.LAN);
            }
        });

        internetSignalingManager.on('connected', () => {
            this.emit('internet-connected');
        });

        internetSignalingManager.on('disconnected', () => {
            this.emit('internet-disconnected');
        });

        internetSignalingManager.on('error', (error) => {
            this.emit('error', { ...error, source: 'internet' });
        });

        // WebRTC 信令需要通过混合管理器发送
        webrtcManager.on('signal', (data) => {
            this.sendSignal(data.to, data);
        });

        p2pService.on('signal', (data) => {
            this.sendSignal(data.to, data);
        });
    }

    private lastDiscoveryTime: number = 0;
    private throttleDiscovery() {
        const now = Date.now();
        if (now - this.lastDiscoveryTime > 15000) { // 15秒内只触发一次，避免疯狂重扫
            this.lastDiscoveryTime = now;
            signalingManager.scanPeers();
        }
    }

    private lastRefreshTime: number = 0;
    private throttleInternetRefresh() {
        const now = Date.now();
        if (now - this.lastRefreshTime > 30000) { // 发现新节点时，每30秒允许刷新一次互联网连接
            this.lastRefreshTime = now;
            console.log('[HybridSignaling] 局域网环境活跃，尝试同步刷新互联网信令，确保网络环境对齐');
            internetSignalingManager.refresh().catch(() => { });
        }
    }
}

export const hybridSignalingManager = new HybridSignalingManager();
