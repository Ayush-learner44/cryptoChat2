"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import "./home.css";

export default function HomePage() {
    const router = useRouter();

    // State for inputs
    const [username, setUsername] = useState("");
    const [keyFileBytes, setKeyFileBytes] = useState(null);
    const [fileName, setFileName] = useState(""); // Just for display
    const [error, setError] = useState("");

    const handleFileUpload = (event) => {
        const file = event.target.files[0];
        if (!file) return;

        setFileName(file.name); // Show user which file they picked

        // Read the file into memory
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const arrayBuffer = e.target.result;
                if (arrayBuffer.byteLength === 0) {
                    setError("Error: Key file is empty.");
                    return;
                }
                // Save the raw bytes to state (waiting for Login click)
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

    const handleLogin = () => {
        if (!username.trim()) {
            setError("Please enter your username.");
            return;
        }
        if (!keyFileBytes) {
            setError("Please upload your Private Key.");
            return;
        }

        // SUCCESS: Store Identity in Session and Redirect
        try {
            const base64Key = Buffer.from(keyFileBytes).toString('base64');
            sessionStorage.setItem("chat_session_key", base64Key);

            // Redirect to the username you TYPED
            router.push(`/chat?user=${username.trim()}`);
        } catch (e) {
            setError("Login processing failed.");
        }
    };

    return (
        <div className="page">
            <div className="card">
                <h1 className="title">PQC Chat Login</h1>
                <p className="subtitle">Secure Identity Access</p>

                {/* 1. USERNAME INPUT */}
                <div className="input-group">

                    <input
                        type="text"
                        placeholder="Username"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        className="text-input"
                    />
                </div>

                {/* 2. FILE UPLOAD */}
                <div className="input-group">
                    <label className="input-label">Private Key File</label>

                    {/* Custom File Button Styling */}
                    <div className="file-upload-wrapper">
                        <input
                            type="file"
                            accept=".key"
                            id="file-upload"
                            onChange={handleFileUpload}
                            className="hidden-file-input"
                        />
                        <label htmlFor="file-upload" className="file-upload-button">
                            {fileName ? "📄 " + fileName : "📂 Click to Upload Key"}
                        </label>
                    </div>
                </div>

                {error && <p className="error">{error}</p>}

                <button onClick={handleLogin} className="primary-button">
                    Login to Chat
                </button>

                <div className="divider">or</div>

                <button onClick={() => router.push("/register")} className="outline-button">
                    Create New Identity
                </button>
            </div>
        </div>
    );
}