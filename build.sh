#!/usr/bin/env bash
# Exit on error
set -o errexit

echo "===> Installing Python Dependencies..."
pip install --upgrade pip
pip install -r requirements.txt

echo "===> Building Frontend Assets..."
if command -v npm &> /dev/null; then
    npm install
    npm run build
else
    echo "Node/NPM not found. Using pre-built dist/ folder."
fi

echo "===> Build Completed Successfully!"
