#!/bin/bash

# Define the Firebase project ID manually (replace with your actual project ID)
export GCLOUD_PROJECT="littleswaps-firebase"
export FIREBASE_CONFIG="{\"projectId\":\"littleswaps-firebase\"}"

# Define the path to your functions file
FUNCTIONS_FILE="./functions/index.js"  # Update this if necessary

# Check if the functions file exists
if [[ ! -f "$FUNCTIONS_FILE" ]]; then
  echo "❌ Functions file not found at $FUNCTIONS_FILE"
  exit 1
fi

# Ask user for the function to run
while true; do
  echo -e "\nAvailable functions:"
  
  # Extract exported function names
  FUNCS=$(grep -o 'export const [a-zA-Z0-9_]*' "$FUNCTIONS_FILE" | awk '{print $3}')
  echo "$FUNCS"
  
  echo -e "\nEnter the function name to run (or type 'exit' to quit):"
  read FUNC_NAME

  if [[ "$FUNC_NAME" == "exit" ]]; then
    echo "🚀 Exiting..."
    exit 0
  fi

  if [[ -z "$FUNC_NAME" ]]; then
    echo "⚠️ Function name cannot be empty."
    continue
  fi

  # Create a temporary test file to execute the function
  TEST_FILE="./functions/testRunner.mjs"
  echo "import { $FUNC_NAME } from './index.js';" > "$TEST_FILE"
  echo "$FUNC_NAME({ eventId: 'test-event', timestamp: new Date().toISOString() }).then(() => console.log('✅ Function executed successfully!')).catch(console.error);" >> "$TEST_FILE"

  # Run the function using Node.js with the Firebase environment set
  echo -e "\n▶️ Running function: $FUNC_NAME"
  node "$TEST_FILE"

  # Remove the temporary file
  rm "$TEST_FILE"
done
