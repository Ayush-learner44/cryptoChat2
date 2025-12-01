"use client";

import { Toaster } from "react-hot-toast";

export function Providers() {
    return (
        <Toaster
            position="top-right"
            toastOptions={{
                style: {
                    background: "#333",
                    color: "#fff",
                    borderRadius: "8px",
                    padding: "12px",
                    fontSize: "14px",
                },
            }}
        />
    );
}
