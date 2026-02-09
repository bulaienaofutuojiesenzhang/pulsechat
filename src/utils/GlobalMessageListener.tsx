import React, { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { p2pService } from './p2pService';
import { receiveMessage, upsertPeer } from '../store/slices/chatSlice';
import { saveMessage } from './storage';
import { RootState } from '../store';

// 用于追踪当前激活的对话
export let activePeerId: string | null = null;
export const setActivePeerId = (id: string | null) => {
    activePeerId = id;
};

const GlobalMessageListener: React.FC = () => {
    const dispatch = useDispatch();
    const profile = useSelector((state: RootState) => (state as any).user?.profile);
    const passphrase = useSelector((state: RootState) => (state as any).user?.passphrase);

    // 同步全局密钥到 P2P 服务
    useEffect(() => {
        if (passphrase) {
            p2pService.setGlobalPassphrase(passphrase);
        }
        if (profile?.id) {
            p2pService.setMyId(profile.id);
        }
    }, [passphrase, profile?.id]);

    useEffect(() => {
        const handleIncomingMessage = (msg: any) => {
            console.log('[GlobalListener] 收到原始消息:', msg);

            const peerId = msg.from;
            const isCurrentChat = activePeerId === peerId;

            const structuredMsg = {
                ...msg,
                isMe: false,
                id: msg.id || Date.now().toString() + Math.random().toString(36).substring(7),
            };

            // 1. 发送到 Redux (更新列表预览和未读数)
            dispatch(receiveMessage({
                peerId,
                message: structuredMsg,
                isCurrentChat
            }));

            // 2. 持久化到存储
            if (profile?.id) {
                saveMessage(profile.id, peerId, structuredMsg);
            }

            // 3. 确保该节点在列表中（防止新节点发来消息没在列表显示）
            const defaultName = `Node-${peerId.substring(peerId.length - 8)}`;
            dispatch(upsertPeer({ id: peerId, name: msg.senderName || defaultName }));
        };

        p2pService.on('message', handleIncomingMessage);

        return () => {
            p2pService.off('message', handleIncomingMessage);
        };
    }, [dispatch]);

    return null; // 此组件仅用于后台监听
};

export default GlobalMessageListener;
