import { RTCPeerConnection, RTCIceCandidate, RTCSessionDescription } from 'react-native-webrtc';
import EventEmitter from 'events';

class P2PService extends EventEmitter {
    private peers: Map<string, any> = new Map();
    private dataChannels: Map<string, any> = new Map();

    constructor() {
        super();
    }

    // Placeholder for DHT node discovery
    async startDiscovery(myId: string) {
        console.log('Starting P2P discovery for:', myId);
    }

    async connectToPeer(peerId: string) {
        if (this.peers.has(peerId)) return;

        const pc = new RTCPeerConnection({
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
        });

        this.peers.set(peerId, pc);

        const dc = (pc as any).createDataChannel('chat');
        this.setupDataChannel(peerId, dc);

        const offer = await (pc as any).createOffer();
        await (pc as any).setLocalDescription(offer);

        this.emit('signal', { to: peerId, type: 'offer', sdp: offer });

        (pc as any).onicecandidate = (event: any) => {
            if (event.candidate) {
                this.emit('signal', { to: peerId, type: 'candidate', candidate: event.candidate });
            }
        };
    }

    async handleSignal(peerId: string, signal: any) {
        let pc = this.peers.get(peerId);
        if (!pc) {
            pc = new RTCPeerConnection({
                iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
            });
            this.peers.set(peerId, pc);

            (pc as any).ondatachannel = (event: any) => {
                this.setupDataChannel(peerId, event.channel);
            };

            (pc as any).onicecandidate = (event: any) => {
                if (event.candidate) {
                    this.emit('signal', { to: peerId, type: 'candidate', candidate: event.candidate });
                }
            };
        }

        if (signal.type === 'offer') {
            await (pc as any).setRemoteDescription(new RTCSessionDescription(signal.sdp));
            const answer = await (pc as any).createAnswer();
            await (pc as any).setLocalDescription(answer);
            this.emit('signal', { to: peerId, type: 'answer', sdp: answer });
        } else if (signal.type === 'answer') {
            await (pc as any).setRemoteDescription(new RTCSessionDescription(signal.sdp));
        } else if (signal.type === 'candidate') {
            await (pc as any).addIceCandidate(new RTCIceCandidate(signal.candidate));
        }
    }

    private setupDataChannel(peerId: string, dc: any) {
        this.dataChannels.set(peerId, dc);
        dc.onopen = () => {
            console.log('Data channel open with:', peerId);
            this.emit('connectionChange', { peerId, status: 'connected' });
        };
        dc.onclose = () => {
            this.emit('connectionChange', { peerId, status: 'disconnected' });
        };
        dc.onmessage = (event: any) => {
            this.emit('message', { from: peerId, text: event.data });
        };
    }

    async sendMessage(peerId: string, message: string) {
        const dc = this.dataChannels.get(peerId);
        if (dc && dc.readyState === 'open') {
            dc.send(message);
            return true;
        }
        return false;
    }
}

export const p2pService = new P2PService();
