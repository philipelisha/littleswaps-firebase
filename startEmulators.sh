#!/bin/bash

export $(grep -v '^#' .env.local | xargs)
firebase emulators:start &

sleep 30

node seedFirebase.js

echo "Firestore data imported successfully."
