import type { Difficulty } from './types';

export const DEFAULT_CERT_CODE = 'CCDV-F';

export const STORAGE_KEYS = {
	theme: 'ccdvf:v1:theme',
	practiceInProgress: 'ccdvf:v1:practice:inProgress',
	examInProgress: 'ccdvf:v1:exam:inProgress',
	history: 'ccdvf:v1:history'
} as const;

export const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'intermediate', 'difficult'];

export const PRACTICE_COUNT_PRESETS = [10, 20, 50, 100] as const;

export const PRACTICE_MAX_COUNT = 100;

export const MAX_HISTORY_ENTRIES = 50;
