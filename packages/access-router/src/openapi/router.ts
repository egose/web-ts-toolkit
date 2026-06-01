import express from 'express';
import type { Router } from 'express';
import { posix } from 'node:path';
import type { AccessRuntime } from '../runtime';
import type { OpenApiRouterOptions } from './types';

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const renderDocsHtml = (specPath: string, title: string, cssUrl: string, bundleUrl: string) => `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <link rel="stylesheet" href="${escapeHtml(cssUrl)}" />
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="${escapeHtml(bundleUrl)}"></script>
  <script>
    window.ui = SwaggerUIBundle({
      url: ${JSON.stringify(specPath)},
      dom_id: '#swagger-ui',
      deepLinking: true,
      presets: [SwaggerUIBundle.presets.apis],
      layout: 'BaseLayout',
    });
  </script>
</body>
</html>`;

const getRelativeSpecPath = (docsPath: string, jsonPath: string) => {
  const docsDir = posix.dirname(docsPath.startsWith('/') ? docsPath : `/${docsPath}`);
  const normalizedJsonPath = jsonPath.startsWith('/') ? jsonPath : `/${jsonPath}`;
  return posix.relative(docsDir, normalizedJsonPath) || posix.basename(normalizedJsonPath);
};

export function createOpenApiRouter(runtime: AccessRuntime, options: OpenApiRouterOptions = {}): Router {
  const router = express.Router();
  const jsonPath = options.jsonPath ?? '/openapi.json';
  const docsPath = options.docsPath ?? '/docs';
  const swaggerUiCssUrl = options.swaggerUiCssUrl ?? 'https://unpkg.com/swagger-ui-dist@5/swagger-ui.css';
  const swaggerUiBundleUrl = options.swaggerUiBundleUrl ?? 'https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js';
  const info = {
    title: options.title ?? 'Access Router API',
    version: options.version ?? '0.0.0',
    description: options.description,
    servers: options.servers,
  };

  router.get(jsonPath, (_req, res) => {
    res.json(runtime.getOpenApiSpec(info));
  });

  if (docsPath !== false) {
    router.get(docsPath, (_req, res) => {
      res
        .type('html')
        .send(renderDocsHtml(getRelativeSpecPath(docsPath, jsonPath), info.title, swaggerUiCssUrl, swaggerUiBundleUrl));
    });
  }

  return router;
}
