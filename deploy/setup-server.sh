#!/usr/bin/env bash
# One-time preparation of a fresh Ubuntu 24.04 server for the Manila Zoo system.
# Run as root on the server:  bash setup-server.sh
#   - installs Docker
#   - adds 2 GB of swap, so a 2 GB server can build the website and load the AI model
#   - opens only SSH, HTTP and HTTPS in the firewall
set -euo pipefail

if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sh
fi

if ! swapon --show | grep -q /swapfile; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

mkdir -p /opt/manila-zoo
echo "Server ready. Docker: $(docker --version)"
free -h
