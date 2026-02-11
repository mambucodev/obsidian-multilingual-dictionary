import { newStemmer, Stemmer } from "snowball-stemmers";
import { DictionaryData, SynsetEntry, SUPPORTED_LANGUAGES } from "./types";
import { DictionaryManager } from "./dictionary-manager";

/** Map language codes to Snowball algorithm names */
const STEMMER_LANGS: Record<string, string> = {
	en: "english",
	it: "italian",
	es: "spanish",
	fr: "french",
	de: "german",
	pt: "portuguese",
	nl: "dutch",
	// pl, ja, zh: no Snowball support
};

export class LookupEngine {
	private indexes: Map<string, Map<string, SynsetEntry[]>> = new Map();
	/** Reverse index: stem -> list of lemmas in the dictionary */
	private stemIndexes: Map<string, Map<string, string[]>> = new Map();
	private stemmers: Map<string, Stemmer> = new Map();
	private manager: DictionaryManager;

	constructor(manager: DictionaryManager) {
		this.manager = manager;
	}

	async loadDictionary(lang: string): Promise<boolean> {
		if (this.indexes.has(lang)) {
			return true;
		}

		const dict = await this.manager.loadDictionary(lang);
		if (!dict) {
			return false;
		}

		this.buildIndex(lang, dict);
		return true;
	}

	private buildIndex(lang: string, dict: DictionaryData): void {
		const index = new Map<string, SynsetEntry[]>();
		for (const [word, entries] of Object.entries(dict.index)) {
			index.set(word.toLowerCase(), entries as SynsetEntry[]);
		}
		this.indexes.set(lang, index);

		// Build reverse stem index for languages with Snowball support
		this.buildStemIndex(lang, index);
	}

	private buildStemIndex(
		lang: string,
		index: Map<string, SynsetEntry[]>
	): void {
		const alg = STEMMER_LANGS[lang];
		if (!alg) return;

		let stemmer = this.stemmers.get(lang);
		if (!stemmer) {
			stemmer = newStemmer(alg) as Stemmer;
			this.stemmers.set(lang, stemmer);
		}

		const stemIndex = new Map<string, string[]>();
		for (const word of index.keys()) {
			const stem = stemmer.stem(word);
			if (!stemIndex.has(stem)) {
				stemIndex.set(stem, []);
			}
			stemIndex.get(stem)!.push(word);
		}
		this.stemIndexes.set(lang, stemIndex);
	}

	unloadDictionary(lang: string): void {
		this.indexes.delete(lang);
		this.stemIndexes.delete(lang);
	}

	unloadAll(): void {
		this.indexes.clear();
		this.stemIndexes.clear();
	}

	isLoaded(lang: string): boolean {
		return this.indexes.has(lang);
	}

	/**
	 * Look up a word. If direct match fails, try stemming to find the lemma.
	 */
	lookup(word: string, lang: string): SynsetEntry[] | null {
		const index = this.indexes.get(lang);
		if (!index) return null;

		const lower = word.toLowerCase();

		// Direct match
		const direct = index.get(lower);
		if (direct) return direct;

		// Stemmer fallback
		return this.stemLookup(lower, lang, index);
	}

	private stemLookup(
		word: string,
		lang: string,
		index: Map<string, SynsetEntry[]>
	): SynsetEntry[] | null {
		const stemmer = this.stemmers.get(lang);
		const stemIndex = this.stemIndexes.get(lang);
		if (!stemmer || !stemIndex) return null;

		const stem = stemmer.stem(word);
		const lemmas = stemIndex.get(stem);
		if (!lemmas || lemmas.length === 0) return null;

		// Return entries for the best matching lemma.
		// Prefer shorter lemmas (more likely to be the base form).
		const sorted = [...lemmas].sort((a, b) => a.length - b.length);
		for (const lemma of sorted) {
			const entries = index.get(lemma);
			if (entries) return entries;
		}

		return null;
	}

	/**
	 * Lookup across all loaded dictionaries.
	 * Returns a map of language code -> entries.
	 */
	lookupAll(word: string): Map<string, SynsetEntry[]> {
		const results = new Map<string, SynsetEntry[]>();
		for (const [lang] of this.indexes) {
			const entries = this.lookup(word, lang);
			if (entries) {
				results.set(lang, entries);
			}
		}
		return results;
	}

	/**
	 * Prefix search for autocomplete suggestions.
	 */
	prefixSearch(prefix: string, lang: string, limit = 10): string[] {
		const index = this.indexes.get(lang);
		if (!index) return [];

		const lowerPrefix = prefix.toLowerCase();
		const results: string[] = [];

		for (const word of index.keys()) {
			if (word.startsWith(lowerPrefix)) {
				results.push(word);
				if (results.length >= limit) break;
			}
		}

		return results;
	}

	getLoadedLanguages(): string[] {
		return Array.from(this.indexes.keys());
	}

	getLanguageName(code: string): string {
		return (
			SUPPORTED_LANGUAGES.find((l) => l.code === code)?.name ?? code
		);
	}
}
