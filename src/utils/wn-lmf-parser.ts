import { XMLParser } from "fast-xml-parser";
import { DictionaryData, SynsetEntry } from "../types";

/**
 * Parses WN-LMF (WordNet Lexical Markup Framework) XML into the plugin's
 * DictionaryData JSON format.
 *
 * The XML structure is:
 *   LexicalResource > Lexicon > LexicalEntry (Lemma + Sense[])
 *   LexicalResource > Lexicon > Synset (Definition, Example[], SynsetRelation[])
 *
 * Synsets have a `members` attribute listing sense IDs.
 * LexicalEntry/Lemma has `writtenForm` and `partOfSpeech`.
 * Sense has `synset` pointing to a Synset id.
 */
export function parseWnLmf(xml: string, langCode: string): DictionaryData {
	const parser = new XMLParser({
		ignoreAttributes: false,
		attributeNamePrefix: "@_",
		isArray: (name) => {
			// These elements can appear multiple times
			return [
				"LexicalEntry",
				"Sense",
				"Synset",
				"Definition",
				"Example",
				"SynsetRelation",
				"SenseRelation",
			].includes(name);
		},
	});

	const doc = parser.parse(xml);
	const lexResource = doc.LexicalResource;
	if (!lexResource) {
		throw new Error("Invalid WN-LMF: missing LexicalResource root");
	}

	const lexicon = lexResource.Lexicon;
	if (!lexicon) {
		throw new Error("Invalid WN-LMF: missing Lexicon");
	}

	const version = lexicon["@_version"] ?? "1.0";

	// Step 1: Build synset map (synset_id -> synset data)
	const synsetMap = new Map<
		string,
		{
			id: string;
			pos: string;
			definition: string;
			examples: string[];
			hypernyms: string[];
			hyponyms: string[];
			memberSenseIds: string[];
		}
	>();

	const synsets: unknown[] = ensureArray(lexicon.Synset);
	for (const s of synsets) {
		const synset = s as Record<string, unknown>;
		const id = synset["@_id"] as string;
		const pos = mapPos(synset["@_partOfSpeech"] as string);
		const membersStr = (synset["@_members"] as string) ?? "";
		const memberSenseIds = membersStr
			? membersStr.split(/\s+/)
			: [];

		// Definitions (take first)
		const defs = ensureArray(synset.Definition);
		let definition = "";
		if (defs.length > 0) {
			const d = defs[0];
			definition =
				typeof d === "string"
					? d
					: typeof d === "object" && d !== null
						? ((d as Record<string, unknown>)["#text"] as string) ??
							""
						: String(d);
		}

		// Examples
		const exs = ensureArray(synset.Example);
		const examples: string[] = [];
		for (const e of exs) {
			if (typeof e === "string") {
				examples.push(e);
			} else if (typeof e === "object" && e !== null) {
				const text = (e as Record<string, unknown>)["#text"];
				if (typeof text === "string") examples.push(text);
			}
		}

		// Relations
		const rels = ensureArray(synset.SynsetRelation);
		const hypernyms: string[] = [];
		const hyponyms: string[] = [];
		for (const r of rels) {
			const rel = r as Record<string, unknown>;
			const relType = rel["@_relType"] as string;
			const target = rel["@_target"] as string;
			if (relType === "hypernym" || relType === "instance_hypernym") {
				hypernyms.push(target);
			} else if (
				relType === "hyponym" ||
				relType === "instance_hyponym"
			) {
				hyponyms.push(target);
			}
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

	// Step 2: Build sense-to-word map from LexicalEntries
	//   Also collect: synset_id -> list of lemma words (for synonyms)
	const senseToWord = new Map<string, string>();
	const synsetToWords = new Map<string, string[]>();

	const entries: unknown[] = ensureArray(lexicon.LexicalEntry);
	for (const e of entries) {
		const entry = e as Record<string, unknown>;
		const lemma = entry.Lemma as Record<string, unknown> | undefined;
		if (!lemma) continue;

		const writtenForm = lemma["@_writtenForm"] as string;
		if (!writtenForm) continue;

		const senses = ensureArray(entry.Sense);
		for (const s of senses) {
			const sense = s as Record<string, unknown>;
			const senseId = sense["@_id"] as string;
			const synsetId = sense["@_synset"] as string;

			if (senseId) senseToWord.set(senseId, writtenForm);
			if (synsetId) {
				if (!synsetToWords.has(synsetId)) {
					synsetToWords.set(synsetId, []);
				}
				synsetToWords.get(synsetId)!.push(writtenForm);
			}
		}
	}

	// Step 3: Build the word index
	const index: Record<string, SynsetEntry[]> = {};

	for (const [synsetId, synsetData] of synsetMap) {
		const words = synsetToWords.get(synsetId) ?? [];
		if (words.length === 0) continue;

		// Resolve hypernym/hyponym synset IDs to their first lemma word
		const hypernymWords = resolveToWords(
			synsetData.hypernyms,
			synsetToWords,
			5
		);
		const hyponymWords = resolveToWords(
			synsetData.hyponyms,
			synsetToWords,
			5
		);

		const synsetEntry: SynsetEntry = {
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
			if (!index[key]) {
				index[key] = [];
			}
			index[key].push(synsetEntry);
		}
	}

	return {
		version,
		language: langCode,
		index,
	};
}

function ensureArray(val: unknown): unknown[] {
	if (val === undefined || val === null) return [];
	if (Array.isArray(val)) return val;
	return [val];
}

function mapPos(pos: string): string {
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

/**
 * Resolve synset IDs to their first lemma word for display.
 */
function resolveToWords(
	synsetIds: string[],
	synsetToWords: Map<string, string[]>,
	limit: number
): string[] {
	const result: string[] = [];
	for (const id of synsetIds) {
		const words = synsetToWords.get(id);
		if (words && words.length > 0) {
			result.push(words[0]);
		}
		if (result.length >= limit) break;
	}
	return result;
}
