/**
 * Test the WN-LMF XML parser against a real OMW dictionary file.
 * Requires: /tmp/omw-it/omw-it.xml (from downloading omw-it-1.4.tar.xz)
 *
 * Run with: node test/test-wn-lmf-parser.mjs
 */

import fs from "fs";
import { XMLParser } from "fast-xml-parser";

let passed = 0;
let failed = 0;

function assert(condition, message) {
	if (condition) {
		console.log(`  PASS: ${message}`);
		passed++;
	} else {
		console.error(`  FAIL: ${message}`);
		failed++;
	}
}

// Inline the parser logic (since we can't import .ts directly)
function parseWnLmf(xml, langCode) {
	const parser = new XMLParser({
		ignoreAttributes: false,
		attributeNamePrefix: "@_",
		isArray: (name) =>
			[
				"LexicalEntry",
				"Sense",
				"Synset",
				"Definition",
				"Example",
				"SynsetRelation",
				"SenseRelation",
			].includes(name),
	});

	const doc = parser.parse(xml);
	const lexicon = doc.LexicalResource.Lexicon;
	const version = lexicon["@_version"] ?? "1.0";

	function ensureArray(val) {
		if (val === undefined || val === null) return [];
		if (Array.isArray(val)) return val;
		return [val];
	}

	function mapPos(pos) {
		switch (pos) {
			case "n":
				return "noun";
			case "v":
				return "verb";
			case "a":
			case "s":
				return "adjective";
			case "r":
				return "adverb";
			default:
				return pos;
		}
	}

	const synsetMap = new Map();
	const synsets = ensureArray(lexicon.Synset);
	for (const synset of synsets) {
		const id = synset["@_id"];
		const pos = mapPos(synset["@_partOfSpeech"]);
		const membersStr = synset["@_members"] ?? "";
		const memberSenseIds = membersStr ? membersStr.split(/\s+/) : [];

		const defs = ensureArray(synset.Definition);
		let definition = "";
		if (defs.length > 0) {
			const d = defs[0];
			definition = typeof d === "string" ? d : d?.["#text"] ?? "";
		}

		const exs = ensureArray(synset.Example);
		const examples = [];
		for (const e of exs) {
			if (typeof e === "string") examples.push(e);
			else if (e?.["#text"]) examples.push(e["#text"]);
		}

		const rels = ensureArray(synset.SynsetRelation);
		const hypernyms = [];
		const hyponyms = [];
		for (const r of rels) {
			if (
				r["@_relType"] === "hypernym" ||
				r["@_relType"] === "instance_hypernym"
			)
				hypernyms.push(r["@_target"]);
			else if (
				r["@_relType"] === "hyponym" ||
				r["@_relType"] === "instance_hyponym"
			)
				hyponyms.push(r["@_target"]);
		}

		synsetMap.set(id, {
			id,
			pos,
			definition,
			examples,
			hypernyms,
			hyponyms,
			memberSenseIds,
		});
	}

	const synsetToWords = new Map();
	const entries = ensureArray(lexicon.LexicalEntry);
	for (const entry of entries) {
		const lemma = entry.Lemma;
		if (!lemma) continue;
		const writtenForm = lemma["@_writtenForm"];
		if (!writtenForm) continue;

		const senses = ensureArray(entry.Sense);
		for (const sense of senses) {
			const synsetId = sense["@_synset"];
			if (synsetId) {
				if (!synsetToWords.has(synsetId))
					synsetToWords.set(synsetId, []);
				synsetToWords.get(synsetId).push(writtenForm);
			}
		}
	}

	const index = {};
	for (const [synsetId, synsetData] of synsetMap) {
		const words = synsetToWords.get(synsetId) ?? [];
		if (words.length === 0) continue;

		const hypernymWords = [];
		for (const hid of synsetData.hypernyms.slice(0, 5)) {
			const w = synsetToWords.get(hid);
			if (w?.length > 0) hypernymWords.push(w[0]);
		}
		const hyponymWords = [];
		for (const hid of synsetData.hyponyms.slice(0, 5)) {
			const w = synsetToWords.get(hid);
			if (w?.length > 0) hyponymWords.push(w[0]);
		}

		const synsetEntry = {
			synset_id: synsetId,
			pos: synsetData.pos,
			definition: synsetData.definition,
			examples: synsetData.examples.slice(0, 3),
			synonyms: words,
			hypernyms: hypernymWords,
			hyponyms: hyponymWords,
		};

		for (const word of words) {
			const key = word.toLowerCase();
			if (!index[key]) index[key] = [];
			index[key].push(synsetEntry);
		}
	}

	return { version, language: langCode, index };
}

