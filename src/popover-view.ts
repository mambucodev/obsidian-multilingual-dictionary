import { DictionarySettings, SynsetEntry } from "./types";
import { LookupEngine } from "./lookup-engine";
import { LanguageDetector } from "./language-detector";

export class PopoverView {
	private engine: LookupEngine;
	private detector: LanguageDetector;
	private settings: DictionarySettings;
	private popoverEl: HTMLElement | null = null;
	private debounceTimer: ReturnType<typeof setTimeout> | null = null;
	private onOpenSidebar: ((word: string) => void) | null = null;
	private static readonly DEBOUNCE_MS = 200;

	constructor(
		engine: LookupEngine,
		detector: LanguageDetector,
		settings: DictionarySettings
	) {
		this.engine = engine;
		this.detector = detector;
		this.settings = settings;
	}

	updateSettings(settings: DictionarySettings): void {
		this.settings = settings;
	}

	setOnOpenSidebar(callback: (word: string) => void): void {
		this.onOpenSidebar = callback;
	}

	/**
	 * Call this when the user double-clicks a word. Debounces to avoid flicker.
	 */
	onWordSelected(word: string, rect: DOMRect): void {
		if (this.debounceTimer) {
			clearTimeout(this.debounceTimer);
		}
		this.debounceTimer = setTimeout(() => {
			this.showPopover(word, rect);
		}, PopoverView.DEBOUNCE_MS);
	}

	private showPopover(word: string, rect: DOMRect): void {
		this.hide();

		const cleaned = word.replace(/[^\p{L}\p{N}'-]/gu, "").trim();
		if (!cleaned || cleaned.length < 2) return;

		let lang: string | undefined;
		let entries: SynsetEntry[] | null = null;

		// Try script detection first (for CJK)
		const scriptLang = LanguageDetector.detectScript(cleaned);
		if (scriptLang && this.engine.isLoaded(scriptLang)) {
			lang = scriptLang;
			entries = this.engine.lookup(cleaned, lang);
		}

		// Try auto-detect or default language
		if (!entries && this.settings.autoDetect) {
			const detected = this.detector.detectWord(cleaned);
			if (detected) {
				lang = detected;
				entries = this.engine.lookup(cleaned, lang);
			}
		}

		// Fallback to default language
		if (!entries) {
			lang = this.settings.defaultLanguage;
			entries = this.engine.lookup(cleaned, lang);
		}

		if (!entries || entries.length === 0) return;

		// Filter out empty entries (same logic as sidebar)
		const seen = new Set<string>();
		const filtered = entries.filter((e) => {
			if (seen.has(e.synset_id)) return false;
			seen.add(e.synset_id);
			return (
				e.definition ||
				e.synonyms.length > 1 ||
				e.examples.length > 0 ||
				e.hypernyms.length > 0
			);
		});

		if (filtered.length === 0 && entries.length === 0) return;

		const toRender = filtered.length > 0 ? filtered : entries;

		this.popoverEl = document.createElement("div");
		this.popoverEl.addClass("mdict-popover");

		const header = this.popoverEl.createDiv("mdict-popover-header");
		header.createEl("strong", { text: cleaned });
		header.createEl("span", {
			text: ` (${this.engine.getLanguageName(lang!)})`,
			cls: "mdict-popover-lang",
		});

		const body = this.popoverEl.createDiv("mdict-popover-body");

		for (const entry of toRender.slice(0, 3)) {
			this.renderEntry(body, entry);
		}

		if (toRender.length > 3) {
			body.createEl("p", {
				text: `... and ${toRender.length - 3} more`,
				cls: "mdict-popover-more",
			});
		}

		// "Open in sidebar" footer link
		const footer = this.popoverEl.createDiv("mdict-popover-footer");
		const openLink = footer.createEl("a", {
			text: "Open in sidebar",
			href: "#",
			cls: "mdict-popover-sidebar-link",
		});
		openLink.addEventListener("click", (e) => {
			e.preventDefault();
			this.hide();
			this.onOpenSidebar?.(cleaned);
		});

		document.body.appendChild(this.popoverEl);
		this.positionPopover(rect);

		// Close on click outside
		setTimeout(() => {
			document.addEventListener("mousedown", this.onClickOutside);
		}, 0);
	}

	private renderEntry(container: HTMLElement, entry: SynsetEntry): void {
		const section = container.createDiv("mdict-popover-entry");

		if (entry.pos) {
			section.createEl("span", {
				text: entry.pos,
				cls: "mdict-popover-pos",
			});
		}

		if (this.settings.showInPopover.definitions && entry.definition) {
			section.createEl("p", {
				text: entry.definition,
				cls: "mdict-popover-definition",
			});
		} else if (entry.synonyms.length > 1) {
			section.createEl("p", {
				text: entry.synonyms.join(", "),
				cls: "mdict-popover-definition mdict-popover-definition-fallback",
			});
		}

		if (
			this.settings.showInPopover.examples &&
			entry.examples.length > 0
		) {
			const exDiv = section.createDiv("mdict-popover-examples");
			for (const ex of entry.examples.slice(0, 2)) {
				exDiv.createEl("p", {
					text: `"${ex}"`,
					cls: "mdict-popover-example",
				});
			}
		}

		if (
			this.settings.showInPopover.synonyms &&
			entry.definition &&
			entry.synonyms.length > 1
		) {
			const synDiv = section.createDiv("mdict-popover-synonyms");
			synDiv.createEl("span", { text: "Synonyms: ", cls: "mdict-label" });
			synDiv.createEl("span", { text: entry.synonyms.join(", ") });
		}

		if (this.settings.showInPopover.relatedWords) {
			if (entry.hypernyms.length > 0) {
				const hypDiv = section.createDiv("mdict-popover-hypernyms");
				hypDiv.createEl("span", { text: "Broader: ", cls: "mdict-label" });
				hypDiv.createEl("span", { text: entry.hypernyms.join(", ") });
			}
			if (entry.hyponyms.length > 0) {
				const hypoDiv = section.createDiv("mdict-popover-hyponyms");
				hypoDiv.createEl("span", { text: "Narrower: ", cls: "mdict-label" });
				hypoDiv.createEl("span", { text: entry.hyponyms.join(", ") });
			}
		}
	}

	private positionPopover(rect: DOMRect): void {
		if (!this.popoverEl) return;

		const padding = 8;
		let top = rect.bottom + padding;
		let left = rect.left;

		// Ensure it doesn't overflow the viewport
		const popRect = this.popoverEl.getBoundingClientRect();
		if (top + popRect.height > window.innerHeight) {
			top = rect.top - popRect.height - padding;
		}
		if (left + popRect.width > window.innerWidth) {
			left = window.innerWidth - popRect.width - padding;
		}
		if (left < 0) left = padding;

		this.popoverEl.style.top = `${top}px`;
		this.popoverEl.style.left = `${left}px`;
	}

	private onClickOutside = (e: MouseEvent): void => {
		if (this.popoverEl && !this.popoverEl.contains(e.target as Node)) {
			this.hide();
		}
	};

	hide(): void {
		if (this.popoverEl) {
			this.popoverEl.remove();
			this.popoverEl = null;
			document.removeEventListener("mousedown", this.onClickOutside);
		}
	}
}
