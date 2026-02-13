import { outputFileName } from './format-utils.js';

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

export function parseLrtemplate(text) {
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

export function serializeLrtemplate(settings, title = 'Converted Preset') {
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

export function parseXmp(xml) {
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

export function serializeXmp(settings, title = 'Converted Preset') {
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
    const xmp = extractXmpFromDng(buffer);
    return parseXmp(xmp);
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

export function convertPreset({ sourceBuffer, sourceName, sourceFormat, outputFormat }) {
  const settings = parseByFormat(sourceFormat, sourceBuffer);
  const { data, mimeType } = serializeByFormat(
    outputFormat,
    settings,
    sourceFormat,
    sourceBuffer,
    sourceName
  );

  return {
    data,
    mimeType,
    outputName: outputFileName(sourceName, outputFormat),
    settingsCount: Object.keys(settings).length
  };
}
