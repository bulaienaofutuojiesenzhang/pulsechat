/**
 * 极简 XOR 加解密工具
 * 用于实现“密钥不对则显示乱码”的业务需求
 */
export const XORCrypto = {
    /**
     * 加密：文本 -> XOR -> Base64
     */
    encrypt: (text: string, key: string): string => {
        if (!key) return text;
        let result = '';
        for (let i = 0; i < text.length; i++) {
            // 对每个字符进行 XOR 偏移
            result += String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length));
        }
        return btoa(unescape(encodeURIComponent(result)));
    },

    /**
     * 解密：Base64 -> XOR -> 文本
     */
    decrypt: (encoded: string, key: string): string => {
        if (!key) return encoded;
        try {
            const text = decodeURIComponent(escape(atob(encoded)));
            let result = '';
            for (let i = 0; i < text.length; i++) {
                result += String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length));
            }
            return result;
        } catch (e) {
            // 如果 Base64 解码失败，说明可能是旧格式或完全不匹配，直接返回原串（即表现为乱码）
            return encoded;
        }
    }
};
