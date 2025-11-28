"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import "./home.css";

export default function HomePage() {
  const router = useRouter();
  const [error, setError] = useState("");

  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    // 1. Infer username from filename (e.g. "alice_private.key" -> "alice")
    // This is a convenience. You can also ask user to type it if preferred.
    const filename = file.name;
    const inferredUsername = filename.split('_')[0];

    if (!inferredUsername) {
      setError("Invalid filename. Expected format: username_private.key");
      return;
    }

    // 2. Read the file
    const reader = new FileReader();

    reader.onload = async (e) => {
      try {
        const arrayBuffer = e.target.result;
        // Verify it's not empty
        if (arrayBuffer.byteLength === 0) {
          setError("Key file is empty!");
          return;
        }

        // 3. Store in sessionStorage (Temporary RAM storage for the session)
        // We convert to Base64 to pass it to the Chat page safely
        const keyBytes = new Uint8Array(arrayBuffer);
        const base64Key = Buffer.from(keyBytes).toString('base64');

        sessionStorage.setItem("chat_session_key", base64Key);

        // 4. Redirect to Chat
        router.push(`/chat?user=${inferredUsername}`);

      } catch (err) {
        console.error(err);
        setError("Failed to parse key file.");
      }
    };

    reader.readAsArrayBuffer(file);
  };

  return (
    <div className="page">
      <div className="card">
        <h1 className="title">PQC Chat Login</h1>
        <p className="subtitle">Identity-Based Authentication</p>

        <div className="upload-section">
          <label className="upload-label">
            Upload your Private Key (.key)
          </label>
          <input
            type="file"
            accept=".key"
            onChange={handleFileUpload}
            className="file-input"
          />
        </div>

        {error && <p className="error">{error}</p>}

        <div className="divider">or</div>

        <button onClick={() => router.push("/register")} className="outline-button">
          Create New Identity
        </button>
      </div>
    </div>
  );
}