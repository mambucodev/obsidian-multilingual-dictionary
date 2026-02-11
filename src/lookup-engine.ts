import { DictionaryData, SynsetEntry, SUPPORTED_LANGUAGES } from "./types";
import { DictionaryManager } from "./dictionary-manager";

export class LookupEngine {
	private indexes: Map<string, Map<string, SynsetEntry[]>> = new Map();
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
	}

	unloadDictionary(lang: string): void {
		this.indexes.delete(lang);
	}

	unloadAll(): void {
		this.indexes.clear();
	}

	isLoaded(lang: string): boolean {
		return this.indexes.has(lang);
	}

	lookup(word: string, lang: string): SynsetEntry[] | null {
		const index = this.indexes.get(lang);
		if (!index) return null;
		return index.get(word.toLowerCase()) ?? null;
	}

	/**
	 * Lookup across all loaded dictionaries.
	 * Returns a map of language code -> entries.
	 */
	lookupAll(word: string): Map<string, SynsetEntry[]> {
		const results = new Map<string, SynsetEntry[]>();
		for (const [lang, index] of this.indexes) {
			const entries = index.get(word.toLowerCase());
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
