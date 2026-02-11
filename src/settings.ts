import { App, Plugin, PluginSettingTab, Setting, Notice } from "obsidian";
import {
	DictionarySettings,
	SUPPORTED_LANGUAGES,
	LanguageInfo,
	IDictionaryPlugin,
} from "./types";

export class DictionarySettingTab extends PluginSettingTab {
	plugin: Plugin & IDictionaryPlugin;

	constructor(app: App, plugin: Plugin & IDictionaryPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		this.addGeneralSettings(containerEl);
		this.addLanguageSettings(containerEl);
		this.addDisplaySettings(containerEl);
		this.addDangerZone(containerEl);
	}

	private addGeneralSettings(containerEl: HTMLElement): void {
		new Setting(containerEl).setName("Default language").addDropdown(
			(dropdown) => {
				for (const lang of SUPPORTED_LANGUAGES) {
					dropdown.addOption(lang.code, lang.name);
				}
				dropdown.setValue(this.plugin.settings.defaultLanguage);
				dropdown.onChange(async (value) => {
					this.plugin.settings.defaultLanguage = value;
					await this.plugin.saveSettings();
				});
			}
		);

		new Setting(containerEl)
			.setName("Auto-detect language")
			.setDesc(
				"Automatically detect the language of selected text from loaded dictionaries"
			)
			.addToggle((toggle) => {
				toggle.setValue(this.plugin.settings.autoDetect);
				toggle.onChange(async (value) => {
					this.plugin.settings.autoDetect = value;
					await this.plugin.saveSettings();
				});
			});
	}

	private addLanguageSettings(containerEl: HTMLElement): void {
		containerEl.createEl("h3", { text: "Installed dictionaries" });

		for (const lang of SUPPORTED_LANGUAGES) {
			this.addLanguageEntry(containerEl, lang);
		}
	}

	private addLanguageEntry(
		containerEl: HTMLElement,
		lang: LanguageInfo
	): void {
		const state = this.plugin.settings.languages[lang.code];

		const setting = new Setting(containerEl)
			.setName(`${lang.name} (${lang.code})`)
			.addToggle((toggle) => {
				toggle.setValue(state.enabled);
				toggle.setTooltip("Enable this language");
				toggle.onChange(async (value) => {
					state.enabled = value;
					await this.plugin.saveSettings();
					if (value && state.downloaded) {
						await this.plugin.lookupEngine.loadDictionary(
							lang.code
						);
					} else if (!value) {
						this.plugin.lookupEngine.unloadDictionary(lang.code);
					}
				});
			});

		if (state.downloaded) {
			const lastUpdated = state.lastUpdated
				? new Date(state.lastUpdated).toLocaleDateString()
				: "Unknown";
			const sizeStr = state.size
				? `${(state.size / (1024 * 1024)).toFixed(1)} MB`
				: "Unknown size";
			const version = state.version ?? "Unknown";

			setting.setDesc(
				`Downloaded (v${version}, ${sizeStr}, Updated: ${lastUpdated})`
			);

			setting.addButton((btn) => {
				btn.setButtonText("Remove");
				btn.setWarning();
				btn.onClick(async () => {
					await this.plugin.dictionaryManager.removeDictionary(
						lang.code
					);
					this.plugin.lookupEngine.unloadDictionary(lang.code);
					await this.plugin.saveSettings();
					this.display();
				});
			});
		} else {
			setting.setDesc(`Not downloaded (~${lang.estimatedSize})`);

			if (lang.downloadUrl) {
				setting.addButton((btn) => {
					btn.setButtonText(
						`Download (${lang.estimatedSize})`
					);
					btn.setCta();
					btn.onClick(async () => {
						btn.setDisabled(true);
						btn.setButtonText("Downloading...");
						const success =
							await this.plugin.dictionaryManager.downloadDictionary(
								lang.code
							);
						if (success) {
							state.enabled = true;
							await this.plugin.saveSettings();
							await this.plugin.lookupEngine.loadDictionary(
								lang.code
							);
						}
						this.display();
					});
				});
			}

			setting.addButton((btn) => {
				btn.setButtonText("Import JSON");
				btn.onClick(() => {
					this.importDictionary(lang.code);
				});
			});

			setting.addButton((btn) => {
				btn.setButtonText("Import .gz");
				btn.onClick(() => {
					this.importGzipDictionary(lang.code);
				});
			});
		}
	}

	private importDictionary(lang: string): void {
		const input = document.createElement("input");
		input.type = "file";
		input.accept = ".json";
		input.onchange = async () => {
			const file = input.files?.[0];
			if (!file) return;

			try {
				const text = await file.text();
				const success =
					await this.plugin.dictionaryManager.importDictionaryFromFile(
						lang,
						text
					);
				if (success) {
					this.plugin.settings.languages[lang].enabled = true;
					await this.plugin.saveSettings();
					await this.plugin.lookupEngine.loadDictionary(lang);
					this.display();
				}
			} catch (error) {
				new Notice(`Failed to read file: ${error}`);
			}
		};
		input.click();
	}

	private importGzipDictionary(lang: string): void {
		const input = document.createElement("input");
		input.type = "file";
		input.accept = ".gz";
		input.onchange = async () => {
			const file = input.files?.[0];
			if (!file) return;

			try {
				const buffer = await file.arrayBuffer();
				const success =
					await this.plugin.dictionaryManager.importDictionaryFromGzip(
						lang,
						buffer
					);
				if (success) {
					this.plugin.settings.languages[lang].enabled = true;
					await this.plugin.saveSettings();
					await this.plugin.lookupEngine.loadDictionary(lang);
					this.display();
				}
			} catch (error) {
				new Notice(`Failed to read file: ${error}`);
			}
		};
		input.click();
	}

	private addDisplaySettings(containerEl: HTMLElement): void {
		containerEl.createEl("h3", { text: "Display options" });

		new Setting(containerEl)
			.setName("Show definitions in popover")
			.addToggle((toggle) => {
				toggle.setValue(
					this.plugin.settings.showInPopover.definitions
				);
				toggle.onChange(async (value) => {
					this.plugin.settings.showInPopover.definitions = value;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName("Show examples in popover")
			.addToggle((toggle) => {
				toggle.setValue(this.plugin.settings.showInPopover.examples);
				toggle.onChange(async (value) => {
					this.plugin.settings.showInPopover.examples = value;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName("Show synonyms in popover")
			.addToggle((toggle) => {
				toggle.setValue(this.plugin.settings.showInPopover.synonyms);
				toggle.onChange(async (value) => {
					this.plugin.settings.showInPopover.synonyms = value;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName("Show related words in popover")
			.setDesc("Hypernyms and hyponyms")
			.addToggle((toggle) => {
				toggle.setValue(
					this.plugin.settings.showInPopover.relatedWords
				);
				toggle.onChange(async (value) => {
					this.plugin.settings.showInPopover.relatedWords = value;
					await this.plugin.saveSettings();
				});
			});
	}

	private addDangerZone(containerEl: HTMLElement): void {
		containerEl.createEl("h3", { text: "Data management" });

		new Setting(containerEl)
			.setName("Clear all downloaded data")
			.setDesc("Remove all downloaded dictionary files")
			.addButton((btn) => {
				btn.setButtonText("Clear all data");
				btn.setWarning();
				btn.onClick(async () => {
					await this.plugin.dictionaryManager.removeAllDictionaries();
					this.plugin.lookupEngine.unloadAll();
					await this.plugin.saveSettings();
					this.display();
				});
			});
	}
}
