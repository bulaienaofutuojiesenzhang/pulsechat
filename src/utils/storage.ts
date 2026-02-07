import { MMKV } from 'react-native-mmkv';

const storage = new MMKV();

export const saveMessage = (peerId: string, message: any) => {
    const key = `messages_${peerId}`;
    const existingMessagesStr = storage.getString(key);
    const messages = existingMessagesStr ? JSON.parse(existingMessagesStr) : [];
    messages.push(message);
    storage.set(key, JSON.stringify(messages));
};

export const getMessages = (peerId: string) => {
    const key = `messages_${peerId}`;
    const messagesStr = storage.getString(key);
    return messagesStr ? JSON.parse(messagesStr) : [];
};

export const clearMessages = (peerId: string) => {
    storage.delete(`messages_${peerId}`);
};
