// Validação client-side para uploads no bucket `product-media`.
// A workspace bloqueia buckets públicos, então o servidor não pode aplicar
// `file_size_limit` / `allowed_mime_types` diretamente via UI; enforce aqui.

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB

export const ALLOWED_IMAGE_MIMES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export function assertValidImage(file: File): void {
  if (!(ALLOWED_IMAGE_MIMES as readonly string[]).includes(file.type)) {
    throw new Error(`Formato não suportado (${file.type || "desconhecido"}). Use JPG, PNG, WEBP ou GIF.`);
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error(`Arquivo muito grande (${(file.size / 1024 / 1024).toFixed(1)} MB). Limite: 5 MB.`);
  }
}

export function safeExtension(file: File): string {
  return EXT_BY_MIME[file.type] ?? "bin";
}