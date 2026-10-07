import { defineEnvVars } from '@sveltejs/kit/env';

export const variables = defineEnvVars({
	ORIGIN: { schema: (input) => input ?? '' },
	OIDC_ISSUER: { schema: (input) => input ?? '' },
	OIDC_CLIENT_ID: { schema: (input) => input ?? '' },
	OIDC_CLIENT_SECRET: { schema: (input) => input ?? '' },
	OIDC_ALLOWED_SUB: { schema: (input) => input ?? '' },
	SESSION_SECRET: { schema: (input) => input ?? '' },
	WALLOS_BASE_URL: { schema: (input) => input ?? '' },
	WALLOS_API_KEY: { schema: (input) => input ?? '' }
});
