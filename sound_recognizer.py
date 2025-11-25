# -----------------------------------------------------------
# Ari Sean and Brendon Richard
# 11/25/2025
# CS 442 - Dr. Liang
#
# sound_recognizer.py
# Raspberry Pi sound recognizer using microphone input.
#
# Requires:
#   pip install pyaudio numpy librosa
# -----------------------------------------------------------

import pyaudio
import numpy as np
import librosa
import time
import queue
import threading


# Audio Stream Configuration
CHUNK = 4096
RATE = 44100
DEVICE_INDEX = 2   # Adjust based on your Pi's microphone index

p = pyaudio.PyAudio()

stream = p.open(
    format=pyaudio.paInt16,
    rate=RATE,
    channels=1,
    input=True,
    input_device_index=DEVICE_INDEX,
    frames_per_buffer=CHUNK
)

audio_queue = queue.Queue()


# Background Thread: Reads mic frames continuously
def audio_reader():
    while True:
        data = stream.read(CHUNK, exception_on_overflow=False)
        audio = np.frombuffer(data, dtype=np.int16).astype(np.float32)
        audio_queue.put(audio)


reader_thread = threading.Thread(target=audio_reader, daemon=True)
reader_thread.start()


# Sound detection function
def detect_sound_simple(audio):
    """
    Basic recognition using:
       - Energy amplitude
       - Spectral centroid
    """
    energy = np.abs(audio).mean()

    # Ignore silence
    if energy < 50:
        return None

    # Frequency-based feature
    centroid = librosa.feature.spectral_centroid(y=audio, sr=RATE)
    avg_centroid = centroid.mean()

    if avg_centroid < 1200:
        return "Low-frequency sound (e.g., hum, thud)"
    elif avg_centroid < 3000:
        return "Mid-frequency sound (e.g., clap, knock)"
    else:
        return "High-frequency sound (e.g., whistle, chirp)"


# Main Loop: Read sound & classify
print("Listening... (Ctrl+C to stop)\n")

try:
    while True:
        if not audio_queue.empty():
            audio = audio_queue.get()

            # Recognize result
            result = detect_sound_simple(audio)

            if result:
                print(f"[{time.strftime('%H:%M:%S')}] Detected: {result}")

        time.sleep(0.01)

except KeyboardInterrupt:
    print("\nStopping listener...")
    stream.stop_stream()
    stream.close()
    p.terminate()

