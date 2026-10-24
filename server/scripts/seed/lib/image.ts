import sharp from 'sharp';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';

const OUT_DIR = path.join(__dirname, '../out');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

export interface GeneratedImage {
  filePath: string;
  fileUrl:  string;
  fileHash: string;
}

function buildSvg(
  docType: string,
  regNumber: string,
  ownerName: string,
  issueDate: string,
  expiryDate: string
): string {
  const title = `${docType.toUpperCase()} CERTIFICATE`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400">
  <rect width="600" height="400" fill="#f8f8f8"/>
  <rect x="0" y="0" width="600" height="55" fill="#003366"/>
  <text x="300" y="28" font-family="sans-serif" font-size="18" font-weight="bold" fill="white" text-anchor="middle">GOVERNMENT OF INDIA</text>
  <text x="300" y="48" font-family="sans-serif" font-size="13" fill="#aaccff" text-anchor="middle">${title}</text>
  <rect x="10" y="65" width="580" height="320" fill="none" stroke="#003366" stroke-width="2"/>
  <text x="40" y="105" font-family="sans-serif" font-size="14" fill="#222">Reg. No. : ${regNumber}</text>
  <text x="40" y="135" font-family="sans-serif" font-size="14" fill="#222">Name     : ${ownerName}</text>
  <text x="40" y="165" font-family="sans-serif" font-size="14" fill="#222">Issue    : ${issueDate}</text>
  <text x="40" y="195" font-family="sans-serif" font-size="14" fill="#222">Expiry   : ${expiryDate}</text>
  <text x="40" y="225" font-family="sans-serif" font-size="12" fill="#666">Type     : ${docType.toUpperCase()}</text>
  <text x="40" y="250" font-family="sans-serif" font-size="12" fill="#666">Authority: Transport Department (DEMO ONLY)</text>
  <circle cx="480" cy="295" r="55" fill="none" stroke="#003366" stroke-width="1.5" stroke-dasharray="4,3"/>
  <text x="480" y="288" font-family="sans-serif" font-size="10" fill="#003366" text-anchor="middle">OFFICIAL</text>
  <text x="480" y="302" font-family="sans-serif" font-size="10" fill="#003366" text-anchor="middle">STAMP</text>
  <text x="480" y="316" font-family="sans-serif" font-size="10" fill="#cc0000" text-anchor="middle">(DEMO)</text>
  <!-- Diagonal watermark -->
  <g transform="rotate(-30 300 200)">
    <text x="300" y="220" font-family="sans-serif" font-size="32" font-weight="bold"
          fill="rgba(200,0,0,0.22)" text-anchor="middle">SAMPLE</text>
    <text x="300" y="258" font-family="sans-serif" font-size="14" font-weight="bold"
          fill="rgba(200,0,0,0.22)" text-anchor="middle">NOT A REAL DOCUMENT</text>
  </g>
</svg>`;
}

export async function generateSampleDocument(
  docType: string,
  regNumber: string,
  ownerName: string,
  issueDate: Date,
  expiryDate: Date
): Promise<GeneratedImage> {
  const svg = buildSvg(
    docType,
    regNumber,
    ownerName,
    issueDate.toISOString().slice(0, 10),
    expiryDate.toISOString().slice(0, 10)
  );

  const filename = `sample_${docType}_${regNumber.replace(/[^A-Z0-9]/gi, '')}_${Date.now()}.png`;
  const filePath = path.join(OUT_DIR, filename);

  let buffer: Buffer;
  try {
    buffer = await sharp(Buffer.from(svg)).png().toBuffer();
  } catch {
    // SVG renderer unavailable — create a plain placeholder PNG
    buffer = await sharp({
      create: { width: 600, height: 400, channels: 3, background: { r: 220, g: 230, b: 245 } }
    }).png().toBuffer();
  }

  fs.writeFileSync(filePath, buffer);
  const fileHash = crypto.createHash('sha256').update(buffer).digest('hex');
  const fileUrl  = `/seed-samples/${filename}`;

  return { filePath, fileUrl, fileHash };
}
