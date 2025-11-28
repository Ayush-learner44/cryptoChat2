// server.js
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { createServer } from "node:http";
import next from "next";
import { Server } from "socket.io";
import { MongoClient } from "mongodb";

const dev = process.env.NODE_ENV !== "production";
const port = process.env.PORT || 3000;
const hostname = "0.0.0.0";

const uri = process.env.MONGODB_URI;
if (!uri) {
    console.error("❌ MONGODB_URI missing.");
    process.exit(1);
}

// MongoDB Connection Reuse
let client;
let clientPromise;
if (!global._mongoClientPromise) {
    client = new MongoClient(uri);
    global._mongoClientPromise = client.connect();
}
clientPromise = global._mongoClientPromise;

const app = next({ dev, hostname, port });
const handler = app.getRequestHandler();

// 1. TRACK USERS EXPLICITLY (Map: Username -> SocketID)
const onlineUsers = {};

app.prepare().then(() => {
    const httpServer = createServer((req, res) => {
        handler(req, res);
    });

    const io = new Server(httpServer, {
        cors: { origin: "*" },
    });

    io.on("connection", (socket) => {

        // Helper to update everyone's list
        const broadcastOnlineList = () => {
            io.emit("online-users", Object.keys(onlineUsers));
        };

        // 2. REGISTER (Store Socket ID)
        socket.on("register-user", (username) => {
            onlineUsers[username] = socket.id; // Map Name -> ID
            socket.username = username;

            console.log(`👤 Registered: ${username} (ID: ${socket.id})`);
            broadcastOnlineList();
        });

        // 3. HANDSHAKE (Send strictly to Recipient's Socket ID)
        socket.on("handshake_packet", ({ to, capsule }) => {
            const recipientSocketId = onlineUsers[to];

            if (recipientSocketId) {
                console.log(`🤝 Handshake: ${socket.username} -> ${to} (ID: ${recipientSocketId})`);
                io.to(recipientSocketId).emit("handshake_received", {
                    from: socket.username,
                    capsule: capsule
                });
            } else {
                console.log(`⚠️ Handshake failed: User ${to} is offline.`);
            }
        });

        // 4. MESSAGE (Send strictly to Recipient's Socket ID)
        socket.on("send-message", ({ to, packet, capsule }) => {
            const recipientSocketId = onlineUsers[to];

            // A. Send to Recipient (If Online)
            if (recipientSocketId) {
                console.log(`📩 Message: ${socket.username} -> ${to} (ID: ${recipientSocketId})`);
                io.to(recipientSocketId).emit("receive-message", {
                    from: socket.username,
                    to: to,           // Explicitly say who it is for
                    packet: packet,
                    capsule: capsule,
                    time: new Date().toISOString()
                });
            } else {
                console.log(`⚠️ Message saved but ${to} is offline.`);
            }

            // B. Send confirmation back to Sender (Optional, useful for UI updates if you rely on socket echo)
            // But usually, sender updates UI locally immediately. 
        });

        // 5. DISCONNECT
        socket.on("disconnect", () => {
            if (socket.username) {
                delete onlineUsers[socket.username];
                console.log(`❌ Disconnected: ${socket.username}`);
                broadcastOnlineList();
            }
        });
    });

    httpServer.listen(port, hostname, () => {
        console.log(`🚀 Ready on http://${hostname}:${port}`);
    });
});