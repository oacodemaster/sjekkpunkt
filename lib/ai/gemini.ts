import 'server-only';
import { GoogleGenAI } from '@google/genai';

let client: GoogleGenAI | null = null;

/** One Gemini client per server instance, shared by vision and translation. */
export function gemini(): GoogleGenAI {
  if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is not set');
  client ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return client;
}
