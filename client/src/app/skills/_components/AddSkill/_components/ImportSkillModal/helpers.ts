/**
 * Read a file as base64 for the import preview (the API takes JSON, not multipart).
 * @param file The chosen file.
 * @returns Its content, base64-encoded without the data-URL prefix.
 */
export function readFileAsBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.onload = () => {
      const url = String(reader.result ?? "");
      resolve(url.slice(url.indexOf(",") + 1));
    };
    reader.readAsDataURL(file);
  });
}

/**
 * @param bytes A size in bytes.
 * @returns The size in KB with one decimal, for the chosen-file label.
 */
export function kilobytes(bytes: number): string {
  return (bytes / 1024).toFixed(1);
}
