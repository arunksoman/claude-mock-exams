import { createClient } from '@libsql/client';
import { TURSO_URL, TURSO_TOKEN } from '$env/static/private';
import type { Certification, Domain, QuestionFull } from '$lib/types';
import { DEFAULT_CERT_CODE } from '$lib/constants';
import { getCertificationByCode, getDomains, getPublishedQuestionsWithChoices } from './queries';

export interface QuestionBank {
	certification: Certification;
	domains: Domain[];
	questions: QuestionFull[];
}

const client = createClient({ url: TURSO_URL, authToken: TURSO_TOKEN });

let bankPromise: Promise<QuestionBank> | null = null;

/**
 * Caches the full question bank in module scope for the lifetime of the server process
 * (valid because adapter-node runs one long-lived process) to avoid re-querying Turso,
 * whose free tier meters row reads, on every practice/exam request.
 */
export function getQuestionBank(certCode: string = DEFAULT_CERT_CODE): Promise<QuestionBank> {
	if (!bankPromise) {
		bankPromise = loadQuestionBank(certCode).catch((err) => {
			bankPromise = null;
			throw err;
		});
	}
	return bankPromise;
}

async function loadQuestionBank(certCode: string): Promise<QuestionBank> {
	const certification = await getCertificationByCode(client, certCode);
	const [domains, questions] = await Promise.all([
		getDomains(client, certification.id),
		getPublishedQuestionsWithChoices(client, certification.id)
	]);
	return { certification, domains, questions };
}
