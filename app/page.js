"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import "./home.css";
import toast from "react-hot-toast";

export default function HomePage() {
    const router = useRouter();

    // State for inputs
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState(""); // <--- NEW STATE
    const [keyFileBytes, setKeyFileBytes] = useState(null);
    const [fileName, setFileName] = useState("");
    const [error, setError] = useState("");

    const handleFileUpload = (event) => {
        const file = event.target.files[0];
        if (!file) return;

        setFileName(file.name);

        // Auto-fill username from filename if empty
        const inferredName = file.name.split('_')[0];
        if (inferredName && !username) setUsername(inferredName);

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const arrayBuffer = e.target.result;
                if (arrayBuffer.byteLength === 0) {
                    setError("Error: Key file is empty.");
                    return;
                }
                const bytes = new Uint8Array(arrayBuffer);
                setKeyFileBytes(bytes);
                setError("");
            } catch (err) {
                console.error(err);
                setError("Failed to read key file.");
            }
        };
        reader.readAsArrayBuffer(file);
    };

    const handleLogin = async () => {
        // 1. Basic Validation
        if (!username.trim()) {
            setError("Please enter your username.");
            return;
        }
        if (!password.trim()) {
            setError("Please enter your password.");
            return;
        }
        if (!keyFileBytes) {
            setError("Please upload your Private Key.");
            return;
        }

        // 2. Verify Password on Server
        try {
            const res = await fetch("/api/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username, password }) // Send password
            });

            if (!res.ok) {
                const data = await res.json();
                setError(data.message || "Login failed");
                return;
            }

            // 3. If Password Correct -> Proceed with Key File Logic
            const base64Key = Buffer.from(keyFileBytes).toString('base64');
            sessionStorage.setItem("chat_session_key", base64Key);

            toast.success(`Welcome, ${username.trim()} 👋`);

            router.push(`/chat?user=${username.trim()}`);

        } catch (e) {
            console.error(e);
            setError("Connection error during login.");
        }
    };

    return (
        <div className="page">
            <div className="card">
                <h1 className="title">Welcome</h1>


                {/* USERNAME */}
                <div className="input-group">
                    <input
                        type="text"
                        placeholder="Username"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        className="text-input"
                    />
                </div>

                {/* PASSWORD (NEW) */}
                <div className="input-group">
                    <input
                        type="password"
                        placeholder="Password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="text-input"
                        style={{ marginTop: '10px' }}
                    />
                </div>

                {/* FILE UPLOAD */}
                <div className="input-group" style={{ marginTop: '10px' }}>
                    <label className="input-label">Private Key File</label>
                    <div className="file-upload-wrapper">
                        <input type="file" accept=".key" id="file-upload" onChange={handleFileUpload} className="hidden-file-input" />
                        <label htmlFor="file-upload" className="file-upload-button">
                            {fileName ? "📄 " + fileName : "📂 Upload Key"}
                        </label>
                    </div>
                </div>

                {error && <p className="error">{error}</p>}

                <button onClick={handleLogin} className="primary-button">Login</button>
                <div className="divider">or</div>
                <button onClick={() => window.location.href = "/register"} className="outline-button">Register</button>
            </div>
        </div>
    );
}