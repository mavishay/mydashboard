// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { EmailPreviewModal } from '../../src/components/EmailPreviewModal';

const mockGmail = {
  getEmailDetail: vi.fn(),
  listAccounts: vi.fn(),
};

const mockShell = {
  openExternal: vi.fn(),
};

function setupDefaults() {
  mockGmail.getEmailDetail.mockResolvedValue({
    id: 'e1',
    accountId: 'a1',
    externalId: 'ext1',
    subject: 'Test Email Subject',
    fromAddress: 'sender@example.com',
    receivedAt: '2026-01-01T00:00:00Z',
    bodyHtml: '<html><body><h1>Hello</h1><p>Test content</p></body></html>',
    snippet: 'Test snippet',
    attachments: [],
  });
  mockGmail.listAccounts.mockResolvedValue([
    { id: 'a1', email: 'user@gmail.com', displayName: 'User', color: '#1976d2' },
  ]);
}

beforeEach(() => {
  vi.clearAllMocks();
  setupDefaults();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).window = {
    electronAPI: {
      gmail: mockGmail,
      shell: mockShell,
    },
  };
});

describe('EmailPreviewModal', () => {
  it('renders email detail after loading', async () => {
    await act(async () => {
      render(
        <EmailPreviewModal
          emailId="e1"
          accountId="a1"
          onClose={() => {}}
        />
      );
    });

    expect(screen.queryByText('Test Email Subject')).toBeTruthy();
    expect(screen.queryByText('sender')).toBeTruthy();
    expect(screen.queryByText(/<sender@example\.com>/)).toBeTruthy();
    expect(screen.queryByText('Close')).toBeTruthy();
  });

  it('shows account badge with color', async () => {
    await act(async () => {
      render(
        <EmailPreviewModal
          emailId="e1"
          accountId="a1"
          onClose={() => {}}
        />
      );
    });

    const badge = screen.queryByText('user@gmail.com');
    expect(badge).toBeTruthy();
    expect(badge?.closest('span')).toHaveStyle({ color: '#1976d2' });
  });

  it('opens Gmail in external browser', async () => {
    await act(async () => {
      render(
        <EmailPreviewModal
          emailId="e1"
          accountId="a1"
          onClose={() => {}}
        />
      );
    });

    const openButton = screen.queryByText('Open in Gmail');
    expect(openButton).toBeTruthy();

    await act(async () => {
      fireEvent.click(openButton!);
    });

    expect(mockShell.openExternal).toHaveBeenCalledWith(
      'https://mail.google.com/mail/u/0/#inbox/ext1'
    );
  });

  it('closes on Escape key', async () => {
    const onClose = vi.fn();
    await act(async () => {
      render(
        <EmailPreviewModal
          emailId="e1"
          accountId="a1"
          onClose={onClose}
        />
      );
    });

    await act(async () => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });

    expect(onClose).toHaveBeenCalled();
  });

  it('closes on close button click', async () => {
    const onClose = vi.fn();
    await act(async () => {
      render(
        <EmailPreviewModal
          emailId="e1"
          accountId="a1"
          onClose={onClose}
        />
      );
    });

    const closeButton = screen.queryByText('×');
    expect(closeButton).toBeTruthy();

    await act(async () => {
      fireEvent.click(closeButton!);
    });

    expect(onClose).toHaveBeenCalled();
  });

  it('closes on backdrop click', async () => {
    const onClose = vi.fn();
    await act(async () => {
      render(
        <EmailPreviewModal
          emailId="e1"
          accountId="a1"
          onClose={onClose}
        />
      );
    });

    const backdrop = document.querySelector('[style*="position: fixed"]');
    expect(backdrop).toBeTruthy();

    await act(async () => {
      fireEvent.click(backdrop!);
    });

    expect(onClose).toHaveBeenCalled();
  });

  it('renders HTML body in sandboxed iframe', async () => {
    await act(async () => {
      render(
        <EmailPreviewModal
          emailId="e1"
          accountId="a1"
          onClose={() => {}}
        />
      );
    });

    const iframe = document.querySelector('iframe');
    expect(iframe).toBeTruthy();
    expect(iframe).toHaveAttribute('sandbox', '');
    expect(iframe).toHaveAttribute('srcdoc', '<html><body><h1>Hello</h1><p>Test content</p></body></html>');
  });

  it('shows error state on failure', async () => {
    mockGmail.getEmailDetail.mockRejectedValue(new Error('Network error'));

    await act(async () => {
      render(
        <EmailPreviewModal
          emailId="e1"
          accountId="a1"
          onClose={() => {}}
        />
      );
    });

    expect(screen.queryByText('Network error')).toBeTruthy();
  });

  it('works for emails from all connected accounts', async () => {
    mockGmail.listAccounts.mockResolvedValue([
      { id: 'a1', email: 'user1@gmail.com', displayName: 'User1', color: '#1976d2' },
      { id: 'a2', email: 'user2@gmail.com', displayName: 'User2', color: '#388e3c' },
    ]);

    await act(async () => {
      render(
        <EmailPreviewModal
          emailId="e1"
          accountId="a2"
          onClose={() => {}}
        />
      );
    });

    const badge = screen.queryByText('user2@gmail.com');
    expect(badge).toBeTruthy();
    expect(badge?.closest('span')).toHaveStyle({ color: '#388e3c' });
  });

  it('shows attachments when present', async () => {
    mockGmail.getEmailDetail.mockResolvedValue({
      id: 'e1',
      accountId: 'a1',
      externalId: 'ext1',
      subject: 'Test Email',
      fromAddress: 'sender@example.com',
      receivedAt: '2026-01-01T00:00:00Z',
      bodyHtml: null,
      snippet: 'Test snippet',
      attachments: [
        { filename: 'document.pdf', mimeType: 'application/pdf', size: 1024 },
        { filename: 'image.png', mimeType: 'image/png', size: 2048 },
      ],
    });

    await act(async () => {
      render(
        <EmailPreviewModal
          emailId="e1"
          accountId="a1"
          onClose={() => {}}
        />
      );
    });

    expect(screen.queryByText('Attachments (2)')).toBeTruthy();
    expect(screen.queryByText('document.pdf')).toBeTruthy();
    expect(screen.queryByText('image.png')).toBeTruthy();
  });
});
