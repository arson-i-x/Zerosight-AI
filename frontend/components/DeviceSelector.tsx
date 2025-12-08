"use client";
import React from "react";

export type Device = { id: string; name?: string };

type Props = {
  devices: Device[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  onRefresh?: () => void;
  showAddButton?: boolean;
  onAdd?: () => void;
};

export default function DeviceSelector({ devices, selectedId, onSelect, onRefresh, showAddButton = false, onAdd }: Props) {
  return (
    <div className="mb-4">
      <label className="block text-sm font-medium text-gray-700 mb-2">Select Device</label>
      {devices.length === 0 ? (
        <div className="text-sm text-gray-600">No devices found. Add one.</div>
      ) : (
        <div className="flex items-center gap-2">
          <select
            value={selectedId ?? ""}
            onChange={(e) => onSelect && onSelect(e.target.value)}
            className="border rounded p-2"
          >
            {devices.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name || d.id}
              </option>
            ))}
          </select>
          <button
            onClick={() => onRefresh && onRefresh()}
            className="px-3 py-1 bg-gray-200 rounded text-sm"
            type="button"
          >
            Refresh Events
          </button>
          {showAddButton && (
            <button
              onClick={() => onAdd && onAdd()}
              className="px-3 py-1 bg-blue-600 text-white rounded text-sm"
              type="button"
            >
              Add Device
            </button>
          )}
        </div>
      )}
    </div>
  );
}
