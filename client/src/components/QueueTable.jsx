function statusClass(status) {
  if (status === 'success') return 'status success';
  if (status === 'error') return 'status error';
  if (status === 'processing') return 'status processing';
  return 'status queued';
}

export default function QueueTable({ items, onDownload }) {
  if (!items.length) {
    return null;
  }

  return (
    <section className="card">
      <h3>Conversion Queue</h3>
      <div className="queue-header">
        <span>Name</span>
        <span>Detected</span>
        <span>Status</span>
        <span>Action</span>
      </div>
      {items.map((item) => (
        <div className="queue-row" key={item.id}>
          <span className="filename" title={item.file.name}>{item.file.name}</span>
          <span>{item.detectedFormat || 'unknown'}</span>
          <span className={statusClass(item.status)}>{item.status}</span>
          <span>
            {item.status === 'success' ? (
              <button className="secondary-btn" onClick={() => onDownload(item.id)}>
                Download
              </button>
            ) : item.error ? (
              <small className="error-text">{item.error}</small>
            ) : (
              '-'
            )}
          </span>
        </div>
      ))}
    </section>
  );
}
