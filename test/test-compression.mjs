/**
 * Test pako gzip compression/decompression used by the plugin.
 * Run with: node test/test-compression.mjs
 */

import pako from "pako";

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

console.log("=== Compression Tests ===\n");

// Test: roundtrip
const testData = JSON.stringify({
	version: "1.0",
	language: "en",
	index: {
		test: [
			{
				synset_id: "test-001",
				pos: "noun",
				definition: "a procedure to assess quality",
				examples: ["the test was difficult"],
				synonyms: ["test", "exam", "examination"],
				hypernyms: ["procedure"],
				hyponyms: [],
			},
		],
	},
});

console.log("Test: Gzip roundtrip");
const compressed = pako.gzip(new TextEncoder().encode(testData));
assert(compressed.length < testData.length, "compressed is smaller than original");

const decompressed = pako.inflate(compressed);
const restored = new TextDecoder().decode(decompressed);
assert(restored === testData, "decompressed matches original");

// Test: parse after roundtrip
console.log("\nTest: JSON parse after decompression");
const parsed = JSON.parse(restored);
assert(parsed.version === "1.0", "version preserved");
assert(parsed.index.test[0].definition === "a procedure to assess quality", "definition preserved");

// Test: ArrayBuffer input (simulates requestUrl response)
console.log("\nTest: ArrayBuffer input");
const buffer = compressed.buffer.slice(
	compressed.byteOffset,
	compressed.byteOffset + compressed.byteLength
);
const fromBuffer = pako.inflate(new Uint8Array(buffer));
const fromBufferStr = new TextDecoder().decode(fromBuffer);
assert(fromBufferStr === testData, "ArrayBuffer input works");

console.log(`\n${"=".repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
