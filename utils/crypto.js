import { MlKem768 } from "mlkem";
import crypto from 'crypto';

// 1. AES-GCM ENCRYPTION
export const encryptGCM = (text, sessionKey) => {
    try {
        const iv = crypto.randomBytes(12);
        const keyBuffer = Buffer.from(sessionKey);
        const cipher = crypto.createCipheriv('aes-256-gcm', keyBuffer, iv);

        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');

        const tag = cipher.getAuthTag().toString('hex');

        return {
            iv: iv.toString('hex'),
            content: encrypted,
            tag: tag
        };
    } catch (err) {
        console.error("Encryption Failed:", err);
        return null;
    }
};

// 2. AES-GCM DECRYPTION
export const decryptGCM = (packet, sessionKey) => {
    try {
        if (!packet || !packet.iv || !packet.tag || !packet.content) return null;

        const iv = Buffer.from(packet.iv, 'hex');
        const tag = Buffer.from(packet.tag, 'hex');
        const keyBuffer = Buffer.from(sessionKey);

        const decipher = crypto.createDecipheriv('aes-256-gcm', keyBuffer, iv);

        decipher.setAuthTag(tag);

        let decrypted = decipher.update(packet.content, 'hex', 'utf8');
        decrypted += decipher.final('utf8');

        return decrypted;
    } catch (err) {
        console.error("Decryption Failed:", err);
        throw new Error("Integrity check failed"); // Throw so UI knows to show error
    }
};

// 3. GENERATE IDENTITY
export const generateIdentity = async () => {
    const bob = new MlKem768();
    const [pk, sk] = await bob.generateKeyPair();
    return {
        publicKey: Buffer.from(pk).toString('hex'),
        privateKey: sk
    };
};

// 4. KEY EXCHANGE (ENCAPS)
export const performKeyExchange = async (recipientPublicKeyHex) => {
    const alice = new MlKem768();
    const pkBytes = Buffer.from(recipientPublicKeyHex, 'hex');
    const [capsule, sharedSecret] = await alice.encap(pkBytes);
    return {
        capsule: Buffer.from(capsule).toString('hex'),
        sharedSecret: sharedSecret
    };
};

// 5. RECOVER KEY (DECAPS)
export const recoverSessionKey = async (capsuleHex, privateKeyBytes) => {
    const bob = new MlKem768();
    const capsuleBytes = Buffer.from(capsuleHex, 'hex');
    const sharedSecret = await bob.decap(capsuleBytes, privateKeyBytes);
    return sharedSecret;
};
