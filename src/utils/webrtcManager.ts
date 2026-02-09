import {
    RTCPeerConnection,
    RTCIceCandidate,
    RTCSessionDescription,
    MediaStream,
    registerGlobals
} from 'react-native-webrtc';
import EventEmitter from 'events';

// 免费的 STUN 服务器，用于 NAT 穿透
const ICE_SERVERS = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
    ]
};

class WebRTCManager extends EventEmitter {
    private peers: Map<string, RTCPeerConnection> = new Map();
    private dataChannels: Map<string, any> = new Map();

    /**
     * 创建或获取与某个节点的 P2P 连接
     */
    async createPeerConnection(peerId: string) {
        if (this.peers.has(peerId)) return this.peers.get(peerId);

        const pc = new RTCPeerConnection(ICE_SERVERS);

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                // 将 ICE Candidate 发送给对方（通过信令通道）
                this.emit('signal', {
                    to: peerId,
                    type: 'candidate',
                    candidate: event.candidate
                });
            }
        };

        const dc = pc.createDataChannel('chat');
        this.setupDataChannel(peerId, dc);

        pc.ondatachannel = (event) => {
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

    /**
     * 发送消息（支持互联网穿透）
     */
    sendMessage(peerId: string, data: any) {
        const dc = this.dataChannels.get(peerId);
        if (dc && dc.readyState === 'open') {
            dc.send(JSON.stringify(data));
            return true;
        }
        return false;
    }

    /**
     * 处理收到的 WebRTC 信令
     */
    async handleSignal(from: string, signal: any) {
        let pc = this.peers.get(from);
        if (!pc) pc = await this.createPeerConnection(from);

        if (signal.type === 'offer') {
            await pc.setRemoteDescription(new RTCSessionDescription(signal.offer));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            this.emit('signal', { to: from, type: 'answer', answer });
        } else if (signal.type === 'answer') {
            await pc.setRemoteDescription(new RTCSessionDescription(signal.answer));
        } else if (signal.type === 'candidate') {
            await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
        }
    }

    /**
     * 发起连接邀请
     */
    async makeOffer(peerId: string) {
        const pc = await this.createPeerConnection(peerId);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        this.emit('signal', { to: peerId, type: 'offer', offer });
    }
}

export const webrtcManager = new WebRTCManager();
