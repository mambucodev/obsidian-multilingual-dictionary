import { Plugin, Menu, Editor, MarkdownView } from "obsidian";
import {
	DictionarySettings,
	DEFAULT_SETTINGS,
	DICTIONARY_VIEW_TYPE,
	SUPPORTED_LANGUAGES,
} from "./types";
import { DictionaryManager } from "./dictionary-manager";
import { LookupEngine } from "./lookup-engine";
import { LanguageDetector } from "./language-detector";
import { PopoverView } from "./popover-view";
import { DictionarySidebar } from "./sidebar-view";
import { DictionarySettingTab } from "./settings";

export default class MultilingualDictionaryPlugin extends Plugin {
	settings: DictionarySettings = DEFAULT_SETTINGS;
	dictionaryManager!: DictionaryManager;
	lookupEngine!: LookupEngine;
	private languageDetector!: LanguageDetector;
	private popoverView!: PopoverView;

	async onload(): Promise<void> {
		await this.loadSettings();

		this.dictionaryManager = new DictionaryManager(
			this.app,
			this.settings
		);
		this.lookupEngine = new LookupEngine(this.dictionaryManager);
		this.languageDetector = new LanguageDetector(this.lookupEngine);
		this.popoverView = new PopoverView(
			this.lookupEngine,
			this.languageDetector,
			this.settings
		);
		this.popoverView.setOnOpenSidebar((word) => {
			this.lookupInSidebar(word);
		});

		// Register sidebar view
		this.registerView(DICTIONARY_VIEW_TYPE, (leaf) => {
			return new DictionarySidebar(
				leaf,
				this,
				this.lookupEngine,
				this.languageDetector
			);
		});

		// Add settings tab
		this.addSettingTab(new DictionarySettingTab(this.app, this));

		// Add ribbon icon to open sidebar
		this.addRibbonIcon("book-open", "Open Dictionary", () => {
			this.activateSidebar();
		});

		// Add command: Open dictionary sidebar
		this.addCommand({
			id: "open-dictionary-sidebar",
			name: "Open dictionary sidebar",
			callback: () => {
				this.activateSidebar();
			},
		});

		// Add command: Look up selected word in sidebar
		this.addCommand({
			id: "lookup-selected-word",
			name: "Look up selected word",
			editorCallback: (editor) => {
				const word = this.getWordFromEditor(editor);
				if (word) {
					this.lookupInSidebar(word);
				}
			},
		});

		// Double-click on a word shows popover
		this.registerDomEvent(document, "dblclick", (evt: MouseEvent) => {
			this.handleDoubleClick(evt);
		});

		// Right-click context menu
		this.registerEvent(
			this.app.workspace.on("editor-menu", (menu, editor) => {
				const word = this.getWordFromEditor(editor);
				if (word) {
					menu.addItem((item) => {
						item.setTitle(`Look up "${word}"`)
							.setIcon("book-open")
							.onClick(() => {
								this.lookupInSidebar(word);
							});
					});
				}
			})
		);

		// Load enabled dictionaries
		await this.loadEnabledDictionaries();
	}

	onunload(): void {
		this.popoverView.hide();
		this.lookupEngine.unloadAll();
		this.languageDetector.clearCache();
	}

	async loadSettings(): Promise<void> {
		const data = await this.loadData();
		this.settings = Object.assign({}, DEFAULT_SETTINGS, data);

		// Ensure all supported languages have state entries
		for (const lang of SUPPORTED_LANGUAGES) {
			if (!this.settings.languages[lang.code]) {
				this.settings.languages[lang.code] = {
					enabled: false,
					downloaded: false,
					version: null,
					size: 0,
					lastUpdated: 0,
				};
			}
		}
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
		this.dictionaryManager.updateSettings(this.settings);
		this.popoverView.updateSettings(this.settings);
	}

	private async loadEnabledDictionaries(): Promise<void> {
		for (const lang of SUPPORTED_LANGUAGES) {
			const state = this.settings.languages[lang.code];
			if (state.enabled && state.downloaded) {
				await this.lookupEngine.loadDictionary(lang.code);
			}
		}
	}

	private async activateSidebar(): Promise<void> {
		const leaves =
			this.app.workspace.getLeavesOfType(DICTIONARY_VIEW_TYPE);
		if (leaves.length > 0) {
			this.app.workspace.revealLeaf(leaves[0]);
			return;
		}

		const leaf = this.app.workspace.getRightLeaf(false);
		if (leaf) {
			await leaf.setViewState({
				type: DICTIONARY_VIEW_TYPE,
				active: true,
			});
			this.app.workspace.revealLeaf(leaf);
		}
	}

	private lookupInSidebar(word: string): void {
		this.activateSidebar().then(() => {
			const leaves =
				this.app.workspace.getLeavesOfType(DICTIONARY_VIEW_TYPE);
			if (leaves.length > 0) {
				const sidebar = leaves[0].view as DictionarySidebar;
				sidebar.setSearchWord(word);
			}
		});
	}

	/**
	 * Get the selected word, or the word under the cursor if nothing is selected.
	 */
	private getWordFromEditor(editor: Editor): string | null {
		const selection = editor.getSelection();
		if (selection && selection.trim().length >= 2) {
			return selection.trim().split(/\s+/)[0];
		}

		// Get word under cursor
		const cursor = editor.getCursor();
		const line = editor.getLine(cursor.line);
		if (!line) return null;

		// Find word boundaries around cursor
		let start = cursor.ch;
		let end = cursor.ch;
		const wordChars = /[\p{L}\p{N}'-]/u;

		while (start > 0 && wordChars.test(line[start - 1])) start--;
		while (end < line.length && wordChars.test(line[end])) end++;

		const word = line.slice(start, end);
		return word.length >= 2 ? word : null;
	}

	private handleDoubleClick(evt: MouseEvent): void {
		// Only trigger within the editor area
		const target = evt.target as HTMLElement;
		if (!target.closest(".cm-content")) {
			return;
		}

		// Small delay to let the browser finish selecting the word
		setTimeout(() => {
			const selection = window.getSelection();
			if (!selection || selection.isCollapsed) return;

			const text = selection.toString().trim();
			if (!text || text.length < 2 || /\s/.test(text)) return;

			const range = selection.getRangeAt(0);
			const rect = range.getBoundingClientRect();
			this.popoverView.onWordSelected(text, rect);
		}, 10);
	}
}
