import { GlobalWorkerOptions } from 'pdfjs-dist';

/**
 * Configures PDF.js application-global worker state.
 *
 * Use this once at application startup when every PDF.js consumer can share the
 * same worker configuration. Calling it again replaces the previous global
 * worker URL or port and can collide with other PDF.js consumers in the same
 * JavaScript realm. For isolation, pass a caller-created PDF.js `PDFWorker` on
 * an individual `DocumentInitParameters` source instead of using this helper.
 *
 * When passing an existing DOM `Worker`, the caller retains ownership of
 * terminating it.
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
