"use client";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL;

export default function ConfirmEmailPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [message, setMessage] = useState("Verifying email...");

  useEffect(() => {
    async function handleCallback() {
      const token_hash = searchParams.get("token_hash");
      const type = searchParams.get("type");

      if (!token_hash || type !== "email") {
        setMessage("Invalid confirmation link.");
        setTimeout(() => router.push("/login"), 2000);
        return;
      }

      console.log("Confirming email with token_hash:", token_hash);

      try {
        const res = await fetch(`${BACKEND}/auth/confirm_email`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token_hash }),
          credentials: "include",
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error || `Request failed: ${res.status}`);
        }
        setMessage("Email confirmed! Redirecting to login...");
        setTimeout(() => router.push("/login"), 2000);
      } catch (err) {
        setMessage(`Error: ${String(err)}`);
        setTimeout(() => router.push("/login"), 3000);
      }
    }

    handleCallback();
  }, [searchParams, router]);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <h1 className="text-2xl font-semibold mb-4">Email Confirmation</h1>
        <p className="text-gray-600">{message}</p>
      </div>
    </div>
  );
}