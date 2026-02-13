import cors from 'cors';
import express from 'express';
import multer from 'multer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { convertPreset } from './lib/preset-converter.js';
import { detectFormat, isSupportedFormat } from './lib/format-utils.js';

const app = express();
const port = process.env.PORT || 8787;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const clientDistPath = path.resolve(__dirname, '../../client/dist');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 1
  }
});

app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'preset-converter-api' });
});

app.post('/api/convert', upload.single('file'), (req, res) => {
  try {
    const outputFormat = String(req.body.outputFormat || '').toLowerCase();
    if (!isSupportedFormat(outputFormat)) {
      return res.status(400).json({ error: 'Output format must be .lrtemplate, .xmp, or .dng.' });
    }

    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: 'No file uploaded.' });
    }

    const sourceFormat = detectFormat(file.originalname, file.buffer);
    if (!isSupportedFormat(sourceFormat)) {
      return res.status(400).json({ error: `Unsupported input file: ${file.originalname}` });
    }

    const converted = convertPreset({
      sourceBuffer: file.buffer,
      sourceName: file.originalname,
      sourceFormat,
      outputFormat
    });

    res.setHeader('Content-Type', converted.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${converted.outputName}"`);
    res.setHeader('X-Detected-Format', sourceFormat);
    res.setHeader('X-Output-Filename', converted.outputName);
    res.setHeader('X-Settings-Count', String(converted.settingsCount));

    return res.send(converted.data);
  } catch (error) {
    return res.status(400).json({ error: error.message || 'Conversion failed.' });
  }
});

app.use(express.static(clientDistPath));

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) {
    return next();
  }
  return res.sendFile(path.join(clientDistPath, 'index.html'));
});

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Preset converter API listening on http://localhost:${port}`);
});
