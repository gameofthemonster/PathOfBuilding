import { inflate } from "pako"

/**
 * 将 POB build string 解码为 XML 文本。
 * POB build string = base64url(zlib-deflate(xml))
 */
export function decodeBuildString(buildCode: string): string {
  // base64url → base64 标准格式
  const b64 = buildCode
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(buildCode.length + (4 - (buildCode.length % 4)) % 4, "=")

  // base64 → Uint8Array
  const binaryStr = atob(b64)
  const bytes = new Uint8Array(binaryStr.length)
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i)
  }

  // zlib inflate → string
  const xml = inflate(bytes, { to: "string" })
  return xml
}
