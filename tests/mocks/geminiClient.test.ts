import { describe, it, expect } from 'vitest';
import {
  createMockChat,
  createMockGenerateContent,
  mockAi,
  resetGeminiMocks,
  chaosResponses,
  createRateLimitError,
  createContextLengthError,
} from '@/tests/mocks/geminiClient';

describe('geminiClient mocks', () => {
  afterEach(() => {
    resetGeminiMocks();
  });

  it('validates chat message payloads', async () => {
    const chat = createMockChat(chaosResponses.emptyText);
    await expect(chat.sendMessage({ message: 'hello' })).resolves.toEqual(chaosResponses.emptyText);
    await expect(chat.sendMessage({ message: ['hi'] })).resolves.toEqual(chaosResponses.emptyText);
    // @ts-expect-error invalid payload to exercise error branch
    await expect(chat.sendMessage({ notMessage: true })).rejects.toBeInstanceOf(Error);
  });

  it('creates generateContent mocks with expected response', async () => {
    const fn = createMockGenerateContent(chaosResponses.malformedJson);
    expect(await fn({ model: 'x', contents: 'y' } as any)).toEqual(chaosResponses.malformedJson);
  });

  it('exposes reusable errors and clears spies', () => {
    const rateError = createRateLimitError();
    const contextError = createContextLengthError();

    expect(rateError.status).toBe(429);
    expect(contextError.status).toBe(413);

    mockAi.models.generateContent('test' as any);
    mockAi.chats.create({ model: 'a', config: {} } as any);
    resetGeminiMocks();
    expect(mockAi.models.generateContent).not.toHaveBeenCalled();
  });
});
