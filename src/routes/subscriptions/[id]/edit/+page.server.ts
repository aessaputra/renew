import { ORIGIN } from '$app/env/private';
import { error, fail, redirect, type Actions, type ServerLoad } from '@sveltejs/kit';
import { isValidOrigin } from '#lib/server/auth-state.js';
import { getSubscription, mutateSubscription, readWallosConfig } from '#lib/server/wallos.js';

import {
	subscriptionFormValues,
	toWallosFields,
	validateSubscriptionInput
} from '#lib/wallos.js';

import type { WallosCategory, WallosCurrency, WallosPaymentMethod } from '#lib/wallos.js';

interface ParentReferences {
	references: { categories: WallosCategory[]; paymentMethods: WallosPaymentMethod[]; currencies: WallosCurrency[] };
	referencesUnavailable: boolean;
}

export const load: ServerLoad = async ({ params, parent, request }) => {
	const id = params.id ?? '';
	if (!(/^\d+$/).test(id)) throw error(404);
	const config = readWallosConfig();
	if (!config) throw error(503);
	const { references, referencesUnavailable } = await parent() as ParentReferences;
	// ponytail: POST renders data-less outage form via referencesUnavailable; full upstream fetch resumes on restore.
	if (referencesUnavailable && request.method === 'POST') {
		return { subscription: null, categories: [], paymentMethods: [], currencies: [], referencesUnavailable: true };
	}
	let sub;
	try {
		sub = await getSubscription(config, id);
	} catch (err) {
		const code = err instanceof Error ? err.message : 'failed';
		if (code === 'notfound') throw error(404);
		throw error(code === 'unavailable' ? 503 : 500);
	}
	if (referencesUnavailable) {
		throw error(503);
	}
	return {
		subscription: {
			id: sub.id,
			name: sub.name,
			price: sub.price,
			currency_id: sub.currency_id,
			frequency: sub.frequency,
			cycle: sub.cycle,
			next_payment: sub.next_payment,
			category_id: sub.category_id,
			payment_method_id: sub.payment_method_id,
			notify: sub.notify,
			notify_days_before: sub.notify_days_before,
			url: sub.url,
			notes: sub.notes
		},
		categories: references.categories,
		paymentMethods: references.paymentMethods
			.filter((m) => m.enabled === 1 || m.id === sub.payment_method_id)
			.map((m) => ({ id: m.id, name: m.name })),
		currencies: references.currencies.map((c) => ({ id: c.id, code: c.code, symbol: c.symbol }))
	};
};

export const actions: Actions = {
	update: async ({ request, params }) => {
		if (!isValidOrigin(request.headers.get('origin'), ORIGIN)) {
			return fail(403, { errors: ['Request not allowed.'], values: {} });
		}
		const id = params.id ?? '';
		if (!(/^\d+$/).test(id)) return fail(404, { errors: ['Subscription not found.'] });
		const config = readWallosConfig();
		if (!config) return fail(503, { errors: ['Service unavailable.'], values: {} });
		const fd = await request.formData();
		const validated = validateSubscriptionInput(fd);
		if (!validated.ok) {
			return fail(400, { errors: validated.errors, values: subscriptionFormValues(fd) });
		}
		try {
			await mutateSubscription(config, 'edit', { id, ...toWallosFields(validated.data, true) });
		} catch (err) {
			const code = err instanceof Error ? err.message : 'failed';
			if (code === 'notfound') return fail(404, { errors: ['Subscription not found.'] });
			if (code === 'invalid') {
				return fail(400, {
					errors: ['Invalid subscription data.'],
					values: subscriptionFormValues(fd)
				});
			}
			return fail(503, { errors: ['Service unavailable.'], values: subscriptionFormValues(fd) });
		}
		throw redirect(303, `/subscriptions/${id}`);
	}
};
