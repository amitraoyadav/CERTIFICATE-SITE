import { handleApiRequest } from './_handlers.ts';

/**
 * Primary Vercel Serverless Function Entry Point.
 * Dispatches all API requests through the consolidated handler.
 */
export default async function handler(req: any, res: any) {
  return handleApiRequest(req, res);
}
