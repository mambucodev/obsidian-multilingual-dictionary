import { LookupEngine } from "./lookup-engine";

/**
 * Lightweight language detector based on character patterns and dictionary lookup.
 * Checks loaded dictionaries to determine which language a word belongs to.
 */
export class LanguageDetector {
	private engine: LookupEngine;
	private cache: Map<string, string | null> = new Map();
	private static readonly CACHE_LIMIT = 500;

	constructor(engine: LookupEngine) {
		this.engine = engine;
	}

	/**
	 * Detect the language of a single word by checking loaded dictionaries.
	 * Returns the language code with the best match, or null if not found.
	 */
	detectWord(word: string): string | null {
		const lower = word.toLowerCase();
		if (this.cache.has(lower)) {
			return this.cache.get(lower) ?? null;
		}

		const results = this.engine.lookupAll(lower);
		let bestLang: string | null = null;
		let bestCount = 0;

		for (const [lang, entries] of results) {
			if (entries.length > bestCount) {
				bestCount = entries.length;
				bestLang = lang;
			}
		}

		// Cache result
		if (this.cache.size >= LanguageDetector.CACHE_LIMIT) {
			// Evict oldest entry
			const firstKey = this.cache.keys().next().value;
			if (firstKey !== undefined) {
				this.cache.delete(firstKey);
			}
		}
		this.cache.set(lower, bestLang);

		return bestLang;
	}

	/**
	 * Detect the language of a block of text by sampling words.
	 * Returns the most likely language code.
	 */
	detectText(text: string, defaultLang: string): string {
		const words = text
			.split(/\s+/)
			.filter((w) => w.length > 2)
			.map((w) => w.replace(/[^\p{L}]/gu, ""))
			.filter((w) => w.length > 0);

		if (words.length === 0) return defaultLang;

		// Sample up to 10 words
		const sample = words.slice(0, 10);
		const langCounts = new Map<string, number>();

		for (const word of sample) {
			const lang = this.detectWord(word);
			if (lang) {
				langCounts.set(lang, (langCounts.get(lang) ?? 0) + 1);
			}
		}

		if (langCounts.size === 0) return defaultLang;

		let bestLang = defaultLang;
		let bestCount = 0;
		for (const [lang, count] of langCounts) {
			if (count > bestCount) {
				bestCount = count;
				bestLang = lang;
			}
		}

		return bestLang;
	}

	/**
	 * Quick script-based heuristic for CJK languages.
	 */
	static detectScript(text: string): string | null {
		const cjkRegex = /[\u4e00-\u9fff]/;
		const hiraganaKatakana = /[\u3040-\u309f\u30a0-\u30ff]/;

		if (hiraganaKatakana.test(text)) return "ja";
		if (cjkRegex.test(text)) return "zh";

		return null;
	}

	clearCache(): void {
		this.cache.clear();
	}
}
