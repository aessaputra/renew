import { WALLOS_BASE_URL, WALLOS_API_KEY } from '$app/env/private';
import type { WallosCategory, WallosPaymentMethod, WallosCurrency } from '#lib/wallos.js';
import { coerceWallosNumber } from '#lib/wallos.js';

const REQUEST_TIMEOUT_MS = 10_000;

export interface WallosConfig {
	baseUrl: string;
	apiKey: string;
}

export interface WallosSubscription {
	id: number;
	price: number;
	currency_id: number;
	cycle: number;
	frequency: number;
	payment_method_id: number;
	category_id: number;
	notify: number;
	inactive: number;
	notify_days_before: number;
	name: string;
	next_payment: string;
	notes: string;
	url: string;
	start_date: string;
	category_name: string;
	payment_method_name: string;
}

export type { WallosCategory, WallosPaymentMethod, WallosCurrency };

export function readWallosConfig(): WallosConfig | null {
	const rawBase = WALLOS_BASE_URL;
	const apiKey = WALLOS_API_KEY;
	if (!rawBase || !apiKey) return null;
	const baseUrl = rawBase.replace(/\/+$/, '');
	try {
		const parsed = new URL(baseUrl);
		if (parsed.username || parsed.password || parsed.search || parsed.hash) return null;
		const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
		if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && loopback)) return null;
	} catch {
		return null;
	}
	return { baseUrl, apiKey };
}

type WallosEnvelope = Record<string, unknown>;

function envelopeErrorCode(title: unknown): 'invalid' | 'notfound' | 'failed' {
	const text = typeof title === 'string' ? title.toLowerCase() : '';
	if (text.includes('missing') || text.includes('invalid')) return 'invalid';
	if (text.includes('not found') || text.includes('belong')) return 'notfound';
	return 'failed';
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function wallosGet(
	config: WallosConfig,
	path: string,
	params: Record<string, string> = {}
): Promise<WallosEnvelope> {
	const query = new URLSearchParams({ apiKey: config.apiKey, ...params }).toString();
	let response: Response;
	try {
		response = await fetch(`${config.baseUrl}${path}?${query}`, {
			redirect: 'error',
			signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
		});
	} catch {
		throw new Error('unavailable');
	}
	if (!response.ok) throw new Error('unavailable');
	let body: unknown;
	try {
		body = await response.json();
	} catch {
		throw new Error('failed');
	}
	if (!isRecord(body)) throw new Error('failed');
	if (body.success !== true) throw new Error(envelopeErrorCode(body.title));
	return body;
}

export async function listSubscriptions(config: WallosConfig): Promise<WallosSubscription[]> {
	const body = await wallosGet(config, '/api/subscriptions/get_subscriptions.php');
	const list = body.subscriptions;
	if (!Array.isArray(list)) throw new Error('failed');
	const subscriptions = list.map(parseSubscription);
	if (new Set(subscriptions.map((sub) => sub.id)).size !== subscriptions.length) throw new Error('failed');
	return subscriptions;
}

export async function getSubscription(config: WallosConfig, id: string): Promise<WallosSubscription> {
	if (!(/^[1-9]\d*$/).test(id) || !Number.isSafeInteger(Number(id))) throw new Error('notfound');

	const body = await wallosGet(config, '/api/subscriptions/get_subscription.php', { id });
	const sub = body.subscription;
	const subscription = parseSubscription(sub);
	if (String(subscription.id) !== id) throw new Error('notfound');
	return subscription;
}

function parseSubscription(value: unknown): WallosSubscription {
	if (!isRecord(value)) throw new Error('failed');
	const NULLABLE_NUMBERS = new Set(['category_id', 'payment_method_id', 'notify_days_before']);
	const numericFields = ["id", "price", "currency_id", "cycle", "frequency", "payment_method_id", "category_id", "notify", "inactive", "notify_days_before"] as const;
	const stringFields = ["name", "next_payment", "notes", "url", "start_date", "category_name", "payment_method_name"] as const;
	for (const key of numericFields) {
		const raw = value[key];
		const coerced = raw == null && NULLABLE_NUMBERS.has(key) ? 0 : raw;
		if (typeof coerced !== 'number' || !Number.isFinite(coerced)) throw new Error('failed');
	}
	if (stringFields.some((key) => typeof value[key] !== 'string')) throw new Error('failed');
	if (!Number.isSafeInteger(value.id) || Number(value.id) <= 0 || ![0, 1].includes(Number(value.inactive)) || ![0, 1].includes(Number(value.notify))) throw new Error('failed');
	// Only known fields cross the server boundary; upstream extras never reach page data.
	const out = Object.fromEntries([...numericFields, ...stringFields].map((key) => [key, value[key]])) as unknown as Record<string, unknown>;
	for (const key of NULLABLE_NUMBERS) out[key] = coerceWallosNumber(out[key]);
	return out as unknown as WallosSubscription;
}

function referenceList(value: unknown): Record<string, unknown>[] {
	if (!Array.isArray(value) || value.some((item) => !isRecord(item) ||
		typeof item.id !== 'number' || !Number.isSafeInteger(item.id) || item.id <= 0 || typeof item.name !== 'string')) throw new Error('failed');
	if (new Set(value.map((item) => item.id)).size !== value.length) throw new Error('failed');
	return value;
}

export async function listCategories(config: WallosConfig): Promise<WallosCategory[]> {
	const body = await wallosGet(config, '/api/categories/get_categories.php');
	return referenceList(body.categories).map((item) => ({ id: item.id as number, name: item.name as string }));
}

export async function listPaymentMethods(config: WallosConfig): Promise<WallosPaymentMethod[]> {
	const body = await wallosGet(config, '/api/payment_methods/get_payment_methods.php');
	return referenceList(body.payment_methods).map((item) => {
		if (item.enabled !== 0 && item.enabled !== 1) throw new Error('failed');
		return { id: item.id as number, name: item.name as string, enabled: item.enabled };
	});
}

export async function listCurrencies(config: WallosConfig): Promise<WallosCurrency[]> {
	const body = await wallosGet(config, '/api/currencies/get_currencies.php');
	return referenceList(body.currencies).map((item) => {
		if (typeof item.code !== 'string' || typeof item.symbol !== 'string') throw new Error('failed');
		return { id: item.id as number, name: item.name as string, code: item.code, symbol: item.symbol };
	});
}

export type MutateAction = 'add' | 'edit' | 'delete';

export async function mutateSubscription(
	config: WallosConfig,
	action: MutateAction,
	fields: Record<string, string>
): Promise<void> {
	const form = new FormData();
	form.set('api_key', config.apiKey);
	form.set('action', action);
	for (const [key, value] of Object.entries(fields)) form.set(key, value);
	let response: Response;
	try {
		response = await fetch(`${config.baseUrl}/api/subscriptions/set_subscriptions.php`, {
			method: 'POST',
			body: form,
			redirect: 'error',
			signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
		});
	} catch {
		throw new Error('unavailable');
	}
	if (!response.ok) throw new Error('unavailable');
	let body: unknown;
	try {
		body = await response.json();
	} catch {
		throw new Error('failed');
	}
	if (!isRecord(body) || body.success !== true) {
		throw new Error(envelopeErrorCode(isRecord(body) ? body.title : undefined));
	}
}
