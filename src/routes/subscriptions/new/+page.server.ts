import { ORIGIN } from '$app/env/private';
import { error, fail, redirect, type Actions, type ServerLoad } from '@sveltejs/kit';
import { isValidOrigin } from '#lib/server/auth-state.js';
import { mutateSubscription, readWallosConfig } from '#lib/server/wallos.js';

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

export const load: ServerLoad = async ({ parent, request }) => {
	const config = readWallosConfig();
	if (!config) throw error(503);
	const { references, referencesUnavailable } = await parent() as ParentReferences;
	if (referencesUnavailable) {
		if (request.method === 'POST') {
			return { categories: [], paymentMethods: [], currencies: [], referencesUnavailable: true };
		}
		throw error(503);
	}
	return {
		categories: references.categories,
		paymentMethods: references.paymentMethods.filter((m) => m.enabled === 1),
		currencies: references.currencies
	};
};

export const actions: Actions = {
	create: async ({ request }) => {
		if (!isValidOrigin(request.headers.get('origin'), ORIGIN)) {
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
