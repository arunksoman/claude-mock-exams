import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { ADMIN_USER, ADMIN_PASS, ADMIN_SESSION_SECRET } from '$env/static/private';

export const ADMIN_SESSION_COOKIE = 'ccdvf_admin_session';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

/** Fixed-length hash comparison so mismatched-length inputs don't create a timing side
 *  channel — a plain string/Buffer compare on unequal lengths returns early. */
function safeEqual(a: string, b: string): boolean {
	const hashA = createHash('sha256').update(a).digest();
	const hashB = createHash('sha256').update(b).digest();
	return timingSafeEqual(hashA, hashB);
}

export function verifyAdminCredentials(username: string, password: string): boolean {
	return safeEqual(username, ADMIN_USER) && safeEqual(password, ADMIN_PASS);
}

function sign(payload: string): string {
	return createHmac('sha256', ADMIN_SESSION_SECRET).update(payload).digest('hex');
}

/**
 * Stateless signed session token: `${expiresAt}.${hmac}`. No server-side session store is
 * needed (and none would reliably survive across serverless instances anyway) — the cookie
 * is self-verifying via HMAC, using a secret that's separate from the login password itself.
 */
export function createSessionToken(): string {
	const expiresAt = String(Date.now() + SESSION_TTL_MS);
	return `${expiresAt}.${sign(expiresAt)}`;
}

export function verifySessionToken(token: string | undefined): boolean {
	if (!token) return false;
	const [expiresAt, signature] = token.split('.');
	if (!expiresAt || !signature) return false;
	if (!safeEqual(signature, sign(expiresAt))) return false;
	const expiresAtMs = Number(expiresAt);
	return Number.isFinite(expiresAtMs) && Date.now() < expiresAtMs;
}
