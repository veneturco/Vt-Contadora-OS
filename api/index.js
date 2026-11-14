// Entrypoint de Serverless Function para Vercel
// Encapsula el servidor Express de backend/server.js para ejecución serverless sin servidor permanente.

const app = require('../backend/server');

module.exports = app;
