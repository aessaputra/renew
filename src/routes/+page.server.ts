import { error, type ServerLoad } from '@sveltejs/kit';
import {
	listCurrencies,
	listPaymentMethods,
	listSubscriptions,
	listCategories,
	readWallosConfig
} from '$lib/server/wallos';
import { type SubscriptionRow } from '$lib/wallos';

export const load: ServerLoad = async () => {
	const config = readWallosConfig();
	if (!config) throw error(503);
	// Mulai referensi non-esensial lebih dulu agar paralel; kembalikan sebagai
	// promise yang di-stream. List render tanpa menunggu keduanya.
	const categoriesStream = listCategories(config)
		.then((cats) => cats.map((c) => ({ id: c.id, name: c.name })))
		.catch(() => [] as { id: number; name: string }[]);
	const paymentMethodsStream = listPaymentMethods(config)
		.then((pays) => pays.map((m) => ({ id: m.id, name: m.name })))
		.catch(() => [] as { id: number; name: string }[]);
	// Tandai handled agar rejection sebelum render mulai tidak crash server (dok kit/load).
	categoriesStream.catch(() => {});
	paymentMethodsStream.catch(() => {});
	let subs, currs;
	try {
		[subs, currs] = await Promise.all([listSubscriptions(config), listCurrencies(config)]);
	} catch (err) {
		const code = err instanceof Error ? err.message : 'failed';
		throw error(code === 'unavailable' ? 503 : 500);
	}
	const currencyCodeById = new Map(currs.map((c) => [c.id, c.code] as const));
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
	return {
		subscriptions: rows,
		categories: categoriesStream,
		paymentMethods: paymentMethodsStream
	};
};
