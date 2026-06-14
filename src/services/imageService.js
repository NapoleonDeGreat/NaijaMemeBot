const { createCanvas, loadImage } = require('canvas');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const OUTPUT_DIR = path.join(__dirname, '../../public/generated');
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

const CANVAS_SIZE = 1080;

function wrapText(ctx, text, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let current = '';
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function drawSpeechBubble(ctx, x, y, width, height, radius = 20) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + 80, y + height);
  ctx.lineTo(x + 50, y + height + 30);
  ctx.lineTo(x + 60, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

async function generateMemeImage({ templatePath, caption, recipientName, category }) {
  const canvas = createCanvas(CANVAS_SIZE, CANVAS_SIZE);
  const ctx = canvas.getContext('2d');

  // Background
  try {
    const bgImage = await loadImage(path.resolve(templatePath));
    ctx.drawImage(bgImage, 0, 0, CANVAS_SIZE, CANVAS_SIZE);
  } catch (err) {
    console.warn('Template not found, using fallback gradient');
    const gradient = ctx.createLinearGradient(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    gradient.addColorStop(0, '#1a5c1a');
    gradient.addColorStop(1, '#f5a623');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
  }

  // Dark overlay
  ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  // Speech bubble
  const bubbleX = 40;
  const bubbleY = 300;
  const bubbleW = CANVAS_SIZE - 80;
  const bubbleH = 240;

  ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
  drawSpeechBubble(ctx, bubbleX, bubbleY, bubbleW, bubbleH);
  ctx.fill();

  ctx.strokeStyle = '#2d7a2d';
  ctx.lineWidth = 3;
  drawSpeechBubble(ctx, bubbleX, bubbleY, bubbleW, bubbleH);
  ctx.stroke();

  // Caption text
  ctx.fillStyle = '#1a3a1a';
  ctx.font = 'bold 38px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  const captionLines = wrapText(ctx, caption, bubbleW - 80);
  const lineHeight = 50;
  const totalTextH = captionLines.length * lineHeight;
  const textStartY = bubbleY + (bubbleH - totalTextH) / 2;
  captionLines.forEach((line, i) => {
    ctx.fillText(line, CANVAS_SIZE / 2, textStartY + i * lineHeight);
  });

  // Bottom bar
  const barH = 130;
  ctx.fillStyle = '#1a5c1a';
  ctx.fillRect(0, CANVAS_SIZE - barH, CANVAS_SIZE, barH);

  ctx.fillStyle = '#f5a623';
  ctx.font = 'bold 32px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`THANK YOU, ${recipientName.toUpperCase()}!`, CANVAS_SIZE / 2, CANVAS_SIZE - barH + 38);

  ctx.fillStyle = '#ffffff';
  ctx.font = '24px Arial';
  ctx.fillText('You too much! 💪😄', CANVAS_SIZE / 2, CANVAS_SIZE - barH + 80);

  // Watermark
  const watermarkText = process.env.WATERMARK_TEXT || 'NaijaMeme';
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillRect(CANVAS_SIZE - 260, 10, 250, 50);
  ctx.fillStyle = '#1a5c1a';
  ctx.font = 'bold 26px Arial';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillText(watermarkText, CANVAS_SIZE - 20, 35);

  // Save
  const filename = `${uuidv4()}.jpg`;
  const outputPath = path.join(OUTPUT_DIR, filename);
  const buffer = canvas.toBuffer('image/jpeg', { quality: 0.92 });
  fs.writeFileSync(outputPath, buffer);

  return {
    localPath: outputPath,
    filename,
    publicUrl: `${process.env.APP_URL}/generated/${filename}`,
  };
}

module.exports = { generateMemeImage };
