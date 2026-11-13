set -e
cd /workspace/bj3d
sed -e "s#^} from 'three';#} from './three-src.js';#" src/bj3d.js > src/bj3d-src.js
node build.mjs
cp /workspace/royal-casino-backup-antes-bj3d.html /workspace/royal-casino/index.html
python3 patch.py
