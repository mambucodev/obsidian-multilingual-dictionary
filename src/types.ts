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

export type ArchiveFormat = "xml.gz" | "tar.xz";

export interface LanguageInfo {
	code: string;
	name: string;
	downloadUrl: string;
	format: ArchiveFormat;
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

const OMW_BASE =
	"https://github.com/omwn/omw-data/releases/download/v1.4";
const EWN_BASE =
	"https://github.com/globalwordnet/english-wordnet/releases/download/2025-edition";

export const SUPPORTED_LANGUAGES: LanguageInfo[] = [
	{ code: "en", name: "English", downloadUrl: `${EWN_BASE}/english-wordnet-2025.xml.gz`, format: "xml.gz", estimatedSize: "10 MB" },
	{ code: "it", name: "Italian", downloadUrl: `${OMW_BASE}/omw-it-1.4.tar.xz`, format: "tar.xz", estimatedSize: "1.4 MB" },
	{ code: "es", name: "Spanish", downloadUrl: `${OMW_BASE}/omw-es-1.4.tar.xz`, format: "tar.xz", estimatedSize: "1.5 MB" },
	{ code: "fr", name: "French", downloadUrl: `${OMW_BASE}/omw-fr-1.4.tar.xz`, format: "tar.xz", estimatedSize: "2.5 MB" },
	{ code: "de", name: "German", downloadUrl: `${OMW_BASE}/omw-de-1.4.tar.xz`, format: "tar.xz", estimatedSize: "1.2 MB" },
	{ code: "pt", name: "Portuguese", downloadUrl: `${OMW_BASE}/omw-pt-1.4.tar.xz`, format: "tar.xz", estimatedSize: "1.5 MB" },
	{ code: "nl", name: "Dutch", downloadUrl: `${OMW_BASE}/omw-nl-1.4.tar.xz`, format: "tar.xz", estimatedSize: "1.0 MB" },
	{ code: "pl", name: "Polish", downloadUrl: `${OMW_BASE}/omw-pl-1.4.tar.xz`, format: "tar.xz", estimatedSize: "1.8 MB" },
	{ code: "ja", name: "Japanese", downloadUrl: `${OMW_BASE}/omw-ja-1.4.tar.xz`, format: "tar.xz", estimatedSize: "2.0 MB" },
	{ code: "zh", name: "Chinese", downloadUrl: `${OMW_BASE}/omw-cmn-1.4.tar.xz`, format: "tar.xz", estimatedSize: "1.0 MB" },
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
