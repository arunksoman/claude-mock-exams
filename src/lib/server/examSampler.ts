import type { Client } from '@libsql/client';
import type { Certification, Difficulty, Domain, QuestionFull } from '$lib/types';
import { shuffle } from '$lib/shuffle';
import {
	buildSampleStatement,
	getChoicesForQuestionIds,
	getDomainDifficultyCounts,
	mapQuestionRow,
	sampleQuestions
} from './queries';

/**
 * Largest-remainder proportional allocation: distributes `total` items across weighted
 * buckets so per-bucket counts sum to exactly `total`, with no rounding drift. Reused for
 * both allocation layers below — domain weights and, within each domain, difficulty weights.
 */
function allocateProportional<K>(weights: Map<K, number>, total: number): Map<K, number> {
	const totalWeight = [...weights.values()].reduce((sum, w) => sum + w, 0);
	if (totalWeight <= 0 || total <= 0) return new Map();

	const entries = [...weights.entries()].map(([key, weight]) => {
		const raw = (weight / totalWeight) * total;
		return { key, base: Math.floor(raw), remainder: raw - Math.floor(raw) };
	});

	const allocation = new Map<K, number>(entries.map((e) => [e.key, e.base]));
	let shortfall = total - entries.reduce((sum, e) => sum + e.base, 0);

	const byRemainderDesc = [...entries].sort((a, b) => b.remainder - a.remainder);
	for (let i = 0; shortfall > 0 && byRemainderDesc.length > 0; i++, shortfall--) {
		const target = byRemainderDesc[i % byRemainderDesc.length];
		allocation.set(target.key, (allocation.get(target.key) ?? 0) + 1);
	}

	return allocation;
}

/**
 * Samples a mock-exam question set entirely via SQL — never loads the question bank into
 * memory, so cost stays proportional to exam_question_count regardless of how large the bank
 * grows over time.
 *
 * Two layers of proportional allocation, both driven by live DB data rather than fixed
 * constants:
 *  1. Domain — exam_question_count is split across domains by weight_percentage, matching
 *     the real exam blueprint (unchanged from before).
 *  2. Difficulty — each domain's slice is further split across difficulty levels
 *     proportional to that domain's *actual* published-question counts per difficulty, so a
 *     domain skewed toward "medium" naturally draws mostly medium questions. This is
 *     self-adjusting: it stays correct automatically as questions are added or rebalanced,
 *     with no hardcoded difficulty mix to maintain.
 *
 * Since (domain, difficulty) partitions the table with no overlap between buckets, every
 * bucket's `ORDER BY RANDOM() LIMIT n` draw is independent — they're all sent together as one
 * batched round trip. Any shortfall (a bucket without enough published questions) is topped
 * up by a single unfiltered backfill draw afterward, excluding whatever was already picked.
 */
export async function sampleExamQuestions(
	client: Client,
	certification: Certification,
	domains: Domain[]
): Promise<QuestionFull[]> {
	const total = certification.examQuestionCount;

	const domainAllocation = allocateProportional(
		new Map(domains.map((d) => [d.id, d.weightPercentage])),
		total
	);
	const difficultyCounts = await getDomainDifficultyCounts(client, certification.id);

	const statements: { sql: string; args: (string | number)[] }[] = [];
	for (const domain of domains) {
		const domainCount = domainAllocation.get(domain.id) ?? 0;
		if (domainCount === 0) continue;

		const availableByDifficulty = difficultyCounts.get(domain.id) ?? new Map<Difficulty, number>();
		const difficultyAllocation = allocateProportional(availableByDifficulty, domainCount);

		for (const [difficulty, count] of difficultyAllocation) {
			if (count === 0) continue;
			statements.push(
				buildSampleStatement(
					{ certificationId: certification.id, domainIds: [domain.id], difficulties: [difficulty] },
					count
				)
			);
		}
	}

	const results = statements.length > 0 ? await client.batch(statements, 'read') : [];
	const primaryRows = results.flatMap((rs) => rs.rows.map(mapQuestionRow));

	const choicesByQuestion = await getChoicesForQuestionIds(
		client,
		primaryRows.map((r) => r.id)
	);
	let selected: QuestionFull[] = primaryRows.map((r) => ({
		...r,
		choices: choicesByQuestion.get(r.id) ?? []
	}));

	if (selected.length < total) {
		const backfill = await sampleQuestions(
			client,
			{ certificationId: certification.id, excludeIds: selected.map((q) => q.id) },
			total - selected.length
		);
		selected = [...selected, ...backfill];
	}

	return shuffle(selected);
}
