import { App, Notice, requestUrl } from "obsidian";
import { decompressGzip } from "./utils/compression";
import {
	parseWnLmf,
	parseWnLmfDefinitions,
	extractOffset,
} from "./utils/wn-lmf-parser";
import { XzReadableStream } from "xz-decompress";
import { parseTar } from "nanotar";
import {
	DictionaryData,
	DictionarySettings,
	DictionarySource,
	SynsetEntry,
	DATA_DIR,
	SUPPORTED_LANGUAGES,
} from "./types";

const EN_FALLBACK_SOURCE: DictionarySource = {
	url: "https://github.com/omwn/omw-data/releases/download/v1.4/omw-en-1.4.tar.xz",
	format: "tar.xz",
	label: "English definitions (fallback)",
};

export class DictionaryManager {
	private app: App;
	private settings: DictionarySettings;
	private basePath: string;

	constructor(app: App, settings: DictionarySettings) {
		this.app = app;
		this.settings = settings;
		this.basePath = `${this.app.vault.configDir}/plugins/${DATA_DIR}`;
	}

	updateSettings(settings: DictionarySettings): void {
		this.settings = settings;
	}

	private getDictPath(lang: string): string {
		return `${this.basePath}/${lang}-dict.json`;
	}

	async ensureDataDir(): Promise<void> {
		const adapter = this.app.vault.adapter;
		if (!(await adapter.exists(this.basePath))) {
			await adapter.mkdir(this.basePath);
		}
	}

	async downloadDictionary(
		lang: string,
		onProgress?: (message: string) => void
	): Promise<boolean> {
		const langInfo = SUPPORTED_LANGUAGES.find((l) => l.code === lang);
		if (!langInfo) {
			new Notice(`Unknown language: ${lang}`);
			return false;
		}

		if (langInfo.sources.length === 0) {
			new Notice(
				`No download sources configured for ${langInfo.name}. ` +
					`Use the import buttons to load a dictionary file manually.`
			);
			return false;
		}

		const notice = new Notice(
			`Downloading ${langInfo.name} dictionary...`,
			0
		);

		try {
			await this.ensureDataDir();

			let merged: DictionaryData | null = null;

			for (let i = 0; i < langInfo.sources.length; i++) {
				const source = langInfo.sources[i];
				const label = source.label;
				onProgress?.(
					`Downloading ${label} (${i + 1}/${langInfo.sources.length})...`
				);

				const response = await requestUrl({ url: source.url });
				onProgress?.(`Extracting ${label}...`);

				const xml = await this.extractXml(
					response.arrayBuffer,
					source
				);

				onProgress?.(`Parsing ${label}...`);
				const dictData = parseWnLmf(xml, lang);

				if (!merged) {
					merged = dictData;
				} else {
					this.mergeDictionaries(merged, dictData);
				}
			}

			if (!merged) {
				throw new Error("No dictionary data produced");
			}

			// Backfill missing definitions with English for non-English languages
			if (lang !== "en") {
				await this.backfillEnglishDefinitions(
					merged,
					onProgress
				);
			}

			onProgress?.("Saving...");
			const jsonStr = JSON.stringify(merged);
			await this.app.vault.adapter.write(
				this.getDictPath(lang),
				jsonStr
			);

			this.settings.languages[lang].downloaded = true;
			this.settings.languages[lang].version = merged.version;
			this.settings.languages[lang].size = jsonStr.length;
			this.settings.languages[lang].lastUpdated = Date.now();

			notice.hide();
			new Notice(`${langInfo.name} dictionary installed successfully!`);
			onProgress?.("Done!");
			return true;
		} catch (error) {
			notice.hide();
			const msg =
				error instanceof Error ? error.message : String(error);
			new Notice(
				`Failed to download ${langInfo.name} dictionary: ${msg}`
			);
			onProgress?.(`Error: ${msg}`);
			return false;
		}
	}

