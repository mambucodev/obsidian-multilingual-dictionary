export interface SynsetEntry {
	synset_id: string;
	pos: string;
	definition: string;
	examples: string[];
	synonyms: string[];
	hypernyms: string[];
	hyponyms: string[];
}

export interface DictionaryData {
	version: string;
	language: string;
	index: Record<string, SynsetEntry[]>;
}

export interface LanguageInfo {
	code: string;
	name: string;
	downloadUrl: string;
	estimatedSize: string;
}

export interface LanguageState {
	enabled: boolean;
	downloaded: boolean;
	version: string | null;
	size: number;
	lastUpdated: number;
}

export interface DictionarySettings {
	languages: Record<string, LanguageState>;
	defaultLanguage: string;
	autoDetect: boolean;
	showInPopover: {
		definitions: boolean;
		examples: boolean;
		synonyms: boolean;
		relatedWords: boolean;
	};
}

export const SUPPORTED_LANGUAGES: LanguageInfo[] = [
	{ code: "en", name: "English", downloadUrl: "", estimatedSize: "35 MB" },
	{ code: "it", name: "Italian", downloadUrl: "", estimatedSize: "18 MB" },
	{ code: "es", name: "Spanish", downloadUrl: "", estimatedSize: "22 MB" },
	{ code: "fr", name: "French", downloadUrl: "", estimatedSize: "20 MB" },
	{ code: "de", name: "German", downloadUrl: "", estimatedSize: "25 MB" },
	{ code: "pt", name: "Portuguese", downloadUrl: "", estimatedSize: "19 MB" },
	{ code: "nl", name: "Dutch", downloadUrl: "", estimatedSize: "21 MB" },
	{ code: "pl", name: "Polish", downloadUrl: "", estimatedSize: "23 MB" },
	{ code: "ja", name: "Japanese", downloadUrl: "", estimatedSize: "30 MB" },
	{ code: "zh", name: "Chinese", downloadUrl: "", estimatedSize: "28 MB" },
];

export const DEFAULT_SETTINGS: DictionarySettings = {
	languages: Object.fromEntries(
		SUPPORTED_LANGUAGES.map((lang) => [
			lang.code,
			{
				enabled: false,
				downloaded: false,
				version: null,
				size: 0,
				lastUpdated: 0,
			},
		])
	),
	defaultLanguage: "en",
	autoDetect: true,
	showInPopover: {
		definitions: true,
		examples: true,
		synonyms: true,
		relatedWords: true,
	},
};

export const DICTIONARY_VIEW_TYPE = "dictionary-sidebar";
export const DATA_DIR = "multilingual-dictionary/data";
