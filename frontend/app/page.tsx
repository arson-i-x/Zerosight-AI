"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "./providers/AuthProvider";

export default function HomePage() {
  const router = useRouter();
  const { ready, accessToken } = useAuth();

  useEffect(() => {
    if (!ready) return; // wait for auth to load

    if (accessToken) {
      // User is logged in, redirect to dashboard
      router.push("/dashboard");
    } else {
      // User is not logged in, redirect to login
      router.push("/login");
    }
  }, [ready, accessToken, router]);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <p className="text-gray-600">Redirecting...</p>
    </div>
  );
}