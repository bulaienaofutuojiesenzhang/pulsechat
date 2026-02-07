import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, Button, Input } from '@rneui/themed';
import { useDispatch } from 'react-redux';
import { setProfile } from '../store/slices/userSlice';
import { generateKeyPair, publicKeyToId } from '../utils/encryption';

const LoginScreen = () => {
    const dispatch = useDispatch();
    const [name, setName] = React.useState('');
    const [loading, setLoading] = React.useState(false);

    const handleRegister = async () => {
        if (name.trim()) {
            setLoading(true);
            try {
                const { publicKey, privateKey } = await generateKeyPair();
                const id = publicKeyToId(publicKey);
                dispatch(setProfile({
                    id,
                    publicKey,
                    privateKey,
                    name: name.trim()
                }));
            } catch (error) {
                console.error('Failed to generate identity:', error);
            } finally {
                setLoading(false);
            }
        }
    };

    return (
        <View style={styles.container}>
            <Text h3 style={styles.title}>欢迎使用 PulseChat</Text>
            <Text style={styles.subtitle}>您的隐私，由您掌控</Text>
            <Input
                placeholder="请输入昵称"
                value={name}
                onChangeText={setName}
                containerStyle={styles.input}
            />
            <Button
                title="快速开始 (生成身份)"
                onPress={handleRegister}
                loading={loading}
                buttonStyle={styles.button}
            />
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        padding: 20,
        justifyContent: 'center',
        backgroundColor: '#fff',
    },
    title: {
        textAlign: 'center',
        marginBottom: 10,
    },
    subtitle: {
        textAlign: 'center',
        color: '#666',
        marginBottom: 40,
    },
    input: {
        marginBottom: 20,
    },
    button: {
        borderRadius: 8,
        paddingVertical: 12,
    },
});

export default LoginScreen;
