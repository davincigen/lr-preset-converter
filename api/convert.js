const path = require('node:path');
const Busboy = require('busboy');

const SUPPORTED_FORMATS = new Set(['lrtemplate', 'xmp', 'dng']);
const MAX_FILE_SIZE = 10 * 1024 * 1024;

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
}

function safeBaseName(fileName) {
  const cleaned = path.basename(fileName).replace(/[^a-zA-Z0-9._-]/g, '_');
  return cleaned || 'preset';
}

function outputFileName(inputName, outputFormat) {
  const name = safeBaseName(inputName);
  const base = name.includes('.') ? name.slice(0, name.lastIndexOf('.')) : name;
  return `${base}.${outputFormat}`;
}

function detectFormat(fileName, buffer) {
  const ext = path.extname(fileName || '').toLowerCase().replace('.', '');
  if (SUPPORTED_FORMATS.has(ext)) {
    return ext;
  }

  const text = buffer?.toString('utf8', 0, Math.min(buffer.length, 1500)) || '';
  if (/x:xmpmeta|<rdf:RDF|crs:/i.test(text)) {
    return 'xmp';
  }
  if (/\bProcessVersion\b|\bLrPreset\b|\btitle\s*=\s*"/i.test(text)) {
    return 'lrtemplate';
  }

  return 'unsupported';
}

function decodeValue(value) {
  const normalized = String(value).trim().replace(/,$/, '');
  if (normalized.startsWith('"') && normalized.endsWith('"')) {
    return normalized.slice(1, -1);
  }
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  const asNumber = Number(normalized);
  if (!Number.isNaN(asNumber) && normalized !== '') return asNumber;
  return normalized;
}

function encodeLrValue(value) {
  if (typeof value === 'number') {
    return Number.isInteger(value) ? `${value}` : value.toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return `"${String(value).replace(/"/g, '\\"')}"`;
}

function encodeXmpValue(value) {
  if (typeof value === 'boolean') return value ? 'True' : 'False';
  return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function parseLrtemplate(text) {
  const settings = {};
  const regex = /^\s*([A-Za-z0-9_]+)\s*=\s*(.+)$/gm;
  let match = regex.exec(text);
  while (match) {
    settings[match[1]] = decodeValue(match[2]);
    match = regex.exec(text);
  }
  if (!Object.keys(settings).length) {
    throw new Error('Preset settings could not be read from .lrtemplate file.');
  }
  return settings;
}

function serializeLrtemplate(settings, title = 'Converted Preset') {
  const lines = [
    's = {',
    `  id = "${Math.floor(Date.now() / 1000)}",`,
    `  internalName = "${title}",`,
    `  title = "${title}",`,
    '  type = "Develop",'
  ];

  Object.entries(settings).forEach(([key, value]) => {
    if (['id', 'internalName', 'title', 'type'].includes(key)) return;
    lines.push(`  ${key} = ${encodeLrValue(value)},`);
  });

  lines.push('}');
  return `${lines.join('\n')}\n`;
}

function parseXmp(xml) {
  const settings = {};
  const attrRegex = /\bcrs:([A-Za-z0-9_]+)="([^"]*)"/g;
  let match = attrRegex.exec(xml);
  while (match) {
    settings[match[1]] = decodeValue(match[2]);
    match = attrRegex.exec(xml);
  }

  if (!Object.keys(settings).length) {
    throw new Error('No Camera Raw settings found in .xmp data.');
  }
  return settings;
}

function serializeXmp(settings, title = 'Converted Preset') {
  const attrs = Object.entries(settings)
    .map(([key, value]) => `crs:${key}="${encodeXmpValue(value)}"`)
    .join('\n      ');

  return `<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description
      xmlns:crs="http://ns.adobe.com/camera-raw-settings/1.0/"
      crs:Name="${encodeXmpValue(title)}"
      ${attrs} />
  </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>
`;
}

function extractXmpFromDng(buffer) {
  const text = buffer.toString('utf8');
  const start = text.indexOf('<x:xmpmeta');
  const end = text.indexOf('</x:xmpmeta>');
  if (start === -1 || end === -1) {
    throw new Error('No embedded XMP metadata was found in this .dng file.');
  }
  return text.slice(start, end + '</x:xmpmeta>'.length);
}

