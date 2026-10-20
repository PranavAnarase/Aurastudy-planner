/**
 * AuraStudy Centralized API Configuration - Version 1
 * Standard namespace: /api/v1/aurastudy
 */

export const API_BASE_URL: string =
  (import.meta as any).env?.VITE_API_BASE_URL || 'http://127.0.0.1:8001';

export const AURASTUDY_V1_PREFIX: string = `${API_BASE_URL}/api/v1/aurastudy`;
