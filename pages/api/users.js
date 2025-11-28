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
        const client = await clientPromise;
        const db = client.db("chatapp");
        const users = db.collection("users");

        if (req.method === "GET") {
            const allUsers = await users.find({}, { projection: { username: 1, _id: 0 } }).toArray();
            return res.status(200).json(allUsers.map(u => u.username));
        }

        res.status(405).json({ message: "Method not allowed" });
    } catch (e) {
        console.error("Users API error:", e);
        res.status(500).json({ message: "Internal server error" });
    }
}