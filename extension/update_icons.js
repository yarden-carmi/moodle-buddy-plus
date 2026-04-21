const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const iconDir = path.join(__dirname, 'src', 'icons');
const sizes = [16, 32, 48, 128, 96]; // added 96 just in case
const modifiers = ['', '-gray'];
const extras = ['google-icon-96+16.png']; // there is this file in there

async function run() {
  let filesToProcess = [];
  for (const size of sizes) {
    for (const mod of modifiers) {
      filesToProcess.push({ name: `${size}${mod}.png`, size: size, mod: mod });
    }
  }
  filesToProcess.push({ name: 'google-icon-96+16.png', size: 96, mod: '' });

  for (const file of filesToProcess) {
    const filepath = path.join(iconDir, file.name);
    if (!fs.existsSync(filepath)) continue;
    
    // For hue shift
    let baseImg = sharp(filepath);
    if (file.mod === '') {
      baseImg = baseImg.modulate({ hue: 200, lightness: 0 }); // hue rot
    }

    // plus icon size and svg
    const iconBaseSize = file.size;
    const plusSize = Math.max(Math.floor(iconBaseSize / 2), 10);
    const svg = `<svg width="${plusSize}" height="${plusSize}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <circle cx="50" cy="50" r="50" fill="#22c55e" opacity="1" />
      <path d="M 50 15 L 50 85 M 15 50 L 85 50" stroke="white" stroke-width="20" stroke-linecap="round" />
    </svg>`;

    try {
      const buffer = await baseImg.composite([
        { input: Buffer.from(svg), gravity: 'southeast' }
      ]).png().toBuffer();

      fs.writeFileSync(filepath, buffer);
      console.log('processed', file.name);
    } catch(err) {
      console.error('Error with ' + file.name, err);
    }
  }
}
run().catch(console.error);
