/**
 * Blob-download — перехват URL.createObjectURL для получения файлов от GLM Agent Mode
 * 
 * Fix (по рекомендации GLM): readAsArrayBuffer вместо readAsDataURL для бинарных файлов
 * atob() ломает байты >127 — используем btoa(String.fromCharCode(...bytes))
 */

/**
 * Перехватить blob и кликнуть Download
 * @param {string} savePath — путь для сохранения (опционально)
 * @returns {Promise<{success: boolean, type: string, size: number, base64: string, content: string}>}
 */
function blobDownload(savePath) {
  return new Promise((resolve, reject) => {
    const orig = URL.createObjectURL;
    let resolved = false;

    URL.createObjectURL = function(blob) {
      const blobUrl = orig.call(URL, blob);

      const reader = new FileReader();
      reader.onerror = () => {
        if (!resolved) { resolved = true; reject(new Error('FileReader error')); }
      };

      // Для бинарных файлов — readAsArrayBuffer, для текста — readAsDataURL
      if (blob.type.startsWith('text/') || blob.type === 'application/json') {
        reader.onload = () => {
          const base64 = reader.result.split(',')[1];
          if (!resolved) {
            resolved = true;
            resolve({
              success: true,
              type: blob.type,
              size: blob.size,
              base64,
              content: atob(base64),
            });
          }
        };
        reader.readAsDataURL(blob);
      } else {
        // Бинарные файлы (PNG, ZIP, PDF) — корректная кодировка
        reader.onload = () => {
          const bytes = new Uint8Array(reader.result);
          let binary = '';
          for (let i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i]);
          }
          if (!resolved) {
            resolved = true;
            resolve({
              success: true,
              type: blob.type,
              size: blob.size,
              base64: btoa(binary),
              content: null, // Бинарные данные — только base64
            });
          }
        };
        reader.readAsArrayBuffer(blob);
      }

      return blobUrl;
    };

    // Кликнуть Download (по возможности)
    setTimeout(() => {
      const dlBtn = document.querySelector('button[title="Download file"]');
      if (dlBtn) {
        dlBtn.click();
      } else {
        // Fallback: поиск по SVG path (download icon)
        const btns = document.querySelectorAll('button');
        for (const btn of btns) {
          const svg = btn.querySelector('svg path');
          if (svg && svg.getAttribute('d')?.includes('M4 16v1a3')) {
            btn.click();
            break;
          }
        }
      }

      // Timeout — 10 сек для больших файлов
      setTimeout(() => {
        if (!resolved) { resolved = true; reject(new Error('Blob download timeout (10s)')); }
        URL.createObjectURL = orig; // Восстановить оригинальную функцию
      }, 10000);
    }, 200);
  });
}
