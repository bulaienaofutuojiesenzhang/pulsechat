import { ready, crypto_sign_keypair } from 'react-native-libsodium';
import { Buffer } from 'buffer';

export const initSodium = async () => {
    await ready;
};

export const generateKeyPair = async () => {
    await ready;
    const { publicKey, privateKey } = await crypto_sign_keypair();
    return {
        publicKey: Buffer.from(publicKey).toString('hex'),
        privateKey: Buffer.from(privateKey).toString('hex'),
    };
};

export const publicKeyToId = (publicKey: string) => {
    // Simple ID generation from public key
    return publicKey.substring(0, 32);
};

export const restoreKeyPair = async (privateKeyHex: string) => {
    await ready;
    const sk = Buffer.from(privateKeyHex, 'hex');

    // 如果是 64 字节 (128 字符) 的完整私钥，公钥就在后 32 字节
    if (sk.length === 64) {
        const pk = sk.slice(32);
        return {
            publicKey: Buffer.from(pk).toString('hex'),
            privateKey: privateKeyHex,
        };
    }
    // 如果是 32 字节 (64 字符) 的种子，通过 libsodium 派生
    else if (sk.length === 32) {
        const { crypto_sign_seed_keypair } = require('react-native-libsodium');
        const { publicKey, privateKey } = await crypto_sign_seed_keypair(sk);
        return {
            publicKey: Buffer.from(publicKey).toString('hex'),
            privateKey: Buffer.from(privateKey).toString('hex'),
        };
    }

    throw new Error('无效的私钥长度');
};
