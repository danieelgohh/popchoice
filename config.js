import OpenAI from 'openai';
import { createClient } from "@supabase/supabase-js";

const openAIKey = import.meta.env.VITE_OPENAI_API_KEY
const supabaseKey = import.meta.env.VITE_SUPABASE_API_KEY
const supabaseURL = import.meta.env.VITE_SUPABASE_URL

/** OpenAI config */
if (!openAIKey) throw new Error("OpenAI API key is missing or invalid.");
export const openai = new OpenAI({
  apiKey: openAIKey,
  dangerouslyAllowBrowser: true
});

/** Supabase config */
const privateKey = supabaseKey;
if (!privateKey) throw new Error(`Expected env var SUPABASE_API_KEY`);
const url = supabaseURL;
if (!url) throw new Error(`Expected env var SUPABASE_URL`);
export const supabase = createClient(url, privateKey);