	/**
	 * Download the OMW English source and backfill any entries that have
	 * no definition with the matching English definition (by PWN offset).
	 */
	private async backfillEnglishDefinitions(
		dict: DictionaryData,
		onProgress?: (message: string) => void
	): Promise<void> {
		onProgress?.("Downloading English definitions for fallback...");

		const response = await requestUrl({ url: EN_FALLBACK_SOURCE.url });
		onProgress?.("Extracting English definitions...");

		const xml = await this.extractXml(
			response.arrayBuffer,
			EN_FALLBACK_SOURCE
		);

		onProgress?.("Parsing English definitions...");
		const enDefs = parseWnLmfDefinitions(xml);

		// Backfill: for each entry with no definition, look up by offset
		let filled = 0;
		for (const entries of Object.values(dict.index)) {
			for (const entry of entries as SynsetEntry[]) {
				if (entry.definition) continue;

				const offset = extractOffset(entry.synset_id);
				if (!offset) continue;

				const enDef = enDefs.get(offset);
				if (enDef) {
					entry.definition = enDef;
					entry.fallback = true;
					filled++;
				}
			}
		}

		onProgress?.(
			`Backfilled ${filled} definitions from English`
		);
	}

	/**
	 * Merge entries from `source` into `target`.
	 * For existing words, add new synset entries (deduplicated by synset_id).
	 * For new words, add them directly.
	 */
	private mergeDictionaries(
		target: DictionaryData,
		source: DictionaryData
	): void {
		for (const [word, entries] of Object.entries(source.index)) {
			const existing = target.index[word];
			if (!existing) {
				target.index[word] = entries;
			} else {
				// Merge: add entries with new synset_ids, prefer entries with definitions
				const existingIds = new Set(
					existing.map((e) => e.synset_id)
				);
				for (const entry of entries) {
					if (!existingIds.has(entry.synset_id)) {
						existing.push(entry);
					} else if (entry.definition) {
						// Replace existing empty entry with one that has a definition
						const idx = existing.findIndex(
							(e) =>
								e.synset_id === entry.synset_id &&
								!e.definition
						);
						if (idx !== -1) {
							existing[idx] = entry;
						}
					}
				}
			}
		}
	}

	/**
	 * Extract XML string from the downloaded archive.
	 */
	private async extractXml(
		data: ArrayBuffer,
		source: DictionarySource
	): Promise<string> {
		if (source.format === "xml.gz") {
			return decompressGzip(data);
		}

		// tar.xz: decompress xz, then extract tar, then find the XML
		const xzStream = new XzReadableStream(
			new Blob([data]).stream()
		);
		const tarBuffer = new Uint8Array(
			await new Response(xzStream).arrayBuffer()
		);

		const files = parseTar(tarBuffer);
		const xmlFile = files.find(
			(f) => f.name.endsWith(".xml") && f.data && f.data.length > 0
		);
		if (!xmlFile) {
			throw new Error(
				"No XML file found in archive. Contents: " +
					files.map((f) => f.name).join(", ")
			);
		}

		return new TextDecoder().decode(xmlFile.data);
	}

	async loadDictionary(lang: string): Promise<DictionaryData | null> {
		const path = this.getDictPath(lang);
		try {
			if (!(await this.app.vault.adapter.exists(path))) {
				return null;
			}
			const content = await this.app.vault.adapter.read(path);
			return JSON.parse(content) as DictionaryData;
		} catch (error) {
			console.error(`Failed to load ${lang} dictionary:`, error);
			return null;
		}
	}

	async removeDictionary(lang: string): Promise<void> {
		const path = this.getDictPath(lang);
		try {
			if (await this.app.vault.adapter.exists(path)) {
				await this.app.vault.adapter.remove(path);
			}
			this.settings.languages[lang].downloaded = false;
			this.settings.languages[lang].version = null;
			this.settings.languages[lang].size = 0;
			this.settings.languages[lang].lastUpdated = 0;

			const langName =
				SUPPORTED_LANGUAGES.find((l) => l.code === lang)?.name ?? lang;
			new Notice(`${langName} dictionary removed.`);
		} catch (error) {
			console.error(`Failed to remove ${lang} dictionary:`, error);
		}
	}

	async removeAllDictionaries(): Promise<void> {
		for (const lang of SUPPORTED_LANGUAGES) {
			if (this.settings.languages[lang.code]?.downloaded) {
				await this.removeDictionary(lang.code);
			}
		}
		new Notice("All dictionaries removed.");
	}

	isDictionaryDownloaded(lang: string): boolean {
		return this.settings.languages[lang]?.downloaded ?? false;
	}
}
