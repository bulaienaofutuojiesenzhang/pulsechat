import React, { useState, useEffect, useRef } from 'react';
import { View, FlatList, StyleSheet, KeyboardAvoidingView, Platform, TouchableOpacity, Alert, Clipboard } from 'react-native';
import { Input, Button, Text } from '@rneui/themed';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSelector, useDispatch } from 'react-redux';
import FastImage from 'react-native-fast-image';
import { launchImageLibrary } from 'react-native-image-picker';
import RNFS from 'react-native-fs';
import { RootState } from '../store';
import { p2pService } from '../utils/p2pService';
import { webrtcManager } from '../utils/webrtcManager';
import { saveMessage, getMessages } from '../utils/storage';
import { setActivePeerId } from '../utils/GlobalMessageListener';
import { resetUnreadCount } from '../store/slices/chatSlice';

// 兼容性解决：简单的信令编码工具
const encodeSignal = (obj: any) => {
    try {
        const str = JSON.stringify(obj);
        return `PULSE:${str}`;
    } catch (e) { return ''; }
};

const decodeSignal = (code: string) => {
    if (!code || !code.startsWith('PULSE:')) return null;
    return JSON.parse(code.replace('PULSE:', ''));
};

const ChatScreen = () => {
    const navigation = useNavigation() as any;
    const route = useRoute() as any;
    const dispatch = useDispatch();
    const { peerId, peerName } = route.params;

    const [messages, setMessages] = useState<any[]>([]);
    const [inputText, setInputText] = useState('');
    const [showMore, setShowMore] = useState(false);
    const [isVoiceMode, setIsVoiceMode] = useState(false);
    const [chatKey, setChatKey] = useState('123456');

    const userState = useSelector((state: RootState) => (state as any).user);
    const profile = userState?.profile;
    const currentPeerId = useRef(peerId);

    useEffect(() => {
        currentPeerId.current = peerId;
        p2pService.setEncryptionKey(peerId, chatKey);
    }, [peerId, chatKey]);

    useEffect(() => {
        setActivePeerId(peerId);
        dispatch(resetUnreadCount(peerId));

        const loadHistory = () => {
            const msgs = getMessages(peerId);
            setMessages(msgs);
        };
        loadHistory();

        const handleMsg = (msg: any) => {
            if (msg.from === currentPeerId.current) {
                const incomingMsg = {
                    ...msg,
                    isMe: false,
                    id: msg.id || Date.now().toString() + Math.random().toString(36).substring(7)
                };
                setMessages(prev => {
                    if (prev.some(m => m.id === incomingMsg.id)) return prev;
                    return [...prev, incomingMsg];
                });
            }
        };

        const handleRefresh = () => loadHistory();

        p2pService.on('message', handleMsg);
        p2pService.on('refresh', handleRefresh);

        return () => {
            setActivePeerId(null);
            p2pService.off('message', handleMsg);
            p2pService.off('refresh', handleRefresh);
        };
    }, [peerId, dispatch]);

    // 发送文本消息
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

        const { isMe, ...payload } = newMessage;
        await p2pService.sendPayload(peerId, payload);
        setInputText('');
    };

    // 发送图片消息
    const handlePickImage = async () => {
        const result = await launchImageLibrary({ mediaType: 'photo', quality: 0.5 });
        if (result.assets && result.assets.length > 0) {
            const asset = result.assets[0];
            try {
                const base64Data = await RNFS.readFile(asset.uri!, 'base64');
                const newMessage = {
                    id: Date.now().toString() + Math.random().toString(36).substring(7),
                    type: 'image',
                    data: base64Data,
                    senderId: profile?.id,
                    timestamp: Date.now(),
                    isMe: true,
                };
                setMessages(prev => [...prev, newMessage]);
                saveMessage(peerId, newMessage);
                setShowMore(false);
                await p2pService.sendFile(peerId, base64Data, 'image');
            } catch (e) { Alert.alert('错误', '读取图片失败'); }
        }
    };

    // 语音录制 (暂时禁用)
    const handleStartRecord = () => {
        Alert.alert('提示', '语音功能正在维护中，请使用文字或图片交流');
    };

    const handleStopRecord = () => {
        // No action
    };

    // 手动连接逻辑
    const handleGenerateCode = async () => {
        try {
            const pc = await webrtcManager.createPeerConnection(peerId);
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            setTimeout(() => {
                const signal = { type: 'offer', offer: pc.localDescription };
                Clipboard.setString(encodeSignal(signal));
                Alert.alert('已复制连接码', '请将此代码发送给对方，让对方点击“导入码”');
            }, 1000);
        } catch (e) { Alert.alert('错误', '生成失败'); }
    };

    const handleImportCode = () => {
        Alert.prompt('导入连接码', '请粘贴对方发给你的代码', [
            { text: '取消', style: 'cancel' },
            {
                text: '导入',
                onPress: async (code) => {
                    if (!code) return;
                    try {
                        const signal = decodeSignal(code);
                        if (!signal) throw new Error();
                        await webrtcManager.handleSignal(peerId, signal);
                        if (signal.type === 'offer') {
                            setTimeout(async () => {
                                const pc = (webrtcManager as any).peers.get(peerId);
                                if (pc && pc.localDescription?.type === 'answer') {
                                    Clipboard.setString(encodeSignal({ type: 'answer', answer: pc.localDescription }));
                                    Alert.alert('已复制回执', '请发回给对方以完成握手');
                                }
                            }, 1000);
                        }
                    } catch (e) { Alert.alert('错误', '无效连接码'); }
                }
            }
        ]);
    };

    // 同步删除逻辑
    const handleClearAll = () => {
        Alert.alert('彻底清除', '这将同时删除对方手机上的该聊天记录，确定吗？', [
            { text: '取消', style: 'cancel' },
            {
                text: '确定',
                style: 'destructive',
                onPress: async () => {
                    await p2pService.requestSyncDelete(peerId);
                    setMessages([]);
                }
            }
        ]);
    };

    // 设置密钥逻辑
    const handleSetEncryptionKey = () => {
        Alert.prompt('设置安全密钥', '只有双方密钥一致时才能正常读信（测试默认 123456）', [
            { text: '取消', style: 'cancel' },
            {
                text: '设置',
                onPress: (val) => {
                    if (val) setChatKey(val);
                }
            }
        ], 'plain-text', chatKey);
    };

    const renderItem = ({ item, index }: { item: any, index: number }) => {
        const showTime = index === 0 || item.timestamp - messages[index - 1].timestamp > 300000;
        const renderContent = () => {
            if (item.type === 'image') {
                return <FastImage style={styles.imageMsg} source={{ uri: item.data.startsWith('data:') ? item.data : `data:image/jpeg;base64,${item.data}` }} resizeMode="cover" />;
            }
            if (item.type === 'audio') {
                return (
                    <View style={styles.audioBubble}>
                        <Text style={item.isMe ? styles.myText : styles.theirText}>🔊 [语音消息]</Text>
                    </View>
                );
            }
            return <Text style={[styles.messageText, item.isMe ? styles.myText : styles.theirText]}>{item.text}</Text>;
        };

        return (
            <View>
                {showTime && (
                    <View style={styles.timeContainer}><Text style={styles.timeText}>{new Date(item.timestamp).getHours()}:{new Date(item.timestamp).getMinutes().toString().padStart(2, '0')}</Text></View>
                )}
                <View style={[styles.messageWrapper, item.isMe ? styles.myMessage : styles.theirMessage]}>
                    <View style={styles.avatarMini}><Text style={{ fontSize: 18 }}>{item.isMe ? '我' : '👥'}</Text></View>
                    <View style={[styles.messageBubble, item.isMe ? styles.myBubble : styles.theirBubble, item.type === 'image' && styles.imageBubble]}>
                        {renderContent()}
                        <View style={[styles.beak, item.isMe ? styles.myBeak : styles.theirBeak]} />
                    </View>
                </View>
            </View>
        );
    };

    useEffect(() => {
        navigation.setOptions({ title: peerName || '聊天', headerStyle: { backgroundColor: '#EDEDED' }, headerShadowVisible: false });
    }, [navigation, peerName]);

    return (
        <View style={styles.container}>
            <FlatList data={messages} renderItem={renderItem} keyExtractor={item => item.id} contentContainerStyle={styles.listContent} />
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
                <View style={styles.inputBar}>
                    <TouchableOpacity style={styles.iconBtn} onPress={() => setIsVoiceMode(!isVoiceMode)}>
                        <Text style={styles.iconText}>{isVoiceMode ? '⌨️' : '🎤'}</Text>
                    </TouchableOpacity>
                    {isVoiceMode ? (
                        <TouchableOpacity style={styles.voiceRecordBtn} onPress={handleStartRecord}><Text style={styles.voiceRecordText}>[语音功能暂不可用]</Text></TouchableOpacity>
                    ) : (
                        <Input placeholder="" value={inputText} onChangeText={setInputText} containerStyle={styles.inputContainer} inputContainerStyle={styles.inputInner} multiline />
                    )}
                    <TouchableOpacity style={styles.iconBtn} onPress={() => setShowMore(!showMore)}><Text style={styles.iconText}>➕</Text></TouchableOpacity>
                </View>
                {showMore && (
                    <View style={styles.morePanel}>
                        <TouchableOpacity style={styles.panelItem} onPress={handlePickImage}><View style={styles.panelIcon}><Text style={{ fontSize: 30 }}>🖼️</Text></View><Text style={styles.panelText}>照片</Text></TouchableOpacity>
                        <TouchableOpacity style={styles.panelItem} onPress={handleGenerateCode}><View style={styles.panelIcon}><Text style={{ fontSize: 30 }}>🔗</Text></View><Text style={styles.panelText}>连接码</Text></TouchableOpacity>
                        <TouchableOpacity style={styles.panelItem} onPress={handleImportCode}><View style={styles.panelIcon}><Text style={{ fontSize: 30 }}>📥</Text></View><Text style={styles.panelText}>导入码</Text></TouchableOpacity>
                        <TouchableOpacity style={styles.panelItem} onPress={handleSetEncryptionKey}><View style={styles.panelIcon}><Text style={{ fontSize: 30 }}>🔐</Text></View><Text style={styles.panelText}>设置密码</Text></TouchableOpacity>
                        <TouchableOpacity style={styles.panelItem} onPress={handleClearAll}><View style={styles.panelIcon}><Text style={{ fontSize: 30 }}>💣</Text></View><Text style={styles.panelText}>一键焚毁</Text></TouchableOpacity>
                    </View>
                )}
            </KeyboardAvoidingView>
        </View>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#EDEDED' },
    listContent: { padding: 10, paddingBottom: 20 },
    timeContainer: { alignItems: 'center', marginVertical: 15 },
    timeText: { backgroundColor: 'rgba(0,0,0,0.05)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, color: '#999', fontSize: 12 },
    messageWrapper: { flexDirection: 'row', marginBottom: 15, alignItems: 'flex-start' },
    myMessage: { flexDirection: 'row-reverse' },
    theirMessage: { flexDirection: 'row' },
    avatarMini: { width: 40, height: 40, backgroundColor: '#fff', borderRadius: 4, justifyContent: 'center', alignItems: 'center', marginHorizontal: 8 },
    messageBubble: { padding: 10, borderRadius: 6, maxWidth: '75%', position: 'relative' },
    imageBubble: { padding: 0, overflow: 'hidden' },
    myBubble: { backgroundColor: '#95ec69' },
    theirBubble: { backgroundColor: '#fff' },
    beak: { position: 'absolute', top: 12, width: 0, height: 0, borderStyle: 'solid', borderTopWidth: 6, borderBottomWidth: 6, borderTopColor: 'transparent', borderBottomColor: 'transparent' },
    myBeak: { right: -6, borderLeftWidth: 6, borderLeftColor: '#95ec69' },
    theirBeak: { left: -6, borderRightWidth: 6, borderRightColor: '#fff' },
    messageText: { fontSize: 16, lineHeight: 22 },
    myText: { color: '#000' },
    theirText: { color: '#000' },
    imageMsg: { width: 200, height: 150, borderRadius: 4 },
    audioBubble: { flexDirection: 'row', alignItems: 'center', minWidth: 60, paddingRight: 10 },
    inputBar: { flexDirection: 'row', backgroundColor: '#F7F7F7', padding: 8, alignItems: 'center', borderTopWidth: 0.5, borderTopColor: '#ccc' },
    inputContainer: { flex: 1, paddingHorizontal: 0 },
    inputInner: { backgroundColor: '#fff', borderBottomWidth: 0, borderRadius: 4, paddingHorizontal: 10, minHeight: 40 },
    voiceRecordBtn: { flex: 1, height: 40, backgroundColor: '#eee', borderRadius: 4, justifyContent: 'center', alignItems: 'center', marginHorizontal: 10 },
    voiceRecordText: { fontSize: 14, color: '#999' },
    iconBtn: { padding: 8 },
    iconText: { fontSize: 24 },
    morePanel: { flexDirection: 'row', flexWrap: 'wrap', backgroundColor: '#F7F7F7', padding: 20, borderTopWidth: 0.5, borderTopColor: '#eee' },
    panelItem: { alignItems: 'center', marginRight: 30, marginBottom: 20 },
    panelIcon: { width: 60, height: 60, backgroundColor: '#fff', borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginBottom: 5 },
    panelText: { fontSize: 12, color: '#666' }
});

export default ChatScreen;
