
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

    // REFS
    const socketRef = useRef(null);
    const messagesEndRef = useRef(null);
    const myPrivateKeyRef = useRef(null);
    const sessionKeyRef = useRef(null);
    // NEW: Track who we are currently looking at to filter incoming messages
    const activeRecipientRef = useRef("");

    // UI STATE
    const [username, setUsername] = useState("");
    const [recipient, setRecipient] = useState("");
    const [connected, setConnected] = useState(false);
    const [message, setMessage] = useState("");
    const [chat, setChat] = useState([]);
    const [users, setUsers] = useState([]);
    const [onlineUsers, setOnlineUsers] = useState([]);

    // 1. INITIALIZE
    useEffect(() => {
        const u = searchParams.get("user");
        if (u) setUsername(u);

        const storedKeyB64 = sessionStorage.getItem("chat_session_key");
        if (storedKeyB64) {
            const binaryString = atob(storedKeyB64);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
            myPrivateKeyRef.current = bytes;
        } else {
            router.push("/");
        }
    }, [searchParams, router]);

    // Keep Ref in sync with State for the socket listeners
    useEffect(() => {
        activeRecipientRef.current = recipient;
    }, [recipient]);

    // 2. AUTO SCROLL
    useEffect(() => {
        if (messagesEndRef.current) messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }, [chat]);

    // 3. FETCH USERS
    useEffect(() => {
        fetch("/api/users")
            .then(res => res.json())
            .then(data => { if (Array.isArray(data)) setUsers(data); })
            .catch(err => console.error(err));
    }, []);

    // 4. SOCKET LOGIC
    useEffect(() => {
        socketRef.current = io();

        socketRef.current.on("connect", () => {
            // We need username. Wait a tick or rely on the other effect.
        });

        socketRef.current.on("online-users", (active) => setOnlineUsers(active));

        // A. HANDSHAKE (Silent Background Processing)
        socketRef.current.on("handshake_received", async (data) => {
            if (!myPrivateKeyRef.current) return;
            console.log(`⚡ Handshake from ${data.from}`);

            try {
                // Always compute the key (so it's ready)
                const secret = await recoverSessionKey(data.capsule, myPrivateKeyRef.current);

                // ONLY update UI if we are currently talking to THIS person
                // OR if we are talking to nobody
                if (activeRecipientRef.current === data.from || activeRecipientRef.current === "") {
                    sessionKeyRef.current = secret;
                    setConnected(true);

                    // If we weren't talking to anyone, auto-select sender
                    if (activeRecipientRef.current === "") {
                        setRecipient(data.from);
                    }

                    setChat((prev) => [...prev, { from: "system", text: `🔐 Secure Connection with ${data.from}`, time: new Date().toISOString() }]);
                } else {
                    console.log(`Background: Saved session for ${data.from} (Currently talking to ${activeRecipientRef.current})`);
                    // In a real app, you would store this 'secret' in a Map<User, Key>
                    // For this assignment, we just ignore it visually until user clicks them.
                }
            } catch (err) { console.error("Handshake err", err); }
        });

        // B. MESSAGE RECEIVER (Strict Filtering)
        socketRef.current.on("receive-message", async (data) => {
            // 1. Is this message for the person I am currently looking at?
            // If No -> IGNORE IT VISUALLY (Don't append to chat array)
            if (data.from !== activeRecipientRef.current && data.from !== username) {
                console.log(`Ignored message from ${data.from} because I am talking to ${activeRecipientRef.current}`);
                return;
            }

            let text = "🔒 [Fail]";

            // Decryption Logic (Same as before)
            if (data.capsule && myPrivateKeyRef.current) {
                try {
                    const tempKey = await recoverSessionKey(data.capsule, myPrivateKeyRef.current);
                    sessionKeyRef.current = tempKey;
                    text = decryptGCM(data.packet, tempKey);
                } catch (e) { }
            } else if (sessionKeyRef.current) {
                text = decryptGCM(data.packet, sessionKeyRef.current);
            }

            setChat((prev) => [...prev, { from: data.from, text: text, time: data.time }]);
        });

        return () => { if (socketRef.current) socketRef.current.disconnect(); };
    }, []);

    // Register user when username is set
    useEffect(() => {
        if (username && socketRef.current) socketRef.current.emit("register-user", username);
    }, [username]);


    // 5. CONNECT / SWITCH USER
    const handleUserSelect = (e) => {
        const newUser = e.target.value;
        setRecipient(newUser);
        setChat([]); // CLEAR CHAT when switching users!
        setConnected(false); // Reset connection state until we connect
        sessionKeyRef.current = null; // Clear old session key
    };

    const connect = async () => {
        if (!recipient) return;

        // Load History
        const res = await fetch(`/api/message?user1=${encodeURIComponent(username)}&user2=${encodeURIComponent(recipient)}`);
        const history = await res.json();

        const decrypted = await Promise.all(history.map(async (msg) => {
            try {
                const isMe = msg.from === username;
                const targetCapsule = isMe ? msg.senderCapsule : msg.capsule;
                const targetPacket = isMe ? msg.senderPacket : msg.packet;

                if (targetCapsule && myPrivateKeyRef.current) {
                    const k = await recoverSessionKey(targetCapsule, myPrivateKeyRef.current);
                    return { from: msg.from, text: decryptGCM(targetPacket, k), time: msg.time };
                }
                return { from: msg.from, text: "🔒", time: msg.time };
            } catch (e) { return { from: msg.from, text: "⚠️", time: msg.time }; }
        }));
        setChat(decrypted);

        // Initiate Handshake
        try {
            const resKey = await fetch(`/api/getPublicKey?username=${encodeURIComponent(recipient)}`);
            const data = await resKey.json();
            if (data.publicKey) {
                const { capsule, sharedSecret } = await performKeyExchange(data.publicKey);
                sessionKeyRef.current = sharedSecret;
                setConnected(true);
                socketRef.current.emit("handshake_packet", { to: recipient, capsule });
            }
        } catch (e) { console.log("Handshake skip", e); }
    };

    const sendMessage = async () => {
        if (!message || !recipient) return;

        const [resBob, resMe] = await Promise.all([
            fetch(`/api/getPublicKey?username=${encodeURIComponent(recipient)}`),
            fetch(`/api/getPublicKey?username=${encodeURIComponent(username)}`)
        ]);
        const bobData = await resBob.json();
        const meData = await resMe.json();

        if (!bobData.publicKey || !meData.publicKey) return alert("Public Keys missing!");

        const exBob = await performKeyExchange(bobData.publicKey);
        const packetBob = encryptGCM(message, exBob.sharedSecret);

        const exMe = await performKeyExchange(meData.publicKey);
        const packetMe = encryptGCM(message, exMe.sharedSecret);

        await fetch("/api/message", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                from: username, to: recipient,
                packet: packetBob, capsule: exBob.capsule,
                senderPacket: packetMe, senderCapsule: exMe.capsule
            }),
        });

        socketRef.current.emit("send-message", {
            to: recipient,
            packet: packetBob,
            capsule: exBob.capsule
        });

        setChat((prev) => [...prev, { from: username, text: message, time: new Date().toISOString() }]);
        setMessage("");
        sessionKeyRef.current = exBob.sharedSecret;
    };

    return (
        <div className="chat-page">
            <div className="top-bar">
                <button onClick={() => router.push("/")} className="home-button">Home</button>
                <span className="profile-badge">User: <strong>{username}</strong></span>
            </div>

            <div className="chat-center">
                <div className="chat-card">
                    <div className="recipient-row">
                        {/* UPDATE: Use handleUserSelect to clear chat on switch */}
                        <select value={recipient} onChange={handleUserSelect} className="recipient-select">
                            <option value="" disabled>Select User</option>
                            {users.filter(u => u !== username).map((u, i) => (
                                <option key={i} value={u}>{u} {onlineUsers.includes(u) ? "🟢" : "⚪"}</option>
                            ))}
                        </select>
                        <button onClick={connect} className="connect-button">Connect</button>
                        <button onClick={() => setChat([])} className="refresh-button">Clear</button>
                        <button onClick={async () => {
                            await fetch("/api/deleteMessages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user1: username, user2: recipient }) });
                            setChat([]);
                        }} className="delete-button">Delete</button>
                        <button onClick={() => {
                            sessionKeyRef.current = null;
                            setConnected(false);
                            setRecipient("");
                            setChat([]);
                        }} className="disconnect-button">Disconnect</button>
                    </div>

                    <div className="chat-window">
                        <div className="messages">
                            {chat.map((c, i) => (
                                <div key={i} className={`message ${c.from === username ? "me" : c.from === "system" ? "system" : "them"}`}>
                                    <span className="from">{c.from === username ? "me" : c.from}:</span> {c.text}
                                    {c.time && <span className="timestamp"> {new Date(c.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}
                                </div>
                            ))}
                            <div ref={messagesEndRef} />
                        </div>
                        <div className="input-row">
                            <input value={message} onChange={e => setMessage(e.target.value)} className="message-input" placeholder="Type..." />
                            <button onClick={sendMessage} className="send-button">Send</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function ChatPage() {
    return <Suspense fallback={<div>Loading...</div>}><ChatPageInner /></Suspense>;
}