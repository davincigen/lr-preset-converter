import { useMemo, useState } from 'react';
import JSZip from 'jszip';
import Dropzone from './components/Dropzone';
import QueueTable from './components/QueueTable';
import Tips from './components/Tips';
import { convertFile, detectFormat, downloadBlob } from './api';

const OUTPUT_OPTIONS = ['lrtemplate', 'xmp', 'dng'];

function makeQueueItem(file) {
  const detectedFormat = detectFormat(file);
  return {
    id: crypto.randomUUID(),
    file,
    detectedFormat,
    status: detectedFormat === 'unsupported' ? 'error' : 'queued',
    error: detectedFormat === 'unsupported' ? 'Unsupported file format' : '',
    result: null
  };
}

export default function App() {
  const [queue, setQueue] = useState([]);
  const [outputFormat, setOutputFormat] = useState('xmp');
  const [isConverting, setIsConverting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [globalError, setGlobalError] = useState('');

  const successCount = useMemo(
    () => queue.filter((item) => item.status === 'success').length,
    [queue]
  );

  const queuedCount = useMemo(
    () => queue.filter((item) => item.status === 'queued').length,
    [queue]
  );

  const onAddFiles = (files) => {
    const newItems = files.map(makeQueueItem);
    setQueue((current) => [...current, ...newItems]);
  };

  const runConversion = async () => {
    const eligible = queue.filter((item) => item.status === 'queued');
    if (!eligible.length) {
      setGlobalError('No valid queued files to convert.');
      return;
    }

    setGlobalError('');
    setIsConverting(true);
    setProgress(0);

    for (let i = 0; i < eligible.length; i += 1) {
      const item = eligible[i];
      setQueue((current) => current.map((q) => (q.id === item.id ? { ...q, status: 'processing' } : q)));

      try {
        const result = await convertFile(item.file, outputFormat);
        setQueue((current) =>
          current.map((q) =>
            q.id === item.id
              ? {
                  ...q,
                  detectedFormat: q.detectedFormat === 'unsupported' ? result.detectedFormat : q.detectedFormat,
                  status: 'success',
                  result
                }
              : q
          )
        );
      } catch (error) {
        setQueue((current) =>
          current.map((q) =>
            q.id === item.id
              ? {
                  ...q,
                  status: 'error',
                  error: error.message
                }
              : q
          )
        );
      }

      setProgress(Math.round(((i + 1) / eligible.length) * 100));
    }

    setIsConverting(false);
  };

  const resetQueue = () => {
    setQueue([]);
    setProgress(0);
    setGlobalError('');
  };

  const clearConverted = () => {
    setQueue((current) => current.filter((item) => item.status !== 'success'));
  };

  const downloadItem = (itemId) => {
    const item = queue.find((q) => q.id === itemId);
    if (!item?.result) return;
    downloadBlob(item.result.blob, item.result.outputFileName);
  };

  const downloadAll = async () => {
    const successful = queue.filter((item) => item.status === 'success' && item.result);
    if (!successful.length) return;

    if (successful.length === 1) {
      downloadBlob(successful[0].result.blob, successful[0].result.outputFileName);
      return;
    }

    const zip = new JSZip();
    successful.forEach((item) => {
      zip.file(item.result.outputFileName, item.result.blob);
    });

    const zipBlob = await zip.generateAsync({ type: 'blob' });
    downloadBlob(zipBlob, `converted-presets-${Date.now()}.zip`);
  };

  const downloadBatchZip = async () => {
    const successful = queue.filter((item) => item.status === 'success' && item.result);
    if (!successful.length) return;

    const zip = new JSZip();
    successful.forEach((item) => {
      zip.file(item.result.outputFileName, item.result.blob);
    });

    const zipBlob = await zip.generateAsync({ type: 'blob' });
    downloadBlob(zipBlob, `converted-presets-${Date.now()}.zip`);
  };

  return (
    <main className="app-shell">
      <section className="hero card">
        <h1>Lightroom Preset Converter</h1>
        <p>Convert `.lrtemplate`, `.xmp`, and `.dng` presets in a clean, fast workflow.</p>

        <Dropzone onFiles={onAddFiles} />

        <div className="controls">
          <label htmlFor="output">Output format</label>
          <select
            id="output"
            value={outputFormat}
            onChange={(event) => setOutputFormat(event.target.value)}
            disabled={isConverting}
          >
            {OUTPUT_OPTIONS.map((format) => (
              <option value={format} key={format}>
                {format.toUpperCase()}
              </option>
            ))}
          </select>
          <button className="primary-btn" onClick={runConversion} disabled={isConverting || queuedCount === 0}>
            {isConverting ? 'Converting...' : 'Convert Queue'}
          </button>
          <button className="secondary-btn" onClick={downloadAll} disabled={successCount === 0 || isConverting}>
            Download Converted
          </button>
          <button className="secondary-btn" onClick={downloadBatchZip} disabled={successCount === 0 || isConverting}>
            Batch Download ZIP
          </button>
          <button className="ghost-btn" onClick={clearConverted} disabled={isConverting || successCount === 0}>
            Clear Converted
          </button>
          <button className="ghost-btn" onClick={resetQueue} disabled={isConverting || queue.length === 0}>
            Clear
          </button>
        </div>

        <div className="progress-wrap" aria-live="polite">
          <div className="progress-label">
            <span>Progress</span>
            <span>{progress}%</span>
          </div>
          <div className="progress-track">
            <div className="progress-bar" style={{ width: `${progress}%` }} />
          </div>
        </div>

        {globalError ? <p className="error-banner">{globalError}</p> : null}
      </section>

      <QueueTable items={queue} onDownload={downloadItem} />
      <Tips />
    </main>
  );
}
