export interface DomainMeta {
	code: string;
	title: string;
	weight?: number;
}

interface CertDomainConfig {
	/** Display/reading order — matches the exam blueprint, overview first. */
	order: string[];
	titles: Record<string, string>;
	weights: Record<string, number>;
}

const CERT_DOMAINS: Record<string, CertDomainConfig> = {
	'ccdv-f': {
		order: [
			'overview',
			'applications-integration',
			'model-selection-optimization',
			'agents-workflows',
			'prompt-context-engineering',
			'tools-mcps',
			'security-safety',
			'claude-code',
			'eval-testing-debugging'
		],
		titles: {
			overview: 'Exam Overview & Study Strategy',
			'applications-integration': 'Applications & Integration',
			'model-selection-optimization': 'Model Selection & Optimization',
			'agents-workflows': 'Agents & Workflows',
			'prompt-context-engineering': 'Prompt & Context Engineering',
			'tools-mcps': 'Tools & MCPs',
			'security-safety': 'Security & Safety',
			'claude-code': 'Claude Code',
			'eval-testing-debugging': 'Eval, Testing & Debugging'
		},
		weights: {
			'applications-integration': 33.1,
			'model-selection-optimization': 16.8,
			'agents-workflows': 14.7,
			'prompt-context-engineering': 11.0,
			'tools-mcps': 10.6,
			'security-safety': 8.1,
			'claude-code': 3.1,
			'eval-testing-debugging': 2.6
		}
	},
	'ccar-f': {
		order: [
			'overview',
			'agentic-architecture',
			'claude-code-config',
			'prompt-structured-output',
			'tool-design-mcp',
			'context-management-reliability'
		],
		titles: {
			overview: 'Exam Overview & Study Strategy',
			'agentic-architecture': 'Agentic Architecture & Orchestration',
			'claude-code-config': 'Claude Code Configuration & Workflows',
			'prompt-structured-output': 'Prompt Engineering & Structured Output',
			'tool-design-mcp': 'Tool Design & MCP Integration',
			'context-management-reliability': 'Context Management & Reliability'
		},
		weights: {
			'agentic-architecture': 27,
			'claude-code-config': 20,
			'prompt-structured-output': 20,
			'tool-design-mcp': 18,
			'context-management-reliability': 15
		}
	}
};

function configFor(cert: string): CertDomainConfig {
	return CERT_DOMAINS[cert] ?? { order: [], titles: {}, weights: {} };
}

export function domainOrderFor(cert: string): string[] {
	return configFor(cert).order;
}

export function titleFor(cert: string, code: string): string {
	return configFor(cert).titles[code] ?? code;
}

export function weightFor(cert: string, code: string): number | undefined {
	return configFor(cert).weights[code];
}

export function domainsFor(cert: string): DomainMeta[] {
	return domainOrderFor(cert).map((code) => ({
		code,
		title: titleFor(cert, code),
		weight: weightFor(cert, code)
	}));
}
