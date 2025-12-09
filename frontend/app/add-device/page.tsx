"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../providers/AuthProvider";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL;
const DEVICES_API_URL = `${BACKEND}/API/devices`;

export default function AddDevicePage() {
  const router = useRouter();
  const { ready, apiFetch, accessToken } = useAuth();
  const [deviceId, setDeviceId] = useState("");
  const [deviceName, setDeviceName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const auth = useAuth();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!ready || !accessToken) {
      setError("Not authenticated");
      return;
    }
    if (!deviceId) {
      setError("Device ID is required");
      return;
    }

    setLoading(true);
    try {
      const res = await apiFetch(`${DEVICES_API_URL}/add_device`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: auth.userId, device_id: deviceId, device_name: deviceName }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `Request failed: ${res.status}`);
      }

      // success -> go back to dashboard
      router.push("/dashboard");
    } catch (err: any) {
      setError(err.message || String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-6 max-w-lg mx-auto">
      <h1 className="text-2xl font-semibold mb-4">Add Device</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">Device ID</label>
          <input
            value={deviceId}
            onChange={(e) => setDeviceId(e.target.value)}
            className="mt-1 block w-full border rounded p-2"
            placeholder="uuid or your device identifier"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Device Name (optional)</label>
          <input
            value={deviceName}
            onChange={(e) => setDeviceName(e.target.value)}
            className="mt-1 block w-full border rounded p-2"
            placeholder="My Pi Kitchen"
          />
        </div>
        {error && <div className="text-red-600">{error}</div>}
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-60"
          >
            {loading ? "Adding…" : "Add Device"}
          </button>
          <button
            type="button"
            onClick={() => router.push("/dashboard")}
            className="px-4 py-2 bg-gray-200 rounded"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
