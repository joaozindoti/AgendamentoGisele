// Compressão no navegador antes do upload: redimensiona pro lado maior e
// converte pra WebP. Foto de celular (3–8 MB) vira ~100–200 KB, sobe rápido
// no 4G e não pesa na agenda. Se o navegador não conseguir (formato que o
// canvas não lê, WebP sem suporte), devolve o arquivo original — o limite
// de 5 MB e o validar-foto continuam valendo do mesmo jeito.
export async function comprimirParaWebp(arquivo: File, ladoMaximo = 1200, qualidade = 0.82): Promise<File> {
  try {
    const bitmap = await createImageBitmap(arquivo);
    const escala = Math.min(1, ladoMaximo / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * escala);
    canvas.height = Math.round(bitmap.height * escala);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/webp", qualidade));
    if (!blob || blob.type !== "image/webp" || blob.size >= arquivo.size) return arquivo;
    return new File([blob], arquivo.name.replace(/\.[^.]+$/, "") + ".webp", { type: "image/webp" });
  } catch {
    return arquivo;
  }
}

export const TIPOS_FOTO = ["image/jpeg", "image/png", "image/webp"];
export const LIMITE_FOTO_BYTES = 5 * 1024 * 1024;
