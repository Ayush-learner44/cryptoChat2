import { MongoClient } from "mongodb";
import bcrypt from "bcryptjs";

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
    const users = db.collection("users");

    if (req.method === "POST") {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ message: "Username and Password required" });
        }

        // 1. Find User
        const user = await users.findOne({ username });
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        // 2. Check Password
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ message: "Invalid Password" });
        }

        // 3. Success
        return res.status(200).json({ message: "Login successful" });
    }

    res.status(405).json({ message: "Method not allowed" });
}