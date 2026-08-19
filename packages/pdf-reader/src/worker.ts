import { GlobalWorkerOptions } from 'pdfjs-dist';

/**
 * Configures PDF.js without bundler-specific imports or package-load side effects.
 * Pass either a worker URL emitted by your bundler or an existing module Worker.
 */
export function configurePdfWorker(worker: string | Worker): void {
  if (typeof worker === 'string') {
    GlobalWorkerOptions.workerSrc = worker;
  } else {
    GlobalWorkerOptions.workerPort = worker;
  }
}
