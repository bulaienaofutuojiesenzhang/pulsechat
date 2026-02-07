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
