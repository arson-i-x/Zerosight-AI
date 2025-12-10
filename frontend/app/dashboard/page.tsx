"use client";
import { useEffect, useState } from "react";
import DeviceSelector from "@/components/DeviceSelector";
import { useRouter } from "next/navigation";
import { useAuth } from "../providers/AuthProvider";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL;
const DEVICES_API_URL = `${BACKEND}/API/devices/`;

type Event = {
  id: string;
  event_type: string;
  created_at: string;
  details?: any;
};

export default function DashboardPage() {
  const router = useRouter();
  const auth = useAuth();
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [devices, setDevices] = useState<Array<{ id: string; name: string }>>([]);
  const [showSelector, setShowSelector] = useState(false);

  function handleLogout() {
    auth.logout();
    // redirect to login
    try {
      router.push("/login");
    } catch {
      window.location.href = "/login";
    }
  }

  function handleAddDevice() {
    try {
      router.push("/add-device");
    } catch {
      window.location.href = "/add-device";
    }
  }

  function ensureAuth() {
    if (!auth.ready) return false;
    if (!auth.accessToken) {
      try { router.push("/login"); } catch { window.location.href = "/login"; }
      return false;
    }
    return true;
  }

  async function fetchUserDevices() {
    if (!ensureAuth()) return;
    try {
      console.log("Fetching user devices");
      const res = await auth.apiFetch(`${DEVICES_API_URL}user_devices`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || `Request failed: ${res.status}`);
      }
      console.log("User devices data:", data);
      return data;
    } catch (error) {
      console.error("Error fetching user devices:", error);
    }
  }

  async function selectRecentDevice() {
    if (!ensureAuth()) return null;
    const data = await fetchUserDevices();
    const list = data?.devices || [];
    setDevices(list);
    const firstId = list[0]?.device_uuid ?? null;
    setDeviceId(firstId);
  }

  async function fetchEvents(idParam?: string) {
    const id = idParam ?? deviceId;
    if (!id || !ensureAuth()) return;
    try {
      console.log("Fetching events for device:", id);
      setLoading(true);
      const res = await auth.apiFetch(
        `${DEVICES_API_URL}events/${id}`, // use path param instead of query
        { method: "GET" }
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || `Request failed: ${res.status}`);
      }
      setEvents(data.events || []);
      setLoading(false);
    } catch (error) {
      console.error("Error fetching events:", error);
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!ensureAuth()) return;
    setLoading(true);
    async function load() {
      await selectRecentDevice();
      await fetchEvents();
      setLoading(false);
    }
    load();
    // re-run when device changes or auth becomes ready
  }, [ deviceId, auth.ready, auth.accessToken ]);



  if (loading)
    return (
      <div className="flex items-center justify-center min-h-screen text-xl">
        Loading…
      </div>
    );

  // Show add device prompt if no devices
  if (devices.length === 0) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        {/* User Profile Header */}
        <div className="mb-6 p-4 bg-white rounded-lg shadow flex items-center gap-4">
          {auth.avatarUrl && (
            <img
              src={auth.avatarUrl}
              alt="Avatar"
              className="w-10 h-10 sm:w-12 sm:h-12 rounded-full object-cover"
              style={{ width: 150, height: 150 }}
              loading="lazy"
            />
          )}
          <div>
            <h2 className="text-2xl font-semibold">{auth.fullName || 'User'}</h2>
            <p className="text-gray-600 text-sm">ID: {auth.userId}</p>
          </div>
        </div>

        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-semibold">Your Devices</h1>
          <button
            onClick={handleLogout}
            className="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600 text-sm"
          >
            Logout
          </button>
        </div>

        <div className="flex items-center justify-center min-h-96">
          <button
            onClick={handleAddDevice}
            className="px-8 py-4 bg-blue-600 hover:bg-blue-700 text-white text-xl font-semibold rounded-lg shadow-lg"
          >
            + Add Device
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* User Profile Header */}
      <div className="mb-6 p-4 bg-white rounded-lg shadow flex items-center gap-4">
        {auth.avatarUrl && (
          <img
            src={auth.avatarUrl}
           alt="Avatar"
            className="w-10 h-10 sm:w-12 sm:h-12 rounded-full object-cover"
            style={{ width: 150, height: 150 }}
            loading="lazy"
          />
        )}
        <div>
          <h1 className="text-2xl font-semibold">{`${auth.fullName || 'User'}'s Dashboard`}</h1>
          <p className="text-gray-600 text-sm">User ID: {auth.userId}</p>
        </div>
      </div>

      <div className="flex items-center justify-between mb-4">
        <h2 className="text-3xl font-semibold">Your Events</h2>
        <div className="flex gap-2">
          <button
            onClick={() => setShowSelector((s) => !s)}
            className="px-3 py-1 bg-gray-100 rounded hover:bg-gray-200 text-sm"
          >
            Devices
          </button>
          <button
            onClick={handleLogout}
            className="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600 text-sm"
          >
            Logout
          </button>
        </div>
      </div>

      {/* Floating/inline selector panel */}
      {showSelector && (
        <div className="mb-4 p-4 bg-white border rounded shadow">
          <DeviceSelector
            devices={devices}
            selectedId={deviceId}
            onSelect={async (id) => {
              setDeviceId(id);
              await fetchEvents(id);
              setShowSelector(false);
            }}
            onRefresh={() => fetchEvents()}
            showAddButton={true}
            onAdd={handleAddDevice}
          />
        </div>
      )}

      {events.length === 0 ? (
        <div className="text-gray-600 text-center">No events yet.</div>
      ) : (
        <div className="space-y-4">
          {events.map(ev => (
            <div
              key={ev.id}
              className="bg-white p-4 rounded-lg shadow flex flex-col"
            >
              <span className="font-semibold">{ev.event_type}</span>
              <span className="text-sm text-gray-500">{new Date(ev.created_at).toLocaleString()}</span>
              {ev.details && (
                <pre className="text-xs mt-2 p-2 bg-gray-100 rounded">{JSON.stringify(ev.details, null, 2)}</pre>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}