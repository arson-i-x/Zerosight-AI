"use client";
import React, { useState } from "react";
import { useAuth } from "../providers/AuthProvider";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const auth = useAuth();
  
  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const ok = await auth.login(email, password);
    if (!ok) {
      setError("Login failed");
      return;
    }
    window.location.href = "/dashboard";
  }

  return (
    <div className="flex items-center justify-center min-h-screen">
      <form
        onSubmit={handleLogin}
        className="bg-white p-8 rounded-xl shadow-md w-full max-w-sm"
      >
        <h1 className="text-2xl font-semibold mb-6 text-center">ZeroSight Login</h1>

        {error && (
          <div className="bg-red-100 text-red-800 p-2 rounded mb-4 text-sm">
            {error}
          </div>
        )}

        <input
          className="w-full mb-4 p-3 border rounded"
          placeholder="Email"
          type="email"
          onChange={e => setEmail(e.target.value)}
        />

        <input
          className="w-full mb-6 p-3 border rounded"
          placeholder="Password"
          type="password"
          onChange={e => setPassword(e.target.value)}
        />

        <button
          type="submit"
          className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded"
        >
          Login
        </button>
        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={() => {
              try {
                window.location.href = "/signup";
              } catch {
                // fallback
                window.location.href = "/signup";
              }
            }}
            className="w-full mt-2 border border-gray-300 text-gray-700 py-2 rounded"
          >
            Create account
          </button>
        </div>
      </form>
    </div>
  );
}
