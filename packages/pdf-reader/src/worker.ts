import { GlobalWorkerOptions } from 'pdfjs-dist';

/**
 * Configures PDF.js without bundler-specific imports or package-load side effects.
 * Pass either a worker URL emitted by your bundler or an existing module Worker.
 *
 * Calling this again replaces the previous configuration. When passing an
 * existing `Worker`, the caller retains ownership of terminating it.
 */
export function configurePdfWorker(worker: string | Worker): void {
  if (typeof worker === 'string') {
    GlobalWorkerOptions.workerPort = null;
    GlobalWorkerOptions.workerSrc = worker;
  } else {
    GlobalWorkerOptions.workerSrc = '';
    GlobalWorkerOptions.workerPort = worker;
  }
}
