import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import open from 'open';
import { handleApi } from './api.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(__dirname, 'dist');

if (!fs.existsSync(path.join(dist, 'index.html'))) {
	console.error('dist/ not found — run `npm run build` first, or use `npm start` which builds automatically.');
	process.exit(1);
}

const app = express();
app.use('/api', handleApi);
app.use(express.static(dist));

const port = Number(process.env.PORT) || 5178;
app.listen(port, async () => {
	const url = `http://localhost:${port}`;
	console.log(`Beer GUI listening on ${url}`);
	if (process.env.NO_OPEN !== '1') {
		try {
			await open(url);
		} catch {
			// opening the browser is best-effort only
		}
	}
});
