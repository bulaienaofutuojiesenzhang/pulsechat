import React, { useState } from 'react';
import {
    View,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    Alert,
    Clipboard,
    Text,
    Platform,
} from 'react-native';
import { ListItem } from '@rneui/themed';
import Ionicons from '@react-native-vector-icons/ionicons';
import { useSelector, useDispatch } from 'react-redux';
import { useNavigation } from '@react-navigation/native';
import { RootState } from '../store';
import { clearProfile } from '../store/slices/userSlice';
import { resetChat } from '../store/slices/chatSlice';
import { hybridSignalingManager } from '../utils/hybridSignalingManager';

const ProfileScreen = () => {
    const navigation = useNavigation() as any;
    const dispatch = useDispatch();
    const profile = useSelector((state: RootState) => (state as any).user?.profile);
    const passphrase = useSelector((state: RootState) => (state as any).user?.passphrase);
    const [showPrivateKey, setShowPrivateKey] = useState(false);
    const [showPassphrase, setShowPassphrase] = useState(false);

    const handleCopyId = () => {
        Clipboard.setString(profile?.id || '');
        Alert.alert('已复制', '您的 ID 已复制到剪贴板');
    };

    const handleCopyPublicKey = () => {
        Clipboard.setString(profile?.publicKey || '');
        Alert.alert('已复制', '公钥已复制到剪贴板');
    };

    const handleViewPrivateKey = () => {
        Alert.alert(
            '安全警告',
            '私钥是您身份的唯一凭证，请勿泄露给任何人！确定要查看吗？',
            [
                { text: '取消', style: 'cancel' },
                { text: '查看', onPress: () => setShowPrivateKey(true) },
            ]
        );
    };

    const handleCopyPrivateKey = () => {
        Alert.alert(
            '确认复制',
            '复制私钥存在安全风险，请确保在安全环境下操作',
            [
                { text: '取消', style: 'cancel' },
                {
                    text: '复制',
                    style: 'destructive',
                    onPress: () => {
                        Clipboard.setString(profile?.privateKey || '');
                        Alert.alert('已复制', '私钥已复制，请妥善保管');
                    },
                },
            ]
        );
    };

    const handleLogout = () => {
        Alert.alert(
            '退出登录',
            '将清除本地身份数据，请确保已备份私钥！',
            [
                { text: '取消', style: 'cancel' },
                {
                    text: '退出',
                    style: 'destructive',
                    onPress: () => {
                        hybridSignalingManager.stop();
                        dispatch(clearProfile());
                        dispatch(resetChat());
                    },
                },
            ]
        );
    };

    const handleSetPassphrase = () => {
        Alert.prompt(
            '设置全局密钥',
            '此密钥用于所有消息的加解密，请确保与对方一致',
            [
                { text: '取消', style: 'cancel' },
                {
                    text: '确定',
                    onPress: (val) => {
                        if (val) {
                            const { setPassphrase } = require('../store/slices/userSlice');
                            dispatch(setPassphrase(val));
                            Alert.alert('成功', '全局密钥已更新');
                        }
                    }
                }
            ],
            'plain-text',
            passphrase
        );
    };

    const renderKeyItem = (label: string, value: string, icon: string, color: string, isSensitive: boolean, show: boolean, onToggle: () => void, onCopy: () => void) => (
        <View style={styles.keyItemContainer}>
            <View style={styles.keyItemHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Ionicons name={icon as any} size={18} color={color} />
                    <Text style={styles.keyItemLabel}>{label}</Text>
                </View>
                <View style={{ flexDirection: 'row' }}>
                    {isSensitive && (
                        <TouchableOpacity onPress={onToggle} style={styles.keyItemAction}>
                            <Ionicons name={show ? "eye-off-outline" : "eye-outline"} size={18} color="#576B95" />
                        </TouchableOpacity>
                    )}
                    <TouchableOpacity onPress={onCopy} style={styles.keyItemAction}>
                        <Ionicons name="copy-outline" size={18} color="#576B95" />
                    </TouchableOpacity>
                </View>
            </View>
            <View style={styles.keyContentBox}>
                <Text style={styles.keyFullText} selectable>
                    {isSensitive && !show ? '••••••••••••••••••••••••••••••••' : (value || '未设置')}
                </Text>
            </View>
        </View>
    );

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <Ionicons name="chevron-back" size={24} color="#000" />
                    <Text style={styles.backText}>返回</Text>
                </TouchableOpacity>
                <Text style={styles.headerTitle}>个人资料</Text>
                <View style={styles.placeholder} />
            </View>

            <ScrollView style={styles.content}>
                <View style={styles.profileHeader}>
                    <View style={styles.avatar}>
                        <Text style={styles.avatarText}>
                            {profile?.name?.charAt(0) || '?'}
                        </Text>
                    </View>
                    <Text style={styles.userName}>{profile?.name}</Text>
                    <TouchableOpacity style={styles.idRow} onPress={handleCopyId}>
                        <Text style={styles.idValue}>ID: {profile?.id}</Text>
                    </TouchableOpacity>
                </View>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>安全通信设置</Text>
                    <ListItem bottomDivider onPress={handleSetPassphrase} containerStyle={styles.listItem}>
                        <Ionicons name="lock-closed-outline" size={20} color="#07C160" />
                        <ListItem.Content>
                            <ListItem.Title style={styles.listTitle}>全局通行密钥 (Passphrase)</ListItem.Title>
                            <ListItem.Subtitle style={styles.keyText}>
                                {showPassphrase ? passphrase : '•••••• (点击修改)'}
                            </ListItem.Subtitle>
                        </ListItem.Content>
                        <TouchableOpacity onPress={() => setShowPassphrase(!showPassphrase)}>
                            <Ionicons name={showPassphrase ? "eye-off-outline" : "eye-outline"} size={20} color="#999" />
                        </TouchableOpacity>
                    </ListItem>
                </View>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>身份凭证 (请妥善备份私钥)</Text>

                    {renderKeyItem(
                        '节点公钥',
                        profile?.publicKey || '',
                        'key-outline',
                        '#07C160',
                        false,
                        true,
                        () => { },
                        handleCopyPublicKey
                    )}

                    {renderKeyItem(
                        '节点私钥',
                        profile?.privateKey || '',
                        'lock-closed-outline',
                        '#FA5151',
                        true,
                        showPrivateKey,
                        () => setShowPrivateKey(!showPrivateKey),
                        handleCopyPrivateKey
                    )}
                </View>

                <View style={styles.warningBox}>
                    <Ionicons name="warning-outline" size={16} color="#D48806" />
                    <Text style={styles.warningText}>
                        卸载 App 会导致身份丢失。请务必保存上方【私钥】，以便在新设备或重新安装后恢复帐号。
                    </Text>
                </View>

                <View style={styles.section}>
                    <ListItem
                        bottomDivider
                        onPress={() => Alert.alert('关于', 'PulseChat v0.0.1\n基于 WebRTC & Sodium 的 P2P 加密通信')}
                        containerStyle={styles.listItem}
                    >
                        <Ionicons name="information-circle-outline" size={20} color="#666" />
                        <ListItem.Content>
                            <ListItem.Title style={styles.listTitle}>关于 PulseChat</ListItem.Title>
                        </ListItem.Content>
                        <ListItem.Chevron />
                    </ListItem>
                </View>

                <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
                    <Text style={styles.logoutText}>退出登录 (需手动备份私钥)</Text>
                </TouchableOpacity>
            </ScrollView>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#EDEDED',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#EDEDED',
        paddingHorizontal: 10,
        paddingVertical: 12,
        borderBottomWidth: 0.5,
        borderBottomColor: '#ddd',
    },
    backBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 5,
    },
    backText: {
        fontSize: 16,
        color: '#000',
    },
    headerTitle: {
        fontSize: 17,
        fontWeight: '600',
        color: '#000',
    },
    placeholder: {
        width: 70,
    },
    content: {
        flex: 1,
    },
    profileHeader: {
        backgroundColor: '#fff',
        alignItems: 'center',
        paddingVertical: 30,
        marginBottom: 10,
    },
    avatar: {
        width: 80,
        height: 80,
        borderRadius: 8,
        backgroundColor: '#07C160',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 15,
    },
    avatarText: {
        fontSize: 36,
        color: '#fff',
        fontWeight: '600',
    },
    userName: {
        fontSize: 22,
        fontWeight: '600',
        color: '#000',
        marginBottom: 8,
    },
    idRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    idLabel: {
        fontSize: 14,
        color: '#888',
    },
    idValue: {
        fontSize: 14,
        color: '#576B95',
    },
    section: {
        backgroundColor: '#fff',
        marginBottom: 10,
    },
    sectionTitle: {
        fontSize: 13,
        color: '#888',
        paddingHorizontal: 15,
        paddingTop: 15,
        paddingBottom: 8,
    },
    listItem: {
        paddingVertical: 14,
    },
    listTitle: {
        fontSize: 16,
        color: '#000',
    },
    keyText: {
        fontSize: 12,
        color: '#888',
        fontFamily: 'monospace',
        marginTop: 4,
    },
    actionText: {
        fontSize: 14,
        color: '#576B95',
    },
    warningBox: {
        flexDirection: 'row',
        backgroundColor: '#FFF9E6',
        marginHorizontal: 15,
        marginBottom: 10,
        padding: 12,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: '#FFE58F',
        alignItems: 'flex-start',
    },
    warningText: {
        flex: 1,
        fontSize: 13,
        color: '#D48806',
        lineHeight: 20,
        marginLeft: 8,
    },
    logoutBtn: {
        backgroundColor: '#fff',
        marginHorizontal: 15,
        marginTop: 20,
        marginBottom: 40,
        paddingVertical: 14,
        borderRadius: 8,
        alignItems: 'center',
    },
    logoutText: {
        fontSize: 16,
        color: '#FA5151',
    },
    keyItemContainer: {
        padding: 15,
        borderBottomWidth: 0.5,
        borderBottomColor: '#eee',
    },
    keyItemHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    keyItemLabel: {
        fontSize: 14,
        fontWeight: '600',
        color: '#333',
        marginLeft: 6,
    },
    keyItemAction: {
        marginLeft: 15,
        padding: 4,
    },
    keyContentBox: {
        backgroundColor: '#F8F8F8',
        padding: 10,
        borderRadius: 4,
        borderWidth: 0.5,
        borderColor: '#E8E8E8',
    },
    keyFullText: {
        fontSize: 12,
        color: '#666',
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
        lineHeight: 18,
    },
});

export default ProfileScreen;
