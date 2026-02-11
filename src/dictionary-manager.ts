import { App, Notice, requestUrl } from "obsidian";
import { decompressGzip } from "./utils/compression";
import { parseWnLmf } from "./utils/wn-lmf-parser";
import { XzReadableStream } from "xz-decompress";
import { parseTar } from "nanotar";
import {
	DictionaryData,
	DictionarySettings,
	DATA_DIR,
	SUPPORTED_LANGUAGES,
	LanguageInfo,
} from "./types";

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

		if (!langInfo.downloadUrl) {
			new Notice(
				`No download URL configured for ${langInfo.name}. ` +
					`Use the import buttons to load a dictionary file manually.`
			);
			return false;
		}

		const notice = new Notice(
			`Downloading ${langInfo.name} dictionary...`,
			0
		);
		onProgress?.(`Downloading ${langInfo.name} dictionary...`);

		try {
			await this.ensureDataDir();

			const response = await requestUrl({ url: langInfo.downloadUrl });
			onProgress?.("Extracting...");

			const xml = await this.extractXml(
				response.arrayBuffer,
				langInfo
			);

			onProgress?.("Parsing WordNet data...");
			const dictData = parseWnLmf(xml, lang);
			const jsonStr = JSON.stringify(dictData);

			onProgress?.("Saving...");
			await this.app.vault.adapter.write(
				this.getDictPath(lang),
				jsonStr
			);

			this.settings.languages[lang].downloaded = true;
			this.settings.languages[lang].version = dictData.version;
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
	 * Extract XML string from the downloaded archive.
	 * English: .xml.gz (gzip-compressed XML)
	 * Others: .tar.xz (xz-compressed tar containing an XML file)
	 */
	private async extractXml(
		data: ArrayBuffer,
		langInfo: LanguageInfo
	): Promise<string> {
		if (langInfo.format === "xml.gz") {
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

	async importDictionaryFromFile(
		lang: string,
		content: string
	): Promise<boolean> {
		try {
			// Validate it's proper dictionary JSON
			const parsed = JSON.parse(content) as DictionaryData;
			if (!parsed.index || !parsed.language || !parsed.version) {
				new Notice(
					"Invalid dictionary file: missing required fields (index, language, version)"
				);
				return false;
			}

			await this.ensureDataDir();
			await this.app.vault.adapter.write(
				this.getDictPath(lang),
				content
			);

			this.settings.languages[lang].downloaded = true;
			this.settings.languages[lang].version = parsed.version;
			this.settings.languages[lang].size = content.length;
			this.settings.languages[lang].lastUpdated = Date.now();

			new Notice(
				`${SUPPORTED_LANGUAGES.find((l) => l.code === lang)?.name ?? lang} dictionary imported successfully!`
			);
			return true;
		} catch (error) {
			const msg =
				error instanceof Error ? error.message : String(error);
			new Notice(`Failed to import dictionary: ${msg}`);
			return false;
		}
	}

	async importDictionaryFromGzip(
		lang: string,
		data: ArrayBuffer
	): Promise<boolean> {
		try {
			const jsonStr = decompressGzip(data);
			return await this.importDictionaryFromFile(lang, jsonStr);
		} catch (error) {
			const msg =
				error instanceof Error ? error.message : String(error);
			new Notice(`Failed to decompress dictionary: ${msg}`);
			return false;
		}
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
