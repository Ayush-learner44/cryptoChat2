"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import io from "socket.io-client";
import {
    encryptGCM,
    decryptGCM,
    performKeyExchange,
    recoverSessionKey
} from "../../utils/crypto";
import "./chat.css";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

function ChatPageInner() {
    const router = useRouter();
    const searchParams = useSearchParams();

    // REFS (Mutable state that doesn't trigger re-renders but is accessible to Sockets)
    const socketRef = useRef(null);
    const messagesEndRef = useRef(null);
    const myPrivateKeyRef = useRef(null); // Holds the Private Key
    const sessionKeyRef = useRef(null);   // Holds the Session Key

    // UI STATE
    const [username, setUsername] = useState("");
    const [recipient, setRecipient] = useState("");
    const [connected, setConnected] = useState(false);
    const [message, setMessage] = useState("");
    const [chat, setChat] = useState([]);
    const [users, setUsers] = useState([]);
    const [onlineUsers, setOnlineUsers] = useState([]);

    // 1. INITIALIZE & LOAD KEY (Run Once)
    useEffect(() => {
        const u = searchParams.get("user");
        if (u) setUsername(u);

        const storedKeyB64 = sessionStorage.getItem("chat_session_key");
        if (storedKeyB64) {
            const binaryString = atob(storedKeyB64);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            // Save to REF (for Logic) and State (for UI if needed)
            myPrivateKeyRef.current = bytes;
        } else {
            router.push("/");
        }
    }, [searchParams, router]);

    // 2. AUTO SCROLL
    useEffect(() => {
        if (messagesEndRef.current) messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }, [chat]);

    // 3. FETCH USERS
    useEffect(() => {
        fetch("/api/users")
            .then(res => res.json())
            .then(data => {
                if (Array.isArray(data)) setUsers(data);
            })
            .catch(err => console.error(err));
    }, []);

    // 4. SOCKET SETUP (Run ONCE - No Dependencies)
    useEffect(() => {
        // Initialize Socket
        socketRef.current = io();

        // Connect Logic
        socketRef.current.on("connect", () => {
            // We need the username. Since this runs once, we use a timeout or check params
            // Ideally we emit register inside the username useEffect, but this is fine for now
            // We will emit register manually in the other useEffect to be safe
        });

        socketRef.current.on("online-users", (activeUsers) => {
            setOnlineUsers(activeUsers);
        });

        // A. HANDSHAKE LISTENER
        socketRef.current.on("handshake_received", async (data) => {
            if (!myPrivateKeyRef.current) return;
            console.log(`⚡ Realtime Handshake from ${data.from}`);

            try {
                // Use REF to get key
                const secret = await recoverSessionKey(data.capsule, myPrivateKeyRef.current);

                // Update REF immediately
                sessionKeyRef.current = secret;

                // Update UI State
                setConnected(true);
                setRecipient(data.from);

                setChat((prev) => [
                    ...prev,
                    { from: "system", text: `🔐 Secure Connection Established with ${data.from}`, time: new Date().toISOString() }
                ]);
            } catch (err) {
                console.error("Handshake failed:", err);
            }
        });

        // B. MESSAGE LISTENER
        socketRef.current.on("receive-message", async (data) => {
            console.log("📩 Message Packet:", data);

            // 1. Decrypt using REF values (Always fresh)
            let decryptedText = "🔒 [Decryption Failed]";
            let keysUpdated = false;

            // Strategy A: Use Capsule (Auto-Recovery)
            if (data.capsule && myPrivateKeyRef.current) {
                try {
                    const tempKey = await recoverSessionKey(data.capsule, myPrivateKeyRef.current);
                    sessionKeyRef.current = tempKey; // Update Ref
                    keysUpdated = true;
                    decryptedText = decryptGCM(data.packet, tempKey);
                } catch (e) { console.error("Auto-recover failed", e); }
            }

            // Strategy B: Use Existing Session Key
            if (decryptedText.startsWith("🔒") && sessionKeyRef.current) {
                try {
                    decryptedText = decryptGCM(data.packet, sessionKeyRef.current);
                } catch (e) { }
            }

            // 2. Update UI
            // Check if it's for me OR from me (sender echo)
            setChat((prev) => {
                // Avoid duplicates if needed, but append is safer
                return [...prev, { from: data.from, text: decryptedText, time: data.time }];
            });

            if (keysUpdated) setConnected(true);
        });

        // Cleanup on Unmount ONLY
        return () => {
            if (socketRef.current) socketRef.current.disconnect();
        };
    }, []); // <--- EMPTY ARRAY = RUNS ONCE. NO DISCONNECT LOOPS.


    // 5. REGISTER USER ON SOCKET (When username is set)
    useEffect(() => {
        if (username && socketRef.current) {
            socketRef.current.emit("register-user", username);
        }
    }, [username]);


    // 6. CONNECT BUTTON
    const connect = async () => {
        if (!recipient.trim()) return;

        const keyRes = await fetch(`/api/getPublicKey?username=${encodeURIComponent(recipient)}`);
        if (!keyRes.ok) { alert("User not found!"); return; }
        const { publicKey } = await keyRes.json();

        const { capsule, sharedSecret } = await performKeyExchange(publicKey);

        // Update REF and State
        sessionKeyRef.current = sharedSecret;
        setConnected(true);

        socketRef.current.emit("handshake_packet", { to: recipient, capsule });

        // Load History
        loadHistory(sharedSecret);
    };

    const loadHistory = async () => {
        const res = await fetch(`/api/message?user1=${encodeURIComponent(username)}&user2=${encodeURIComponent(recipient)}`);
        if (res.ok) {
            const history = await res.json();

            const decryptedHistory = await Promise.all(history.map(async (msg) => {
                try {
                    // Logic: Sender vs Receiver
                    const isMe = msg.from === username;
                    const targetCapsule = isMe ? msg.senderCapsule : msg.capsule;
                    const targetPacket = isMe ? msg.senderPacket : msg.packet;

                    if (targetCapsule && myPrivateKeyRef.current) {
                        const msgSecret = await recoverSessionKey(targetCapsule, myPrivateKeyRef.current);
                        return {
                            from: msg.from,
                            text: decryptGCM(targetPacket, msgSecret),
                            time: msg.time
                        };
                    }
                    return { from: msg.from, text: "🔒 [Key Missing]", time: msg.time };
                } catch (e) { return { from: msg.from, text: "⚠️ Error", time: msg.time }; }
            }));
            setChat(decryptedHistory);
        }
    };

    const disconnect = () => {
        if (sessionKeyRef.current) try { sessionKeyRef.current.fill(0); } catch (e) { }
        sessionKeyRef.current = null;
        setConnected(false);
        setRecipient("");
        setChat([]);
    };

    const sendMessage = async () => {
        if (!message.trim()) return;

        // Ensure we have keys
        if (!sessionKeyRef.current) {
            alert("No session! Click Connect first.");
            return;
        }

        // A. Fetch Public Keys for Double Encryption
        const [resBob, resMe] = await Promise.all([
            fetch(`/api/getPublicKey?username=${encodeURIComponent(recipient)}`),
            fetch(`/api/getPublicKey?username=${encodeURIComponent(username)}`)
        ]);
        const bobData = await resBob.json();
        const meData = await resMe.json();

        // B. Encrypt
        const exBob = await performKeyExchange(bobData.publicKey);
        const packetBob = encryptGCM(message, exBob.sharedSecret);

        const exMe = await performKeyExchange(meData.publicKey);
        const packetMe = encryptGCM(message, exMe.sharedSecret);

        // C. Save DB
        await fetch("/api/message", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                from: username, to: recipient,
                packet: packetBob, capsule: exBob.capsule,
                senderPacket: packetMe, senderCapsule: exMe.capsule
            }),
        });

        // D. Send Socket (Bob's Version)
        socketRef.current.emit("send-message", {
            to: recipient,
            packet: packetBob,
            capsule: exBob.capsule
        });

        // E. Show Local
        setChat((prev) => [...prev, { from: username, text: message, time: new Date().toISOString() }]);
        setMessage("");

        // Update Session Key for next time
        sessionKeyRef.current = exBob.sharedSecret;
    };

    return (
        <div className="chat-page">
            <div className="top-bar">
                <button onClick={() => router.push("/")} className="home-button">Home</button>
                {username && <span className="profile-badge">User: <strong>{username}</strong></span>}
            </div>

            <div className="chat-center">
                <div className="chat-card">
                    <div className="recipient-row">
                        <select
                            value={recipient}
                            onChange={(e) => setRecipient(e.target.value)}
                            className="recipient-select"
                        >
                            <option value="" disabled>Select recipient</option>
                            {users.filter((u) => u !== username).map((u, i) => (
                                <option key={i} value={u}>
                                    {u} {onlineUsers.includes(u) ? "🟢" : "⚪"}
                                </option>
                            ))}
                        </select>

                        <button onClick={connect} className="connect-button">Connect</button>
                        <button onClick={() => setChat([])} className="refresh-button">Clear</button>
                        <button onClick={async () => {
                            await fetch("/api/deleteMessages", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ user1: username, user2: recipient }),
                            });
                            setChat([]);
                        }} className="delete-button">Delete</button>
                        <button onClick={disconnect} className="disconnect-button">Disconnect</button>
                    </div>

                    <div className="chat-window">
                        <div className="messages">
                            {chat.map((c, i) => {
                                const label = c.from === username ? "me" : c.from;
                                const time = c.time ? new Date(c.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "";
                                return (
                                    <div key={i} className={`message ${c.from === username ? "me" : c.from === "system" ? "system" : "them"}`}>
                                        <span className="from">{label}:</span> {c.text}
                                        {time && <span className="timestamp"> {time}</span>}
                                    </div>
                                );
                            })}
                            <div ref={messagesEndRef} />
                        </div>

                        <div className="input-row">
                            <input
                                type="text"
                                placeholder={connected ? "Type message..." : "Connect first"}
                                value={message}
                                onChange={(e) => setMessage(e.target.value)}
                                className="message-input"
                            // disabled={!connected} // Enabled so you can type while waiting
                            />
                            <button onClick={sendMessage} className="send-button">Send</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function ChatPage() {
    return (
        <Suspense fallback={<div>Loading...</div>}>
            <ChatPageInner />
        </Suspense>
    );
}