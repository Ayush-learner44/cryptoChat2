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
    try {
        if (req.method !== "POST") return res.status(405).json({ message: "Method not allowed" });

        const { user1, user2 } = req.body;
        if (!user1 || !user2) return res.status(400).json({ message: "Missing users" });

        const client = await clientPromise;
        const db = client.db("chatapp");
        const messages = db.collection("messages");

        await messages.deleteMany({
            $or: [
                { from: user1, to: user2 },
                { from: user2, to: user1 }
            ]
        });

        return res.status(200).json({ message: "Messages deleted" });
    } catch (err) {
        console.error("Delete error:", err);
        res.status(500).json({ message: "Internal server error" });
    }
}