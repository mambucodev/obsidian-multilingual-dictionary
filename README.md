# Obsidian Multilingual Dictionary

Offline dictionary lookups inside [Obsidian](https://obsidian.md). Download only the languages you need and look up words without ever leaving your notes.

## Features

- **10 languages** — English, Italian, Spanish, French, German, Portuguese, Dutch, Polish, Japanese, Chinese
- **Fully offline** — dictionaries are downloaded once and stored locally
- **Synonym popover** — double-click a word to see definitions, synonyms, and related words
- **Sidebar view** — dedicated dictionary panel with search and prefix autocomplete
- **Right-click lookup** — context menu option to look up any word
- **Stemmer support** — finds base forms of conjugated/inflected words (powered by Snowball)
- **Auto language detection** — detects the language of selected text across loaded dictionaries
- **Multiple sources per language** — merges dictionaries for better coverage (e.g. Italian uses both OMW and ItalWordNet)

## Installation

### From source

```bash
git clone https://github.com/mambucodev/obsidian-multilingual-dictionary.git
cd obsidian-multilingual-dictionary
npm install
npm run build
```

Copy `main.js`, `manifest.json`, and `styles.css` into your vault's `.obsidian/plugins/multilingual-dictionary/` folder.

### Manual install

Download the latest release and extract it into `.obsidian/plugins/multilingual-dictionary/`.

## Usage

1. Open **Settings > Multilingual Dictionary**
2. Click **Download** next to the languages you want
3. Look up words by:
   - **Double-clicking** a word to open the popover
   - **Right-clicking** a word and selecting "Look up in dictionary"
   - Opening the **Dictionary sidebar** from the ribbon icon and typing a search

## Dictionary sources

| Language   | Source                                     |
| ---------- | ------------------------------------------ |
| English    | [Open English WordNet 2025](https://github.com/globalwordnet/english-wordnet) |
| Italian    | [OMW Italian](https://github.com/omwn/omw-data) + [ItalWordNet](https://github.com/omwn/omw-data) |
| Spanish    | [OMW Spanish](https://github.com/omwn/omw-data) |
| French     | [WOLF French](https://github.com/omwn/omw-data) |
| German     | [OMW German](https://github.com/omwn/omw-data) |
| Portuguese | [OpenWN-PT](https://github.com/omwn/omw-data) |
| Dutch      | [Open Dutch WordNet](https://github.com/omwn/omw-data) |
| Polish     | [plWordNet](https://github.com/omwn/omw-data) |
| Japanese   | [Japanese WordNet](https://github.com/omwn/omw-data) |
| Chinese    | [Chinese WordNet](https://github.com/omwn/omw-data) |

All dictionaries use the [WN-LMF](https://globalwordnet.github.io/schemas/) format and are parsed directly within the plugin.

## Development

```bash
npm install
npm run dev     # watch mode
npm run build   # production build
```

Tests:

```bash
node test/test-lookup.mjs
node test/test-compression.mjs
node test/test-wn-lmf-parser.mjs
```

## License

[MIT](LICENSE)
