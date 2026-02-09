import React from 'react';
import { View, StyleSheet, FlatList, KeyboardAvoidingView, Platform } from 'react-native';
import { Text, Input, Button, ListItem, Icon } from '@rneui/themed';
import { useSelector } from 'react-redux';
import { RootState } from '../store';
import { p2pService } from '../utils/p2pService';

import { saveMessage, getMessages } from '../utils/storage';

const ChatScreen = ({ route }) => {
    const { peerId, peerName } = route.params || { peerId: 'test_peer', peerName: '远端用户' };
    const [messages, setMessages] = React.useState([]);
    const [inputText, setInputText] = React.useState('');
    const profile = useSelector((state: RootState) => state.user.profile);

    React.useEffect(() => {
        // Load history
        const history = getMessages(peerId);
        setMessages(history);

        const handleMessage = (data) => {
            if (data.from === peerId) {
                const newMessage = { id: Date.now().toString(), text: data.text, isMe: false };
                setMessages(prev => [...prev, newMessage]);
                saveMessage(peerId, newMessage);
            }
        };

        p2pService.on('message', handleMessage);
        return () => {
            p2pService.off('message', handleMessage);
        };
    }, [peerId]);

    const handleSend = () => {
        if (inputText.trim()) {
            p2pService.sendMessage(peerId, inputText.trim());
            const newMessage = { id: Date.now().toString(), text: inputText.trim(), isMe: true };
            setMessages(prev => [...prev, newMessage]);
            saveMessage(peerId, newMessage);
            setInputText('');
        }
    };

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={90}
        >
            <View style={styles.header}>
                <Text h4>{peerName}</Text>
                <Text style={styles.peerId}>ID: {peerId.substring(0, 12)}...</Text>
            </View>

            <FlatList
                data={messages}
                keyExtractor={item => item.id}
                renderItem={({ item }) => (
                    <View style={[styles.messageBubble, item.isMe ? styles.myMessage : styles.theirMessage]}>
                        <Text style={item.isMe ? styles.myMessageText : styles.theirMessageText}>{item.text}</Text>
                    </View>
                )}
                contentContainerStyle={styles.listContent}
            />

            <View style={styles.inputContainer}>
                <Input
                    placeholder="发送消息..."
                    value={inputText}
                    onChangeText={setInputText}
                    containerStyle={styles.input}
                    inputContainerStyle={{ borderBottomWidth: 0 }}
                />
                <Button
                    icon={<Icon iconProps={{ name: "send-outline", color: "#fff" }} />}
                    onPress={handleSend}
                    buttonStyle={styles.sendButton}
                />
            </View>
        </KeyboardAvoidingView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#fff',
    },
    header: {
        padding: 15,
        backgroundColor: '#f8f8f8',
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
    },
    peerId: {
        fontSize: 12,
        color: '#999',
    },
    listContent: {
        padding: 15,
    },
    messageBubble: {
        padding: 10,
        borderRadius: 15,
        marginBottom: 10,
        maxWidth: '80%',
    },
    myMessage: {
        alignSelf: 'flex-end',
        backgroundColor: '#2089dc',
    },
    theirMessage: {
        alignSelf: 'flex-start',
        backgroundColor: '#f0f0f0',
    },
    myMessageText: {
        color: '#fff',
    },
    theirMessageText: {
        color: '#333',
    },
    inputContainer: {
        flexDirection: 'row',
        padding: 10,
        borderTopWidth: 1,
        borderTopColor: '#eee',
        alignItems: 'center',
    },
    input: {
        flex: 1,
        height: 50,
    },
    sendButton: {
        borderRadius: 25,
        width: 50,
        height: 50,
    },
});

export default ChatScreen;
