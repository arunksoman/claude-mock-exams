import type { Domain, QuestionFull } from '$lib/types';
import type { QuestionBank } from './db';
import { shuffle } from '$lib/shuffle';

/**
 * Distributes `total` items across domains proportional to weight_percentage using the
 * largest-remainder method, so the per-domain counts sum to exactly `total` with no drift.
 */
function allocateByWeight(domains: Domain[], total: number): Map<number, number> {
	const entries = domains.map((d) => {
		const raw = (d.weightPercentage / 100) * total;
		return { id: d.id, base: Math.floor(raw), remainder: raw - Math.floor(raw) };
	});

	const allocation = new Map<number, number>(entries.map((e) => [e.id, e.base]));
	let shortfall = total - entries.reduce((sum, e) => sum + e.base, 0);

	const byRemainderDesc = [...entries].sort((a, b) => b.remainder - a.remainder);
	for (let i = 0; shortfall > 0 && byRemainderDesc.length > 0; i++, shortfall--) {
		const target = byRemainderDesc[i % byRemainderDesc.length];
		allocation.set(target.id, (allocation.get(target.id) ?? 0) + 1);
	}

	return allocation;
}

/**
 * Samples a mock-exam question set proportional to the certification's domain weights,
 * sized to exam_question_count. Falls back to backfilling from the remaining pool if a
 * domain doesn't have enough published questions to fill its allotment.
 */
export function sampleExamQuestions(bank: QuestionBank): QuestionFull[] {
	const total = bank.certification.examQuestionCount;

	const questionsByDomain = new Map<number, QuestionFull[]>();
	for (const question of bank.questions) {
		const list = questionsByDomain.get(question.domainId);
		if (list) list.push(question);
		else questionsByDomain.set(question.domainId, [question]);
	}

	const allocation = allocateByWeight(bank.domains, total);

	const selected: QuestionFull[] = [];
	for (const domain of bank.domains) {
		const count = allocation.get(domain.id) ?? 0;
		if (count === 0) continue;
		const pool = shuffle(questionsByDomain.get(domain.id) ?? []);
		selected.push(...pool.slice(0, count));
	}

	if (selected.length < total) {
		const usedIds = new Set(selected.map((q) => q.id));
		const backfillPool = shuffle(bank.questions.filter((q) => !usedIds.has(q.id)));
		for (const question of backfillPool) {
			if (selected.length >= total) break;
			selected.push(question);
		}
	}

	return shuffle(selected);
}
