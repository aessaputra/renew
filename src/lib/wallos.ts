export interface WallosCategory {
	id: number;
	name: string;
}

export interface WallosPaymentMethod {
	id: number;
	name: string;
	enabled: number;
}

export interface WallosCurrency {
	id: number;
	name: string;
	symbol: string;
	code: string;
}

export function currencyById(
	currencies: WallosCurrency[],
	id: number
): { code: string; symbol: string } {
	const found = currencies.find((c) => c.id === id);
	return { code: found?.code ?? '', symbol: found?.symbol ?? '' };
}

const formatterCache = new Map<string, Intl.NumberFormat>();

export function formatPrice(amount: number, currencyCode: string): string {
	const code = currencyCode.trim().toUpperCase();
	const locale = code === 'IDR' ? 'id-ID' : 'en-US';
	// ponytail: cache per currency; list renders call this per row per keystroke.
	const options = { maximumSignificantDigits: 21 } as const;
	if (!code) {
		return new Intl.NumberFormat(locale, options).format(amount);
	}
	let fmt = formatterCache.get(code);
	if (!fmt) {
		try {
			fmt = new Intl.NumberFormat(locale, { ...options, style: 'currency', currency: code });
		} catch {
			const number = new Intl.NumberFormat(locale, options).format(amount);
			return currencyCode.trim() ? `${currencyCode.trim()}\u00a0${number}` : number;
		}
		formatterCache.set(code, fmt);
	}
	try {
		return fmt.format(amount);
	} catch {
		const number = new Intl.NumberFormat(locale, options).format(amount);
		return currencyCode.trim() ? `${currencyCode.trim()}\u00a0${number}` : number;
	}
}

export interface SubscriptionFilter {
	q: string;
	categoryId: string;
	paymentMethodId: string;
}

export interface SubscriptionRow {
	id: number;
	name: string;
	price: number;
	currencyCode: string;
	next_payment: string;
	category_id: number;
	category_name: string;
	payment_method_id: number;
	payment_method_name: string;
	inactive: number;
}

export function filterSubscriptions(
	list: SubscriptionRow[],
	filter: SubscriptionFilter
): SubscriptionRow[] {
	const q = filter.q.trim().toLowerCase();
	return list.filter((s) => {
		if (s.inactive !== 0) return false;
		if (q && !s.name.toLowerCase().includes(q)) return false;
		if (filter.categoryId && String(s.category_id) !== filter.categoryId) return false;
		if (filter.paymentMethodId && String(s.payment_method_id) !== filter.paymentMethodId)
			return false;
		return true;
	});
}

