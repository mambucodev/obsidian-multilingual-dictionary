import { ItemView, WorkspaceLeaf } from "obsidian";
import {
	DICTIONARY_VIEW_TYPE,
	SynsetEntry,
	SUPPORTED_LANGUAGES,
} from "./types";
import { LookupEngine } from "./lookup-engine";
import { LanguageDetector } from "./language-detector";
import type MultilingualDictionaryPlugin from "./main";

export class DictionarySidebar extends ItemView {
	private plugin: MultilingualDictionaryPlugin;
	private engine: LookupEngine;
	private detector: LanguageDetector;
	private resultsDiv: HTMLElement | null = null;
	private searchInput: HTMLInputElement | null = null;
	private langSelect: HTMLSelectElement | null = null;
	private debounceTimer: ReturnType<typeof setTimeout> | null = null;

	constructor(
		leaf: WorkspaceLeaf,
		plugin: MultilingualDictionaryPlugin,
		engine: LookupEngine,
		detector: LanguageDetector
	) {
		super(leaf);
		this.plugin = plugin;
		this.engine = engine;
		this.detector = detector;
	}

	getViewType(): string {
		return DICTIONARY_VIEW_TYPE;
	}

	getDisplayText(): string {
		return "Dictionary";
	}

	getIcon(): string {
		return "book-open";
	}

	async onOpen(): Promise<void> {
		const container = this.containerEl.children[1] as HTMLElement;
		container.empty();
		container.addClass("mdict-sidebar");

		// Search bar
		const searchBar = container.createDiv("mdict-sidebar-search");

		this.searchInput = searchBar.createEl("input", {
			type: "text",
			placeholder: "Look up a word...",
			cls: "mdict-sidebar-input",
		});

		this.langSelect = searchBar.createEl("select", {
			cls: "mdict-sidebar-lang-select",
		});

		// "Auto" option
		const autoOpt = this.langSelect.createEl("option", {
			value: "auto",
			text: "Auto",
		});
		if (this.plugin.settings.autoDetect) {
			autoOpt.selected = true;
		}

		for (const lang of SUPPORTED_LANGUAGES) {
			const state = this.plugin.settings.languages[lang.code];
			if (state.enabled && state.downloaded) {
				const opt = this.langSelect.createEl("option", {
					value: lang.code,
					text: lang.name,
				});
				if (
					!this.plugin.settings.autoDetect &&
					lang.code === this.plugin.settings.defaultLanguage
				) {
					opt.selected = true;
				}
			}
		}

		this.searchInput.addEventListener("input", () => {
			if (this.debounceTimer) clearTimeout(this.debounceTimer);
			this.debounceTimer = setTimeout(() => {
				this.performLookup();
			}, 200);
		});

		this.langSelect.addEventListener("change", () => {
			this.performLookup();
		});

		// Suggestions area
		this.resultsDiv = container.createDiv("mdict-sidebar-results");

		this.renderEmpty();
	}

	async onClose(): Promise<void> {
		if (this.debounceTimer) clearTimeout(this.debounceTimer);
	}

	/**
	 * Public method to programmatically set the search word (e.g., from a command).
	 */
	setSearchWord(word: string): void {
		if (this.searchInput) {
			this.searchInput.value = word;
			this.performLookup();
		}
	}

	private performLookup(): void {
		if (!this.searchInput || !this.resultsDiv || !this.langSelect) return;

		const word = this.searchInput.value.trim();
		if (!word || word.length < 2) {
			this.renderEmpty();
			return;
		}

		const selectedLang = this.langSelect.value;

		if (selectedLang === "auto") {
			// Search across all loaded dictionaries
			const allResults = this.engine.lookupAll(word);
			if (allResults.size === 0) {
				this.renderNoResults(word);
				return;
			}
			this.renderMultiLangResults(word, allResults);
		} else {
			const entries = this.engine.lookup(word, selectedLang);
			if (!entries || entries.length === 0) {
				// Show prefix suggestions
				const suggestions = this.engine.prefixSearch(
					word,
					selectedLang,
					5
				);
				this.renderNoResults(word, suggestions);
				return;
			}
			this.renderResults(word, selectedLang, entries);
		}
	}

