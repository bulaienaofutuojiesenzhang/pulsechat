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
        upsertPeer: (state, action: PayloadAction<{ id: string; name: string }>) => {
            const { id, name } = action.payload;
            if (!state.peers[id]) {
                state.peers[id] = { id, name, unreadCount: 0 };
            } else {
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
        }
    },
});

export const { upsertPeer, receiveMessage, resetUnreadCount, clearChat } = chatSlice.actions;
export default chatSlice.reducer;
