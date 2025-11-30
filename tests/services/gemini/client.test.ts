/**
 * Tests for Gemini API client initialization
 * Covers client creation, API configuration checks, and validation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Use vi.hoisted to ensure mocks are available before any imports
const mockGetApiKey = vi.hoisted(() => vi.fn(() => 'test-api-key-12345'));
const mockValidateApiKey = vi.hoisted(() => vi.fn(() => null));
const mockGoogleGenAI = vi.hoisted(() => vi.fn().mockImplementation(() => ({
  models: { generateContent: vi.fn() },
  chats: { create: vi.fn() },
})));

// Mock the config module before importing client
vi.mock('@/config/api', () => ({
  getApiKey: mockGetApiKey,
  validateApiKey: mockValidateApiKey,
}));

// Mock GoogleGenAI to avoid actual API initialization
vi.mock('@google/genai', () => ({
  GoogleGenAI: mockGoogleGenAI,
}));

describe('Gemini Client - Valid Configuration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetApiKey.mockReturnValue('test-api-key-12345');
    mockValidateApiKey.mockReturnValue(null); // null = valid
  });

  it('isApiConfigured returns true when API key is valid', async () => {
    // Reset modules to re-run initialization with valid key
    vi.resetModules();
    
    const { isApiConfigured } = await import('@/services/gemini/client');
    expect(isApiConfigured()).toBe(true);
  });

  it('getApiStatus returns configured status when valid', async () => {
    vi.resetModules();
    
    const { getApiStatus } = await import('@/services/gemini/client');
    const status = getApiStatus();
    
    expect(status.configured).toBe(true);
    expect(status.error).toBeUndefined();
  });

  it('exports ai client instance', async () => {
    vi.resetModules();
    
    const { ai } = await import('@/services/gemini/client');
    
    expect(ai).toBeDefined();
    expect(mockGoogleGenAI).toHaveBeenCalledWith({ apiKey: 'test-api-key-12345' });
  });
});

describe('Gemini Client - Invalid Configuration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  afterEach(() => {
    // Reset to valid state for other tests
    mockGetApiKey.mockReturnValue('test-api-key-12345');
    mockValidateApiKey.mockReturnValue(null);
  });

  it('reports invalid configuration via status API when API key is missing', async () => {
    mockGetApiKey.mockReturnValue('');
    mockValidateApiKey.mockReturnValue('API key is required');

    const { isApiConfigured, getApiStatus } = await import('@/services/gemini/client');

    expect(isApiConfigured()).toBe(false);
    const status = getApiStatus();
    expect(status.configured).toBe(false);
    expect(status.error).toContain('API key is required');
  });

  it('reports invalid format error via status API', async () => {
    mockGetApiKey.mockReturnValue('bad-key');
    mockValidateApiKey.mockReturnValue('Invalid format');

    const { isApiConfigured, getApiStatus } = await import('@/services/gemini/client');

    expect(isApiConfigured()).toBe(false);
    const status = getApiStatus();
    expect(status.configured).toBe(false);
    expect(status.error).toContain('Invalid format');
  });

  it('logs warning to console when validation fails', async () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    mockGetApiKey.mockReturnValue('bad-key');
    mockValidateApiKey.mockReturnValue('Invalid format');

    await import('@/services/gemini/client');

    expect(consoleSpy).toHaveBeenCalledTimes(1);
    const logged = consoleSpy.mock.calls[0][0];
    expect(logged).toContain('[Quill AI API]');
    expect(logged).toContain('Invalid format');

    consoleSpy.mockRestore();
  });
});
