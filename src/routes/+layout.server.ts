import type { ServerLoad } from '@sveltejs/kit';
import {
	listCategories,
	listCurrencies,
	listPaymentMethods,
	readWallosConfig
} from '#lib/server/wallos.js';

export const load: ServerLoad = async ({ depends }) => {
	depends('app:references');
	const config = readWallosConfig();
	if (!config)
		return {
			references: { currencies: [], paymentMethods: [], categories: [] },
			referencesUnavailable: true
		};
	try {
		const [currs, cats, pays] = await Promise.all([
			listCurrencies(config),
			listCategories(config),
			listPaymentMethods(config)
		]);
		return {
			references: {
				currencies: currs.map((c) => ({ id: c.id, code: c.code, symbol: c.symbol })),
				categories: cats.map((c) => ({ id: c.id, name: c.name })),
				paymentMethods: pays.map((m) => ({ id: m.id, name: m.name, enabled: m.enabled }))
			},
			referencesUnavailable: false
		};
	} catch {
		// eslint-disable-next-line no-console
		console.error('Wallos reference fetch failed; returning empty references');
		return {
			references: { currencies: [], paymentMethods: [], categories: [] },
			referencesUnavailable: true
		};
	}
};
