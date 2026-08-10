export interface DomainMeta {
	code: string;
	title: string;
	weight?: number;
}

/** Display/reading order — matches the CCDV-F exam blueprint, overview first. */
export const DOMAIN_ORDER = [
	'overview',
	'applications-integration',
	'model-selection-optimization',
	'agents-workflows',
	'prompt-context-engineering',
	'tools-mcps',
	'security-safety',
	'claude-code',
	'eval-testing-debugging'
];

const TITLES: Record<string, string> = {
	overview: 'Exam Overview & Study Strategy',
	'applications-integration': 'Applications & Integration',
	'model-selection-optimization': 'Model Selection & Optimization',
	'agents-workflows': 'Agents & Workflows',
	'prompt-context-engineering': 'Prompt & Context Engineering',
	'tools-mcps': 'Tools & MCPs',
	'security-safety': 'Security & Safety',
	'claude-code': 'Claude Code',
	'eval-testing-debugging': 'Eval, Testing & Debugging'
};

const WEIGHTS: Record<string, number> = {
	'applications-integration': 33.1,
	'model-selection-optimization': 16.8,
	'agents-workflows': 14.7,
	'prompt-context-engineering': 11.0,
	'tools-mcps': 10.6,
	'security-safety': 8.1,
	'claude-code': 3.1,
	'eval-testing-debugging': 2.6
};

export function titleFor(code: string): string {
	return TITLES[code] ?? code;
}

export function weightFor(code: string): number | undefined {
	return WEIGHTS[code];
}

export const DOMAINS: DomainMeta[] = DOMAIN_ORDER.map((code) => ({
	code,
	title: titleFor(code),
	weight: weightFor(code)
}));
