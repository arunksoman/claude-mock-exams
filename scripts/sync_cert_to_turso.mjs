// One-off migration: copy a certification's rows (cert, domains, topics, tags,
// questions, choices, question_tags) from the local sqlite build to Turso Cloud,
// remapping autoincrement ids since they differ between the two databases.
//
// Usage: node scripts/sync_cert_to_turso.mjs CCAR-F
//
// Not part of the normal import.py workflow — this exists because import.py only
// ever writes to the local db/claude-mock-exams.db file (see CONTEXT_MAP.md's
// "Known gaps": there's no automated local -> Turso sync).

import { createClient } from '@libsql/client';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

function loadEnv() {
	const text = readFileSync(join(root, '.env'), 'utf-8');
	const env = {};
	for (const line of text.split('\n')) {
		const m = line.replace(/\r$/, '').match(/^([A-Z_]+)=(.*)$/);
		if (m) env[m[1]] = m[2].trim();
	}
	return env;
}

const certCode = process.argv[2];
if (!certCode) {
	console.error('Usage: node scripts/sync_cert_to_turso.mjs <CERT_CODE>');
	process.exit(1);
}

const env = loadEnv();
const local = createClient({ url: `file:${join(root, 'db', 'claude-mock-exams.db')}` });
const remote = createClient({ url: env.TURSO_URL, authToken: env.TURSO_TOKEN });

async function main() {
	const certRow = (await local.execute({ sql: 'SELECT * FROM certifications WHERE code = ?', args: [certCode] })).rows[0];
	if (!certRow) throw new Error(`No local certification row for ${certCode}`);

	const existing = await remote.execute({ sql: 'SELECT id FROM certifications WHERE code = ?', args: [certCode] });
	if (existing.rows.length > 0) {
		console.log(`Remote already has ${certCode} (id=${existing.rows[0].id}) — deleting it first for a clean resync.`);
		await remote.execute({ sql: 'DELETE FROM certifications WHERE id = ?', args: [existing.rows[0].id] });
	}

	const certRes = await remote.execute({
		sql: `INSERT INTO certifications (code, name, vendor, description, exam_question_count, exam_duration_minutes, passing_score, max_score)
		      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		args: [certRow.code, certRow.name, certRow.vendor, certRow.description, certRow.exam_question_count, certRow.exam_duration_minutes, certRow.passing_score, certRow.max_score]
	});
	const remoteCertId = Number(certRes.lastInsertRowid);
	console.log(`Inserted certification ${certCode} -> remote id ${remoteCertId}`);

	const localDomains = (await local.execute({ sql: 'SELECT * FROM domains WHERE certification_id = ?', args: [certRow.id] })).rows;
	const domainIdMap = new Map();
	for (const d of localDomains) {
		const res = await remote.execute({
			sql: `INSERT INTO domains (certification_id, code, name, weight_percentage, description, sort_order) VALUES (?, ?, ?, ?, ?, ?)`,
			args: [remoteCertId, d.code, d.name, d.weight_percentage, d.description, d.sort_order]
		});
		domainIdMap.set(d.id, Number(res.lastInsertRowid));
	}
	console.log(`Inserted ${localDomains.length} domains`);

	const localDomainIds = localDomains.map((d) => d.id);
	let localTopics = [];
	if (localDomainIds.length > 0) {
		const placeholders = localDomainIds.map(() => '?').join(',');
		localTopics = (await local.execute({ sql: `SELECT * FROM topics WHERE domain_id IN (${placeholders})`, args: localDomainIds })).rows;
	}
	const topicIdMap = new Map();
	for (const t of localTopics) {
		const res = await remote.execute({
			sql: `INSERT INTO topics (domain_id, name, description) VALUES (?, ?, ?)`,
			args: [domainIdMap.get(t.domain_id), t.name, t.description]
		});
		topicIdMap.set(t.id, Number(res.lastInsertRowid));
	}
	console.log(`Inserted ${localTopics.length} topics`);

	const localQuestions = (await local.execute({ sql: 'SELECT * FROM questions WHERE certification_id = ?', args: [certRow.id] })).rows;
	const questionIdMap = new Map();
	let qCount = 0;
	for (const q of localQuestions) {
		const res = await remote.execute({
			sql: `INSERT INTO questions (certification_id, domain_id, topic_id, external_key, question_type, difficulty, stem, select_count, explanation, reference, status)
			      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			args: [
				remoteCertId,
				domainIdMap.get(q.domain_id),
				q.topic_id ? topicIdMap.get(q.topic_id) : null,
				q.external_key,
				q.question_type,
				q.difficulty,
				q.stem,
				q.select_count,
				q.explanation,
				q.reference,
				q.status
			]
		});
		questionIdMap.set(q.id, Number(res.lastInsertRowid));
		qCount++;
	}
	console.log(`Inserted ${qCount} questions`);

	const localQuestionIds = localQuestions.map((q) => q.id);
	let choiceCount = 0;
	let tagLinkCount = 0;
	// Tags are shared/global by name across certs — get-or-create against remote's tags table.
	const remoteTagIdByName = new Map();
	for (const localQ of localQuestions) {
		const remoteQId = questionIdMap.get(localQ.id);

		const choices = (await local.execute({ sql: 'SELECT * FROM choices WHERE question_id = ? ORDER BY sort_order', args: [localQ.id] })).rows;
		for (const c of choices) {
			await remote.execute({
				sql: `INSERT INTO choices (question_id, label, is_correct, reasoning, sort_order) VALUES (?, ?, ?, ?, ?)`,
				args: [remoteQId, c.label, c.is_correct, c.reasoning, c.sort_order]
			});
			choiceCount++;
		}

		const tagRows = (await local.execute({
			sql: `SELECT t.name FROM tags t JOIN question_tags qt ON qt.tag_id = t.id WHERE qt.question_id = ?`,
			args: [localQ.id]
		})).rows;
		for (const t of tagRows) {
			let remoteTagId = remoteTagIdByName.get(t.name);
			if (!remoteTagId) {
				const existingTag = await remote.execute({ sql: 'SELECT id FROM tags WHERE name = ?', args: [t.name] });
				if (existingTag.rows.length > 0) {
					remoteTagId = Number(existingTag.rows[0].id);
				} else {
					const res = await remote.execute({ sql: 'INSERT INTO tags (name) VALUES (?)', args: [t.name] });
					remoteTagId = Number(res.lastInsertRowid);
				}
				remoteTagIdByName.set(t.name, remoteTagId);
			}
			await remote.execute({
				sql: 'INSERT OR IGNORE INTO question_tags (question_id, tag_id) VALUES (?, ?)',
				args: [remoteQId, remoteTagId]
			});
			tagLinkCount++;
		}
	}
	console.log(`Inserted ${choiceCount} choices, ${tagLinkCount} question_tags links across ${remoteTagIdByName.size} distinct tags`);

	// Sanity check against v_question_summary on the remote.
	const summary = await remote.execute({
		sql: `SELECT COUNT(*) as n, SUM(CASE WHEN choice_count != 6 OR correct_choice_count != 1 THEN 1 ELSE 0 END) as bad
		      FROM v_question_summary WHERE certification_id = ?`,
		args: [remoteCertId]
	});
	console.log('Remote sanity check:', summary.rows[0]);
}

main()
	.then(() => {
		console.log('Sync complete.');
		process.exit(0);
	})
	.catch((err) => {
		console.error(err);
		process.exit(1);
	});
