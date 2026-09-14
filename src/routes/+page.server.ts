import { error, type ServerLoad } from '@sveltejs/kit';
import {
	listCurrencies,
	listPaymentMethods,
	listSubscriptions,
	listCategories,
	readWallosConfig
} from '$lib/server/wallos';
import { currencyById, type SubscriptionRow } from '$lib/wallos';

export const load: ServerLoad = async () => {
	const config = readWallosConfig();
	if (!config) throw error(503);
	let subs, cats, pays, currs;
	try {
		[subs, cats, pays, currs] = await Promise.all([
			listSubscriptions(config),
			listCategories(config),
			listPaymentMethods(config),
			listCurrencies(config)
		]);
	} catch (err) {
		const code = err instanceof Error ? err.message : 'failed';
		throw error(code === 'unavailable' ? 503 : 500);
	}
	const rows: SubscriptionRow[] = subs.map((s) => ({
		id: s.id,
		name: s.name,
		price: s.price,
		currencyCode: currencyById(currs, s.currency_id).code,
		next_payment: s.next_payment,
		category_id: s.category_id,
		category_name: s.category_name,
		payment_method_id: s.payment_method_id,
		payment_method_name: s.payment_method_name,
		inactive: s.inactive
	}));
	return {
		subscriptions: rows,
		categories: cats.map((c) => ({ id: c.id, name: c.name })),
		paymentMethods: pays.map((m) => ({ id: m.id, name: m.name }))
	};
};
