<script lang="ts">
	import { enhance } from '$app/forms';
	let { data, values, action }: {
		data: {
			categories: { id: number; name: string }[];
			paymentMethods: { id: number; name: string }[];
			currencies: { id: number; code: string; symbol: string }[];
			referencesUnavailable?: boolean;
		};
		values: Record<string, string>;
		action: string;
	} = $props();
	let pending = $state(false);
	let notifyOn = $derived((values.notify ?? '1') === '1' || values.notify === 'on');
</script>

<form method="POST" {action} use:enhance={({ cancel }) => {
	if (pending) { cancel(); return; }
	pending = true;
	return async ({ update }) => {
		try { await update(); } finally { pending = false; }
	};
}} class="mt-6">
	{#if data.referencesUnavailable}
		<p role="status" class="rounded-[var(--radius-control)] border border-border bg-primary/5 px-4 py-3 text-sm text-muted-foreground">Reference data is unavailable. Submitted selections are preserved by ID.</p>
	{/if}
	<fieldset class="card card-pad">
		<legend class="px-2 text-sm font-semibold text-muted-foreground">Billing</legend>
		<div class="flex flex-col gap-4">
	<label class="flex flex-col gap-2 text-base font-medium">
		Name
		<input
			name="name"
			required
			autocomplete="off"
			maxlength="200"
			value={values.name ?? ''}
			class="field-control"
			placeholder="Netflix"
		/>
	</label>
	<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
		<label class="flex min-w-0 flex-col gap-2 text-base font-medium">
			Price
			<input
				name="price"
				type="number"
				step="0.01"
				min="0"
				required
				inputmode="decimal"
				value={values.price ?? ''}
				class="field-control tabular-nums"
				placeholder="12.99"
			/>
		</label>
		<label class="flex min-w-0 flex-col gap-2 text-base font-medium">
			Currency
			<select
				name="currency_id"
				required
				value={values.currency_id ?? ''}
				class="field-control"
			>
				<option value="">Select</option>
				{#if data.referencesUnavailable && values.currency_id}
				<option value={values.currency_id}>Currency ID {values.currency_id}</option>
			{/if}
			{#each data.currencies as c (c.id)}
				<option value={String(c.id)}>{c.code}</option>
			{/each}
			</select>
		</label>
	</div>
	<div role="group" aria-labelledby="billing-interval" class="min-w-0">
		<p id="billing-interval" class="mb-2 text-base font-medium">Billing interval</p>
		<div class="flex items-center gap-3">
			<span>Every</span>
			<label class="w-20 min-w-0 shrink-0 sm:w-24">
				<span class="sr-only">Repeat every</span>
				<input
					name="frequency"
					type="number"
					min="1"
					step="1"
					required
					inputmode="numeric"
					value={values.frequency ?? ''}
					class="field-control tabular-nums"
				/>
			</label>
			<label class="min-w-0 flex-1 sm:max-w-48">
				<span class="sr-only">Period unit</span>
				<select
					name="cycle"
					required
					value={values.cycle ?? ''}
					class="field-control"
				>
					<option value="">Select</option>
					{#if values.cycle && !['1', '2', '3', '4'].includes(values.cycle)}
						<option value={values.cycle}>Invalid selection ({values.cycle})</option>
					{/if}
					<option value="1">Days</option>
					<option value="2">Weeks</option>
					<option value="3">Months</option>
					<option value="4">Years</option>
				</select>
			</label>
		</div>
	</div>
	<label class="flex flex-col gap-2 text-base font-medium">
		Next payment
		<input
			name="next_payment"
			type="date"
			required
			value={values.next_payment ?? ''}
			class="field-control"
		/>
	</label>
		</div>
	</fieldset>
	<fieldset class="card card-pad mt-5">
		<legend class="px-2 text-sm font-semibold text-muted-foreground">Organization <span class="font-normal">(optional)</span></legend>
		<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
		<label class="flex min-w-0 flex-col gap-2 text-base font-medium">
			Category
			<select
				name="category_id"
				value={values.category_id ?? ''}
				class="field-control"
			>
				<option value="">None</option>
				{#if data.referencesUnavailable && values.category_id}
				<option value={values.category_id}>Category ID {values.category_id}</option>
			{/if}
			{#each data.categories as c (c.id)}
					<option value={String(c.id)}>{c.name}</option>
				{/each}
			</select>
		</label>
		<label class="flex min-w-0 flex-col gap-2 text-base font-medium">
			Payment method
			<select
				name="payment_method_id"
				value={values.payment_method_id ?? ''}
				class="field-control"
			>
				<option value="">None</option>
				{#if data.referencesUnavailable && values.payment_method_id}
				<option value={values.payment_method_id}>Payment method ID {values.payment_method_id}</option>
			{/if}
			{#each data.paymentMethods as m (m.id)}
					<option value={String(m.id)}>{m.name}</option>
				{/each}
			</select>
		</label>
		</div>
	</fieldset>
	<fieldset class="card card-pad mt-5">
		<legend class="px-2 text-sm font-semibold text-muted-foreground">Reminder &amp; notes <span class="font-normal">(optional)</span></legend>
		<div class="flex flex-col gap-4">
			<div class="flex flex-wrap items-center gap-x-4 gap-y-3">
				<input
					id="notify"
					name="notify"
					type="checkbox"
					checked={notifyOn}
					class="size-6 shrink-0 accent-[var(--primary)]"
				/>
				<label for="notify" class="inline-flex min-h-12 flex-1 items-center text-base font-medium">Reminder</label>
				<div class="flex w-full flex-col gap-2 sm:w-auto">
					<label for="reminder-days" class="text-sm font-medium">Days before payment</label>
					<input
						id="reminder-days"
						name="notify_days_before"
						type="number"
						min="0"
						max="365"
						inputmode="numeric"
						aria-label="Reminder days before"
						value={values.notify_days_before ?? '7'}
						class="field-control sm:w-40"
					/>
				</div>
			</div>
			<label class="flex flex-col gap-2 text-base font-medium">
				URL
				<input
					name="url"
					type="url"
					inputmode="url"
					maxlength="2048"
					value={values.url ?? ''}
					class="field-control"
					placeholder="https://example.com"
				/>
			</label>
			<label class="flex flex-col gap-2 text-base font-medium">
				Notes
				<textarea
					name="notes"
					rows="3"
					maxlength="5000"
					value={values.notes ?? ''}
					class="field-control min-h-28 resize-y py-3"
					placeholder="Plan, renewal terms, cancellation notes"
				></textarea>
			</label>
		</div>
	</fieldset>
	<button
		type="submit" disabled={pending} aria-busy={pending}
		class="primary-action primary-action-inline mt-5"
	>
		{pending ? 'Saving…' : 'Save'}
	</button>
</form>
