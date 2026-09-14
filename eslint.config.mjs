import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
	js.configs.recommended,
	...tseslint.configs.recommended,
	...svelte.configs['flat/recommended'],
	{
		files: ['**/*.svelte'],
		languageOptions: {
			parserOptions: {
				parser: tseslint.parser
			}
		},
		// ponytail: single-language app, no `resolve()` i18n routing; re-enable if paragons/other i18n added.
		rules: {
			'svelte/no-navigation-without-resolve': 'off'
		}
	},
	{
		languageOptions: {
			globals: { ...globals.browser, ...globals.node }
		},
		rules: {
			'no-console': 'error'
		}
	},
	{
		ignores: ['build/', '.svelte-kit/', 'node_modules/']
	}
);
