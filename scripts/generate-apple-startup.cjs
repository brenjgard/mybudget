/* eslint-disable @typescript-eslint/no-require-imports -- Build static launch assets from the existing vector logo. */
const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');
const sizes = require('../app/data/apple-startup-sizes.json');

async function generate() {
  const root = path.join(__dirname, '..');
  const logo = await fs.readFile(path.join(root, 'public/harbor-app-icon.svg'), 'utf8');
  const output = path.join(root, 'public/apple-startup');
  await fs.mkdir(output, { recursive: true });
  for (const [deviceWidth, deviceHeight, scale] of sizes) {
    for (const landscape of [false, true]) {
      const width = (landscape ? deviceHeight : deviceWidth) * scale;
      const height = (landscape ? deviceWidth : deviceHeight) * scale;
      const logoSize = 220 * scale;
      const positionedLogo = logo.replace('<svg ', `<svg x="${(width-logoSize)/2}" y="${(height-logoSize)/2}" `)
        .replace('width="512" height="512"', `width="${logoSize}" height="${logoSize}"`);
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#1B3A5C"/>${positionedLogo}</svg>`;
      await sharp(Buffer.from(svg)).png({compressionLevel:9,palette:true}).toFile(path.join(output, `${width}x${height}.png`));
    }
  }
  console.log(`Generated ${sizes.length * 2} portrait/landscape Apple launch images.`);
}
generate().catch(error => { console.error(error); process.exitCode = 1; });
