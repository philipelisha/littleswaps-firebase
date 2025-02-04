#!/bin/bash

echo "Starting PostgreSQL..."
docker compose up -d

echo "Waiting for PostgreSQL to be ready..."
sleep 5 # Adjust this if necessary

export $(grep -v '^#' .env.local | xargs)
firebase emulators:start &

sleep 30

node seedPostgres.js
node seedFirebase.js

echo "Firestore data imported successfully."
