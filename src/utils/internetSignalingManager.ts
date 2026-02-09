import { io, Socket } from 'socket.io-client';
import EventEmitter from 'events';
import { SIGNALING_SERVER } from '../config';

/**
 * 互联网信令管理器
 * 通过 Socket.IO 连接到中继服务器,实现跨网络通信
 */
class InternetSignalingManager extends EventEmitter {
    private socket: Socket | null = null;
    private myUserId: string = '';
    private isConnected: boolean = false;
    private reconnectTimer: any = null;

    constructor() {
        super();
    }

    /**
     * 启动互联网信令服务
     */
    async start(userId: string): Promise<void> {
        this.myUserId = userId;

        if (this.socket?.connected) {
            console.log('[InternetSignaling] 已连接,跳过重复启动');
            return;
        }

        try {
            this.socket = io(SIGNALING_SERVER.url, {
                reconnectionAttempts: SIGNALING_SERVER.reconnectionAttempts,
                reconnectionDelay: SIGNALING_SERVER.reconnectionDelay,
                timeout: SIGNALING_SERVER.timeout,
                transports: ['websocket', 'polling'],
            });

            this.setupEventListeners();

            // 等待连接建立
            await new Promise<void>((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('连接超时'));
                }, SIGNALING_SERVER.timeout);

                this.socket!.once('connect', () => {
                    clearTimeout(timeout);
                    resolve();
                });

                this.socket!.once('connect_error', (err) => {
                    clearTimeout(timeout);
                    reject(err);
                });
            });

            // 注册用户
            this.socket.emit('register', { userId: this.myUserId });

        } catch (error) {
            console.error('[InternetSignaling] 启动失败:', error);
            this.emit('error', { type: 'CONNECTION_FAILED', error });
            throw error;
        }
    }

    /**
     * 停止服务
     */
    stop(): void {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }

        if (this.socket) {
            this.socket.removeAllListeners();
            this.socket.disconnect();
            this.socket = null;
        }

        this.isConnected = false;
        console.log('[InternetSignaling] 已停止');
    }

    /**
     * 发送信令到指定用户
     */
    sendSignal(targetUserId: string, signal: any): void {
        if (!this.socket?.connected) {
            console.error('[InternetSignaling] 未连接,无法发送信令');
            this.emit('error', { type: 'NOT_CONNECTED', targetUserId });
            return;
        }

        this.socket.emit('signal', {
            targetUserId,
            type: signal.type,
            payload: signal,
        });

        console.log(`[InternetSignaling] 发送信令给 ${targetUserId}:`, signal.type);
    }

    /**
     * 获取在线用户列表
     */
    getOnlineUsers(): void {
        if (this.socket?.connected) {
            this.socket.emit('get-online-users');
        }
    }

    /**
     * 检查是否已连接
     */
    isReady(): boolean {
        return this.isConnected && this.socket?.connected === true;
    }

    /**
     * 设置事件监听器
     */
    private setupEventListeners(): void {
        if (!this.socket) return;

        // 连接成功
        this.socket.on('connect', () => {
            console.log('[InternetSignaling] 已连接到服务器');
            this.isConnected = true;
            this.emit('connected');
        });

        // 注册成功
        this.socket.on('register-success', (data: { onlineCount: number }) => {
            console.log(`[InternetSignaling] 注册成功,在线用户: ${data.onlineCount}`);
            this.emit('register-success', data);
        });

        // 接收信令
        this.socket.on('signal', (data: { fromUserId: string; type: string; payload: any }) => {
            console.log(`[InternetSignaling] 收到来自 ${data.fromUserId} 的信令:`, data.type);
            this.emit('signal', {
                from: data.fromUserId,
                ...data.payload,
            });
        });

        // 用户上线通知
        this.socket.on('user-online', (data: { userId: string }) => {
            console.log(`[InternetSignaling] 用户上线: ${data.userId}`);
            this.emit('peer-online', { id: data.userId });
        });

        // 用户下线通知
        this.socket.on('user-offline', (data: { userId: string }) => {
            console.log(`[InternetSignaling] 用户下线: ${data.userId}`);
            this.emit('peer-offline', { id: data.userId });
        });

        // 在线用户列表
        this.socket.on('online-users', (data: { users: string[] }) => {
            console.log('[InternetSignaling] 在线用户列表:', data.users);
            this.emit('online-users', data.users);
        });

        // 心跳
        this.socket.on('ping', () => {
            this.socket!.emit('pong');
        });

        // 断开连接
        this.socket.on('disconnect', (reason) => {
            console.log('[InternetSignaling] 断开连接:', reason);
            this.isConnected = false;
            this.emit('disconnected', reason);
        });

        // 连接错误
        this.socket.on('connect_error', (error) => {
            console.error('[InternetSignaling] 连接错误:', error);
            this.emit('error', { type: 'CONNECTION_ERROR', error });
        });

        // 重连尝试
        this.socket.on('reconnect_attempt', (attemptNumber) => {
            console.log(`[InternetSignaling] 重连尝试 ${attemptNumber}`);
        });

        // 重连成功
        this.socket.on('reconnect', (attemptNumber) => {
            console.log(`[InternetSignaling] 重连成功,尝试次数: ${attemptNumber}`);
            this.isConnected = true;
            // 重新注册
            if (this.myUserId) {
                this.socket!.emit('register', { userId: this.myUserId });
            }
        });
    }
}

export const internetSignalingManager = new InternetSignalingManager();