export interface ValidatedSubscriptionInput {
	name: string;
	price: number;
	currency_id: number;
	frequency: number;
	cycle: number;
	next_payment: string;
	category_id?: number;
	payment_method_id?: number;
	notify: number;
	notify_days_before?: number;
	url?: string;
	notes?: string;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const INPUT_FIELDS = ['name', 'price', 'currency_id', 'frequency', 'cycle', 'next_payment',
	'category_id', 'payment_method_id', 'notify', 'notify_days_before', 'url', 'notes'];

export function subscriptionFormValues(fd: FormData): Record<string, string> {
	return Object.fromEntries(INPUT_FIELDS.map((key) => {
		const value = fd.get(key);
		return [key, typeof value === 'string' ? value : key === 'notify' ? '0' : ''];
	}));
}

export function coerceWallosNumber(value: unknown): number {
	return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export function formatBillingInterval(cycle: unknown, frequency: unknown): string {
	if (typeof cycle !== 'number' || !Number.isInteger(cycle) || cycle < 1 || cycle > 4 ||
		typeof frequency !== 'number' || !Number.isSafeInteger(frequency) || frequency < 1) return 'Not set';
	const unit = ['day', 'week', 'month', 'year'][cycle - 1];
	return frequency === 1 ? `Every ${unit}` : `Every ${frequency} ${unit}s`;
}

export function safeSubscriptionUrl(value: string): string {
	try {
		const url = new URL(value);
		return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : '';
	} catch {
		return '';
	}
}

function isValidDate(value: string): boolean {
	const date = new Date(`${value}T00:00:00Z`);
	return DATE_RE.test(value) && Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function toPositiveInt(value: string): number | undefined {
	if (!/^\d+$/.test(value)) return undefined;
	const n = Number(value);
	return Number.isSafeInteger(n) && n > 0 ? n : undefined;
}

export function validateSubscriptionInput(
	fd: FormData
): { ok: true; data: ValidatedSubscriptionInput } | { ok: false; errors: string[] } {
	const errors: string[] = [];
	if ([...fd.values()].some((value) => typeof value !== 'string')) errors.push('File uploads are not supported.');
	if (INPUT_FIELDS.some((key) => fd.getAll(key).length > 1)) errors.push('Duplicate fields are not allowed.');
	const str = (key: string): string => {
		const v = fd.get(key);
		return typeof v === 'string' ? v.trim() : '';
	};

	const name = str('name');
	if (!name) errors.push('Name is required.');
	if (name.length > 200) errors.push('Name must be 200 characters or fewer.');

	const priceRaw = str('price');
	const price = Number(priceRaw);
	if (!priceRaw || !Number.isFinite(price) || price < 0) {
		errors.push('Price must be a non-negative number.');
	}

	const currency_id = toPositiveInt(str('currency_id'));
	if (currency_id === undefined) errors.push('Currency is required.');

	const frequency = toPositiveInt(str('frequency'));
	if (frequency === undefined) errors.push('Frequency is required.');

	const cycle = toPositiveInt(str('cycle'));
	if (cycle === undefined || ![1, 2, 3, 4].includes(cycle)) {
		errors.push('Cycle must be 1 (Days), 2 (Weeks), 3 (Months), or 4 (Years).');
	}

	const next_payment = str('next_payment');
	if (!isValidDate(next_payment)) errors.push('Next payment date is required (YYYY-MM-DD).');

	const categoryRaw = str('category_id');
	const category_id = toPositiveInt(categoryRaw);
	if (categoryRaw && category_id === undefined) errors.push('Category is invalid.');

	const payRaw = str('payment_method_id');
	const payment_method_id = toPositiveInt(payRaw);
	if (payRaw && payment_method_id === undefined) errors.push('Payment method is invalid.');

	if (!['', 'on', '0', '1'].includes(str('notify'))) errors.push('Reminder is invalid.');
	const notify = fd.get('notify') === 'on' || str('notify') === '1' ? 1 : 0;
	const daysRaw = str('notify_days_before');
	let notify_days_before: number | undefined;
	if (daysRaw) {
		if (!/^\d+$/.test(daysRaw)) {
			errors.push('Reminder days must be between 0 and 365.');
		} else {
			const n = Number(daysRaw);
			if (!Number.isSafeInteger(n) || n < 0 || n > 365) {
				errors.push('Reminder days must be between 0 and 365.');
			} else {
				notify_days_before = n;
			}
		}
	}

	const url = str('url');
	if (url && !safeSubscriptionUrl(url)) errors.push('URL must start with http(s)://.');

	const notes = str('notes');
	if (notes.length > 5000 || url.length > 2048) errors.push('URL or notes are too long.');

	if (errors.length > 0 || currency_id === undefined || frequency === undefined || cycle === undefined) {
		return { ok: false, errors };
	}

	const data: ValidatedSubscriptionInput = {
		name,
		price,
		currency_id,
		frequency,
		cycle,
		next_payment,
		notify
	};
	if (category_id != null) data.category_id = category_id;
	if (payment_method_id != null) data.payment_method_id = payment_method_id;
	if (notify_days_before !== undefined) data.notify_days_before = notify_days_before;
	if (url) data.url = url;
	if (notes) data.notes = notes;
	return { ok: true, data };
}

export function toWallosFields(data: ValidatedSubscriptionInput, editing = false): Record<string, string> {
	const fields: Record<string, string> = {
		name: data.name,
		price: String(data.price),
		currency_id: String(data.currency_id),
		frequency: String(data.frequency),
		cycle: String(data.cycle),
		next_payment: data.next_payment,
		notify: String(data.notify)
	};
	if (data.category_id !== undefined) fields.category_id = String(data.category_id);
	if (data.payment_method_id !== undefined)
		fields.payment_method_id = String(data.payment_method_id);
	if (data.notify_days_before !== undefined)
		fields.notify_days_before = String(data.notify_days_before);
	if (data.url !== undefined) fields.url = data.url;
	if (data.notes !== undefined) fields.notes = data.notes;
	// Omission preserves upstream values on edit; explicit empties clear them.
	return editing ? {
		category_id: '', payment_method_id: '', notify_days_before: '', url: '', notes: '', ...fields
	} : fields;
}
