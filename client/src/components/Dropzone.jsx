import { useRef } from 'react';

const SUPPORTED_EXTENSIONS = ['.lrtemplate', '.xmp', '.dng'];

export default function Dropzone({ onFiles }) {
  const inputRef = useRef(null);

  const readFiles = (fileList) => {
    const files = Array.from(fileList || []);
    if (files.length) {
      onFiles(files);
    }
  };

  const onDrop = (event) => {
    event.preventDefault();
    readFiles(event.dataTransfer.files);
  };

  return (
    <section
      className="dropzone"
      onDragOver={(event) => event.preventDefault()}
      onDrop={onDrop}
      role="button"
      tabIndex={0}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          inputRef.current?.click();
        }
      }}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden-input"
        accept={SUPPORTED_EXTENSIONS.join(',')}
        onChange={(event) => readFiles(event.target.files)}
      />
      <h2>Drop Lightroom preset files here</h2>
      <p>or click to browse ({SUPPORTED_EXTENSIONS.join(', ')})</p>
    </section>
  );
}
