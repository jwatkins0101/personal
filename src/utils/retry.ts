// Retry utility for handling intermittent AppleScript failures

export interface RetryOptions {
  maxAttempts?: number;
  delayMs?: number;
  backoff?: boolean;
  onRetry?: (attempt: number, error: Error) => void;
}

const DEFAULT_OPTIONS: Required<Omit<RetryOptions, 'onRetry'>> = {
  maxAttempts: 3,
  delayMs: 1000,
  backoff: true,
};

/**
 * Sleep for a given number of milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry an async function with exponential backoff.
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      if (attempt === opts.maxAttempts) {
        break;
      }

      // Call onRetry callback if provided
      if (opts.onRetry) {
        opts.onRetry(attempt, lastError);
      }

      // Calculate delay with optional exponential backoff
      const delay = opts.backoff
        ? opts.delayMs * Math.pow(2, attempt - 1)
        : opts.delayMs;

      await sleep(delay);
    }
  }

  throw lastError;
}

/**
 * Retry with a fallback value on failure.
 */
export async function retryWithFallback<T>(
  fn: () => Promise<T>,
  fallback: T,
  options: RetryOptions = {}
): Promise<T> {
  try {
    return await retry(fn, options);
  } catch {
    return fallback;
  }
}
