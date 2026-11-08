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

/** Teinte d'un sujet (design system : une couleur fixe par sujet, reconnaissable d'une page à l'autre). */
const TAG_TONES: Record<string, string> = {
	homelab: 'butter',
	kubernetes: 'sky',
	gitops: 'mint',
	'agents-ia': 'lavender',
};
const FALLBACK_TONES = ['peach', 'turquoise', 'pink'];
export function tagTone(tag: string): string {
	const slug = tagSlug(tag);
	if (TAG_TONES[slug]) return TAG_TONES[slug];
	let hash = 0;
	for (const char of slug) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
	return FALLBACK_TONES[hash % FALLBACK_TONES.length];
}

/** Numéro d'un article dans le carnet : 1 pour le plus ancien publié. */
export function postNumber(posts: Post[], post: Post): number {
	const chronological = [...posts].sort((a, b) => a.data.pubDate.valueOf() - b.data.pubDate.valueOf());
	return chronological.findIndex((p) => p.id === post.id) + 1;
}

/** Teinte du Marker d'un article : coral → mint → sky → lavender → butter. */
const MARKER_TONES = ['coral', 'mint', 'sky', 'lavender', 'butter'];
export function markerTone(index: number): string {
	return MARKER_TONES[(Math.max(1, index) - 1) % MARKER_TONES.length];
}
