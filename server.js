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
    console.error("❌ MONGODB_URI missing. Check .env.local");
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

// TRACK ONLINE USERS
const onlineUsers = new Set();

app.prepare().then(() => {
    const httpServer = createServer((req, res) => {
        handler(req, res);
    });

    const io = new Server(httpServer, {
        cors: { origin: "*" },
    });

    io.on("connection", (socket) => {
        // 1. Register User
        socket.on("register-user", (username) => {
            socket.username = username;
            socket.join(username);

            onlineUsers.add(username);
            io.emit("online-users", Array.from(onlineUsers));

            console.log(`👤 User '${username}' connected.`);
        });

        // 2. Handshake Packet
        socket.on("handshake_packet", ({ to, capsule }) => {
            io.to(to).emit("handshake_received", {
                from: socket.username,
                capsule: capsule
            });
        });

        // 3. Message Packet (Forwarding Capsule for History)
        socket.on("send-message", ({ to, packet, capsule }) => {
            console.log(`📩 Relay msg from ${socket.username} -> ${to}`);

            io.to(to).emit("receive-message", {
                from: socket.username,
                packet: packet,
                capsule: capsule,
                time: new Date().toISOString()
            });
        });

        // 4. Disconnect
        socket.on("disconnect", () => {
            if (socket.username) {
                onlineUsers.delete(socket.username);
                io.emit("online-users", Array.from(onlineUsers));
                console.log(`❌ User '${socket.username}' disconnected.`);
            }
        });
    });

    httpServer.listen(port, hostname, () => {
        console.log(`🚀 Ready on http://${hostname}:${port}`);
    });
});