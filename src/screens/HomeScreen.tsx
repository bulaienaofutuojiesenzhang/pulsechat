import React from 'react';
import { View, StyleSheet, FlatList, Alert, TouchableOpacity, Clipboard } from 'react-native';
import { Text, ListItem, Icon, FAB } from '@rneui/themed';
import { useSelector } from 'react-redux';
import { RootState } from '../store';
import { signalingManager } from '../utils/signalingManager';

const HomeScreen = ({ navigation }) => {
    const profile = useSelector((state: RootState) => state.user.profile);
    const [discoveredPeers, setDiscoveredPeers] = React.useState([]);

    React.useEffect(() => {
        if (profile?.id) {
            signalingManager.start(profile.id);

            // Listen for discovered peers
            const handlePeerFound = (peer) => {
                setDiscoveredPeers(prev => {
                    if (prev.find(p => p.id === peer.id)) return prev;
                    return [...prev, peer];
                });
            };

            signalingManager.on('peerFound', handlePeerFound);
            return () => {
                signalingManager.stop();
                signalingManager.off('peerFound', handlePeerFound);
            };
        }
    }, [profile?.id]);

    return (
        <View style={styles.container}>
            <ListItem
                bottomDivider
                onPress={() => {
                    if (profile?.id) {
                        Clipboard.setString(profile.id);
                        Alert.alert('已复制', `完整 ID 已复制到剪贴板`);
                    }
                }}
            >
                <ListItem.Content>
                    <ListItem.Title style={styles.welcome}>你好, {profile?.name}</ListItem.Title>
                    <ListItem.Subtitle>ID: {profile?.id?.substring(0, 16)}... (点击复制)</ListItem.Subtitle>
                </ListItem.Content>
                <Icon iconProps={{ name: "copy-outline", size: 20, color: "#999" }} />
            </ListItem>

            {discoveredPeers.length > 0 ? (
                <FlatList
                    data={discoveredPeers}
                    keyExtractor={item => item.id}
                    renderItem={({ item }) => (
                        <ListItem
                            bottomDivider
                            onPress={() => navigation.navigate('Chat', { peerId: item.id, peerName: item.name })}
                        >
                            <Icon iconProps={{ name: "person-outline" }} />
                            <ListItem.Content>
                                <ListItem.Title>{item.name || '未知节点'}</ListItem.Title>
                                <ListItem.Subtitle>{item.id.substring(0, 20)}...</ListItem.Subtitle>
                            </ListItem.Content>
                            <Icon iconProps={{ name: "chevron-forward-outline", size: 20, color: "#999" }} />
                        </ListItem>
                    )}
                />
            ) : (
                <View style={styles.emptyContainer}>
                    <Icon iconProps={{ name: "search-outline", size: 60, color: "#ccc" }} />
                    <Text style={styles.emptyText}>暂无发现的节点</Text>
                    <Text style={styles.emptyHint}>点击右下角 + 按钮,输入对方 ID 开始对话</Text>
                </View>
            )}

            <FAB
                icon={<Icon iconProps={{ name: 'add-outline', color: 'white' }} />}
                color="#2089dc"
                placement="right"
                title="开始新对话"
                onPress={() => {
                    Alert.prompt(
                        '开始新对话',
                        '请输入或粘贴对方的完整节点 ID',
                        [
                            { text: '取消', style: 'cancel' },
                            {
                                text: '开始对话',
                                onPress: (peerId) => {
                                    if (peerId && peerId.trim()) {
                                        navigation.navigate('Chat', {
                                            peerId: peerId.trim(),
                                            peerName: '手动连接'
                                        });
                                    } else {
                                        Alert.alert('错误', '请输入有效的节点 ID');
                                    }
                                }
                            }
                        ],
                        'plain-text'
                    );
                }}
            />
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f5f5f5',
    },
    welcome: {
        fontWeight: 'bold',
        fontSize: 18,
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    emptyText: {
        marginTop: 10,
        color: '#999',
    },
    emptyHint: {
        marginTop: 5,
        color: '#bbb',
        fontSize: 12,
        textAlign: 'center',
        paddingHorizontal: 20,
    },
});

export default HomeScreen;
