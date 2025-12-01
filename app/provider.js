"use client";

import { Toaster } from "react-hot-toast";

export function Providers() {
    return (
        <Toaster
            position="top-right"
            toastOptions={{
                // Default styles for all toasts
                style: {
                    background: "#4caf50",
                    color: "#fff",
                    fontWeight: "bold",
                    borderRadius: "8px",
                    padding: "12px",
                },
                success: {
                    icon: "✅",
                },
                error: {
                    style: { background: "#f44336", color: "#fff" },
                },
            }}
        />
    );
}
