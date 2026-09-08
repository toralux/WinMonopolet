import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { handleApi } from './api.mjs';

export default defineConfig({
	plugins: [
		svelte(),
		{
			name: 'beer-gui-api',
			configureServer(server) {
				server.middlewares.use('/api', handleApi);
			}
		}
	]
});
