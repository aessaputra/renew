import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import * as oidc from 'openid-client';
import { isValidHttpsOrigin, isValidIssuer } from './auth-state';

const DISCOVERY_TIMEOUT_SECONDS = 10;

export interface ServerConfig {
	origin: string;
	allowedSub: string;
	configuration: oidc.Configuration;
}

export interface LoginChallenge {
	url: string;
	state: string;
	nonce: string;
	codeVerifier: string;
}

let cached: ServerConfig | null = null;
let pending: Promise<ServerConfig> | null = null;

function readConfigInputs(): {
	origin: string;
	issuer: string;
	clientId: string;
	clientSecret: string;
	allowedSub: string;
} | null {
	const origin = env.ORIGIN;
	const issuer = env.OIDC_ISSUER;
	const clientId = env.OIDC_CLIENT_ID;
	const clientSecret = env.OIDC_CLIENT_SECRET;
	const allowedSub = env.OIDC_ALLOWED_SUB;
	if (!origin || !issuer || !clientId || !clientSecret || !allowedSub) return null;
	if (!isValidHttpsOrigin(origin, dev)) return null;
	if (!isValidIssuer(issuer)) return null;
	return { origin, issuer, clientId, clientSecret, allowedSub };
}

function selectClientAuth(
	methods: readonly string[] | undefined,
	clientSecret: string
): oidc.ClientAuth {
	if (!methods || methods.length === 0) return oidc.ClientSecretBasic(clientSecret);
	if (methods.includes('client_secret_post')) return oidc.ClientSecretPost(clientSecret);
	if (methods.includes('client_secret_basic')) return oidc.ClientSecretBasic(clientSecret);
	throw new Error('unavailable');
}

async function discover(): Promise<ServerConfig> {
	const inputs = readConfigInputs();
	if (!inputs) throw new Error('unavailable');
	const discovered = await oidc.discovery(new URL(inputs.issuer), inputs.clientId, undefined, undefined, {
		timeout: DISCOVERY_TIMEOUT_SECONDS
	});
	const metadata = discovered.serverMetadata();
	const clientAuth = selectClientAuth(metadata.token_endpoint_auth_methods_supported, inputs.clientSecret);
	const configuration = new oidc.Configuration(
		metadata,
		inputs.clientId,
		{ client_secret: inputs.clientSecret },
		clientAuth
	);
	configuration.timeout = DISCOVERY_TIMEOUT_SECONDS;
	oidc.enableNonRepudiationChecks(configuration);
	return { origin: inputs.origin, allowedSub: inputs.allowedSub, configuration };
}

export function getServerConfig(): Promise<ServerConfig> {
	if (cached) return Promise.resolve(cached);
	if (pending) return pending;
	pending = discover().then(
		(config) => {
			cached = config;
			pending = null;
			return config;
		},
		(error) => {
			pending = null;
			throw error;
		}
	);
	return pending;
}

export function discardServerConfig(): void {
	cached = null;
}

export async function buildLoginChallenge(config: ServerConfig): Promise<LoginChallenge> {
	const state = oidc.randomState();
	const nonce = oidc.randomNonce();
	const codeVerifier = oidc.randomPKCECodeVerifier();
	const codeChallenge = await oidc.calculatePKCECodeChallenge(codeVerifier);
	const url = oidc.buildAuthorizationUrl(config.configuration, {
		scope: 'openid',
		response_type: 'code',
		response_mode: 'query',
		redirect_uri: `${config.origin}/auth/callback`,
		state,
		nonce,
		code_challenge: codeChallenge,
		code_challenge_method: 'S256'
	});
	return { url: url.toString(), state, nonce, codeVerifier };
}

export async function exchangeCallback(
	config: ServerConfig,
	callbackUrl: URL,
	checks: { pkceCodeVerifier: string; expectedState: string; expectedNonce: string }
): Promise<string> {
	let tokens: oidc.TokenEndpointResponse & oidc.TokenEndpointResponseHelpers;
	try {
		tokens = await oidc.authorizationCodeGrant(config.configuration, callbackUrl, {
			pkceCodeVerifier: checks.pkceCodeVerifier,
			expectedState: checks.expectedState,
			expectedNonce: checks.expectedNonce,
			idTokenExpected: true
		});
	} catch {
		throw new Error('failed');
	}
	const sub = tokens.claims()?.sub;
	if (typeof sub !== 'string' || sub !== config.allowedSub) {
		throw new Error(typeof sub === 'string' && sub.length > 0 ? 'denied' : 'failed');
	}
	return sub;
}

