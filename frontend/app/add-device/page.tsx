"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../providers/AuthProvider";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL + "/API/devices" || 
                    "http://localhost:8000/API/devices";

export default function AddDevicePage() {
  const router = useRouter();
  const { ready, accessToken, supabase, apiFetch } = useAuth();
  const [deviceId, setDeviceId] = useState("");
  const [deviceName, setDeviceName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      const device = await claimDevice(deviceId);
      console.log("Device claimed:", device);
      router.push("/dashboard");
    } catch (err: any) {
      setError(err.message || String(err));
    } finally {
      setLoading(false);
    }
  }

  async function claimDevice(deviceUUID: string) {
    if (!accessToken) {
      throw new Error("You must be logged in to claim a device.");
    }
    if (!supabase) {
      throw new Error("Supabase client is not initialized.");
    }
    if (!deviceUUID) {
      throw new Error("Device UUID is required.");
    }
    const session = (await supabase.auth.getSession()).data.session ?? null;

    if (!session || !session.user) {
      throw new Error("Invalid Supabase session.");
    }

    // Attempt to claim
    const { data, error } = await supabase
      .from("device_credentials")
      .update({
        claimed: true,
        user_id: session.user.id,
      })
      .eq("device_uuid", deviceUUID)
      .eq("claimed", false) // cannot overwrite claimed devices
      .select()
      .maybeSingle();
    if (!error && data) {
      const res = await apiFetch(BACKEND_URL+`/add_device`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ deviceId: deviceUUID, deviceName }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.error || `Failed to claim device: ${res.status}`);
      }
    }
    if (error) {
      throw new Error("Failed to claim device: " + error.message);
    }

    if (!data) {
      throw new Error("Device is already claimed.");
    }

    return data;
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
