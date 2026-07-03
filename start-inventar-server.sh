#!/usr/bin/env sh
cd "$(dirname "$0")" || exit 1

if command -v python3 >/dev/null 2>&1; then
  python3 server.py
elif command -v python >/dev/null 2>&1; then
  python server.py
else
  echo "Python wurde nicht gefunden."
  exit 1
fi
