const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createCanvas, loadImage } = require('canvas');

const WIDTH = 1080;
const HEIGHT = 1350;
const POSTER_DIR = path.join(__dirname, '..', '..', 'public', 'uploads', 'posters');

const POSTER_THEMES = {
  sunset: {
    name: 'Sunset Glow',
    gradient: ['#f97316', '#ec4899'],
    accent: '#fef3c7',
    text: '#0f172a',
    subtext: '#1f2937',
    confetti: ['#fde68a', '#f9a8d4', '#fcd34d'],
  },
  aurora: {
    name: 'Aurora Night',
    gradient: ['#0f172a', '#312e81'],
    accent: '#cffafe',
    text: '#f8fafc',
    subtext: '#cbd5f5',
    confetti: ['#bae6fd', '#c7d2fe', '#f5d0fe'],
  },
  citrus: {
    name: 'Citrus Burst',
    gradient: ['#facc15', '#ef4444'],
    accent: '#fff7ed',
    text: '#1e1b4b',
    subtext: '#312e81',
    confetti: ['#fcd34d', '#fdba74', '#fb7185'],
  },
};

if (!fs.existsSync(POSTER_DIR)) {
  fs.mkdirSync(POSTER_DIR, { recursive: true });
}

async function fetchAiBackground(prompt) {
  if (!prompt) return null;
  const finalPrompt = `${prompt}, cinematic lighting, ultra realistic vibrant background, 4k`;
  const targetUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(finalPrompt)}`;
  const fetchFn = global.fetch || (await import('node-fetch')).default;
  try {
    const response = await fetchFn(targetUrl, {
      headers: { 'User-Agent': 'CollageEventZone/1.0 poster-generator' },
    });
    if (!response.ok) return null;
    const arrayBuffer = await response.arrayBuffer();
    return await loadImage(Buffer.from(arrayBuffer));
  } catch (err) {
    console.warn('AI background fetch failed', err.message);
    return null;
  }
}

function wrapText(ctx, text, maxWidth) {
  if (!text) return [];
  const words = text.split(/\s+/);
  const lines = [];
  let current = '';
  for (const word of words) {
    const testLine = current ? `${current} ${word}` : word;
    const { width } = ctx.measureText(testLine);
    if (width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = testLine;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function drawBlobs(ctx, palette) {
  const blobColors = [
    palette.accent,
    palette.gradient[0],
    palette.gradient[1],
  ];
  blobColors.forEach((color, i) => {
    ctx.save();
    ctx.translate(200 * i, 160 * i);
    ctx.rotate((Math.PI / 12) * (i + 1));
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.12 + i * 0.05;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(200, -60, 320, 160, 140, 260);
    ctx.bezierCurveTo(-60, 360, -180, 120, 0, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  });
}

function scatterConfetti(ctx, palette) {
  ctx.save();
  palette.confetti.forEach((color, idx) => {
    for (let i = 0; i < 25; i++) {
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.18;
      const size = 6 + (i % 4);
      const x = Math.random() * WIDTH;
      const y = Math.random() * HEIGHT;
      ctx.beginPath();
      ctx.roundRect(x, y, size, size * 2, size / 3);
      ctx.fill();
      ctx.rotate((idx + 1) * 0.01);
    }
  });
  ctx.restore();
}

function paintTemplateBackground(ctx, palette) {
  const gradient = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  gradient.addColorStop(0, palette.gradient[0]);
  gradient.addColorStop(1, palette.gradient[1]);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  drawBlobs(ctx, palette);
  scatterConfetti(ctx, palette);
}

function drawCard(ctx, palette) {
  const cardWidth = WIDTH - 200;
  const cardHeight = HEIGHT - 360;
  const x = 100;
  const y = 210;
  const radius = 32;
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + cardWidth - radius, y);
  ctx.quadraticCurveTo(x + cardWidth, y, x + cardWidth, y + radius);
  ctx.lineTo(x + cardWidth, y + cardHeight - radius);
  ctx.quadraticCurveTo(x + cardWidth, y + cardHeight, x + cardWidth - radius, y + cardHeight);
  ctx.lineTo(x + radius, y + cardHeight);
  ctx.quadraticCurveTo(x, y + cardHeight, x, y + cardHeight - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
  ctx.fill();

  ctx.lineWidth = 4;
  ctx.strokeStyle = `rgba(255,255,255,0.55)`;
  ctx.stroke();

  return { x, y, width: cardWidth, height: cardHeight };
}

async function generatePosterImage({
  title,
  datetime,
  venue,
  description,
  theme = 'sunset',
  mode = 'template',
  aiPrompt = '',
}) {
  if (!title || !datetime || !venue) {
    throw new Error('Title, date/time, and venue are required');
  }
  const palette = POSTER_THEMES[theme] || POSTER_THEMES.sunset;
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');
  ctx.antialias = 'subpixel';

  let backgroundImage = null;
  if (mode === 'ai') {
    backgroundImage = await fetchAiBackground(aiPrompt || `${title} event poster background`);
  }

  if (backgroundImage) {
    ctx.drawImage(backgroundImage, 0, 0, WIDTH, HEIGHT);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  } else {
    paintTemplateBackground(ctx, palette);
  }

  const card = drawCard(ctx, palette);

  ctx.fillStyle = palette.accent;
  ctx.font = '600 42px "Segoe UI", "Poppins", sans-serif';
  ctx.fillText('Hey, you are invited!', card.x + 40, card.y + 70);

  ctx.fillStyle = palette.text;
  ctx.font = '800 68px "Segoe UI", "Poppins", sans-serif';
  const titleLines = wrapText(ctx, title, card.width - 80);
  let cursorY = card.y + 150;
  titleLines.forEach((line) => {
    ctx.fillText(line, card.x + 40, cursorY);
    cursorY += 78;
  });

  ctx.fillStyle = palette.gradient[1];
  ctx.font = '600 36px "Segoe UI", "Poppins", sans-serif';
  ctx.fillText('when we vibe', card.x + 40, cursorY + 12);
  ctx.fillStyle = palette.subtext;
  ctx.font = '400 34px "Segoe UI", "Poppins", sans-serif';
  const dateLines = wrapText(ctx, datetime, card.width - 80);
  cursorY += 58;
  dateLines.forEach((line) => {
    ctx.fillText(line, card.x + 40, cursorY);
    cursorY += 46;
  });

  cursorY += 10;
  ctx.fillStyle = palette.gradient[0];
  ctx.font = '600 36px "Segoe UI", "Poppins", sans-serif';
  ctx.fillText('where the magic happens', card.x + 40, cursorY);
  ctx.fillStyle = palette.subtext;
  ctx.font = '400 34px "Segoe UI", "Poppins", sans-serif';
  const venueLines = wrapText(ctx, venue, card.width - 80);
  cursorY += 48;
  venueLines.forEach((line) => {
    ctx.fillText(line, card.x + 40, cursorY);
    cursorY += 42;
  });

  if (description) {
    cursorY += 14;
    ctx.fillStyle = palette.gradient[1];
    ctx.font = '600 34px "Segoe UI", "Poppins", sans-serif';
    ctx.fillText('expect vibes like…', card.x + 40, cursorY);
    ctx.fillStyle = '#475569';
    ctx.font = '400 30px "Segoe UI", "Poppins", sans-serif';
    const descLines = wrapText(ctx, description, card.width - 80);
    cursorY += 46;
    descLines.slice(0, 5).forEach((line) => {
      ctx.fillText(`✦ ${line}`, card.x + 40, cursorY);
      cursorY += 38;
    });
  }

  ctx.fillStyle = `rgba(15,23,42,0.75)`;
  ctx.font = '600 32px "Segoe UI", "Poppins", sans-serif';
  ctx.fillText('hosted by your Collage Event fam ✨', card.x + 40, card.y + card.height - 50);

  const filename = `poster_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.png`;
  const filePath = path.join(POSTER_DIR, filename);
  fs.writeFileSync(filePath, canvas.toBuffer('image/png'));

  return {
    filePath,
    publicPath: `/uploads/posters/${filename}`,
    meta: { theme, mode, title },
  };
}

module.exports = {
  POSTER_THEMES,
  generatePosterImage,
};


