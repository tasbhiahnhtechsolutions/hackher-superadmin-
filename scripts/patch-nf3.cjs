const fs = require('fs');
const path = require('path');

const targetFile = path.resolve(__dirname, '../node_modules/nf3/dist/_chunks/trace.mjs');

if (fs.existsSync(targetFile)) {
  let content = fs.readFileSync(targetFile, 'utf8');
  const targetImport = 'import { nodeFileTrace } from "@vercel/nft";';
  if (content.includes(targetImport)) {
    const replacement = 'import nftPackage from "@vercel/nft";\nconst nodeFileTrace = nftPackage.nodeFileTrace || nftPackage.default?.nodeFileTrace || nftPackage;';
    content = content.replace(targetImport, replacement);
    fs.writeFileSync(targetFile, content, 'utf8');
    console.log('[patch-nf3] Successfully patched nf3/dist/_chunks/trace.mjs');
  } else {
    console.log('[patch-nf3] nf3 trace.mjs is already patched or target import not found.');
  }
} else {
  console.log('[patch-nf3] nf3 trace.mjs not found, skipping patch.');
}
