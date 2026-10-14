// tests/setup.ts — nạp chrome mock vào globalThis trước mỗi test file (TDD §12.2).
import { createChromeMock } from "./mocks/chrome";

(globalThis as unknown as { chrome: unknown }).chrome = createChromeMock();
