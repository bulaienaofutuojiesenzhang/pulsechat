import Zeroconf from 'react-native-zeroconf';
import TcpSocket from 'react-native-tcp-socket';
import EventEmitter from 'events';
import { p2pService } from './p2pService';

class SignalingManager extends EventEmitter {
    private zeroconf = new Zeroconf();
    private myId: string = '';
    private server: any;
    private clients: Map<string, any> = new Map();
    private port: number = 8888;

    constructor() {
        super();
        this.zeroconf.on('start', () => console.log('Zeroconf started'));
        this.zeroconf.on('resolved', (service: any) => {
            console.log('Peer resolved:', service);
            if (service.name.startsWith('pulsechat_') && service.name !== `pulsechat_${this.myId}`) {
                const peerId = service.name.replace('pulsechat_', '');
                const host = service.addresses[0];
                const port = service.port;
                this.connectToPeerSignaling(peerId, host, port);
            }
        });

        p2pService.on('signal', (data) => {
            this.sendSignal(data.to, data);
        });
    }

    private startServer() {
        if (this.server) return;
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
                    console.error('Signaling decode error:', e);
                }
            });
            socket.on('error', (err) => console.log('Socket error:', err));
        }).listen({ port: this.port, host: '0.0.0.0' });
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
                console.error('Signaling client decode error:', e);
            }
        });

        client.on('error', (err) => {
            console.log('Signaling client error with:', peerId, err);
            this.clients.delete(peerId);
        });
    }

    private sendSignal(peerId: string, signal: any) {
        const client = this.clients.get(peerId);
        if (client) {
            client.write(JSON.stringify({ ...signal, from: this.myId }));
        }
    }

    start(myId: string) {
        this.myId = myId;
        this.startServer();
        this.zeroconf.publish('http', 'tcp', 'local.', `pulsechat_${myId}`, this.port);
        this.zeroconf.scan('http', 'tcp', 'local.');
    }

    stop() {
        this.zeroconf.stop();
        this.zeroconf.unpublishService(`pulsechat_${this.myId}`);
        if (this.server) this.server.close();
    }
}

export const signalingManager = new SignalingManager();
