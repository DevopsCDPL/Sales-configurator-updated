const { createProxyMiddleware } = require('http-proxy-middleware');

const BACKEND = process.env.REACT_APP_API_URL
  ? process.env.REACT_APP_API_URL.replace('/api', '')
  : 'https://g-t-production.up.railway.app';

module.exports = function (app) {
  app.use(
    '/api',
    createProxyMiddleware({
      target: BACKEND,
      changeOrigin: true,
      logLevel: 'warn',
    })
  );
  app.use(
    '/uploads',
    createProxyMiddleware({
      target: BACKEND,
      changeOrigin: true,
    })
  );
  app.use(
    '/health',
    createProxyMiddleware({
      target: BACKEND,
      changeOrigin: true,
    })
  );
};
