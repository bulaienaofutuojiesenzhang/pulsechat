import {
    RTCPeerConnection,
    RTCIceCandidate,
    RTCSessionDescription,
} from 'react-native-webrtc';
import EventEmitter from 'events';

const ICE_SERVERS = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
    ]
};

class WebRTCManager extends EventEmitter {
    private peers: Map<string, RTCPeerConnection> = new Map();
    private dataChannels: Map<string, any> = new Map();

    async createPeerConnection(peerId: string) {
        if (this.peers.has(peerId)) return this.peers.get(peerId)!;

        const pc = new RTCPeerConnection(ICE_SERVERS) as any;

        pc.onicecandidate = (event: any) => {
            if (event.candidate) {
                this.emit('signal', {
                    to: peerId,
                    type: 'candidate',
                    candidate: event.candidate
                });
            }
        };

        const dc = pc.createDataChannel('chat');
        this.setupDataChannel(peerId, dc);

        pc.ondatachannel = (event: any) => {
            this.setupDataChannel(peerId, event.channel);
        };

        pc.onconnectionstatechange = () => {
            console.log(`[WebRTC] 与 ${peerId} 连接状态:`, pc.connectionState);
            if (pc.connectionState === 'connected') {
                this.emit('peerConnected', peerId);
            }
        };

        this.peers.set(peerId, pc);
        return pc;
    }

    private setupDataChannel(peerId: string, dc: any) {
        dc.onopen = () => console.log(`[WebRTC] ${peerId} 数据通道已开启`);
        dc.onmessage = (event: any) => {
            try {
                const data = JSON.parse(event.data);
                this.emit('message', { from: peerId, data });
            } catch (e) {
                console.error('[WebRTC] 消息解析错误:', e);
            }
        };
        this.dataChannels.set(peerId, dc);
    }

    sendMessage(peerId: string, data: any) {
        const dc = this.dataChannels.get(peerId);
        if (dc && dc.readyState === 'open') {
            dc.send(JSON.stringify(data));
            return true;
        }
        return false;
    }

    async handleSignal(from: string, signal: any) {
        let pc = this.peers.get(from);
        if (!pc) pc = await this.createPeerConnection(from);

        try {
            if (signal.type === 'offer') {
                await pc.setRemoteDescription(new RTCSessionDescription(signal.offer));
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                this.emit('signal', { to: from, type: 'answer', answer });
            } else if (signal.type === 'answer') {
                if (pc.signalingState === 'have-local-offer') {
                    await pc.setRemoteDescription(new RTCSessionDescription(signal.answer));
                } else {
                    console.log('[WebRTC] 忽略 Answer: 状态不是 have-local-offer');
                }
            } else if (signal.type === 'candidate') {
                if (pc.remoteDescription) {
                    await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
                } else {
                    // 如果还未设置 remoteDescription, 暂存 candidate 或者是让它重试
                    console.log('[WebRTC] 暂存 Candidate');
                }
            }
        } catch (e) {
            console.error('[WebRTC] 处理信令失败:', e);
        }
    }

    async makeOffer(peerId: string) {
        const pc = await this.createPeerConnection(peerId);
        try {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            this.emit('signal', { to: peerId, type: 'offer', offer });
        } catch (e) {
            console.error('[WebRTC] 创建 Offer 失败:', e);
        }
    }

    /**
     * 生成手动连接码 (包含 Offer 和所有已收集到的 Candidates)
     */
    async generateConnectionCode(peerId: string): Promise<string> {
        const pc = await this.createPeerConnection(peerId);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        // 等待 ICE 收集一点数据 (或者是让用户稍等片刻)
        await new Promise(r => setTimeout(r, 1000));

        const codeObj = {
            from: 'manual',
            type: pc.localDescription.type,
            sdp: pc.localDescription.sdp,
        };
        return btoa(JSON.stringify(codeObj));
    }

    /**
     * 应用手动连接码
     */
    async applyConnectionCode(peerId: string, code: string) {
        try {
            const signal = JSON.parse(atob(code));
            await this.handleSignal(peerId, {
                type: signal.type,
                [signal.type]: signal
            });
        } catch (e) {
            console.error('[WebRTC] 手动应用信令失败:', e);
            throw new Error('无效的连接码');
        }
    }
}

export const webrtcManager = new WebRTCManager();
