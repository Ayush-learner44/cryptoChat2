"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { generateIdentity } from "../../utils/crypto"; // Ensure path is correct
import "./register.css";

export default function RegisterPage() {
    const router = useRouter();
    const [username, setUsername] = useState("");
    const [error, setError] = useState("");
    const [isProcessing, setIsProcessing] = useState(false);

    const handleRegister = async () => {
        if (!username.trim()) {
            setError("Please enter a username");
            return;
        }
        setIsProcessing(true);
        setError("");

        try {
            // 1. Generate Keys (Client-Side)
            const { publicKey, privateKey } = await generateIdentity();

            // 2. Upload ONLY Public Key to Server
            const res = await fetch("/api/register", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    username,
                    publicKey: publicKey
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

                alert(`SUCCESS!\n\nUser '${username}' registered.\nWe have downloaded your private key file.\n\nKeep this file safe! You need it to login.`);

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
                <h1 className="title">Create Identity</h1>
                <p className="subtitle">Secure Post-Quantum Registration</p>

                <div className="form-group">
                    <label className="label">Username</label>
                    <input
                        type="text"
                        placeholder="e.g. alice"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
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