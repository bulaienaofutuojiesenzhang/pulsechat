import React, { useState, useEffect, useRef } from 'react';
import { View, FlatList, StyleSheet, KeyboardAvoidingView, Platform, TouchableOpacity, Alert, Clipboard, TextInput, Text } from 'react-native';
import Ionicons from '@react-native-vector-icons/ionicons';
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
import { resetUnreadCount, updatePeerName } from '../store/slices/chatSlice';
import { signalingManager } from '../utils/signalingManager';

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
    const [connStatus, setConnStatus] = useState<'connected' | 'disconnected' | 'connecting'>(signalingManager.getConnectionStatus(peerId) as any);

    const userState = useSelector((state: RootState) => (state as any).user);
    const peers = useSelector((state: RootState) => state.chat.peers);
    const peerInfo = peers[peerId];
    const profile = userState?.profile;
    const currentPeerId = useRef(peerId);

    useEffect(() => {
        currentPeerId.current = peerId;
    }, [peerId]);

    useEffect(() => {
        setActivePeerId(peerId);
        dispatch(resetUnreadCount(peerId));

        const loadHistory = async () => {
            if (profile?.id) {
                const history = await getMessages(profile.id, peerId);
                setMessages(history);
            }
        };
        loadHistory();

        const handleMsg = (msg: any) => {
            if (msg.from === currentPeerId.current) {
                setMessages(prev => {
                    const exists = prev.some(m => m.id === msg.data.id);
                    if (exists) return prev;
                    return [...prev, msg.data];
                });
            }
        };

        const handleRefresh = () => loadHistory();

        const handleSignalingError = (err: any) => {
            if (err.type === 'CONNECTION_FAILED' && err.peerId === peerId) {
                setConnStatus('disconnected');
                Alert.alert(
                    '连接失败',
                    '无法通过局域网找到该节点。请确保双方：\n1. 连接在同一个 WiFi 下\n2. 手机没有开启“热点”或切换到“数据网络”\n3. 对方应用正在运行',
                    [{ text: '知道了' }]
                );
            }
        };

        const handleStatusChange = (data: { peerId: string, status: any }) => {
            if (data.peerId === peerId) {
                setConnStatus(data.status);
            }
        };

        // 初始进入时，如果没有连接，尝试扫描一次
        if (signalingManager.getConnectionStatus(peerId) === 'disconnected') {
            if (profile?.id) {
                signalingManager.start(profile.id, profile.name);
            }
        }

        p2pService.on('message', handleMsg);
        p2pService.on('refresh', handleRefresh);
        signalingManager.on('error', handleSignalingError);
        signalingManager.on('statusChange', handleStatusChange);

        return () => {
            setActivePeerId(null);
            p2pService.off('message', handleMsg);
            p2pService.off('refresh', handleRefresh);
            signalingManager.off('error', handleSignalingError);
            signalingManager.off('statusChange', handleStatusChange);
        };
    }, [peerId, dispatch, profile?.id]);

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

        setMessages(prev => {
            const exists = prev.some(m => m.id === newMessage.id);
            if (exists) return prev;
            return [...prev, newMessage];
        });
        // 持久化
        if (profile?.id) {
            saveMessage(profile.id, peerId, newMessage);
        }

        const { isMe, ...payload } = newMessage;
        const sent = await p2pService.sendPayload(peerId, payload);
        if (!sent) {
            // 如果发送失败，展示一个不可达提示（不阻塞本地显示，但提醒用户）
            console.log('[Chat] 消息发送可能失败，节点不在线');
        }
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
                setMessages(prev => {
                    const exists = prev.some(m => m.id === newMessage.id);
                    if (exists) return prev;
                    return [...prev, newMessage];
                });
                if (profile?.id) {
                    saveMessage(profile.id, peerId, newMessage);
                }
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

    // 重命名逻辑
    const handleRename = () => {
        Alert.prompt(
            '修改备注',
            '为该节点设置一个好记的名字',
            [
                { text: '取消', style: 'cancel' },
                {
                    text: '确定',
                    onPress: (newName) => {
                        if (newName?.trim()) {
                            dispatch(updatePeerName({ id: peerId, name: newName.trim() }));
                        }
                    }
                }
            ],
            'plain-text',
            peerInfo?.name || peerName
        );
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
        const displayName = peerInfo?.name || peerName || '聊天';
        const isOnline = connStatus === 'connected';

        navigation.setOptions({
            headerTitle: () => (
                <TouchableOpacity onPress={handleRename} style={{ alignItems: 'center' }}>
                    <Text style={{ fontSize: 17, fontWeight: '600', color: isOnline ? '#000' : '#888' }}>
                        {displayName}
                    </Text>
                    <Text style={{ fontSize: 10, color: isOnline ? '#07C160' : '#FA5151' }}>
                        {isOnline ? '● 在线' : '○ 寻找节点中...'}
                    </Text>
                </TouchableOpacity>
            ),
            headerStyle: { backgroundColor: '#EDEDED' },
            headerShadowVisible: false
        });
    }, [navigation, peerInfo?.name, peerName, connStatus]);

    return (
        <View style={styles.container}>
            <FlatList data={messages} renderItem={renderItem} keyExtractor={item => item.id} contentContainerStyle={styles.listContent} />
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
                <View style={styles.inputBar}>
                    <TouchableOpacity style={styles.iconBtn} onPress={() => setIsVoiceMode(!isVoiceMode)}>
                        <Ionicons name={isVoiceMode ? 'keypad-outline' : 'mic-outline'} size={24} color="#666" />
                    </TouchableOpacity>
                    {isVoiceMode ? (
                        <TouchableOpacity style={styles.voiceRecordBtn} onPress={handleStartRecord}>
                            <Text style={styles.voiceRecordText}>按住 说话</Text>
                        </TouchableOpacity>
                    ) : (
                        <View style={styles.inputWrapper}>
                            <TextInput
                                placeholder="输入消息..."
                                placeholderTextColor="#999"
                                value={inputText}
                                onChangeText={setInputText}
                                style={styles.textInput}
                                multiline
                            />
                        </View>
                    )}
                    {inputText.trim() ? (
                        <TouchableOpacity style={styles.sendBtn} onPress={handleSend}>
                            <Text style={styles.sendBtnText}>发送</Text>
                        </TouchableOpacity>
                    ) : (
                        <TouchableOpacity style={styles.iconBtn} onPress={() => setShowMore(!showMore)}>
                            <Ionicons name="add-circle-outline" size={26} color="#666" />
                        </TouchableOpacity>
                    )}
                </View>
                {showMore && (
                    <View style={styles.morePanel}>
                        <TouchableOpacity style={styles.panelItem} onPress={handlePickImage}><View style={styles.panelIonicons}><Ionicons name="image-outline" size={28} color="#666" /></View><Text style={styles.panelText}>照片</Text></TouchableOpacity>
                        <TouchableOpacity style={styles.panelItem} onPress={handleGenerateCode}><View style={styles.panelIonicons}><Ionicons name="link-outline" size={28} color="#666" /></View><Text style={styles.panelText}>连接码</Text></TouchableOpacity>
                        <TouchableOpacity style={styles.panelItem} onPress={handleImportCode}><View style={styles.panelIonicons}><Ionicons name="download-outline" size={28} color="#666" /></View><Text style={styles.panelText}>导入码</Text></TouchableOpacity>
                        <TouchableOpacity style={styles.panelItem} onPress={handleClearAll}><View style={styles.panelIonicons}><Ionicons name="trash-outline" size={28} color="#FA5151" /></View><Text style={styles.panelText}>一键焚毁</Text></TouchableOpacity>
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
    inputBar: { flexDirection: 'row', backgroundColor: '#F7F7F7', paddingHorizontal: 8, paddingVertical: 6, alignItems: 'center', borderTopWidth: 0.5, borderTopColor: '#ddd' },
    inputWrapper: { flex: 1, backgroundColor: '#fff', borderRadius: 6, marginHorizontal: 8, maxHeight: 100 },
    textInput: { paddingHorizontal: 12, paddingVertical: 8, fontSize: 16, color: '#000', maxHeight: 100, minHeight: 36 },
    voiceRecordBtn: { flex: 1, height: 36, backgroundColor: '#fff', borderRadius: 6, justifyContent: 'center', alignItems: 'center', marginHorizontal: 8 },
    voiceRecordText: { fontSize: 14, color: '#333' },
    iconBtn: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
    sendBtn: { backgroundColor: '#07C160', borderRadius: 6, paddingHorizontal: 12, height: 36, justifyContent: 'center', alignItems: 'center' },
    sendBtnText: { color: '#fff', fontSize: 15, fontWeight: '500' },
    morePanel: { flexDirection: 'row', flexWrap: 'wrap', backgroundColor: '#F7F7F7', padding: 15, borderTopWidth: 0.5, borderTopColor: '#eee' },
    panelItem: { alignItems: 'center', width: 70, marginBottom: 15 },
    panelIonicons: { width: 56, height: 56, backgroundColor: '#fff', borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginBottom: 6 },
    panelText: { fontSize: 12, color: '#666' }
});

export default ChatScreen;
