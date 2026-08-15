import { fail, redirect } from '@sveltejs/kit';
import { dev } from '$app/environment';
import {
	ADMIN_SESSION_COOKIE,
	createSessionToken,
	verifyAdminCredentials
} from '$lib/server/adminAuth';
import type { Actions } from './$types';

export const actions: Actions = {
	default: async ({ request, cookies }) => {
		const form = await request.formData();
		const username = String(form.get('username') ?? '');
		const password = String(form.get('password') ?? '');

		if (!verifyAdminCredentials(username, password)) {
			return fail(401, { error: 'Incorrect username or password.' });
		}

		cookies.set(ADMIN_SESSION_COOKIE, createSessionToken(), {
			path: '/admin',
			httpOnly: true,
			sameSite: 'lax',
			secure: !dev,
			maxAge: 60 * 60 * 12
		});

		redirect(303, '/admin/questions');
	}
};
