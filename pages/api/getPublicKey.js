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
    if (req.method !== "GET") return res.status(405).json({ message: "Method not allowed" });

    const { username } = req.query;
    if (!username) return res.status(400).json({ message: "Target username required" });

    try {
        const client = await clientPromise;
        const db = client.db("chatapp");
        const users = db.collection("users");

        const user = await users.findOne({ username });

        if (!user) return res.status(404).json({ message: "User not found" });
        if (!user.publicKey) return res.status(404).json({ message: "User has no PQC Key" });

        return res.status(200).json({ publicKey: user.publicKey });

    } catch (err) {
        console.error("API Error:", err);
        return res.status(500).json({ message: "Server Error" });
    }
}