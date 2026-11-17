import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

// 部分 Word 样式同时声明了主题字体和明确的中文字体，LibreOffice 可能将同一标题
// 拆成多种字体。这里只处理已知冲突的 Noto Sans CJK SC，避免改变其他文档的排版。
export function normalizeWordFonts(input: Uint8Array): Uint8Array {
  let total = 0;
  // DOCX 是 ZIP 包；按条目声明的解压大小累计设限，避免处理过大的文档。
  const files = unzipSync(input, {
    filter(entry) {
      total += entry.originalSize;
      if (total > 128 * 1024 * 1024) throw new Error("Word 文件解压后超过 128 MB。");
      return true;
    },
  });
  const styles = files["word/styles.xml"];
  if (!styles) throw new Error("Word 文件缺少样式数据。");
  const xml = strFromU8(styles);
  // 仅当西文、混合文本和东亚字体均明确指定同一目标字体时，移除竞争的主题属性。
  const updated = xml.replace(/<w:rFonts\b[^>]*\/?\s*>/g, (tag) => {
    const font = (name: string) => tag.match(new RegExp(`\\bw:${name}="([^"]*)"`))?.[1];
    if (font("ascii") !== "Noto Sans CJK SC" || font("hAnsi") !== font("ascii") || font("eastAsia") !== font("ascii")) return tag;
    return tag.replace(/\s+w:(?:asciiTheme|hAnsiTheme|eastAsiaTheme)="[^"]*"/g, "");
  });
  // 没有匹配项时保留原始字节；有变更时只替换样式文件后重新打包。
  if (updated === xml) return input;
  files["word/styles.xml"] = strToU8(updated);
  return zipSync(files, { level: 6 });
}
