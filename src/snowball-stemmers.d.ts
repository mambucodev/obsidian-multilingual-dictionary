declare module "snowball-stemmers" {
	interface Stemmer {
		stem(word: string): string;
	}
	function newStemmer(language: string): Stemmer;
}
