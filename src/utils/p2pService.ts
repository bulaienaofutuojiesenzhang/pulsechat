import EventEmitter from 'events';
import { webrtcManager } from './webrtcManager';
import { clearMessages } from './storage';
import { XORCrypto } from './crypto';

const CHUNK_SIZE = 16384; // 16KB per chunk to be safe with RTCDataChannel

class P2PService extends EventEmitter {
    private fileBuffers: Map<string, { chunks: string[], total: number, type: string }> = new Map();
    private globalPassphrase: string = '123456';
    private myId: string = '';

    constructor() {
        super();
        webrtcManager.on('message', ({ from, data }) => {
            this.receivePayload(from, data);
        });
    }

    /**
     * 设置全局加解密密钥 (Passphrase)
     */
    setGlobalPassphrase(key: string) {
        console.log(`[P2P] 设置全局密钥: ${key}`);
        this.globalPassphrase = key;
    }

    setMyId(id: string) {
        this.myId = id;
    }

    async sendPayload(to: string, payload: any) {
        // 对聊天内容进行加密（如果类型是 chat 且消息有文本）
        let finalPayload = payload;
        const key = this.globalPassphrase;

        if (payload.type === 'chat' && payload.text && key) {
            finalPayload = {
                ...payload,
                text: XORCrypto.encrypt(payload.text, key),
                isEncrypted: true
            };
        }

        const success = webrtcManager.sendMessage(to, finalPayload);
        if (!success) {
            console.log(`[P2P] WebRTC 不可用，降级 TCP 发送`, finalPayload.type);
            this.emit('signal', { to, ...finalPayload });
        }
    }

    /**
     * 发送大文件（图片/语音）
     */
    async sendFile(to: string, base64Data: string, fileType: 'image' | 'audio') {
        const fileId = Math.random().toString(36).substring(7);
        const totalChunks = Math.ceil(base64Data.length / CHUNK_SIZE);
        const key = this.globalPassphrase;

        console.log(`[P2P] 开始发送 ${fileType}, 大小: ${base64Data.length}, 分片数: ${totalChunks}`);

        for (let i = 0; i < totalChunks; i++) {
            let chunk = base64Data.substring(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);

            // 对分片也进行加密（可选，为了性能也可以只加密描述信息，但这里为了“乱码”效果全部加密）
            if (key) {
                chunk = XORCrypto.encrypt(chunk, key);
            }

            const payload = {
                type: 'file_chunk',
                fileId,
                fileType,
                chunk,
                index: i,
                total: totalChunks,
                timestamp: Date.now(),
                isEncrypted: !!key
            };
            await this.sendPayload(to, payload);
            if (i % 5 === 0) await new Promise(r => setTimeout(r, 10));
        }
    }

    public receivePayload(from: string, data: any) {
        const key = this.globalPassphrase;
        let processedData = data;

        // 如果是加密消息，尝试解密
        if (data.isEncrypted && key) {
            if (data.type === 'chat' && data.text) {
                processedData = { ...data, text: XORCrypto.decrypt(data.text, key) };
            }
            // 文件分片会在 handleFileChunk 中解密
        }

        if (processedData.type === 'file_chunk') {
            this.handleFileChunk(from, processedData);
            return;
        }

        if (processedData.type === 'chat') {
            this.emit('message', { from, ...processedData });
        } else if (processedData.type === 'delete_all') {
            console.log(`[P2P] 收到来自 ${from} 的远程销毁指令`);
            if (this.myId) {
                clearMessages(this.myId, from);
            }
            this.emit('refresh');
        }
    }

    private handleFileChunk(from: string, data: any) {
        const { fileId, chunk, index, total, fileType, isEncrypted } = data;
        const key = `${from}_${fileId}`;

        if (!this.fileBuffers.has(key)) {
            this.fileBuffers.set(key, { chunks: new Array(total), total, type: fileType });
        }

        const buffer = this.fileBuffers.get(key)!;

        // 分片解密
        const encryptionKey = this.globalPassphrase;
        let finalChunk = chunk;
        if (isEncrypted && encryptionKey) {
            finalChunk = XORCrypto.decrypt(chunk, encryptionKey);
        }

        buffer.chunks[index] = finalChunk;

        const receivedCount = buffer.chunks.filter(c => c !== undefined).length;
        if (receivedCount === total) {
            const fullBase64 = buffer.chunks.join('');
            this.emit('message', {
                from,
                type: fileType,
                data: fullBase64,
                id: fileId,
                timestamp: data.timestamp
            });
            this.fileBuffers.delete(key);
        }
    }

    /**
     * 发起同步删除请求
     */
    async requestSyncDelete(peerId: string) {
        console.log(`[P2P] 向 ${peerId} 发送同步删除指令`);
        await this.sendPayload(peerId, { type: 'delete_all' });
        if (this.myId) {
            clearMessages(this.myId, peerId);
        }
        this.emit('refresh');
    }
}

export const p2pService = new P2PService();
