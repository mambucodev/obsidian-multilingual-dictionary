import { Plugin, WorkspaceLeaf, EditorView } from "obsidian";
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

		// Add command: Look up selected word
		this.addCommand({
			id: "lookup-selected-word",
			name: "Look up selected word",
			editorCallback: (editor) => {
				const selection = editor.getSelection();
				if (selection) {
					this.lookupInSidebar(selection.trim());
				}
			},
		});

		// Register selection event for popover
		this.registerDomEvent(document, "mouseup", (evt: MouseEvent) => {
			this.handleSelectionChange(evt);
		});

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

	private handleSelectionChange(evt: MouseEvent): void {
		const selection = window.getSelection();
		if (!selection || selection.isCollapsed) {
			return;
		}

		const text = selection.toString().trim();
		if (!text || text.length < 2 || text.includes(" ")) {
			return;
		}

		// Only trigger within the editor area
		const target = evt.target as HTMLElement;
		if (!target.closest(".cm-content")) {
			return;
		}

		const range = selection.getRangeAt(0);
		const rect = range.getBoundingClientRect();
		this.popoverView.onTextSelected(text, rect);
	}
}
