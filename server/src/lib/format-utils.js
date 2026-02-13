import path from 'node:path';

const SUPPORTED_FORMATS = new Set(['lrtemplate', 'xmp', 'dng']);

export function safeBaseName(fileName) {
  const cleaned = path.basename(fileName).replace(/[^a-zA-Z0-9._-]/g, '_');
  return cleaned || 'preset';
}

export function getExtension(fileName) {
  const ext = path.extname(fileName || '').toLowerCase().replace('.', '');
  return ext;
}

export function detectFormat(fileName, buffer) {
  const ext = getExtension(fileName);
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

export function isSupportedFormat(format) {
  return SUPPORTED_FORMATS.has(format);
}

export function outputFileName(inputName, outputFormat) {
  const name = safeBaseName(inputName);
  const base = name.includes('.') ? name.slice(0, name.lastIndexOf('.')) : name;
  return `${base}.${outputFormat}`;
}
