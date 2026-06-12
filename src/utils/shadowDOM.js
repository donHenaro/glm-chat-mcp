/**
 * Shadow DOM Utilities
 * 
 * IMPROVED v3.1: Поддержка современных веб-компонентов
 * 
 * Использование:
 * import { pierceShadowDOM, queryShadow } from './shadowDOM.js';
 * const elements = await queryShadow(page, 'my-custom-button');
 */

/**
 * Находит элементы внутри Shadow DOM
 * "Пробивает" shadow roots для поиска вложенных элементов
 * 
 * @param {Page} page - Playwright Page
 * @param {string} selector - CSS селектор
 * @returns {Promise<Array>} Массив найденных элементов
 */
export async function queryShadow(page, selector) {
  return await page.evaluateHandle((sel) => {
    // Прямые элементы
    const direct = Array.from(document.querySelectorAll(sel));
    
    // Элементы внутри shadow roots
    const shadowElements = [];
    
    function pierceRoots(root) {
      const all = root.querySelectorAll('*');
      for (const el of all) {
        if (el.shadowRoot) {
          const found = el.shadowRoot.querySelectorAll(sel);
          shadowElements.push(...found);
          pierceRoots(el.shadowRoot);
        }
      }
    }
    
    pierceRoots(document);
    
    return [...direct, ...shadowElements];
  }, selector);
}

/**
 * pierceShadowDOM — JavaScript код для внедрения в страницу
 * Используется через page.evaluate()
 */
export const pierceShadowDOMCode = `
function pierceShadowDOM(selector) {
  const results = [];
  
  // 1. Прямой поиск
  results.push(...document.querySelectorAll(selector));
  
  // 2. Поиск через Shadow DOM
  function traverseShadows(root) {
    const elements = root.querySelectorAll('*');
    for (const el of elements) {
      if (el.shadowRoot) {
        results.push(...el.shadowRoot.querySelectorAll(selector));
        traverseShadows(el.shadowRoot);
      }
    }
  }
  
  traverseShadows(document);
  return results;
}
`;

/**
 * Проверяет, находится ли элемент внутри Shadow DOM
 * 
 * @param {Element} element - DOM элемент
 * @returns {boolean} true если элемент в shadow root
 */
export function isInsideShadowDOM(element) {
  let parent = element.parentNode;
  while (parent) {
    if (parent.host) {
      return true; // Это shadow root
    }
    parent = parent.parentNode;
  }
  return false;
}

/**
 * Ожидает появления элемента, включая Shadow DOM
 * 
 * @param {Page} page - Playwright Page
 * @param {string} selector - CSS селектор
 * @param {object} options - Опции ожидания
 * @returns {Promise<Locator>} Playwright Locator
 */
export async function waitForShadowElement(page, selector, options = {}) {
  const { timeout = 10000, state = 'attached' } = options;
  
  // Сначала пробуем обычный поиск
  try {
    return await page.locator(selector).first();
  } catch {
    // Fallback: используем JavaScript injection
    await page.waitForFunction(
      (sel) => {
        // Прямой поиск
        if (document.querySelectorAll(sel).length > 0) return true;
        
        // Поиск через shadow roots
        function checkShadows(root) {
          const all = root.querySelectorAll('*');
          for (const el of all) {
            if (el.shadowRoot && el.shadowRoot.querySelectorAll(sel).length > 0) {
              return true;
            }
            if (el.shadowRoot && checkShadows(el.shadowRoot)) {
              return true;
            }
          }
          return false;
        }
        
        return checkShadows(document);
      },
      selector,
      { timeout }
    );
  }
  
  return await page.locator(selector).first();
}
