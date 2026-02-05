// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// https://astro.build/config
export default defineConfig({
	integrations: [
		starlight({
			title: 'PubSubJS',
			description: 'Type-safe, schema-validated pub/sub for TypeScript',
			social: [
				{ icon: 'github', label: 'GitHub', href: 'https://github.com/pubsubjs/pubsubjs' },
			],
			sidebar: [
				{
					label: 'Getting Started',
					items: [
						{ label: 'Introduction', slug: 'getting-started/introduction' },
						{ label: 'Installation', slug: 'getting-started/installation' },
						{ label: 'Quick Start', slug: 'getting-started/quick-start' },
					],
				},
				{
					label: 'Changelog',
					link: '/changelog/',
				},
				{
					label: 'Core Concepts',
					items: [
						{ label: 'Events & Schemas', slug: 'concepts/events' },
						{ label: 'Attributes & Filtering', slug: 'concepts/attributes-filtering' },
						{ label: 'Publisher', slug: 'concepts/publisher' },
						{ label: 'Subscriber', slug: 'concepts/subscriber' },
						{ label: 'Transports', slug: 'concepts/transports' },
						{ label: 'Middleware', slug: 'concepts/middleware' },
						{ label: 'Context', slug: 'concepts/context' },
					],
				},
				{
					label: 'Transports',
					items: [
						{ label: 'Overview', slug: 'transports/overview' },
						{ label: 'WebSocket', slug: 'transports/websocket' },
						{ label: 'Redis', slug: 'transports/redis' },
						{ label: 'SSE', slug: 'transports/sse' },
						{ label: 'Custom Transports', slug: 'transports/custom' },
					],
				},
				{
					label: 'React Integration',
					items: [
						{ label: 'Setup', slug: 'react/setup' },
						{ label: 'Hooks', slug: 'react/hooks' },
						{ label: 'Examples', slug: 'react/examples' },
					],
				},
				{
					label: 'Advanced',
					items: [
						{ label: 'Error Handling', slug: 'advanced/error-handling' },
						{ label: 'Testing', slug: 'advanced/testing' },
						{ label: 'TypeScript', slug: 'advanced/typescript' },
					],
				},
				{
					label: 'API Reference',
					autogenerate: { directory: 'reference' },
				},
			],
			customCss: ['./src/styles/custom.css'],
		}),
	],
});
