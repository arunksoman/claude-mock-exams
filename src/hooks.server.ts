import { redirect, type Handle } from '@sveltejs/kit';
import { ADMIN_SESSION_COOKIE, verifySessionToken } from '$lib/server/adminAuth';

/**
 * Gate for the /admin surface. This MUST live in `handle`, not a +layout.server.ts load —
 * `handle` runs before form actions are invoked, whereas layout `load` functions only run
 * to render the page *after* an action's side effects have already happened. An auth check
 * in `load` alone would not stop an unauthenticated POST straight to an admin action.
 */
export const handle: Handle = async ({ event, resolve }) => {
	const { pathname } = event.url;

	if (pathname.startsWith('/admin')) {
		const authed = verifySessionToken(event.cookies.get(ADMIN_SESSION_COOKIE));
		const isLoginPage = pathname === '/admin/login';

		if (!authed && !isLoginPage) {
			redirect(303, '/admin/login');
		}
		if (authed && isLoginPage) {
			redirect(303, '/admin');
		}
	}

	return resolve(event);
};
