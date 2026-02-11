/**
 * Quick sanity test for the dictionary JSON format and lookup logic.
 * Run with: node test/test-lookup.mjs
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Create a small test dictionary
const testDict = {
	version: "1.0",
	language: "en",
	index: {
		dog: [
			{
				synset_id: "02084071-n",
				pos: "noun",
				definition: "a member of the genus Canis",
				examples: ["the dog barked all night"],
				synonyms: ["dog", "domestic dog", "Canis familiaris"],
				hypernyms: ["canine", "canid"],
				hyponyms: ["puppy", "pup", "hound"],
			},
		],
		run: [
			{
				synset_id: "01926311-v",
				pos: "verb",
				definition: "move fast by using one's feet",
				examples: ["he ran to catch the bus"],
				synonyms: ["run", "dash", "sprint"],
				hypernyms: ["move", "locomote"],
				hyponyms: ["jog", "trot"],
			},
			{
				synset_id: "02075049-v",
				pos: "verb",
				definition: "direct or control a project or organization",
				examples: ["she runs the department"],
				synonyms: ["run", "manage", "operate"],
				hypernyms: ["direct"],
				hyponyms: [],
			},
		],
		happy: [
			{
				synset_id: "01148283-a",
				pos: "adjective",
				definition: "enjoying or showing good fortune",
				examples: ["a happy turn of events", "a happy childhood"],
				synonyms: ["happy", "glad", "joyful"],
				hypernyms: [],
				hyponyms: [],
			},
		],
	},
};

// Simulate LookupEngine logic
class TestLookupEngine {
	constructor() {
		this.indexes = new Map();
	}

	loadFromData(lang, dict) {
		const index = new Map();
		for (const [word, entries] of Object.entries(dict.index)) {
			index.set(word.toLowerCase(), entries);
		}
		this.indexes.set(lang, index);
		return true;
	}

	lookup(word, lang) {
		const index = this.indexes.get(lang);
		if (!index) return null;
		return index.get(word.toLowerCase()) ?? null;
	}

	lookupAll(word) {
		const results = new Map();
		for (const [lang, index] of this.indexes) {
			const entries = index.get(word.toLowerCase());
			if (entries) results.set(lang, entries);
		}
		return results;
	}

	prefixSearch(prefix, lang, limit = 5) {
		const index = this.indexes.get(lang);
		if (!index) return [];
		const lowerPrefix = prefix.toLowerCase();
		const results = [];
		for (const word of index.keys()) {
			if (word.startsWith(lowerPrefix)) {
				results.push(word);
				if (results.length >= limit) break;
			}
		}
		return results;
	}
}

// Run tests
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

console.log("=== Dictionary Format Tests ===\n");

// Test: valid structure
console.log("Test: Dictionary structure");
assert(testDict.version === "1.0", "version field exists");
assert(testDict.language === "en", "language field exists");
assert(typeof testDict.index === "object", "index field is an object");

// Test: entries have required fields
console.log("\nTest: Entry fields");
const dogEntry = testDict.index.dog[0];
assert(typeof dogEntry.synset_id === "string", "synset_id is string");
assert(typeof dogEntry.pos === "string", "pos is string");
assert(typeof dogEntry.definition === "string", "definition is string");
assert(Array.isArray(dogEntry.examples), "examples is array");
assert(Array.isArray(dogEntry.synonyms), "synonyms is array");
assert(Array.isArray(dogEntry.hypernyms), "hypernyms is array");
assert(Array.isArray(dogEntry.hyponyms), "hyponyms is array");

console.log("\n=== Lookup Engine Tests ===\n");

const engine = new TestLookupEngine();
engine.loadFromData("en", testDict);

// Test: basic lookup
console.log("Test: Basic lookup");
const dogResults = engine.lookup("dog", "en");
assert(dogResults !== null, "dog found");
assert(dogResults.length === 1, "dog has 1 entry");
assert(dogResults[0].definition === "a member of the genus Canis", "correct definition");

// Test: case-insensitive
console.log("\nTest: Case-insensitive lookup");
const dogUpper = engine.lookup("DOG", "en");
assert(dogUpper !== null, "DOG (uppercase) found");

// Test: multiple meanings
console.log("\nTest: Multiple meanings");
const runResults = engine.lookup("run", "en");
assert(runResults !== null, "run found");
assert(runResults.length === 2, "run has 2 entries");

// Test: not found
console.log("\nTest: Not found");
const missing = engine.lookup("xyzzy", "en");
assert(missing === null, "nonexistent word returns null");

// Test: wrong language
console.log("\nTest: Wrong language");
const wrongLang = engine.lookup("dog", "it");
assert(wrongLang === null, "wrong language returns null");

// Test: lookupAll
console.log("\nTest: Cross-language lookup");
const allResults = engine.lookupAll("dog");
assert(allResults.size === 1, "found in 1 language");
assert(allResults.has("en"), "found in English");

// Test: prefix search
console.log("\nTest: Prefix search");
const prefixes = engine.prefixSearch("d", "en", 5);
assert(prefixes.includes("dog"), "prefix 'd' finds 'dog'");

const prefixH = engine.prefixSearch("h", "en", 5);
assert(prefixH.includes("happy"), "prefix 'h' finds 'happy'");

// Test: JSON serialization roundtrip
console.log("\nTest: JSON roundtrip");
const serialized = JSON.stringify(testDict);
const deserialized = JSON.parse(serialized);
const engine2 = new TestLookupEngine();
engine2.loadFromData("en", deserialized);
const dogAfter = engine2.lookup("dog", "en");
assert(dogAfter !== null, "lookup works after JSON roundtrip");
assert(dogAfter[0].synonyms.length === 3, "synonyms preserved after roundtrip");

console.log(`\n${"=".repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
