"use client";
import { useState } from "react";

export default function PiProvisionForm() {
  const [apReady, setApReady] = useState(false);
  const [wifi, setWifi] = useState("");
  const [password, setPassword] = useState("");
  const [deviceKey, setDeviceKey] = useState("");

  async function waitForPiAP() {
    let ready = false;
    while (!ready) {
      try {
        const res = await fetch("http://192.168.4.1/status");
        if (res.ok) ready = true;
      } catch {}
      if (!ready) await new Promise(r => setTimeout(r, 1500));
    }
    setApReady(true);
  }

  // Call this on component mount
  useState(() => {
    waitForPiAP();
  });

  async function handleProvision(e: React.FormEvent) {
    e.preventDefault();
    if (!apReady) alert("AP is not ready yet! Please turn on your device!");

    const res = await fetch("http://192.168.4.1/provision", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wifi, password, deviceKey }),
    });

    if (!res.ok) alert("Provisioning failed");
    else alert("Provisioning successful!");
  }

  return (
    <form onSubmit={handleProvision} className="space-y-4 max-w-md mx-auto p-4">
      {!apReady && (
        <div>
            <div className="text-center text-gray-600">
            Waiting for Pi AP to come online...<br/>
            Please turn on your device and connect to its Wi-Fi network.<br/>
            Wifi Name: <strong>zerosight-setup</strong><br/>
            Password: <strong>zerosight123</strong>
            </div>
        </div>
      )}

      {apReady && (
        <>
          <div>
            <label className="block text-sm font-medium text-gray-700">WiFi SSID</label>
            <input
              value={wifi}
              onChange={e => setWifi(e.target.value)}
              className="mt-1 block w-full border rounded p-2"
              placeholder="HomeWiFi"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">WiFi Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="mt-1 block w-full border rounded p-2"
              placeholder="********"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Device Key</label>
            <input
              value={deviceKey}
              onChange={e => setDeviceKey(e.target.value)}
              className="mt-1 block w-full border rounded p-2"
              placeholder="key provided with your device"
              required
            />
          </div>

          <button
            type="submit"
            className="px-4 py-2 bg-blue-600 text-white rounded"
          >
            Provision Device
          </button>
        </>
      )}
    </form>
  );
}
