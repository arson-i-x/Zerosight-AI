#!/bin/bash
set -e

AP_SSID="zerosight-setup"
AP_PW="zerosight123"
WLAN_IF="wlan0"

echo "=== Updating packages ==="
apt update
apt install -y hostapd dnsmasq python3 python3-pip python3-venv \
               build-essential cmake python3-dev portaudio19-dev \
               libportaudio2 libportaudiocpp0 ffmpeg libsndfile1-dev

###################################
# Hostapd AP config
###################################
echo "=== Configuring hostapd ==="
cat >/etc/hostapd/hostapd.conf <<EOF
interface=$WLAN_IF
driver=nl80211
ssid=$AP_SSID
hw_mode=g
channel=6
wpa=2
wpa_passphrase=$AP_PW
wpa_key_mgmt=WPA-PSK
wpa_pairwise=TKIP
rsn_pairwise=CCMP
EOF

echo 'DAEMON_CONF="/etc/hostapd/hostapd.conf"' >/etc/default/hostapd

###################################
# dnsmasq DHCP config
###################################
echo "=== Configuring dnsmasq ==="
[ -f /etc/dnsmasq.conf ] && mv /etc/dnsmasq.conf /etc/dnsmasq.conf.orig
cat >/etc/dnsmasq.conf <<EOF
interface=$WLAN_IF
dhcp-range=192.168.4.10,192.168.4.100,12h
EOF

###################################
# Static IP for AP mode
###################################
echo "=== Configuring static IP for $WLAN_IF ==="
grep -q "$WLAN_IF" /etc/dhcpcd.conf || cat >>/etc/dhcpcd.conf <<EOF

interface $WLAN_IF
    static ip_address=192.168.4.1/24
EOF

###################################
# Provisioning server
###################################
mkdir -p /opt/provision
python3 -m venv /opt/provision/venv
/opt/provision/venv/bin/pip install --upgrade pip fastapi uvicorn

cat >/opt/provision/server.py <<'EOF'
from fastapi import FastAPI
import subprocess

app = FastAPI()

@app.post("/provision")
async def provision(data: dict):
    ssid = data["ssid"]
    pw = data["password"]

    # Build hashed PSK output
    psk = subprocess.check_output(["wpa_passphrase", ssid, pw]).decode()
    with open("/etc/wpa_supplicant/wpa_supplicant.conf", "w") as f:
        f.write(psk)

    # Switch out of AP mode
    subprocess.call(["systemctl", "stop", "hostapd"])
    subprocess.call(["systemctl", "stop", "dnsmasq"])
    subprocess.call(["systemctl", "restart", "wpa_supplicant"])
    subprocess.call(["wpa_cli", "-i", "wlan0", "reconfigure"])

    return {"status": "ok", "ssid": ssid}
EOF

###################################
# Systemd: provisioning server
###################################
cat >/etc/systemd/system/provision.service <<EOF
[Unit]
Description=Zerosight Provisioning Server
After=network.target

[Service]
ExecStart=/opt/provision/venv/bin/uvicorn server:app --host 0.0.0.0 --port 80
WorkingDirectory=/opt/provision
Restart=always

[Install]
WantedBy=multi-user.target
EOF

###################################
# Button-press AP toggle script
###################################
cat >/opt/provision/toggle_ap.sh <<'EOF'
#!/bin/bash
set -e

AP_SSID="zerosight-setup"
AP_PW="zerosight123"
WLAN_IF="wlan0"

if [ "$EUID" -ne 0 ]; then
    echo "Please run as root"
    exit 1
fi

MODE="$1"

if [ -z "$MODE" ]; then
    echo "Usage: $0 {ap|wifi}"
    exit 1
fi

start_ap() {
    echo "Switching to AP mode..."

    # Stop normal Wi-Fi
    systemctl stop wpa_supplicant || true

    # Configure static IP
    ip addr flush dev $WLAN_IF
    ip addr add 192.168.4.1/24 dev $WLAN_IF
    ip link set $WLAN_IF up

    # Start AP services
    systemctl start dnsmasq
    systemctl start hostapd
    systemctl restart provision

    echo "AP started: $AP_SSID ($AP_PW)"
    echo "SSH will work if connected to this AP (192.168.4.1)"
}

restore_wifi() {
    echo "Restoring normal Wi-Fi..."

    # Stop AP services
    systemctl stop hostapd || true
    systemctl stop dnsmasq || true

    # Flush IP and bring interface up
    ip addr flush dev $WLAN_IF
    ip link set $WLAN_IF up

    # Start wpa_supplicant and DHCP
    systemctl start wpa_supplicant
    dhclient $WLAN_IF || true
    systemctl restart provision

    echo "Normal Wi-Fi restored."
}

case "$MODE" in
    ap) start_ap ;;
    wifi) restore_wifi ;;
    *)
        echo "Unknown mode: $MODE"
        echo "Usage: $0 {ap|wifi}"
        exit 1
        ;;
esac
EOF

chmod +x /opt/provision/toggle_ap.sh

###################################
# Enable systemd services
###################################
systemctl daemon-reload
systemctl enable provision.service

echo ""
echo "=== Setup complete ==="
echo "Toggle AP/Wi-Fi any time with:"
echo "sudo /opt/provision/toggle_ap.sh ap"
echo "sudo /opt/provision/toggle_ap.sh wifi"
echo "Provisioning server: http://192.168.4.1/"

# Python 3.10 may be installed as python3.10 or python3
PYTHON=$(which python3.10 || which python3)

###################################
# Python 3.13 venv setup
###################################

PYTHON="/usr/bin/python3.13"

if [ ! -x "$PYTHON" ]; then
    echo "ERROR: Python 3.13 not found!"
    exit 1
fi

echo "Using Python: $PYTHON"

echo "Creating venv at venv..."
rm -rf venv
$PYTHON -m venv venv
source venv/bin/activate

echo "Upgrading pip inside venv..."
pip install --upgrade pip wheel setuptools

sudo apt update
sudo apt install -y \
    build-essential \
    cmake \
    python3.13-dev \
    python3.13-venv \
    libopenblas-dev \
    liblapack-dev \
    libx11-dev \
    libhdf5-dev \
    libjpeg-dev \
    libpng-dev \
    libboost-all-dev \
    git \
    portaudio19-dev \
    libportaudio2 \
    libportaudiocpp0 \
    ffmpeg \
    libsndfile1-dev

source venv/bin/activate

# Upgrade pip inside venv
pip install --upgrade pip

echo "Activating venv..."
source venv/bin/activate

echo "Upgrading pip..."
pip install --upgrade pip

# For dlib
sudo apt update
sudo apt install -y build-essential cmake python3-dev

# For PyAudio
sudo apt install -y portaudio19-dev libportaudio2 libportaudiocpp0 ffmpeg

# Optional (helps with audio processing, e.g., librosa)
sudo apt install -y libsndfile1-dev

echo "Installing dependencies..."

echo "Installing Python deps..."

pip install --upgrade pip wheel setuptools

# Build dlib manually for Python 3.13
pip install dlib

pip install face_recognition
pip install git+https://github.com/ageitgey/face_recognition_models
pip install numpy opencv-python librosa pyaudio requests
pip install git+https://github.com/ageitgey/face_recognition_models
python - <<'EOF'
import face_recognition, dlib
print("face_recognition OK")
print("dlib:", dlib.__version__)
EOF

echo
echo "=== Virtual environment ready! ==="
echo "To activate later:"
echo "    source venv/bin/activate"
