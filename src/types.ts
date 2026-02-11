export interface SynsetEntry {
	synset_id: string;
	pos: string;
	definition: string;
	examples: string[];
	synonyms: string[];
	hypernyms: string[];
	hyponyms: string[];
	/** True if the definition was backfilled from English */
	fallback?: boolean;
}

export interface DictionaryData {
	version: string;
	language: string;
	index: Record<string, SynsetEntry[]>;
}

export type ArchiveFormat = "xml.gz" | "tar.xz";

export interface DictionarySource {
	url: string;
	format: ArchiveFormat;
	label: string;
}

export interface LanguageInfo {
	code: string;
	name: string;
	sources: DictionarySource[];
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
	{
		code: "en", name: "English", estimatedSize: "10 MB",
		sources: [
			{ url: `${EWN_BASE}/english-wordnet-2025.xml.gz`, format: "xml.gz", label: "Open English WordNet 2025" },
		],
	},
	{
		code: "it", name: "Italian", estimatedSize: "2 MB",
		sources: [
			{ url: `${OMW_BASE}/omw-it-1.4.tar.xz`, format: "tar.xz", label: "OMW Italian" },
			{ url: `${OMW_BASE}/omw-iwn-1.4.tar.xz`, format: "tar.xz", label: "ItalWordNet" },
		],
	},
	{
		code: "es", name: "Spanish", estimatedSize: "1.5 MB",
		sources: [
			{ url: `${OMW_BASE}/omw-es-1.4.tar.xz`, format: "tar.xz", label: "OMW Spanish" },
		],
	},
	{
		code: "fr", name: "French", estimatedSize: "2.5 MB",
		sources: [
			{ url: `${OMW_BASE}/omw-fr-1.4.tar.xz`, format: "tar.xz", label: "WOLF French" },
		],
	},
	{
		code: "de", name: "German", estimatedSize: "1.2 MB",
		sources: [
			{ url: `${OMW_BASE}/omw-de-1.4.tar.xz`, format: "tar.xz", label: "OMW German" },
		],
	},
	{
		code: "pt", name: "Portuguese", estimatedSize: "1.5 MB",
		sources: [
			{ url: `${OMW_BASE}/omw-pt-1.4.tar.xz`, format: "tar.xz", label: "OpenWN-PT" },
		],
	},
	{
		code: "nl", name: "Dutch", estimatedSize: "1.0 MB",
		sources: [
			{ url: `${OMW_BASE}/omw-nl-1.4.tar.xz`, format: "tar.xz", label: "OpenDutchWordNet" },
		],
	},
	{
		code: "pl", name: "Polish", estimatedSize: "1.8 MB",
		sources: [
			{ url: `${OMW_BASE}/omw-pl-1.4.tar.xz`, format: "tar.xz", label: "plWordNet" },
		],
	},
	{
		code: "ja", name: "Japanese", estimatedSize: "2.0 MB",
		sources: [
			{ url: `${OMW_BASE}/omw-ja-1.4.tar.xz`, format: "tar.xz", label: "Japanese WordNet" },
		],
	},
	{
		code: "zh", name: "Chinese", estimatedSize: "1.0 MB",
		sources: [
			{ url: `${OMW_BASE}/omw-cmn-1.4.tar.xz`, format: "tar.xz", label: "Chinese WordNet" },
		],
	},
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

/**
 * Interface for the plugin instance, used by settings and sidebar
 * to avoid circular imports with main.ts.
 */
export interface IDictionaryPlugin {
	settings: DictionarySettings;
	dictionaryManager: import("./dictionary-manager").DictionaryManager;
	lookupEngine: import("./lookup-engine").LookupEngine;
	saveSettings(): Promise<void>;
}
