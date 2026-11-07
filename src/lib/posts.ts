import { getCollection, type CollectionEntry } from 'astro:content';

export type Post = CollectionEntry<'blog'>;

/** Articles publiés, du plus récent au plus ancien. Les brouillons ne sortent qu'en développement. */
export async function getPosts(): Promise<Post[]> {
	const posts = await getCollection('blog', ({ data }) => import.meta.env.DEV || !data.draft);
	return posts.sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());
}

/** Tags utilisés, avec le nombre d'articles, triés par fréquence puis par nom. */
export function getTags(posts: Post[]): { tag: string; count: number }[] {
	const counts = new Map<string, number>();
	for (const post of posts) for (const tag of post.data.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
	return [...counts.entries()]
		.map(([tag, count]) => ({ tag, count }))
		.sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, 'fr'));
}

/** Slug d'URL d'un tag : « Argo CD » → « argo-cd ». */
export function tagSlug(tag: string): string {
	return tag
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/(^-|-$)/g, '');
}

/** Temps de lecture estimé (≈ 220 mots/minute, blocs de code comptés à moitié). */
export function readingTime(body: string | undefined): number {
	if (!body) return 1;
	const code = (body.match(/```[\s\S]*?```/g) ?? []).join(' ');
	const prose = body.replace(/```[\s\S]*?```/g, ' ');
	const words = (s: string) => s.split(/\s+/).filter(Boolean).length;
	return Math.max(1, Math.round((words(prose) + words(code) / 2) / 220));
}
