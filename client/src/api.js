const SUPPORTED_FORMATS = new Set(['lrtemplate', 'xmp', 'dng']);

function extensionFromName(fileName) {
  const parts = fileName.toLowerCase().split('.');
  if (parts.length < 2) return '';
  return parts.at(-1);
}

export function detectFormat(file) {
  const ext = extensionFromName(file.name);
  return SUPPORTED_FORMATS.has(ext) ? ext : 'unsupported';
}

export async function convertFile(file, outputFormat) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('outputFormat', outputFormat);

  const response = await fetch('/api/convert', {
    method: 'POST',
    body: formData
  });

  if (!response.ok) {
    let message = 'Conversion failed.';
    try {
      const error = await response.json();
      message = error.error || message;
    } catch {
      // Keep default message
    }
    throw new Error(message);
  }

  const blob = await response.blob();
  const outputFileName = response.headers.get('x-output-filename') || `${file.name}.${outputFormat}`;
  const detectedFormat = response.headers.get('x-detected-format') || '';

  return {
    blob,
    outputFileName,
    detectedFormat
  };
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
