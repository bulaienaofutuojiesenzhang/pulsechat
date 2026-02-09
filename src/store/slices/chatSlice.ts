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
                // 只有当现有名称为默认生成的 "Node-..." 或 "未知节点" 时，才允许被信令传来的名字覆盖
                // 如果用户已经手动改了名字，则保留用户的备注
                const currentName = state.peers[id].name;
                if (!currentName || currentName.startsWith('Node-') || currentName === '未知节点' || currentName === '新朋友') {
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
