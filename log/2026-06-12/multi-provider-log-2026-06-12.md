# Multi-Provider Consultation Log — 2026-06-12

## Вопрос
Какой подход к обработке ошибок в микросервисной архитектуре Spring Boot ты считаешь лучшим?

## GLM (чат 1920e7ee)
- Уверенность: 9/10
- Подход: Многоуровневая стратегия + @ControllerAdvice + кастомный ApiError
- Ключевое: Netflix-подход, resilience4j, fallback patterns

## DeepSeek (чат 735ff162)
- Уверенность: 95%
- Подход: RFC 7807 (Problem Details) + @ControllerAdvice + ErrorResponse
- Ключевое: стандартизированный формат, traceId, instance URI

## Qwen (чат a2cac957)
- Уверенность: 95%
- Подход: RFC 9457 (ProblemDetail Spring 3 нативно) + 5 уровней
- Ключевое: Spring 3 нативный ProblemDetail, traceId, наблюдаемость

## Консенсус
- ✅ Все 3: @ControllerAdvice + стандартизированный формат ошибок
- ⚠️ GLM: кастомный DTO vs Qwen+DeepSeek: RFC 7807/9457
- 🏆 Qwen: самое современное решение (Spring 3 нативный ProblemDetail)
