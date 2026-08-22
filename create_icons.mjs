import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

function crc32(buf) {
  let table = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      if (c & 1) {
        c = 0xedb88320 ^ (c >>> 1);
      } else {
        c = c >>> 1;
      }
    }
    table[n] = c >>> 0;
  }

  let crc = 0 ^ -1;
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
  }
  return (crc ^ -1) >>> 0;
}

function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);

  const typeBuf = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeBuf, data]);

  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);

  return Buffer.concat([len, body, crc]);
}

function createPng(width, height, drawPixel) {
  // PNG signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(8, 8); // bit depth 8
  ihdr.writeUInt8(6, 9); // color type 6: RGBA
  ihdr.writeUInt8(0, 10); // compression
  ihdr.writeUInt8(0, 11); // filter
  ihdr.writeUInt8(0, 12); // interlace
  const ihdrChunk = makeChunk('IHDR', ihdr);

  // Scanlines (RGBA)
  const rawData = Buffer.alloc(height * (1 + width * 4));
  let offset = 0;

  for (let y = 0; y < height; y++) {
    rawData[offset++] = 0; // Filter type 0 (None)
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = drawPixel(x, y, width, height);
      rawData[offset++] = r;
      rawData[offset++] = g;
      rawData[offset++] = b;
      rawData[offset++] = a;
    }
  }

  const compressedData = zlib.deflateSync(rawData);
  const idatChunk = makeChunk('IDAT', compressedData);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function drawWhatsAppForwardIcon(x, y, width, height) {
  // Normalize coordinates 0 to 1
  const nx = x / width;
  const ny = y / height;

  // Background rounded rectangle (Emerald WhatsApp Green)
  const cx = 0.5, cy = 0.5;
  const dx = Math.abs(nx - cx);
  const dy = Math.abs(ny - cy);
  const distSq = dx * dx + dy * dy;

  // Circle/Rounded container mask
  if (distSq > 0.22) {
    return [0, 0, 0, 0]; // Transparent outside
  }

  // Emerald green gradient background (#00a884 to #128c7e)
  const bgR = Math.round(0 + (18 - 0) * ny);
  const bgG = Math.round(168 + (140 - 168) * ny);
  const bgB = Math.round(132 + (126 - 132) * ny);

  // Forward arrow geometry inside the badge
  // Arrow pointing right
  const inArrowHead = (nx >= 0.55 && nx <= 0.82 && Math.abs(ny - 0.45) <= (0.82 - nx) * 1.1);
  const inArrowStem = (nx >= 0.25 && nx <= 0.65 && ny >= 0.38 && ny <= 0.52);
  const inArrowCurve = (nx >= 0.22 && nx <= 0.45 && ny >= 0.48 && ny <= 0.72 && Math.hypot(nx - 0.45, ny - 0.48) <= 0.22 && Math.hypot(nx - 0.45, ny - 0.48) >= 0.10);

  if (inArrowHead || inArrowStem || inArrowCurve) {
    return [255, 255, 255, 255]; // Crisp white arrow
  }

  return [bgR, bgG, bgB, 255];
}

const iconsDir = path.join(process.cwd(), 'icons');
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

[16, 48, 128].forEach((size) => {
  const png = createPng(size, size, drawWhatsAppForwardIcon);
  fs.writeFileSync(path.join(iconsDir, `icon${size}.png`), png);
  console.log(`Generated icon${size}.png (${size}x${size})`);
});
