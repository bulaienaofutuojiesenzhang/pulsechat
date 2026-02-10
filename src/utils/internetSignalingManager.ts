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
    private onlineUserIds: Set<string> = new Set();

    constructor() {
        super();
        // 重要：添加一个空监听器，防止 EventEmitter 在没有外部监听时因为 'error' 事件导致进程崩溃/红色报错
        this.on('error', () => { });
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
                transports: ['websocket', 'polling'], // 双传输模式提高容错性
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

            // 启动定时自检和状态刷新 (每 30 秒一次)
            this.startHealthCheck();

        } catch (error) {
            // 互联网是备份通道，连接失败不需要在控制台抛出巨大错误或中断程序
            console.log('[InternetSignaling] 互联网服务暂不可用 (可能无网络或服务器维护)');
            this.emit('error', { type: 'CONNECTION_FAILED', error });
            // 不再向上 throw，避免在异步链中造成 Unhandled Promise Rejection
        }
    }

    /**
     * 强行重置连接 (通常在网络环境剧烈变化后使用)
     */
    async refresh(): Promise<void> {
        console.log('[InternetSignaling] 正在强制刷新互联网信令连接...');
        this.stop();
        if (this.myUserId) {
            await this.start(this.myUserId);
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
        this.stopHealthCheck();
        console.log('[InternetSignaling] 已停止');
    }

    private healthCheckTimer: any = null;
    private startHealthCheck() {
        this.stopHealthCheck();
        this.healthCheckTimer = setInterval(() => {
            if (this.socket?.connected) {
                // 每 10 秒主动告诉一次服务器：我还在线，请刷新我的映射
                if (this.myUserId) {
                    this.socket.emit('register', { userId: this.myUserId });
                }
                // 请求在线用户作为心跳探测
                this.socket.emit('get-online-users');
            } else if (this.myUserId) {
                console.log('[InternetSignaling] 检测到连接断开，尝试自动恢复...');
                this.start(this.myUserId).catch(() => { });
            }
        }, 10000); // 缩短到 10 秒
    }

    private stopHealthCheck() {
        if (this.healthCheckTimer) {
            clearInterval(this.healthCheckTimer);
            this.healthCheckTimer = null;
        }
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
     * 检查用户是否在线
     */
    isUserOnline(userId: string): boolean {
        return this.onlineUserIds.has(userId);
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
            this.onlineUserIds.add(data.userId);
            this.emit('peer-online', { id: data.userId });
        });

        // 用户下线通知
        this.socket.on('user-offline', (data: { userId: string }) => {
            console.log(`[InternetSignaling] 用户下线: ${data.userId}`);
            this.onlineUserIds.delete(data.userId);
            this.emit('peer-offline', { id: data.userId });
        });

        // 在线用户列表
        this.socket.on('online-users', (data: { users: string[] }) => {
            console.log('[InternetSignaling] 在线用户列表:', data.users);
            this.onlineUserIds.clear();
            data.users.forEach(id => this.onlineUserIds.add(id));
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
            // 降低日志级别，不要用 console.error 吓到用户和系统
            console.log('[InternetSignaling] 连接尝试中...');
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
                console.log('[InternetSignaling] 正在重连后重新注册用户身份');
                this.socket!.emit('register', { userId: this.myUserId });
            }
        });
    }
}

export const internetSignalingManager = new InternetSignalingManager();
