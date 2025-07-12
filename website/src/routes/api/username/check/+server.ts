import { json } from '@sveltejs/kit';

export async function GET({ url }) {
	const username = url.searchParams.get('username');
	return json({ available: true });
}
