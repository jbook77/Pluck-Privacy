#!/bin/bash
# Package Pluck extension for Chrome Web Store upload
# Usage: ./package-for-store.sh

set -e

OUTPUT="pluck-extension.zip"

# Remove old package if it exists
rm -f "$OUTPUT"

# Create zip with only the required files
zip -r "$OUTPUT" \
  manifest.json \
  popup.html \
  popup.js \
  content.js \
  background.js \
  google-api.js \
  icons/icon16.png \
  icons/icon32.png \
  icons/icon48.png \
  icons/icon128.png

echo ""
echo "Packaged: $OUTPUT"
echo "Contents:"
unzip -l "$OUTPUT"
echo ""
echo "Next step: Upload this file to the Chrome Web Store Developer Dashboard"
