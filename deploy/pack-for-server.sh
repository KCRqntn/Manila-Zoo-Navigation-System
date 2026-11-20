#!/usr/bin/env bash
# Packs only what the server needs into zoo-deploy.tar.gz (about 0.7 GB, mostly the AI model):
# the source code, the deploy files and the live AI model. Leaves out node_modules, build output,
# old models, backups and every .env file (secrets go into deploy/.env.production on the server).
#   bash deploy/pack-for-server.sh            (run from the project folder)
set -euo pipefail
cd "$(dirname "$0")/.."
tar -czf zoo-deploy.tar.gz \
  --exclude='./node_modules' --exclude='*/node_modules' \
  --exclude='*/dist' --exclude='*.tsbuildinfo' \
  --exclude='./.git' --exclude='./backups' --exclude='./.agents' \
  --exclude='./.env' --exclude='./.env.*' --exclude='./deploy/.env.production' \
  --exclude='./zoo-deploy.tar.gz' \
  --exclude='./ai-training/*' \
  . ai-training/predict_api.py ai-training/.dockerignore \
  --exclude='ai-training/models/checkpoint-*' --exclude='ai-training/models/_run' ai-training/models
ls -lh zoo-deploy.tar.gz
