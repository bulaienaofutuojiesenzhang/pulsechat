import { MMKV } from 'react-native-mmkv';

// MMKV v3.x 稳定版写法
const storage = new MMKV();

export const saveMessage = (peerId: string, message: any) => {
    try {
        const key = `messages_${peerId}`;
        const existingMessagesStr = storage.getString(key);
        let messages = existingMessagesStr ? JSON.parse(existingMessagesStr) : [];

        // 去重逻辑：如果已存在相同 ID 的消息，则不重复保存
        if (messages.find((m: any) => m.id === message.id)) {
            return;
        }

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
        storage.delete(`messages_${peerId}`);
    } catch (error) {
        console.error('[Storage] 清除消息失败:', error);
    }
};
