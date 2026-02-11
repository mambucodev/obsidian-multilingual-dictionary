import * as pako from "pako";

export function decompressGzip(data: ArrayBuffer): string {
	const decompressed = pako.inflate(new Uint8Array(data));
	return new TextDecoder().decode(decompressed);
}

export function compressGzip(data: string): Uint8Array {
	return pako.gzip(new TextEncoder().encode(data));
}
