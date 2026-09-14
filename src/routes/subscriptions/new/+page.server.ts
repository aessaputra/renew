import { env } from '$env/dynamic/private';
import { error, fail, redirect, type Actions, type ServerLoad } from '@sveltejs/kit';
import { isValidOrigin } from '$lib/server/auth-state';
import {
	listCurrencies,
	listPaymentMethods,
	listCategories,
	mutateSubscription,
	readWallosConfig
} from '$lib/server/wallos';
import { subscriptionFormValues, toWallosFields, validateSubscriptionInput } from '$lib/wallos';

export const load: ServerLoad = async ({ request }) => {
	const config = readWallosConfig();
	if (!config) throw error(503);
	try {
		const [cats, pays, currs] = await Promise.all([
			listCategories(config),
			listPaymentMethods(config),
			listCurrencies(config)
		]);
		return {
			categories: cats.map((c) => ({ id: c.id, name: c.name })),
			paymentMethods: pays.filter((m) => m.enabled === 1).map((m) => ({ id: m.id, name: m.name })),
			currencies: currs.map((c) => ({ id: c.id, code: c.code, symbol: c.symbol }))
		};
	} catch (err) {
		// ponytail: failed native POSTs use submitted IDs, not cached labels; reload to restore references.
		if (request.method === 'POST') {
			return { categories: [], paymentMethods: [], currencies: [], referencesUnavailable: true };
		}
		const code = err instanceof Error ? err.message : 'failed';
		throw error(code === 'unavailable' ? 503 : 500);
	}
};

export const actions: Actions = {
	create: async ({ request }) => {
		if (!isValidOrigin(request.headers.get('origin'), env.ORIGIN ?? '')) {
			return fail(403, { errors: ['Request not allowed.'], values: {} });
		}
		const config = readWallosConfig();
		if (!config) return fail(503, { errors: ['Service unavailable.'], values: {} });
		const fd = await request.formData();
		const validated = validateSubscriptionInput(fd);
		if (!validated.ok) {
			return fail(400, { errors: validated.errors, values: subscriptionFormValues(fd) });
		}
		try {
			await mutateSubscription(config, 'add', toWallosFields(validated.data));
		} catch (err) {
			const code = err instanceof Error ? err.message : 'failed';
			if (code === 'invalid') {
				return fail(400, {
					errors: ['Invalid subscription data.'],
					values: subscriptionFormValues(fd)
				});
			}
			return fail(503, { errors: ['Service unavailable.'], values: subscriptionFormValues(fd) });
		}
		throw redirect(303, '/');
	}
};
