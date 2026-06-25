#!/bin/bash
set -e

# Clean up npm temp rename dirs that cause ENOTEMPTY errors
node -e "
const fs = require('fs');
const path = require('path');
const nm = 'node_modules';
function rmrf(d) {
  if (!fs.existsSync(d)) return;
  try {
    for (const e of fs.readdirSync(d)) {
      const f = path.join(d, e);
      try { fs.lstatSync(f).isDirectory() ? rmrf(f) : fs.unlinkSync(f); } catch(e){}
    }
    fs.rmdirSync(d);
  } catch(e){}
}
function clean(dir) {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir)) {
    if (e.startsWith('.') && e.length > 4) {
      const full = path.join(dir, e);
      try { if (fs.lstatSync(full).isDirectory()) rmrf(full); } catch(e){}
    }
  }
}
clean(nm);
try {
  for (const e of fs.readdirSync(nm)) {
    if (e.startsWith('@')) clean(path.join(nm, e));
  }
} catch(e){}
" 2>/dev/null || true

npm install
npm run db:push
