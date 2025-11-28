import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;
let client;
let clientPromise;

if (!global._mongoClientPromise) {
    client = new MongoClient(uri);
    global._mongoClientPromise = client.connect();
}
clientPromise = global._mongoClientPromise;

export default async function handler(req, res) {
    const client = await clientPromise;
    const db = client.db("chatapp");
    const messages = db.collection("messages");

    if (req.method === "POST") {
        // Accepts Double Encryption payload
        const { from, to, packet, capsule, senderPacket, senderCapsule } = req.body;

        if (!from || !to || !packet) {
            return res.status(400).json({ message: "Missing fields" });
        }

        const doc = {
            from,
            to,
            packet,         // Encrypted for Receiver
            capsule,        // Key for Receiver
            senderPacket,   // Encrypted for Sender (FIXES HISTORY)
            senderCapsule,  // Key for Sender
            time: new Date()
        };

        await messages.insertOne(doc);
        return res.status(200).json({ message: "Message stored", doc });
    }

    if (req.method === "GET") {
        const { user1, user2 } = req.query;
        if (!user1 || !user2) return res.status(400).json({ message: "Missing query params" });

        const history = await messages
            .find({
                $or: [
                    { from: user1, to: user2 },
                    { from: user2, to: user1 },
                ],
            })
            .sort({ time: 1 })
            .toArray();

        return res.status(200).json(history);
    }

    res.status(405).json({ message: "Method not allowed" });
}