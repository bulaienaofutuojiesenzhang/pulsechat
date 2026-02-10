import React from 'react';
import { View, StyleSheet, TouchableOpacity, Alert, TextInput } from 'react-native';
import { Text, Button, Input } from '@rneui/themed';
import { useDispatch } from 'react-redux';
import { setProfile } from '../store/slices/userSlice';
import { generateKeyPair, publicKeyToId, restoreKeyPair } from '../utils/encryption';
import Ionicons from '@react-native-vector-icons/ionicons';

const LoginScreen = () => {
    const dispatch = useDispatch();
    const [name, setName] = React.useState('');
    const [privateKeyInput, setPrivateKeyInput] = React.useState('');
    const [isRestoreMode, setIsRestoreMode] = React.useState(false);
    const [loading, setLoading] = React.useState(false);

    const handleAction = async () => {
        if (!name.trim()) {
            Alert.alert('提示', '请输入您的昵称');
            return;
        }

        setLoading(true);
        try {
            let keyPair;
            if (isRestoreMode) {
                if (!privateKeyInput.trim()) {
                    Alert.alert('错误', '请输入私钥 Hex');
                    setLoading(false);
                    return;
                }
                keyPair = await restoreKeyPair(privateKeyInput.trim());
            } else {
                keyPair = await generateKeyPair();
            }

            const { publicKey, privateKey } = keyPair;
            const id = publicKeyToId(publicKey);

            dispatch(setProfile({
                id,
                publicKey,
                privateKey,
                name: name.trim()
            }));
        } catch (error: any) {
            console.error('Action failed:', error);
            Alert.alert('失败', error.message || '操作失败，请检查私钥格式');
        } finally {
            setLoading(false);
        }
    };

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Ionicons name="shield-checkmark-outline" size={80} color="#C19769" />
                <Text h3 style={styles.title}>PulseChat</Text>
                <Text style={styles.subtitle}>端到端加密 · 局域网 P2P 通信</Text>
            </View>

            <View style={styles.form}>
                <Input
                    placeholder="您的昵称"
                    leftIcon={<Ionicons name="person-outline" size={20} color="#666" />}
                    value={name}
                    onChangeText={setName}
                    containerStyle={styles.inputContainer}
                />

                {isRestoreMode && (
                    <Input
                        placeholder="私钥 Hex (32字节或64字节)"
                        leftIcon={<Ionicons name="key-outline" size={20} color="#666" />}
                        value={privateKeyInput}
                        onChangeText={setPrivateKeyInput}
                        containerStyle={styles.inputContainer}
                        autoCapitalize="none"
                        secureTextEntry
                    />
                )}

                <Button
                    title={isRestoreMode ? "立即恢复身份" : "开启加密之旅"}
                    onPress={handleAction}
                    loading={loading}
                    buttonStyle={styles.mainButton}
                    titleStyle={styles.mainButtonTitle}
                />

                <TouchableOpacity
                    style={styles.switchBtn}
                    onPress={() => setIsRestoreMode(!isRestoreMode)}
                >
                    <Text style={styles.switchText}>
                        {isRestoreMode ? "没有身份？生成新节点" : "已有私钥？手动恢复身份"}
                    </Text>
                </TouchableOpacity>
            </View>

            <View style={styles.footer}>
                <Text style={styles.footerText}>身份信息将加密存储于本地设备</Text>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        padding: 30,
        backgroundColor: '#fff',
        justifyContent: 'space-between',
    },
    header: {
        alignItems: 'center',
        marginTop: 60,
    },
    title: {
        marginTop: 15,
        fontWeight: '700',
        textAlign: 'center',
    },
    subtitle: {
        color: '#888',
        fontSize: 14,
        marginTop: 5,
        textAlign: 'center',
    },
    form: {
        flex: 1,
        justifyContent: 'center',
    },
    inputContainer: {
        paddingHorizontal: 0,
        marginBottom: 10,
    },
    mainButton: {
        backgroundColor: '#C19769',
        borderRadius: 12,
        paddingVertical: 14,
        marginTop: 20,
    },
    mainButtonTitle: {
        fontSize: 16,
        fontWeight: '600',
    },
    switchBtn: {
        marginTop: 20,
        alignItems: 'center',
    },
    switchText: {
        color: '#007AFF',
        fontSize: 14,
    },
    footer: {
        alignItems: 'center',
        marginBottom: 20,
    },
    footerText: {
        color: '#bbb',
        fontSize: 12,
        textAlign: 'center',
    }
});

export default LoginScreen;
