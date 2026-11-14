// Lets tests import route handlers that use the "@/..." path alias (same mapping as tsconfig.json).
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({ resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } } });
