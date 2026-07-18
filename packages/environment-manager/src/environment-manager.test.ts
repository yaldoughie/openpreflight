import { describe, expect, it } from 'vitest';
import { createProxyConfig } from './index.js';

describe('network policy generation', () => {
  it('denies all external traffic offline', () => {
    const config = createProxyConfig('offline', ['example.com']);
    expect(config).not.toContain('http_access allow internal approved');
    expect(config).toContain('http_access deny metadata');
  });
  it('allows only validated restricted hosts', () => {
    const config = createProxyConfig('restricted', ['updates.example.com']);
    expect(config).toContain('.api.wordpress.org');
    expect(config).toContain('.updates.example.com');
    expect(() => createProxyConfig('custom', ['127.0.0.1'])).toThrow(/Unsafe/);
  });
});
