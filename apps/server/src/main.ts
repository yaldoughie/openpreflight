import { loadConfig } from '@openpreflight/configuration';
import { createServer } from './index.js';

const config = await loadConfig(process.env.OPENPREFLIGHT_CONFIG);
const server = await createServer(config);
const close = async () => {
  await server.close();
  process.exitCode = 0;
};
process.once('SIGINT', () => void close());
process.once('SIGTERM', () => void close());
await server.listen(config.server);
