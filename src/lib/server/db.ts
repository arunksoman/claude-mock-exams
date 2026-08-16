import { createClient } from '@libsql/client';
import { TURSO_URL, TURSO_TOKEN } from '$env/static/private';
import type { Certification, Domain } from '$lib/types';
import { DEFAULT_CERT_CODE } from '$lib/constants';
import { getCertificationByCode, getDomains } from './queries';

export interface CertMeta {
	certification: Certification;
	domains: Domain[];
}

export const dbClient = createClient({ url: TURSO_URL, authToken: TURSO_TOKEN });

// Keyed by certCode — the app now serves more than one certification (CCDV-F, CCAR-F), so a
// single unkeyed promise would let whichever cert loads first in a given server process poison
// the cache for every other cert's requests.
const metaPromises = new Map<string, Promise<CertMeta>>();

/**
 * Cheap fetch (certification row + domain rows) — used by the root layout, which runs on
 * every page load/navigation, and by anything else that just needs cert/domain metadata.
 *
 * Nothing in this app loads the full question bank into memory: practice sampling
 * (`$lib/server/queries.ts#sampleQuestions`) and exam sampling (`$lib/server/examSampler.ts`)
 * both query only the rows they actually need via `ORDER BY RANDOM() LIMIT n`, and exam
 * grading (`getQuestionsByIds`) fetches only the specific question ids being graded. Turso
 * row-read cost stays proportional to what's used per request, not to total bank size — so
 * it doesn't grow as more questions are added later.
 */
export function getCertMeta(certCode: string = DEFAULT_CERT_CODE): Promise<CertMeta> {
	let promise = metaPromises.get(certCode);
	if (!promise) {
		promise = loadCertMeta(certCode).catch((err) => {
			metaPromises.delete(certCode);
			throw err;
		});
		metaPromises.set(certCode, promise);
	}
	return promise;
}

async function loadCertMeta(certCode: string): Promise<CertMeta> {
	const certification = await getCertificationByCode(dbClient, certCode);
	const domains = await getDomains(dbClient, certification.id);
	return { certification, domains };
}
