#!/bin/bash
# Package Pluck extension for Chrome Web Store upload
# Usage: ./package-for-store.sh

set -e

OUTPUT="pluck-extension.zip"

# Auto-bump the patch version in manifest.json
CURRENT_VERSION=$(python3 -c "import json; print(json.load(open('manifest.json'))['version'])")
MAJOR=$(echo "$CURRENT_VERSION" | cut -d. -f1)
MINOR=$(echo "$CURRENT_VERSION" | cut -d. -f2)
NEW_MINOR=$((MINOR + 1))
NEW_VERSION="$MAJOR.$NEW_MINOR"
python3 -c "
import json
with open('manifest.json', 'r') as f:
    m = json.load(f)
m['version'] = '$NEW_VERSION'
with open('manifest.json', 'w') as f:
    json.dump(m, f, indent=2)
print('Version bumped: $CURRENT_VERSION → $NEW_VERSION')
"

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
