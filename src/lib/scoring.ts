import type {
	Certification,
	Domain,
	GradedQuestion,
	DomainBreakdown,
	OverallScore,
	QuestionFull
} from './types';

function sameChoiceSet(a: number[], b: readonly number[]): boolean {
	if (a.length !== b.length) return false;
	const setB = new Set(b);
	return a.every((id) => setB.has(id));
}

/** Exact choice-set match grading — no partial credit, applies uniformly to every question type. */
export function isCorrectSelection(question: QuestionFull, selectedIds: number[]): boolean {
	const correctIds = question.choices.filter((c) => c.isCorrect).map((c) => c.id);
	return sameChoiceSet(selectedIds, correctIds);
}

export function buildGradedQuestion(question: QuestionFull, selectedIds: number[]): GradedQuestion {
	const selectedSet = new Set(selectedIds);
	return {
		id: question.id,
		domainId: question.domainId,
		questionType: question.questionType,
		selectCount: question.selectCount,
		stemHtml: question.stemHtml,
		explanationHtml: question.explanationHtml,
		correct: isCorrectSelection(question, selectedIds),
		choices: question.choices.map((c) => ({ ...c, selected: selectedSet.has(c.id) }))
	};
}

export function buildDomainBreakdown(
	graded: GradedQuestion[],
	domains: Domain[]
): DomainBreakdown[] {
	const domainById = new Map(domains.map((d) => [d.id, d]));
	const totals = new Map<number, { correct: number; total: number }>();

	for (const q of graded) {
		const entry = totals.get(q.domainId) ?? { correct: 0, total: 0 };
		entry.total += 1;
		if (q.correct) entry.correct += 1;
		totals.set(q.domainId, entry);
	}

	return [...totals.entries()]
		.map(([domainId, { correct, total }]) => {
			const domain = domainById.get(domainId);
			return {
				domainId,
				domainName: domain?.name ?? 'Unknown',
				weightPercentage: domain?.weightPercentage ?? 0,
				correct,
				total,
				pct: total > 0 ? Math.round((correct / total) * 100) : 0
			};
		})
		.sort((a, b) => b.weightPercentage - a.weightPercentage);
}

export function buildOverallScore(
	graded: GradedQuestion[],
	certification: Certification
): OverallScore {
	const correctCount = graded.filter((q) => q.correct).length;
	const totalQuestions = graded.length;
	const pct = totalQuestions > 0 ? correctCount / totalQuestions : 0;
	const scaledScore = Math.round(pct * certification.maxScore);
	return {
		correctCount,
		totalQuestions,
		pct: Math.round(pct * 100),
		scaledScore,
		passingScore: certification.passingScore,
		maxScore: certification.maxScore,
		passed: scaledScore >= certification.passingScore
	};
}
