import { error, type ServerLoad } from '@sveltejs/kit';
import { listSubscriptions, readWallosConfig } from '#lib/server/wallos.js';
import { type SubscriptionRow } from '#lib/wallos.js';

interface ParentReferences {
	currencies: { id: number; code: string }[];
	categories: { id: number; name: string }[];
	paymentMethods: { id: number; name: string; enabled: number }[];
}

export const load: ServerLoad = async ({ parent }) => {
	const config = readWallosConfig();
	if (!config) throw error(503);
	const parentData = (await parent()) as { references: ParentReferences };
	const references = parentData.references;
	const currencyCodeById = new Map(references.currencies.map((c) => [c.id, c.code] as const));
	let subs;
	try {
		subs = await listSubscriptions(config);
	} catch (err) {
		const code = err instanceof Error ? err.message : 'failed';
		throw error(code === 'unavailable' ? 503 : 500);
	}
	const rows: SubscriptionRow[] = subs.map((s) => ({
		id: s.id,
		name: s.name,
		price: s.price,
		currencyCode: currencyCodeById.get(s.currency_id) ?? '',
		next_payment: s.next_payment,
		category_id: s.category_id,
		category_name: s.category_name,
		payment_method_id: s.payment_method_id,
		payment_method_name: s.payment_method_name,
		inactive: s.inactive
	}));
	// Wrap parent references to preserve the streaming promise shape in +page.svelte.
	const categoriesStream = Promise.resolve(references.categories);
	const paymentMethodsStream = Promise.resolve(references.paymentMethods);
	return {
		subscriptions: rows,
		categories: categoriesStream,
		paymentMethods: paymentMethodsStream
	};
};
