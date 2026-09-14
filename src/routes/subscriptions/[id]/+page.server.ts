import { env } from '$env/dynamic/private';
import { error, fail, redirect, type Actions, type ServerLoad } from '@sveltejs/kit';
import { isValidOrigin } from '$lib/server/auth-state';
import {
	getSubscription,
	listCurrencies,
	mutateSubscription,
	readWallosConfig
} from '$lib/server/wallos';
import { currencyById } from '$lib/wallos';

export const load: ServerLoad = async ({ params }) => {
	const id = params.id ?? '';
	if (!/^\d+$/.test(id)) throw error(404);
	const config = readWallosConfig();
	if (!config) throw error(503);
	let sub, currs;
	try {
		[sub, currs] = await Promise.all([getSubscription(config, id), listCurrencies(config)]);
	} catch (err) {
		const code = err instanceof Error ? err.message : 'failed';
		if (code === 'notfound') throw error(404);
		throw error(code === 'unavailable' ? 503 : 500);
	}
	const currency = currencyById(currs, sub.currency_id);
	return {
		subscription: { ...sub, currencyCode: currency.code, currencySymbol: currency.symbol }
	};
};

export const actions: Actions = {
	delete: async ({ request, params }) => {
		if (!isValidOrigin(request.headers.get('origin'), env.ORIGIN ?? '')) {
			return fail(403, { errors: ['Request not allowed.'] });
		}
		const fields = await request.formData();
		if (fields.get('confirm') !== 'yes') return fail(400, { errors: ['Confirm deletion first.'] });
		const config = readWallosConfig();
		if (!config) return fail(503, { errors: ['Service unavailable.'] });
		const id = params.id ?? '';
		if (!/^\d+$/.test(id)) return fail(404, { errors: ['Subscription not found.'] });
		try {
			await mutateSubscription(config, 'delete', { id });
		} catch (err) {
			const code = err instanceof Error ? err.message : 'failed';
			if (code === 'notfound') return fail(404, { errors: ['Subscription not found.'] });
			return fail(503, { errors: ['Service unavailable.'] });
		}
		throw redirect(303, '/');
	}
};
