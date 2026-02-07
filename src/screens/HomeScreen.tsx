import React from 'react';
import { View, StyleSheet, FlatList } from 'react-native';
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
            <ListItem bottomDivider>
                <ListItem.Content>
                    <ListItem.Title style={styles.welcome}>你好, {profile?.name}</ListItem.Title>
                    <ListItem.Subtitle>ID: {profile?.id?.substring(0, 16)}...</ListItem.Subtitle>
                </ListItem.Content>
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
                            <Icon name="person" />
                            <ListItem.Content>
                                <ListItem.Title>{item.name || '未知节点'}</ListItem.Title>
                                <ListItem.Subtitle>{item.id.substring(0, 20)}...</ListItem.Subtitle>
                            </ListItem.Content>
                            <ListItem.Chevron />
                        </ListItem>
                    )}
                />
            ) : (
                <View style={styles.emptyContainer}>
                    <Icon name="radar" type="material-community" size={60} color="#ccc" />
                    <Text style={styles.emptyText}>正在发现附近的节点...</Text>
                </View>
            )}

            <FAB
                icon={{ name: 'add', color: 'white' }}
                color="#2089dc"
                placement="right"
                title="开始新对话"
                onPress={() => { }}
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
});

export default HomeScreen;
