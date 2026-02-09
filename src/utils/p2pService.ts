import EventEmitter from 'events';
import { webrtcManager } from './webrtcManager';
import { clearMessages } from './storage';

class P2PService extends EventEmitter {
    constructor() {
        super();
        // 监听来自 WebRTC 的底层消息
        webrtcManager.on('message', ({ from, data }) => {
            this.receivePayload(from, data);
        });
    }

    /**
     * 发送加密消息或指令
     */
    async sendPayload(to: string, payload: any) {
        // 优先使用 WebRTC 互联网通道
        const success = webrtcManager.sendMessage(to, payload);
        if (!success) {
            console.log(`[P2P] WebRTC 通道不可用，降级到 TCP 信令发送给 ${to}`, payload.type);
            // 如果 WebRTC 还没通，把信号交给信令层去尝试握手
            this.emit('signal', { to, ...payload });
        } else {
            console.log(`[P2P] 通过 WebRTC 成功发送给 ${to}:`, payload.type);
        }
    }

    /**
     * 处理收到的数据（无论是来自 WebRTC 还是 TCP）
     */
    public receivePayload(from: string, data: any) {
        console.log(`[P2P] 收到来自 ${from} 的数据:`, data.type);
        if (data.type === 'chat') {
            this.emit('message', { from, ...data });
        } else if (data.type === 'delete_all') {
            // 实现同步删除：收到对方的删除指令，清空本地存储
            console.log(`[P2P] 收到来自 ${from} 的同步删除请求`);
            clearMessages(from);
            this.emit('refresh'); // 通知 UI 刷新
        }
    }

    /**
     * 发起同步删除
     */
    async requestSyncDelete(peerId: string) {
        await this.sendPayload(peerId, { type: 'delete_all' });
        clearMessages(peerId); // 本地也要删
        this.emit('refresh');
    }

    // 辅助信令转发
    handleSignal(from: string, signal: any) {
        webrtcManager.handleSignal(from, signal);
    }
}

export const p2pService = new P2PService();
