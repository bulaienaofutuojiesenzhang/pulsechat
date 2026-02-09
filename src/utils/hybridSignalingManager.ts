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

    constructor() {
        super();
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
        // 优先尝试局域网
        const lanStatus = signalingManager.getConnectionStatus(peerId);
        if (lanStatus === 'connected') {
            console.log(`[HybridSignaling] 使用局域网发送信令给 ${peerId}`);
            signalingManager['sendSignal'](peerId, signal);
            return;
        }

        // 降级到互联网
        if (internetSignalingManager.isReady()) {
            console.log(`[HybridSignaling] 使用互联网发送信令给 ${peerId}`);
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
        });

        signalingManager.on('statusChange', (data) => {
            this.emit('statusChange', data);
        });

        signalingManager.on('error', (error) => {
            this.emit('error', { ...error, source: 'lan' });
        });

        // 转发互联网事件
        internetSignalingManager.on('peer-online', (peer) => {
            this.emit('peerFound', { ...peer, mode: COMMUNICATION_MODE.INTERNET });
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
            });
        });

        internetSignalingManager.on('signal', (signal) => {
            // 根据信号类型判断是 WebRTC 握手还是 P2P 降级数据
            if (['offer', 'answer', 'candidate'].includes(signal.type)) {
                webrtcManager.handleSignal(signal.from, signal);
            } else {
                p2pService.receivePayload(signal.from, signal);
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

        // P2P 服务信令也需要通过混合管理器发送
        p2pService.on('signal', (data) => {
            this.sendSignal(data.to, data);
        });
    }
}

export const hybridSignalingManager = new HybridSignalingManager();
