/**
 * File Manager — Управление временными файлами для GLM Chat
 * Нулевые внешние зависимости — только Node.js built-ins
 */

import {
  readFileSync, writeFileSync, unlinkSync,
  existsSync, mkdirSync, readdirSync, statSync,
  createReadStream, createWriteStream,
} from 'fs';
import { join, dirname, extname, basename } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE_DIR = join(__dirname, '..');

const DIRS = {
  TMP:       join(BASE_DIR, 'tmp'),
  UPLOADS:   join(BASE_DIR, 'uploads'),
  DOWNLOADS: join(BASE_DIR, 'downloads'),
};

// Форматы требующие конвертации в .txt перед отправкой в GLM
const CONVERT_TO_TXT = [
  '.java', '.js', '.ts', '.kt', '.scala',
  '.go', '.rs', '.cpp', '.c', '.cs', '.rb', '.php', '.swift',
];

// Форматы нативно поддерживаемые chat.z.ai
const NATIVE_FORMATS = [
  '.pdf', '.docx', '.doc', '.xls', '.xlsx', '.ppt', '.pptx',
  '.txt', '.md', '.py', '.bmp', '.gif', '.mp4',
];

// Форматы для inline-вставки (маленькие конфиги)
const ALWAYS_INLINE = [
  '.json', '.xml', '.yaml', '.yml', '.properties', '.env',
];

function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function ensureAllDirs() {
  Object.values(DIRS).forEach(ensureDir);
}

function uniqueSuffix() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function getMimeType(filePath) {
  const ext = extname(filePath).toLowerCase();
  const mimes = {
    '.txt': 'text/plain', '.md': 'text/markdown',
    '.pdf': 'application/pdf', '.json': 'application/json',
    '.js': 'text/javascript', '.ts': 'text/typescript',
    '.java': 'text/x-java-source', '.py': 'text/x-python',
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.png': 'image/png', '.gif': 'image/gif',
    '.mp4': 'video/mp4', '.zip': 'application/zip',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  };
  return mimes[ext] || 'application/octet-stream';
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

class FileManager {
  constructor() {
    ensureAllDirs();
    this.fileRegistry = new Map();
  }

  getFileType(filePath) {
    const ext = extname(filePath).toLowerCase();
    if (NATIVE_FORMATS.includes(ext)) return 'native';
    if (CONVERT_TO_TXT.includes(ext)) return 'code';
    if (ALWAYS_INLINE.includes(ext)) return 'inline';
    return 'unknown';
  }

  /**
   * Конвертирует файл кода в .txt
   * @param {string} sourcePath
   * @returns {string} путь к .txt файлу
   */
  convertToTxt(sourcePath) {
    ensureDir(DIRS.TMP);
    const name = basename(sourcePath, extname(sourcePath));
    const outPath = join(DIRS.TMP, `${name}_${uniqueSuffix()}.txt`);
    writeFileSync(outPath, readFileSync(sourcePath, 'utf8'), 'utf8');
    console.log(`[FileManager] Converted: ${sourcePath} -> ${outPath}`);
    return outPath;
  }

  /**
   * Подготовка файла к отправке в GLM
   * @returns {Promise<{success, id, path, converted, type, mime, metadata}>}
   */
  async stageFile(sourcePath, options = {}) {
    const { convert = true } = options;
    const ext = extname(sourcePath).toLowerCase();
    const type = this.getFileType(sourcePath);

    try {
      const stats = statSync(sourcePath);
      let stagedPath = sourcePath;
      let convertedPath = null;

      if (convert && CONVERT_TO_TXT.includes(ext)) {
        convertedPath = this.convertToTxt(sourcePath);
        stagedPath = convertedPath;
      }

      const id = uniqueSuffix();
      this.fileRegistry.set(id, {
        id, original: sourcePath, staged: stagedPath,
        converted: convertedPath, type,
        mime: getMimeType(stagedPath), timestamp: Date.now(),
        metadata: { size: stats.size, sizeHuman: formatBytes(stats.size) },
      });

      return {
        success: true, id, path: stagedPath,
        converted: convertedPath, type,
        mime: getMimeType(stagedPath),
        metadata: { size: stats.size, sizeHuman: formatBytes(stats.size) },
      };
    } catch (error) {
      console.error(`[FileManager] stageFile error:`, error.message);
      return { success: false, error: error.message, path: sourcePath };
    }
  }

  async processGLMDownload(downloadInfo) {
    ensureDir(DIRS.DOWNLOADS);
    return await this.stageFile(downloadInfo.path || downloadInfo.name, { convert: false });
  }

  /**
   * Очистка временных файлов
   * @param {number} olderThanHours - 0 = все файлы
   */
  async cleanupTempFiles(olderThanHours = 24) {
    let deleted = 0;
    const cutoff = Date.now() - (olderThanHours * 3600 * 1000);

    for (const [id, info] of this.fileRegistry.entries()) {
      if (olderThanHours === 0 || info.timestamp <= cutoff) {
        try {
          if (info.converted && existsSync(info.converted)) {
            unlinkSync(info.converted);
            deleted++;
          }
          this.fileRegistry.delete(id);
        } catch { /* нормально */ }
      }
    }

    // Чистим tmp/ директорию
    try {
      if (existsSync(DIRS.TMP)) {
        for (const file of readdirSync(DIRS.TMP)) {
          const fp = join(DIRS.TMP, file);
          try {
            const st = statSync(fp);
            if (st.isFile() && (olderThanHours === 0 || st.mtimeMs <= cutoff)) {
              unlinkSync(fp);
              deleted++;
            }
          } catch { /* нормально */ }
        }
      }
    } catch { /* нормально */ }

    if (deleted > 0) console.log(`[FileManager] Cleaned ${deleted} temp files`);
    return deleted;
  }

  getFileInfo(fileId) { return this.fileRegistry.get(fileId) || null; }
  listFiles(filter = {}) {
    const files = Array.from(this.fileRegistry.values());
    if (filter.type) return files.filter(f => f.type === filter.type);
    return files;
  }
}

const fileManager = new FileManager();
export { fileManager, FileManager };
