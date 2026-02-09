import React, { useState } from 'react';
import { View, FlatList, StyleSheet, Alert, TouchableOpacity, Clipboard, Text } from 'react-native';
import { ListItem, FAB, Badge, SearchBar } from '@rneui/themed';
import { useNavigation } from '@react-navigation/native';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '../store';
import { signalingManager } from '../utils/signalingManager';
import { upsertPeer } from '../store/slices/chatSlice';

const HomeScreen = () => {
    const navigation = useNavigation() as any;
    const dispatch = useDispatch();
    const profile = useSelector((state: RootState) => (state as any).user?.profile);
    const peers = useSelector((state: RootState) => state.chat.peers);
    const [search, setSearch] = useState('');

    const peerList = Object.values(peers).sort((a, b) => {
        const timeA = a.lastMessage?.timestamp || 0;
        const timeB = b.lastMessage?.timestamp || 0;
        return timeB - timeA;
    });

    React.useEffect(() => {
        if (profile?.id) {
            signalingManager.start(profile.id);

            const handlePeerFound = (peer: any) => {
                dispatch(upsertPeer(peer));
            };

            signalingManager.on('peerFound', handlePeerFound);
            return () => {
                signalingManager.off('peerFound', handlePeerFound);
                // 注意：不要在卸载时 stop signaling，否则后台接收不到消息
                // 除非是彻底退出应用
            };
        }
    }, [profile?.id, dispatch]);

    const formatTime = (timestamp: number) => {
        if (!timestamp) return '';
        const date = new Date(timestamp);
        const now = new Date();
        if (date.toDateString() === now.toDateString()) {
            return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
        }
        return `${date.getMonth() + 1}/${date.getDate()}`;
    };

    const renderItem = ({ item }: { item: any }) => (
        <ListItem
            bottomDivider
            onPress={() => navigation.navigate('Chat', { peerId: item.id, peerName: item.name })}
            containerStyle={styles.listItem}
        >
            <View style={styles.avatarContainer}>
                <Text style={styles.avatarText}>👤</Text>
                {item.unreadCount > 0 && (
                    <Badge
                        status="error"
                        value={item.unreadCount}
                        containerStyle={styles.badgeContainer}
                    />
                )}
            </View>
            <ListItem.Content>
                <View style={styles.listHeader}>
                    <ListItem.Title style={styles.peerName}>{item.name || '未知节点'}</ListItem.Title>
                    <Text style={styles.timeText}>{formatTime(item.lastMessage?.timestamp)}</Text>
                </View>
                <ListItem.Subtitle numberOfLines={1} style={styles.lastMsg}>
                    {item.lastMessage?.text || '暂无消息'}
                </ListItem.Subtitle>
            </ListItem.Content>
        </ListItem>
    );

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity
                    onPress={() => {
                        Clipboard.setString(profile?.id || '');
                        Alert.alert('已复制 ID', profile?.id);
                    }}
                    style={styles.profileInfo}
                >
                    <Text style={styles.welcomeText}>你好, {profile?.name} 📋</Text>
                </TouchableOpacity>
            </View>

            <SearchBar
                placeholder="搜索聊天..."
                onChangeText={setSearch}
                value={search}
                platform="android"
                containerStyle={styles.searchBar}
                inputContainerStyle={styles.searchInput}
            />

            {peerList.length > 0 ? (
                <FlatList
                    data={peerList.filter(p => p.name.includes(search))}
                    keyExtractor={item => item.id}
                    renderItem={renderItem}
                />
            ) : (
                <View style={styles.emptyContainer}>
                    <Text style={{ fontSize: 60, color: "#ccc" }}>🔍</Text>
                    <Text style={styles.emptyText}>快去开启你的第一段 P2P 加密聊天吧</Text>
                    <Text style={styles.emptyHint}>点击下方按钮,输入对方节点 ID</Text>
                </View>
            )}

            <FAB
                icon={<Text style={{ fontSize: 24, color: 'white' }}>➕</Text>}
                color="#07C160" // 微信绿
                placement="right"
                onPress={() => {
                    Alert.prompt(
                        '添加 P2P 节点',
                        '请输入对方的完整 ID 进行加密通信',
                        [
                            { text: '取消', style: 'cancel' },
                            {
                                text: '确定',
                                onPress: (peerId) => {
                                    if (peerId?.trim()) {
                                        navigation.navigate('Chat', {
                                            peerId: peerId.trim(),
                                            peerName: '新朋友'
                                        });
                                    }
                                }
                            }
                        ]
                    );
                }}
                style={styles.fab}
            />
        </View>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#fff' },
    header: { padding: 15, backgroundColor: '#EDEDED', borderBottomWidth: 0.5, borderBottomColor: '#ddd' },
    welcomeText: { fontSize: 16, fontWeight: '600', color: '#000' },
    profileInfo: { alignSelf: 'flex-start' },
    searchBar: { backgroundColor: '#fff', paddingHorizontal: 10, borderBottomWidth: 0.5, borderBottomColor: '#eee' },
    searchInput: { backgroundColor: '#f5f5f5', borderRadius: 8, height: 40 },
    listItem: { height: 75, paddingVertical: 10 },
    avatarContainer: { width: 50, height: 50, backgroundColor: '#f0f0f0', borderRadius: 6, justifyContent: 'center', alignItems: 'center' },
    avatarText: { fontSize: 28 },
    badgeContainer: { position: 'absolute', top: -4, right: -4 },
    listHeader: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', marginBottom: 4 },
    peerName: { fontSize: 17, fontWeight: '500', color: '#000' },
    timeText: { fontSize: 12, color: '#b2b2b2' },
    lastMsg: { fontSize: 14, color: '#888' },
    emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40 },
    emptyText: { marginTop: 20, fontSize: 16, color: '#333', textAlign: 'center' },
    emptyHint: { marginTop: 8, fontSize: 13, color: '#b2b2b2', textAlign: 'center' },
    fab: { marginBottom: 20, marginRight: 10 }
});

export default HomeScreen;
