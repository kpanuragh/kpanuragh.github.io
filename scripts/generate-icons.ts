import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const sourceImage = path.join(process.cwd(), 'images', 'fav.png');
const outputDir = path.join(process.cwd(), 'public');

async function generateIcons() {
  console.log('Generating icons from:', sourceImage);

  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  try {
    // 192x192 for PWA
    await sharp(sourceImage)
      .resize(192, 192)
      .toFile(path.join(outputDir, 'icon-192.png'));
    console.log('✓ Generated icon-192.png');

    // 512x512 for PWA
    await sharp(sourceImage)
      .resize(512, 512)
      .toFile(path.join(outputDir, 'icon-512.png'));
    console.log('✓ Generated icon-512.png');

    // 180x180 for Apple
    await sharp(sourceImage)
      .resize(180, 180)
      .toFile(path.join(outputDir, 'apple-touch-icon.png'));
    console.log('✓ Generated apple-touch-icon.png');

    // 32x32 favicon
    await sharp(sourceImage)
      .resize(32, 32)
      .toFile(path.join(outputDir, 'favicon-32x32.png'));
    console.log('✓ Generated favicon-32x32.png');

    // 16x16 favicon
    await sharp(sourceImage)
      .resize(16, 16)
      .toFile(path.join(outputDir, 'favicon-16x16.png'));
    console.log('✓ Generated favicon-16x16.png');

    // Also copy the 32x32 as favicon.ico (browsers will accept PNG)
    await sharp(sourceImage)
      .resize(32, 32)
      .toFile(path.join(outputDir, 'favicon.ico'));
    console.log('✓ Generated favicon.ico');

    console.log('\n✨ All icons generated successfully!');
  } catch (error) {
    console.error('Error generating icons:', error);
    process.exit(1);
  }
}

generateIcons();
