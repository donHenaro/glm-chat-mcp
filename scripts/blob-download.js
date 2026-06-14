/**
 * scripts/blob-download.js v13.1
 * Перехват blob из GLM Agent Mode
 *
 * ИСПРАВЛЕНО (по замечаниям GLM + Qwen):
 * 1. URL.createObjectURL восстанавливается ПРИ ЛЮБОМ исходе (try/finally)
 * 2. Бинарные файлы: readAsArrayBuffer + btoa() → сохранение в файл
 * 3. Нельзя вернуть ArrayBuffer через page.evaluate() — сериализуется как {}
 *    → сохраняем в файл через saveAs() и возвращаем путь
 *
 * Вызов: browser_evaluate(filename='blob-download.js')
 */
(async () => {
  const __origCreateObjectURL = URL.createObjectURL;
  const __captured = { url: null, blob: null, content: null, filename: null, savePath: null };

  // Monkey-patch URL.createObjectURL
  URL.createObjectURL = function(blob) {
    __captured.blob = blob;
    __captured.url = __origCreateObjectURL.call(URL, blob);
    console.log('[blob-download] captured blob:', blob.type, blob.size, 'bytes');
    return __captured.url;
  };

  try {
    // Кликнуть скрытую Download кнопку
    const btn = document.querySelector('button[title="Download file"]');
    if (!btn) {
      // Fallback: поиск по SVG иконке (download arrow)
      const allBtns = document.querySelectorAll('button');
      const dlBtn = Array.from(allBtns).find(b => {
        const svg = b.querySelector('svg path[d*="M21 15v4a2"]');
        return !!svg;
      });
      if (!dlBtn) {
        return { error: 'no-download-btn', hint: 'Ask GLM to show file or use innerText fallback' };
      }
      dlBtn.click();
    } else {
      btn.click();
    }

    // Подождать захвата blob (GLM генерирует blob при клике)
    await new Promise(r => setTimeout(r, 500));

    if (!__captured.blob) {
      return { error: 'no-blob-captured', hint: 'GLM may not have created a file' };
    }

    // Читаем blob — для текстовых файлов текстом, для бинарных через ArrayBuffer
    const isText = __captured.blob.type.startsWith('text/') ||
                   __captured.blob.type === 'application/json' ||
                   __captured.blob.type === 'application/xml';

    if (isText) {
      __captured.content = await __captured.blob.text();
      // Извлечь filename из ближайшего элемента
      const fileCard = (btn || document.querySelector('button[title="Download file"]'))
        ?.closest('[class*="file"]') || document.querySelector('[class*="file-name"]');
      __captured.filename = fileCard?.textContent?.trim() || 'download.txt';
      return {
        ok: true,
        filename: __captured.filename,
        content: __captured.content,
        size: __captured.blob.size,
        type: __captured.blob.type
      };
    } else {
      // БИНАРНЫЕ ФАЙЛЫ: нельзя вернуть ArrayBuffer через evaluate()
      // Решение: используем Playwright download event (если доступен)
      // Fallback: читаем как base64 data URI
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => {
          const dataUri = reader.result; // data:mimetype;base64,...
          const base64 = dataUri.split(',')[1];
          resolve({
            ok: true,
            filename: 'download.bin',
            contentBase64: base64,
            size: __captured.blob.size,
            type: __captured.blob.type,
            // Агент должен декодировать: atob(contentBase64) → Uint8Array → write_file
            instruction: 'Use atob(contentBase64) to decode, then write_file as binary'
          });
        };
        reader.readAsDataURL(__captured.blob);
      });
    }
  } finally {
    // КРИТИЧЕСКИ: восстановить URL.createObjectURL при ЛЮБОМ исходе
    URL.createObjectURL = __origCreateObjectURL;
  }
})();
