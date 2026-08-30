import { useState, useEffect, useCallback } from 'react';
import type { EmailDetail, EmailAttachment } from '../../electron/preload/types';

interface Account {
  id: string;
  email: string;
  displayName: string;
  color: string | null;
}

interface EmailPreviewModalProps {
  emailId: string;
  accountId: string;
  onClose: () => void;
}

function extractDisplayName(from: string | null): string {
  if (!from) return 'Unknown';
  const match = from.match(/^"?([^"<]+)"?\s*</);
  return match ? match[1].trim() : from.split('@')[0];
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleString();
}

export function EmailPreviewModal({ emailId, accountId, onClose }: EmailPreviewModalProps) {
  const [detail, setDetail] = useState<EmailDetail | null>(null);
  const [account, setAccount] = useState<Account | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [emailDetail, accounts] = await Promise.all([
        window.electronAPI.gmail.getEmailDetail(emailId),
        window.electronAPI.gmail.listAccounts(),
      ]);

      setDetail(emailDetail);
      const matchedAccount = accounts.find((a) => a.id === accountId) ?? null;
      setAccount(matchedAccount);
    } catch (err) {
      console.error('Failed to load email detail:', err);
      setError(err instanceof Error ? err.message : 'Failed to load email');
    } finally {
      setLoading(false);
    }
  }, [emailId, accountId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleOpenInGmail = async () => {
    if (!detail) return;
    const url = `https://mail.google.com/mail/u/${detail.accountIndex}/#inbox/${detail.externalId}`;
    try {
      await window.electronAPI.shell.openExternal(url);
    } catch (err) {
      console.error('Failed to open Gmail:', err);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: '8px',
          padding: '1.5rem',
          maxWidth: '720px',
          width: '90%',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 4px 24px rgba(0, 0, 0, 0.15)',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 600, wordBreak: 'break-word' }}>
              {loading ? 'Loading...' : (detail?.subject || '(no subject)')}
            </h2>
            {account && (
              <span
                style={{
                  display: 'inline-block',
                  marginTop: '0.375rem',
                  padding: '0.125rem 0.5rem',
                  borderRadius: '12px',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  background: account.color ? `${account.color}20` : '#e3f2fd',
                  color: account.color ?? '#1976d2',
                }}
              >
                {account.email}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '1.25rem',
              cursor: 'pointer',
              color: '#6b7280',
              padding: '0.25rem',
              flexShrink: 0,
            }}
          >
            &times;
          </button>
        </div>

        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '3rem', color: '#6b7280' }}>
            <span style={{ marginRight: '0.5rem' }}>&#8987;</span>
            Loading email...
          </div>
        ) : error ? (
          <div style={{
            padding: '1rem',
            borderRadius: '8px',
            background: '#ffebee',
            color: '#c62828',
            fontSize: '0.875rem',
          }}>
            {error}
          </div>
        ) : detail ? (
          <>
            <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.75rem' }}>
              <div>
                <span style={{ fontWeight: 500 }}>From: </span>
                {detail.fromAddress ? extractDisplayName(detail.fromAddress) : 'Unknown'}
                {detail.fromAddress && (
                  <span style={{ color: '#9ca3af' }}> &lt;{detail.fromAddress.match(/<([^>]+)>/)?.[1] ?? detail.fromAddress}&gt;</span>
                )}
              </div>
              {detail.receivedAt && (
                <div style={{ marginTop: '0.25rem' }}>
                  <span style={{ fontWeight: 500 }}>Date: </span>
                  {formatDate(detail.receivedAt)}
                </div>
              )}
            </div>

            {detail.attachments.length > 0 && (
              <div style={{ marginBottom: '0.75rem' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 500, color: '#6b7280', marginBottom: '0.25rem' }}>
                  Attachments ({detail.attachments.length})
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  {detail.attachments.map((att, i) => (
                    <div
                      key={i}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        padding: '0.375rem 0.5rem',
                        borderRadius: '4px',
                        background: '#f9fafb',
                        border: '1px solid #e5e7eb',
                        fontSize: '0.8125rem',
                      }}
                    >
                      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {att.filename}
                      </span>
                      <span style={{ color: '#9ca3af', fontSize: '0.75rem', flexShrink: 0 }}>
                        {formatFileSize(att.size)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div
              style={{
                flex: 1,
                minHeight: 0,
                border: '1px solid #e5e7eb',
                borderRadius: '4px',
                overflow: 'hidden',
              }}
            >
              {detail.bodyHtml ? (
                <iframe
                  srcDoc={detail.bodyHtml}
                  sandbox=""
                  style={{ width: '100%', height: '100%', border: 'none' }}
                  title="Email body"
                />
              ) : (
                <div style={{ padding: '1rem', color: '#6b7280', fontSize: '0.875rem' }}>
                  {detail.snippet || 'No content available'}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem' }}>
              <button
                onClick={handleOpenInGmail}
                style={{
                  padding: '0.5rem 1rem',
                  borderRadius: '4px',
                  border: '1px solid #1976d2',
                  background: '#1976d2',
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                }}
              >
                Open in Gmail
              </button>
              <button
                onClick={onClose}
                style={{
                  padding: '0.5rem 1rem',
                  borderRadius: '4px',
                  border: '1px solid #d1d5db',
                  background: '#fff',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                }}
              >
                Close
              </button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
