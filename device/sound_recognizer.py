# -----------------------------------------------------------
# Ari Sean and Brendon Richard
# 11/25/2025
# CS 442 - Dr. Liang
#
# sound_recognizer.py
# Raspberry Pi/Windows sound recognizer using microphone input.
# -----------------------------------------------------------

import argparse
import datetime
import queue
import threading
import time
from collections import deque

import librosa
import numpy as np
import pyaudio

CHUNK = 4096
RATE = 44100

class SoundRecognizer:
    """Streams audio, runs detection, and emits events once noise subsides."""

    def __init__(
        self,
        device_index=None,
        device_name=None,
        callback=None,
        chunk=CHUNK,
        rate=RATE,
        energy_threshold=200.0,
        delta_threshold=120.0,
        silence_frames=4,
    ):
        self.chunk = chunk
        self.rate = rate
        self.callback = callback
        self.audio_queue = queue.Queue()
        self.pa = pyaudio.PyAudio()
        self.device_index = select_device_index(self.pa, preferred_name=device_name, explicit_index=device_index)
        if self.device_index is None:
            raise SystemExit("Unable to find a valid audio input device.")

        self.stream = self.pa.open(
            format=pyaudio.paInt16,
            rate=self.rate,
            channels=1,
            input=True,
            input_device_index=self.device_index,
            frames_per_buffer=self.chunk,
        )

        self._running = False
        self._reader_thread = None
        self._energy_threshold = energy_threshold
        self._delta_threshold = delta_threshold
        self._silence_frames = max(1, silence_frames)
        self._silence_counter = self._silence_frames
        self._armed = True
        self._energy_history = deque(maxlen=80)

    def _reader_loop(self):
        while self._running:
            try:
                data = self.stream.read(self.chunk, exception_on_overflow=False)
            except IOError:
                continue
            audio = np.frombuffer(data, dtype=np.int16).astype(np.float32)
            self.audio_queue.put(audio)

    def start(self):
        if self._running:
            return
        self._running = True
        self._reader_thread = threading.Thread(target=self._reader_loop, daemon=True)
        self._reader_thread.start()

    def stop(self):
        self._running = False
        if self._reader_thread:
            self._reader_thread.join(timeout=1.0)
        self.stream.stop_stream()
        self.stream.close()
        self.pa.terminate()

    def get_detection(self, block=False, timeout=None):
        try:
            audio = self.audio_queue.get(block=block, timeout=timeout)
        except queue.Empty:
            return None

        detection = self._evaluate_audio(audio)
        if detection:
            # use iso format for timestamps
            detection["created_at"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
        return detection

    def _evaluate_audio(self, audio):
        energy, centroid, label = compute_sound_features(audio)
        self._energy_history.append(energy)
        noise_floor = float(min(self._energy_history)) if self._energy_history else energy
        delta = energy - noise_floor

        if energy < self._energy_threshold or delta < self._delta_threshold:
            self._silence_counter = min(self._silence_counter + 1, self._silence_frames)
            if self._silence_counter >= self._silence_frames:
                self._armed = True
            return None

        if not self._armed:
            return None

        self._silence_counter = 0
        self._armed = False

        return {
            "label": label,
            "energy": float(energy),
            "centroid": float(centroid),
        }

    def run(self, poll_timeout=0.1):
        self.start()
        print("Listening... (Ctrl+C to stop)\n")
        try:
            while True:
                detection = self.get_detection(block=True, timeout=poll_timeout)
                if detection and self.callback:
                    self.callback(detection)
        except KeyboardInterrupt:
            raise
        finally:
            self.stop()


def list_input_devices(pa):
    """Print the list of available microphone devices."""
    print("Available audio input devices:")
    for idx in range(pa.get_device_count()):
        info = pa.get_device_info_by_index(idx)
        channels = info.get("maxInputChannels", 0)
        if channels > 0:
            name = info.get("name", "<unknown>")
            rate = info.get("defaultSampleRate")
            print(f"  {idx}: {name} (max channels: {channels}, rate: {rate})")


def select_device_index(pa, preferred_name=None, explicit_index=None):
    """Choose the best input device index based on name or index hints."""
    if explicit_index is not None:
        try:
            info = pa.get_device_info_by_index(explicit_index)
            if info.get("maxInputChannels", 0) > 0:
                return explicit_index
        except IOError:
            pass

    substring = preferred_name.lower() if preferred_name else None
    best_match = None

    for idx in range(pa.get_device_count()):
        info = pa.get_device_info_by_index(idx)
        if info.get("maxInputChannels", 0) == 0:
            continue

        name = info.get("name", "")
        if substring and substring in name.lower():
            return idx

        if info.get("defaultSampleRate") == RATE and best_match is None:
            best_match = idx

    try:
        default = pa.get_default_input_device_info()
        return default.get("index")
    except IOError:
        return best_match


def classify_centroid(centroid):
    if centroid < 1200:
        return "Low-frequency sound (e.g., hum, thud)"
    elif centroid < 3000:
        return "Mid-frequency sound (e.g., clap, knock)"
    return "High-frequency sound (e.g., whistle, chirp)"


def compute_sound_features(audio):
    energy = np.abs(audio).mean()
    centroid = librosa.feature.spectral_centroid(y=audio, sr=RATE)
    avg_centroid = centroid.mean()
    label = classify_centroid(avg_centroid)
    return energy, avg_centroid, label


def _print_detection(event):
    timestamp = datetime.datetime.fromtimestamp(event["timestamp"]).strftime("%H:%M:%S")
    print(f"[{timestamp}] Detected: {event['label']} (energy={event['energy']:.0f}, centroid={event['centroid']:.0f})")


def _build_arg_parser():
    parser = argparse.ArgumentParser(description="Listen for sound events from a microphone input.")
    parser.add_argument("--device-index", type=int, help="Use this input device index directly.")
    parser.add_argument("--device-name", help="Preferred name substring to match (e.g., Logitech).")
    parser.add_argument("--list-devices", action="store_true", help="Show plugged-in microphones and exit.")
    parser.add_argument("--energy-threshold", type=float, default=200.0, help="Minimum average energy to consider a sound event.")
    parser.add_argument("--delta-threshold", type=float, default=120.0, help="Minimum energy above the noise floor.")
    parser.add_argument("--silence-frames", type=int, default=4, help="Number of quiet frames required before retriggering.")
    return parser

if __name__ == "__main__":
    parser = _build_arg_parser()
    args = parser.parse_args()

    if args.list_devices:
        pa = pyaudio.PyAudio()
        list_input_devices(pa)
        pa.terminate()
        exit()

    recognizer = SoundRecognizer(
        device_index=args.device_index,
        device_name=args.device_name,
        callback=_print_detection,
            energy_threshold=args.energy_threshold,
            delta_threshold=args.delta_threshold,
            silence_frames=args.silence_frames,
    )

    try:
        recognizer.run()
    except KeyboardInterrupt:
        print("\nStopping listener...")
