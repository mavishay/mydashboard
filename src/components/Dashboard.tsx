export function Dashboard() {
  return (
    <div style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
      <h1>Unified Productivity Dashboard</h1>
      <p>Phase 1: App shell with SQLite storage</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1rem' }}>
        <div style={{ border: '1px solid #ccc', borderRadius: '8px', padding: '1rem' }}>
          <h2>Email</h2>
          <p>No accounts connected</p>
        </div>
        <div style={{ border: '1px solid #ccc', borderRadius: '8px', padding: '1rem' }}>
          <h2>Tasks</h2>
          <p>No tasks yet</p>
        </div>
      </div>
    </div>
  );
}
