import React, { useState, useEffect, useRef } from 'react';
import { View, FlatList, StyleSheet, KeyboardAvoidingView, Platform, TouchableOpacity, Alert } from 'react-native';
import { Input, Button, ListItem, Text } from '@rneui/themed';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSelector } from 'react-redux';
import { RootState } from '../store';
import { p2pService } from '../utils/p2pService';
import { saveMessage, getMessages } from '../utils/storage';

const ChatScreen = () => {
    const navigation = useNavigation() as any;
    const route = useRoute() as any;
    const { peerId, peerName } = route.params;
    const [messages, setMessages] = useState<any[]>([]);
    const [inputText, setInputText] = useState('');

    // 使用 any 绕过复杂的 Redux 类型映射问题，确保稳定获取
    const userState = useSelector((state: RootState) => (state as any).user);
    const profile = userState?.profile;

    // 使用 Ref 追踪当前 peerId，防止闭包问题
    const currentPeerId = useRef(peerId);
    useEffect(() => {
        currentPeerId.current = peerId;
    }, [peerId]);

    useEffect(() => {
        // 先加载历史记录
        const loadHistory = () => {
            const msgs = getMessages(peerId);
            setMessages(msgs);
        };
        loadHistory();

        // 核心监听器
        const handleMsg = (msg: any) => {
            console.log(`[ChatScreen] 收到消息:`, msg);
            // 只要消息来自当前对话的人
            if (msg.from === currentPeerId.current) {
                const incomingMsg = {
                    ...msg,
                    isMe: false,
                    id: msg.id || Date.now().toString()
                };

                setMessages(prev => {
                    // 如果消息 ID 已经存在（说明是通过存储或其他重复路径过来的），则不重复添加
                    if (prev.some(m => m.id === incomingMsg.id)) return prev;
                    const newBatch = [...prev, incomingMsg];
                    return newBatch;
                });

                // 确保实时保存
                saveMessage(currentPeerId.current, incomingMsg);
            }
        };

        const handleRefresh = () => {
            loadHistory();
        };

        p2pService.on('message', handleMsg);
        p2pService.on('refresh', handleRefresh);

        return () => {
            p2pService.off('message', handleMsg);
            p2pService.off('refresh', handleRefresh);
        };
    }, [peerId]);

    const handleSend = async () => {
        if (!inputText.trim()) return;

        const newMessage = {
            id: Date.now().toString() + Math.random().toString(36).substring(7),
            type: 'chat',
            text: inputText.trim(),
            senderId: profile?.id,
            timestamp: Date.now(),
            isMe: true,
        };

        setMessages(prev => [...prev, newMessage]);
        saveMessage(peerId, newMessage);

        // 剥离 UI 标记后发送
        const { isMe, ...payload } = newMessage;
        await p2pService.sendPayload(peerId, payload);
        setInputText('');
    };

    const handleClearChat = async () => {
        Alert.alert('彻底删除', '这将同时删除对方手机上的聊天记录,确定吗?', [
            { text: '取消', style: 'cancel' },
            {
                text: '确定删除',
                style: 'destructive',
                onPress: async () => {
                    await p2pService.requestSyncDelete(peerId);
                    setMessages([]);
                }
            }
        ]);
    };

    React.useLayoutEffect(() => {
        navigation.setOptions({
            title: peerName || '聊天',
            headerRight: () => (
                <TouchableOpacity onPress={handleClearChat} style={{ marginRight: 15 }}>
                    <Text style={{ color: 'red', fontWeight: 'bold' }}>彻底清除</Text>
                </TouchableOpacity>
            ),
        });
    }, [navigation, peerId, peerName]);

    const renderItem = ({ item }: { item: any }) => (
        <View style={[styles.messageWrapper, item.isMe ? styles.myMessage : styles.theirMessage]}>
            <View style={[styles.messageBubble, item.isMe ? styles.myMessageBubble : styles.theirMessageBubble]}>
                <Text style={[styles.messageText, item.isMe ? styles.myMessageText : styles.theirMessageText]}>
                    {item.text}
                </Text>
            </View>
        </View>
    );

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
        >
            <FlatList
                data={messages}
                renderItem={renderItem}
                keyExtractor={item => item.id}
                contentContainerStyle={styles.listContent}
                inverted={false} // 如果想让新消息在下面，不使用 inverted
            />
            <View style={styles.inputContainer}>
                <Input
                    placeholder="输入加密消息..."
                    value={inputText}
                    onChangeText={setInputText}
                    containerStyle={{ flex: 1 }}
                    inputContainerStyle={{ borderBottomWidth: 0 }}
                />
                <Button
                    title="发送"
                    onPress={handleSend}
                    buttonStyle={styles.sendButton}
                    titleStyle={{ fontWeight: 'bold' }}
                />
            </View>
        </KeyboardAvoidingView>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f0f2f5' },
    listContent: { padding: 15, paddingBottom: 30 },
    messageWrapper: { marginBottom: 12, flexDirection: 'row' },
    myMessage: { justifyContent: 'flex-end' },
    theirMessage: { justifyContent: 'flex-start' },
    messageBubble: {
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 18,
        maxWidth: '75%',
        elevation: 1,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
    },
    myMessageBubble: {
        backgroundColor: '#007AFF',
        borderTopRightRadius: 2,
    },
    theirMessageBubble: {
        backgroundColor: '#fff',
        borderTopLeftRadius: 2,
    },
    messageText: { fontSize: 16 },
    myMessageText: { color: '#fff' },
    theirMessageText: { color: '#333' },
    inputContainer: {
        flexDirection: 'row',
        padding: 10,
        backgroundColor: '#fff',
        alignItems: 'center',
        borderTopWidth: 1,
        borderTopColor: '#eee',
    },
    sendButton: { borderRadius: 25, paddingHorizontal: 20, height: 45 },
});

export default ChatScreen;
