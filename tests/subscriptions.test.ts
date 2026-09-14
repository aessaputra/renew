import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
	filterSubscriptions,
	safeSubscriptionUrl,
	subscriptionFormValues,
	toWallosFields,
	validateSubscriptionInput,
	type SubscriptionRow
} from '../src/lib/wallos.ts';

function fd(entries: Record<string, string>): FormData {
	const form = new FormData();
	for (const [k, v] of Object.entries(entries)) form.set(k, v);
	return form;
}

const valid = () => ({
	name: 'Netflix',
	price: '12.99',
	currency_id: '1',
	frequency: '1',
	cycle: '3',
	next_payment: '2026-10-01'
});

const row = (over: Partial<SubscriptionRow> = {}): SubscriptionRow => ({
	id: 1,
	name: 'Netflix',
	price: 12.99,
	currencyCode: 'EUR',
	next_payment: '2026-10-01',
	category_id: 2,
	category_name: 'Video',
	payment_method_id: 3,
	payment_method_name: 'Card',
	inactive: 0,
	...over
});

describe('validateSubscriptionInput', () => {
	it('accepts valid input', () => {
		const r = validateSubscriptionInput(fd(valid()));
		assert.equal(r.ok, true);
		if (r.ok) {
			assert.equal(r.data.name, 'Netflix');
			assert.equal(r.data.price, 12.99);
			assert.equal(r.data.notify, 0);
		}
	});

	it('rejects empty input with required errors', () => {
		const r = validateSubscriptionInput(fd({}));
		assert.equal(r.ok, false);
		if (!r.ok) {
			assert.ok(r.errors.length >= 5);
			assert.ok(r.errors.some((e) => e.includes('Name')));
			assert.ok(r.errors.some((e) => e.includes('Price')));
		}
	});

	it('rejects negative and non-numeric price', () => {
		for (const price of ['-5', 'abc', '0']) {
			const r = validateSubscriptionInput(fd({ ...valid(), price }));
			assert.equal(r.ok, false);
			if (!r.ok) assert.ok(r.errors.some((e) => e.includes('Price')));
		}
	});

	it('rejects bad date', () => {
		const r = validateSubscriptionInput(fd({ ...valid(), next_payment: 'not-a-date' }));
		assert.equal(r.ok, false);
	});

	it('rejects out-of-range reminder days', () => {
		for (const days of ['-1', '9999', 'abc']) {
			const r = validateSubscriptionInput(
				fd({ ...valid(), notify_days_before: days })
			);
			assert.equal(r.ok, false);
		}
		const ok = validateSubscriptionInput(fd({ ...valid(), notify_days_before: '7' }));
		assert.equal(ok.ok, true);
	});

	it('rejects bad url', () => {
		const r = validateSubscriptionInput(fd({ ...valid(), url: 'ftp://x' }));
		assert.equal(r.ok, false);
	});
});

describe('input trust boundaries', () => {
	it('rejects impossible dates and accepts leap days', () => {
		for (const next_payment of ['2026-02-30', '2026-13-01', '2025-02-29']) {
			assert.equal(validateSubscriptionInput(fd({ ...valid(), next_payment })).ok, false);
		}
		assert.equal(validateSubscriptionInput(fd({ ...valid(), next_payment: '2028-02-29' })).ok, true);
	});

	it('allows only non-credential HTTP URLs', () => {
		for (const url of ['javascript:alert(1)', 'data:text/html,test', 'https://', 'https://user:pass@example.com']) {
			assert.equal(safeSubscriptionUrl(url), '');
		}
		assert.equal(safeSubscriptionUrl('https://example.com'), 'https://example.com/');
	});

	it('rejects files and returns only string fields with an explicit unchecked reminder', () => {
		const form = fd(valid());
		form.set('notes', new File(['test'], 'note.txt'));
		form.set('unknown', 'not-reflected');
		assert.equal(validateSubscriptionInput(form).ok, false);
		const values = subscriptionFormValues(form);
		assert.equal(values.notify, '0');
		assert.equal(values.notes, '');
		assert.equal(values.unknown, undefined);
		assert.ok(Object.values(values).every((value) => typeof value === 'string'));
	});

	it('rejects duplicate and malformed optional fields', () => {
		const duplicate = fd(valid());
		duplicate.append('name', 'Other');
		assert.equal(validateSubscriptionInput(duplicate).ok, false);
		const invalid: Record<string, string>[] = [{ category_id: '-1' }, { payment_method_id: 'abc' }, { notify: '9' }];
		for (const fields of invalid) {
			assert.equal(validateSubscriptionInput(fd({ ...valid(), ...fields })).ok, false);
		}
	});

	it('serializes validated fields without credentials', () => {
		const result = validateSubscriptionInput(fd({ ...valid(), notify: '1', notify_days_before: '0' }));
		assert.ok(result.ok);
		const fields = toWallosFields(result.data);
		assert.equal(fields.notify, '1');
		assert.equal(fields.notify_days_before, '0');
		assert.equal(fields.price, '12.99');
		assert.equal(fields.api_key, undefined);
		assert.equal(toWallosFields(result.data, true).url, '');
		assert.equal(toWallosFields(result.data, true).notes, '');
		assert.equal(toWallosFields(result.data, true).category_id, '0');
	});
});

describe('filterSubscriptions', () => {
	const list = [
		row({ id: 1, name: 'Netflix' }),
		row({ id: 2, name: 'Spotify', category_id: 5 }),
		row({ id: 3, name: 'Old', inactive: 1 })
	];

	it('matches query case-insensitively', () => {
		const out = filterSubscriptions(list, { q: 'net', categoryId: '', paymentMethodId: '' });
		assert.deepEqual(out.map((s) => s.id), [1]);
	});

	it('intersects category and payment filters', () => {
		const out = filterSubscriptions(list, { q: '', categoryId: '5', paymentMethodId: '3' });
		assert.deepEqual(out.map((s) => s.id), [2]);
		const none = filterSubscriptions(list, {
			q: '',
			categoryId: '5',
			paymentMethodId: '99'
		});
		assert.deepEqual(none, []);
	});

	it('always hides inactive', () => {
		const out = filterSubscriptions(list, { q: 'old', categoryId: '', paymentMethodId: '' });
		assert.deepEqual(out, []);
	});
});
