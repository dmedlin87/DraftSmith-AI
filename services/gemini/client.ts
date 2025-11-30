/**
 * Gemini API Client
 * 
 * Centralized AI client initialization with security validation.
 * 
 * SECURITY NOTE: API key is injected at build time via Vite.
 * For production, consider implementing a server-side proxy.
 */

import { GoogleGenAI } from "@google/genai";
import { getApiKey, validateApiKey } from '../../config/api';

// Initialize with environment key
const apiKey = getApiKey();

// Validate on initialization - log but DO NOT throw, so the UI can still load
const validationError = validateApiKey(apiKey);
if (validationError) {
  // Log for debugging context
  console.warn(`[Quill AI API] ${validationError}`);
  // We intentionally do not throw here so that the application can render
  // even when the Gemini API key is missing. Calls to the client will fail
  // at request-time instead of crashing the entire app at import-time.
}

/**
 * Primary Gemini AI client instance.
 * Shared across all service modules.
 */
export const ai = new GoogleGenAI({ apiKey });

/**
 * Check if the API is properly configured.
 */
export function isApiConfigured(): boolean {
  return !validateApiKey(apiKey);
}

/**
 * Get API configuration status for UI display.
 */
export function getApiStatus(): { configured: boolean; error?: string } {
  const error = validateApiKey(apiKey);
  return {
    configured: !error,
    error: error ?? undefined,
  };
}