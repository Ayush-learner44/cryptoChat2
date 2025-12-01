"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { generateIdentity } from "../../utils/crypto";
import toast from "react-hot-toast";
import "./register.css";

export default function RegisterPage() {
    const router = useRouter();
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState(""); // <--- NEW STATE
    const [error, setError] = useState("");
    const [isProcessing, setIsProcessing] = useState(false);

    const handleRegister = async () => {
        if (!username.trim() || !password.trim()) { // <--- CHECK BOTH
            setError("Please enter username and password");
            return;
        }
        setIsProcessing(true);
        setError("");

        try {
            // 1. Generate Keys (Client-Side)
            const { publicKey, privateKey } = await generateIdentity();

            // 2. Upload Public Key AND Password
            const res = await fetch("/api/register", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    username,
                    password, // <--- SEND PASSWORD
                    publicKey
                }),
            });

            if (res.ok) {
                // 3. Force Download of Private Key
                const blob = new Blob([privateKey], { type: "application/octet-stream" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `${username}_private.key`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);

                alert(``);



                toast.success(`User '${username}' registered.\nKey file downloaded ,`);

                router.push("/");
            } else {
                const data = await res.json();
                setError(data.message || "Registration failed");
            }
        } catch (err) {
            console.error(err);
            setError("Error generating secure keys.");
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div className="page">
            <div className="card">
                <h1 className="title">Register</h1>
                <p className="subtitle">Secure Post-Quantum Registration</p>

                <div className="form-group">

                    <input
                        type="text"
                        placeholder="Username"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        className="input"
                        disabled={isProcessing}
                    />
                </div>

                {/* NEW PASSWORD INPUT */}
                <div className="form-group">
                    <input
                        type="password"
                        placeholder="Password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="input"
                        disabled={isProcessing}
                    />
                </div>

                {error && <p className="error">{error}</p>}

                <button onClick={handleRegister} className="button" disabled={isProcessing}>
                    {isProcessing ? "Generating Keys..." : "Register & Download Key"}
                </button>

                <p onClick={() => router.push("/")} className="link">
                    Already have a key? Login
                </p>
            </div>
        </div>
    );
}