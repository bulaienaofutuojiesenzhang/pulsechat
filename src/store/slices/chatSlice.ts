import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface Message {
    id: string;
    type: 'chat' | 'image' | 'audio';
    text?: string;
    senderId: string;
    timestamp: number;
    from: string;
    isMe: boolean;
}

interface ChatState {
    peers: {
        [peerId: string]: {
            id: string;
            name: string;
            lastMessage?: Message;
            unreadCount: number;
        };
    };
}

const initialState: ChatState = {
    peers: {},
};

const chatSlice = createSlice({
    name: 'chat',
    initialState,
    reducers: {
        upsertPeer: (state, action: PayloadAction<{ id: string; name?: string }>) => {
            const { id, name } = action.payload;
            const defaultName = `Node-${id.substring(id.length - 8)}`;
            const finalName = name || defaultName;

            if (!state.peers[id]) {
                state.peers[id] = { id, name: finalName, unreadCount: 0 };
            } else {
                // 如果已存在节点，且传入了有效的名称，则更新
                // 排除掉所有技术性默认名称 (Node-, User-, pulsechat_)
                const oldName = state.peers[id].name;
                const isTechnicalName = name.startsWith('Node-') || name.startsWith('User-') || name.startsWith('pulsechat_');
                if (name && name !== oldName && !isTechnicalName) {
                    state.peers[id].name = name;
                }
            }
        },
        updatePeerName: (state, action: PayloadAction<{ id: string; name: string }>) => {
            const { id, name } = action.payload;
            if (state.peers[id]) {
                state.peers[id].name = name;
            }
        },
        receiveMessage: (state, action: PayloadAction<{ peerId: string; message: Message; isCurrentChat: boolean }>) => {
            const { peerId, message, isCurrentChat } = action.payload;

            if (!state.peers[peerId]) {
                state.peers[peerId] = { id: peerId, name: '未知节点', unreadCount: 0 };
            }

            state.peers[peerId].lastMessage = message;
            if (!isCurrentChat && !message.isMe) {
                state.peers[peerId].unreadCount += 1;
            }
        },
        resetUnreadCount: (state, action: PayloadAction<string>) => {
            const peerId = action.payload;
            if (state.peers[peerId]) {
                state.peers[peerId].unreadCount = 0;
            }
        },
        clearChat: (state, action: PayloadAction<string>) => {
            const peerId = action.payload;
            if (state.peers[peerId]) {
                delete state.peers[peerId].lastMessage;
                state.peers[peerId].unreadCount = 0;
            }
        },
        resetChat: (state) => {
            state.peers = {};
        }
    },
});

export const { upsertPeer, updatePeerName, receiveMessage, resetUnreadCount, clearChat, resetChat } = chatSlice.actions;
export default chatSlice.reducer;
