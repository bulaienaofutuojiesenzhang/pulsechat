export const SIGNALING_SERVER = {
    url: 'http://39.96.165.216:8001',
    reconnectionAttempts: 5,
    reconnectionDelay: 2000,
    timeout: 10000,
};

export const STUN_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
];

export const COMMUNICATION_MODE = {
    LAN: 'lan' as const,
    INTERNET: 'internet' as const,
};
