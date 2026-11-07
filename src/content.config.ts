import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

// Un article = un fichier Markdown/MDX dans src/content/blog/. Le nom de fichier donne l'URL.
const blog = defineCollection({
	loader: glob({ base: './src/content/blog', pattern: '**/*.{md,mdx}' }),
	schema: ({ image }) =>
		z.object({
			title: z.string().max(90),
			description: z.string().max(200),
			pubDate: z.coerce.date(),
			updatedDate: z.coerce.date().optional(),
			heroImage: z.optional(image()),
			tags: z.array(z.string()).default([]),
			// Brouillon : visible en local (`npm run dev`), jamais publié par `npm run build`.
			draft: z.boolean().default(false),
			// Attribution : qui a écrit, qui a vérifié (humains ou agents du studio éditorial).
			writtenBy: z.string().default('Evann'),
			reviewedBy: z.array(z.string()).default([]),
		}),
});

export const collections = { blog };
