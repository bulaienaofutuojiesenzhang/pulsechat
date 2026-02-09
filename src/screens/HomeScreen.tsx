import React, { useState } from 'react';
import { View, FlatList, StyleSheet, Alert, TouchableOpacity, Clipboard, Text } from 'react-native';
import { ListItem, FAB, Badge, SearchBar } from '@rneui/themed';
import Ionicons from '@react-native-vector-icons/ionicons';
import { useNavigation } from '@react-navigation/native';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '../store';
import { hybridSignalingManager } from '../utils/hybridSignalingManager';
import { upsertPeer, updatePeerName } from '../store/slices/chatSlice';

const HomeScreen = () => {
    const navigation = useNavigation() as any;
    const dispatch = useDispatch();
    const profile = useSelector((state: RootState) => (state as any).user?.profile);
    const peers = useSelector((state: RootState) => state.chat.peers);
    const [search, setSearch] = useState('');

    const peerList = React.useMemo(() => {
        return Object.values(peers)
            .filter(p => p.id !== profile?.id && p.id !== '') // 强力过滤自己和空节点
            .sort((a, b) => {
                const timeA = a.lastMessage?.timestamp || 0;
                const timeB = b.lastMessage?.timestamp || 0;
                return timeB - timeA;
            });
    }, [peers, profile?.id]);

    React.useEffect(() => {
        if (profile?.id) {
            hybridSignalingManager.start(profile.id, profile.name);

            const handlePeerFound = (peer: any) => {
                dispatch(upsertPeer(peer));
            };

            hybridSignalingManager.on('peerFound', handlePeerFound);
            return () => {
                hybridSignalingManager.off('peerFound', handlePeerFound);
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

    const handleLongPress = (item: any) => {
        Alert.prompt(
            '修改备注',
            `为节点 ${item.id.substring(0, 8)}... 设置备注`,
            [
                { text: '取消', style: 'cancel' },
                {
                    text: '确定',
                    onPress: (newName) => {
                        if (newName?.trim()) {
                            dispatch(updatePeerName({ id: item.id, name: newName.trim() }));
                        }
                    }
                }
            ],
            'plain-text',
            item.name
        );
    };

    const renderItem = ({ item }: { item: any }) => (
        <ListItem
            bottomDivider
            onPress={() => navigation.navigate('Chat', { peerId: item.id, peerName: item.name })}
            onLongPress={() => handleLongPress(item)}
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
                    <ListItem.Title style={styles.peerName}>
                        {item.name || '未知节点'}
                    </ListItem.Title>
                    <Text style={styles.timeText}>{formatTime(item.lastMessage?.timestamp)}</Text>
                </View>
                <ListItem.Subtitle numberOfLines={1} style={styles.lastMsg}>
                    {item.lastMessage?.text || `ID: ${item.id.substring(0, 16)}...`}
                </ListItem.Subtitle>
            </ListItem.Content>
        </ListItem>
    );

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.headerTitle}>PulseChat</Text>
                <View style={styles.headerRight}>
                    <TouchableOpacity
                        style={styles.headerBtn}
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
                                                const id = peerId.trim();
                                                const defaultName = `Node-${id.substring(id.length - 8)}`;
                                                navigation.navigate('Chat', {
                                                    peerId: id,
                                                    peerName: defaultName
                                                });
                                            }
                                        }
                                    }
                                ]
                            );
                        }}
                    >
                        <Ionicons name="add-circle-outline" size={26} color="#000" />
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={styles.headerBtn}
                        onPress={() => navigation.navigate('Profile')}
                    >
                        <Ionicons name="person-circle-outline" size={26} color="#000" />
                    </TouchableOpacity>
                </View>
            </View>

            <SearchBar
                placeholder="搜索聊天..."
                onChangeText={setSearch}
                value={search}
                containerStyle={styles.searchBar}
                inputContainerStyle={styles.searchInput}
                searchIcon={<Ionicons name="search-outline" size={20} color="#999" />}
                clearIcon={<Ionicons name="close-circle-outline" size={20} color="#999" />}
            />

            {peerList.length > 0 ? (
                <FlatList
                    data={peerList.filter(p => (p.name || '').includes(search))}
                    keyExtractor={item => item.id}
                    renderItem={renderItem}
                />
            ) : (
                <View style={styles.emptyContainer}>
                    <Ionicons name="chatbubbles-outline" size={60} color="#ccc" />
                    <Text style={styles.emptyText}>快去开启你的第一段 P2P 加密聊天吧</Text>
                    <Text style={styles.emptyHint}>点击右上角 + 按钮，输入对方节点 ID</Text>
                </View>
            )}

            <FAB
                icon={<Ionicons name="add" size={24} color="#fff" />}
                color="#07C160"
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
                                        const id = peerId.trim();
                                        const defaultName = `Node-${id.substring(id.length - 8)}`;
                                        navigation.navigate('Chat', {
                                            peerId: id,
                                            peerName: defaultName
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
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 15,
        paddingVertical: 12,
        backgroundColor: '#EDEDED',
        borderBottomWidth: 0.5,
        borderBottomColor: '#ddd'
    },
    headerTitle: { fontSize: 18, fontWeight: '700', color: '#000' },
    headerRight: { flexDirection: 'row', alignItems: 'center' },
    headerBtn: { padding: 6, marginLeft: 10 },
    searchBar: { backgroundColor: '#fff', paddingHorizontal: 10, borderBottomWidth: 0.5, borderBottomColor: '#eee' },
    searchInput: { backgroundColor: '#f5f5f5', borderRadius: 8, height: 36 },
    listItem: { height: 72, paddingVertical: 10 },
    avatarContainer: { width: 48, height: 48, backgroundColor: '#E5E5E5', borderRadius: 6, justifyContent: 'center', alignItems: 'center' },
    avatarText: { fontSize: 24 },
    badgeContainer: { position: 'absolute', top: -4, right: -4 },
    listHeader: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', marginBottom: 4 },
    peerName: { fontSize: 16, fontWeight: '500', color: '#000' },
    timeText: { fontSize: 12, color: '#b2b2b2' },
    lastMsg: { fontSize: 14, color: '#888' },
    emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40 },
    emptyText: { marginTop: 20, fontSize: 16, color: '#333', textAlign: 'center' },
    emptyHint: { marginTop: 8, fontSize: 13, color: '#b2b2b2', textAlign: 'center' },
    fab: { marginBottom: 20, marginRight: 10 }
});

export default HomeScreen;