	private renderEmpty(): void {
		if (!this.resultsDiv) return;
		this.resultsDiv.empty();

		const loaded = this.engine.getLoadedLanguages();
		if (loaded.length === 0) {
			this.resultsDiv.createEl("p", {
				text: "No dictionaries loaded. Download and enable languages in plugin settings.",
				cls: "mdict-sidebar-empty",
			});
		} else {
			this.resultsDiv.createEl("p", {
				text: "Type a word to look it up.",
				cls: "mdict-sidebar-empty",
			});
		}
	}

	private renderNoResults(word: string, suggestions?: string[]): void {
		if (!this.resultsDiv) return;
		this.resultsDiv.empty();

		this.resultsDiv.createEl("p", {
			text: `No results for "${word}".`,
			cls: "mdict-sidebar-no-results",
		});

		if (suggestions && suggestions.length > 0) {
			const sugDiv = this.resultsDiv.createDiv("mdict-sidebar-suggestions");
			sugDiv.createEl("p", { text: "Did you mean:" });
			for (const sug of suggestions) {
				const link = sugDiv.createEl("a", {
					text: sug,
					cls: "mdict-sidebar-suggestion",
					href: "#",
				});
				link.addEventListener("click", (e) => {
					e.preventDefault();
					if (this.searchInput) {
						this.searchInput.value = sug;
						this.performLookup();
					}
				});
			}
		}
	}

	private renderMultiLangResults(
		word: string,
		results: Map<string, SynsetEntry[]>
	): void {
		if (!this.resultsDiv) return;
		this.resultsDiv.empty();

		const header = this.resultsDiv.createDiv("mdict-sidebar-header");
		header.createEl("h4", { text: word });

		for (const [lang, entries] of results) {
			const langSection = this.resultsDiv.createDiv("mdict-sidebar-lang-section");
			langSection.createEl("h5", {
				text: this.engine.getLanguageName(lang),
				cls: "mdict-sidebar-lang-header",
			});
			this.renderEntries(langSection, entries);
		}
	}

	private renderResults(
		word: string,
		lang: string,
		entries: SynsetEntry[]
	): void {
		if (!this.resultsDiv) return;
		this.resultsDiv.empty();

		const header = this.resultsDiv.createDiv("mdict-sidebar-header");
		header.createEl("h4", { text: word });
		header.createEl("span", {
			text: this.engine.getLanguageName(lang),
			cls: "mdict-sidebar-lang-badge",
		});

		this.renderEntries(this.resultsDiv, entries);
	}

	private renderEntries(
		container: HTMLElement,
		entries: SynsetEntry[]
	): void {
		for (const entry of entries) {
			const entryDiv = container.createDiv("mdict-sidebar-entry");

			// Part of speech
			if (entry.pos) {
				entryDiv.createEl("span", {
					text: entry.pos,
					cls: "mdict-sidebar-pos",
				});
			}

			// Definition
			if (entry.definition) {
				entryDiv.createEl("p", {
					text: entry.definition,
					cls: "mdict-sidebar-definition",
				});
			}

			// Examples
			if (entry.examples.length > 0) {
				const exDiv = entryDiv.createDiv("mdict-sidebar-examples");
				exDiv.createEl("span", { text: "Examples:", cls: "mdict-label" });
				for (const ex of entry.examples) {
					exDiv.createEl("p", {
						text: `"${ex}"`,
						cls: "mdict-sidebar-example",
					});
				}
			}

			// Synonyms
			if (entry.synonyms.length > 1) {
				const synDiv = entryDiv.createDiv("mdict-sidebar-synonyms");
				synDiv.createEl("span", { text: "Synonyms: ", cls: "mdict-label" });
				synDiv.createEl("span", { text: entry.synonyms.join(", ") });
			}

			// Hypernyms
			if (entry.hypernyms.length > 0) {
				const hypDiv = entryDiv.createDiv("mdict-sidebar-hypernyms");
				hypDiv.createEl("span", { text: "Broader: ", cls: "mdict-label" });
				hypDiv.createEl("span", { text: entry.hypernyms.join(", ") });
			}

			// Hyponyms
			if (entry.hyponyms.length > 0) {
				const hypoDiv = entryDiv.createDiv("mdict-sidebar-hyponyms");
				hypoDiv.createEl("span", { text: "Narrower: ", cls: "mdict-label" });
				hypoDiv.createEl("span", { text: entry.hyponyms.join(", ") });
			}
		}
	}
}
