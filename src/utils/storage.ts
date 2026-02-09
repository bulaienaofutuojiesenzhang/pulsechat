import { createMMKV } from 'react-native-mmkv';

const storage = createMMKV();

export const saveMessage = (peerId: string, message: any) => {
    try {
        const key = `messages_${peerId}`;
        const existingMessagesStr = storage.getString(key);
        const messages = existingMessagesStr ? JSON.parse(existingMessagesStr) : [];
        messages.push(message);
        storage.set(key, JSON.stringify(messages));
    } catch (error) {
        console.error('[Storage] 保存消息失败:', error);
    }
};

export const getMessages = (peerId: string) => {
    try {
        const key = `messages_${peerId}`;
        const messagesStr = storage.getString(key);
        return messagesStr ? JSON.parse(messagesStr) : [];
    } catch (error) {
        console.error('[Storage] 读取消息失败:', error);
        return [];
    }
};

export const clearMessages = (peerId: string) => {
    try {
        storage.remove(`messages_${peerId}`);
    } catch (error) {
        console.error('[Storage] 清除消息失败:', error);
    }
};
