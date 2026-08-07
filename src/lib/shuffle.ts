export function shuffle<T>(items: T[]): T[] {
	const result = items.slice();
	for (let i = result.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[result[i], result[j]] = [result[j], result[i]];
	}
	return result;
}

/**
 * Source data lists choices with the correct one first (sort_order 0). Every endpoint that
 * serves questions to the client MUST shuffle choice order per-request — otherwise choice
 * position alone leaks the answer, even when is_correct/reasoning are stripped.
 */
export function shuffleQuestionChoices<T extends { choices: unknown[] }>(question: T): T {
	return { ...question, choices: shuffle(question.choices) };
}
