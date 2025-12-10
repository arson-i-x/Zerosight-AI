#!/bin/bash
set -e

echo "=== Updating packages ==="
apt update
apt install -y hostapd dnsmasq python3 python3-pip python3-venv build-essential cmake python3-dev portaudio19-dev libportaudio2 libportaudiocpp0 ffmpeg libsndfile1-dev

###################################
# Create AP configs
###################################
echo "=== Configuring hostapd ==="
cat >/etc/hostapd/hostapd.conf <<EOF
interface=wlan0
driver=nl80211
ssid=zerosight-setup
hw_mode=g
channel=6
wpa=2
wpa_passphrase=zerosight123
wpa_key_mgmt=WPA-PSK
wpa_pairwise=TKIP
rsn_pairwise=CCMP
EOF

echo 'DAEMON_CONF="/etc/hostapd/hostapd.conf"' >/etc/default/hostapd

echo "=== Configuring dnsmasq ==="
[ -f /etc/dnsmasq.conf ] && mv /etc/dnsmasq.conf /etc/dnsmasq.conf.orig
cat >/etc/dnsmasq.conf <<EOF
interface=wlan0
dhcp-range=192.168.4.10,192.168.4.100,12h
EOF

echo "=== Configuring static IP for wlan0 ==="
cat >>/etc/dhcpcd.conf <<EOF

interface wlan0
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
# AP fallback script
###################################
cat >/opt/provision/check_wifi.sh <<'EOF'
#!/bin/bash
# Wait for wlan0 to be ready
for i in {1..5}; do
    SSID=$(wpa_cli -i wlan0 status | grep ssid= | cut -d= -f2)
    if [ ! -z "$SSID" ]; then break; fi
    sleep 2
done

if [ -z "$SSID" ]; then
    echo "No WiFi configured, enabling AP mode..."
    systemctl start dnsmasq
    systemctl start hostapd
    systemctl restart provision
else
    echo "WiFi is configured, disabling AP mode..."
    systemctl stop dnsmasq
    systemctl stop hostapd
fi
EOF
chmod +x /opt/provision/check_wifi.sh

###################################
# Systemd: AP fallback service
###################################
cat >/etc/systemd/system/ap-fallback.service <<EOF
[Unit]
Description=Enable AP mode if WiFi is unconfigured
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=/opt/provision/check_wifi.sh

[Install]
WantedBy=multi-user.target
EOF

###################################
# Enable services
###################################
systemctl daemon-reload
systemctl enable provision.service
systemctl enable ap-fallback.service

echo ""
echo "-------------------------------------"
echo "Provisioning setup complete!"
echo "AP SSID: zerosight-setup"
echo "Password: zerosight123"
echo "Provisioning server: http://192.168.4.1/"
echo "-------------------------------------"

# Python 3.10 may be installed as python3.10 or python3
PYTHON=$(which python3.10 || which python3)

echo "Using Python: $PYTHON"

if [ -z "$PYTHON" ]; then
    echo "ERROR: python3.10 not found!"
    echo "Install with:"
    echo "  sudo apt install python3.10 python3.10-venv python3.10-dev"
    exit 1
fi

# Remove old venv if necessary
rm -rf venv

# Create new venv
echo "Creating venv..."
python3 -m venv venv
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

pip install \
    cmake \
    face_recognition \
    dlib \
    opencv-python \
    numpy \
    librosa \
    pyaudio \
    requests

echo
echo "=== Virtual environment ready! ==="
echo "To activate later:"
echo "    source venv/bin/activate"
