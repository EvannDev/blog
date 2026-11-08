// @ts-check
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import { defineConfig, fontProviders } from 'astro/config';

// Site 100 % statique : `astro build` produit dist/, servi par nginx (voir Dockerfile).
export default defineConfig({
	site: 'https://blog.evann-deb.fr',
	trailingSlash: 'ignore',
	integrations: [mdx(), sitemap()],
	markdown: {
		shikiConfig: {
			// Coloration syntaxique claire / sombre selon le thème du lecteur
			themes: { light: 'github-light', dark: 'github-dark' },
			wrap: false,
		},
	},
	fonts: [
		// Polices du design system « Carnet de bord ». Le provider Google les télécharge au build :
		// elles sont servies depuis le site (CSP font-src 'self'), sans requête vers Google côté lecteur.
		{
			provider: fontProviders.google(),
			name: 'Bodoni Moda',
			cssVariable: '--font-display',
			weights: [700, 800],
			styles: ['normal', 'italic'],
			subsets: ['latin'],
			fallbacks: ['Didot', 'Georgia', 'serif'],
		},
		{
			provider: fontProviders.google(),
			name: 'Fredoka',
			cssVariable: '--font-ui',
			weights: [500, 600],
			styles: ['normal'],
			subsets: ['latin'],
			fallbacks: ['ui-rounded', 'system-ui', 'sans-serif'],
		},
		{
			provider: fontProviders.google(),
			name: 'Quicksand',
			cssVariable: '--font-body',
			weights: [500, 600, 700],
			styles: ['normal'],
			subsets: ['latin'],
			fallbacks: ['ui-rounded', 'system-ui', 'sans-serif'],
		},
		// Titre en collage de l'accueil (CollageTitle) : une police par morceau découpé.
		{
			provider: fontProviders.google(),
			name: 'Gloock',
			cssVariable: '--font-collage-poster',
			weights: [400],
			styles: ['normal'],
			subsets: ['latin'],
			fallbacks: ['Georgia', 'serif'],
		},
		{
			provider: fontProviders.google(),
			name: 'Unbounded',
			cssVariable: '--font-collage-wide',
			weights: [800],
			styles: ['normal'],
			subsets: ['latin'],
			fallbacks: ['system-ui', 'sans-serif'],
		},
		{
			provider: fontProviders.google(),
			name: 'Instrument Serif',
			cssVariable: '--font-collage-thin',
			weights: [400],
			styles: ['italic'],
			subsets: ['latin'],
			fallbacks: ['Georgia', 'serif'],
		},
		{
			provider: fontProviders.google(),
			name: 'JetBrains Mono',
			cssVariable: '--font-mono',
			weights: [400],
			styles: ['normal'],
			subsets: ['latin'],
			fallbacks: ['ui-monospace', 'Menlo', 'Consolas', 'monospace'],
		},
	],
});
