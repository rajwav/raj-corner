import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';

export default defineConfig({
  // Authorization is request-specific. Never prerender a page that may contain
  // private archive data into a public static HTML file.
  output: 'server',
  site: 'https://raj.example',
  adapter: vercel({
    includeFiles: ['./private-media/uploads', './private-media/images'],
  }),
});