// ── Tests ──

const xmlPath = "/tmp/omw-it/omw-it.xml";
if (!fs.existsSync(xmlPath)) {
	console.error(
		`Test file not found: ${xmlPath}\nRun: cd /tmp && curl -sL https://github.com/omwn/omw-data/releases/download/v1.4/omw-it-1.4.tar.xz -o omw-it-1.4.tar.xz && tar xf omw-it-1.4.tar.xz`
	);
	process.exit(1);
}

console.log("=== WN-LMF Parser Tests (Italian) ===\n");

const xml = fs.readFileSync(xmlPath, "utf-8");
console.log(`XML size: ${(xml.length / 1024 / 1024).toFixed(1)} MB`);

const start = Date.now();
const result = parseWnLmf(xml, "it");
const elapsed = Date.now() - start;
console.log(`Parse time: ${elapsed}ms\n`);

// Test: basic structure
console.log("Test: Output structure");
assert(result.version === "1.4", `version is '${result.version}'`);
assert(result.language === "it", `language is '${result.language}'`);
assert(typeof result.index === "object", "index is an object");

const wordCount = Object.keys(result.index).length;
console.log(`\nTotal indexed words: ${wordCount}`);
assert(wordCount > 10000, `has >10k words (got ${wordCount})`);

// Test: lookup a known Italian word
console.log("\nTest: Known word lookup - 'cane'");
const cane = result.index["cane"];
if (cane) {
	assert(cane.length >= 1, `'cane' has ${cane.length} entries`);
	assert(cane[0].pos === "noun", `pos is noun`);
	assert(cane[0].synonyms.length >= 1, `has synonyms`);
	console.log(`  Definition: ${cane[0].definition || "(none)"}`);
	console.log(`  Synonyms: ${cane[0].synonyms.join(", ")}`);
} else {
	assert(false, "'cane' not found in index");
}

// Test: another word
console.log("\nTest: Known word lookup - 'casa'");
const casa = result.index["casa"];
if (casa) {
	assert(casa.length >= 1, `'casa' has ${casa.length} entries`);
	console.log(`  Definition: ${casa[0].definition || "(none)"}`);
	console.log(`  Synonyms: ${casa[0].synonyms.join(", ")}`);
} else {
	assert(false, "'casa' not found in index");
}

// Test: entry structure
console.log("\nTest: Entry field types");
const firstWord = Object.keys(result.index)[0];
const firstEntry = result.index[firstWord][0];
assert(typeof firstEntry.synset_id === "string", "synset_id is string");
assert(typeof firstEntry.pos === "string", "pos is string");
assert(typeof firstEntry.definition === "string", "definition is string");
assert(Array.isArray(firstEntry.examples), "examples is array");
assert(Array.isArray(firstEntry.synonyms), "synonyms is array");
assert(Array.isArray(firstEntry.hypernyms), "hypernyms is array");
assert(Array.isArray(firstEntry.hyponyms), "hyponyms is array");

// Test: JSON serialization size
console.log("\nTest: JSON output");
const jsonStr = JSON.stringify(result);
console.log(`JSON size: ${(jsonStr.length / 1024 / 1024).toFixed(1)} MB`);
assert(jsonStr.length > 0, "JSON is not empty");

// Roundtrip
const reparsed = JSON.parse(jsonStr);
assert(reparsed.language === "it", "language preserved after roundtrip");
assert(
	Object.keys(reparsed.index).length === wordCount,
	"word count preserved after roundtrip"
);

console.log(`\n${"=".repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