function parseByFormat(format, buffer) {
  if (format === 'lrtemplate') {
    return parseLrtemplate(buffer.toString('utf8'));
  }
  if (format === 'xmp') {
    return parseXmp(buffer.toString('utf8'));
  }
  if (format === 'dng') {
    return parseXmp(extractXmpFromDng(buffer));
  }
  throw new Error('Unsupported input format.');
}

function serializeByFormat(outputFormat, settings, sourceFormat, sourceBuffer, sourceName) {
  if (outputFormat === 'lrtemplate') {
    return {
      data: Buffer.from(serializeLrtemplate(settings, sourceName), 'utf8'),
      mimeType: 'text/plain'
    };
  }

  if (outputFormat === 'xmp') {
    return {
      data: Buffer.from(serializeXmp(settings, sourceName), 'utf8'),
      mimeType: 'application/rdf+xml'
    };
  }

  if (outputFormat === 'dng') {
    if (sourceFormat !== 'dng') {
      throw new Error('Converting into .dng requires a .dng source file in this version.');
    }
    return {
      data: sourceBuffer,
      mimeType: 'image/x-adobe-dng'
    };
  }

  throw new Error('Unsupported output format.');
}

function convertPreset({ sourceBuffer, sourceName, sourceFormat, outputFormat }) {
  const settings = parseByFormat(sourceFormat, sourceBuffer);
  const { data, mimeType } = serializeByFormat(outputFormat, settings, sourceFormat, sourceBuffer, sourceName);
  return {
    data,
    mimeType,
    outputName: outputFileName(sourceName, outputFormat),
    settingsCount: Object.keys(settings).length
  };
}

function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const bb = Busboy({
      headers: req.headers,
      limits: { files: 1, fileSize: MAX_FILE_SIZE }
    });

    let outputFormat = '';
    let fileName = '';
    let fileBuffer = null;
    let tooLarge = false;

    bb.on('field', (fieldName, value) => {
      if (fieldName === 'outputFormat') {
        outputFormat = String(value || '').toLowerCase();
      }
    });

    bb.on('file', (fieldName, file, info) => {
      if (fieldName !== 'file') {
        file.resume();
        return;
      }

      fileName = info?.filename || 'preset';
      const chunks = [];

      file.on('data', (chunk) => chunks.push(chunk));
      file.on('limit', () => {
        tooLarge = true;
      });
      file.on('end', () => {
        fileBuffer = Buffer.concat(chunks);
      });
    });

    bb.on('error', reject);

    bb.on('finish', () => {
      if (tooLarge) {
        reject(new Error('File too large. Maximum is 10MB.'));
        return;
      }

      if (!fileBuffer) {
        reject(new Error('No file uploaded.'));
        return;
      }

      resolve({ outputFormat, fileName, fileBuffer });
    });

    req.pipe(bb);
  });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed.' });
    return;
  }

  try {
    const contentType = req.headers['content-type'] || '';
    if (!contentType.toLowerCase().includes('multipart/form-data')) {
      sendJson(res, 400, { error: 'Expected multipart/form-data request.' });
      return;
    }

    const { outputFormat, fileName, fileBuffer } = await parseMultipart(req);

    if (!SUPPORTED_FORMATS.has(outputFormat)) {
      sendJson(res, 400, { error: 'Output format must be .lrtemplate, .xmp, or .dng.' });
      return;
    }

    const sourceFormat = detectFormat(fileName, fileBuffer);
    if (!SUPPORTED_FORMATS.has(sourceFormat)) {
      sendJson(res, 400, { error: `Unsupported input file: ${fileName}` });
      return;
    }

    const converted = convertPreset({
      sourceBuffer: fileBuffer,
      sourceName: fileName,
      sourceFormat,
      outputFormat
    });

    res.statusCode = 200;
    res.setHeader('Content-Type', converted.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${converted.outputName}"`);
    res.setHeader('X-Detected-Format', sourceFormat);
    res.setHeader('X-Output-Filename', converted.outputName);
    res.setHeader('X-Settings-Count', String(converted.settingsCount));
    res.end(converted.data);
  } catch (error) {
    sendJson(res, 400, { error: error.message || 'Conversion failed.' });
  }
};
