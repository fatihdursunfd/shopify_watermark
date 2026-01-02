export type Language = 'en' | 'tr' | 'es' | 'fr' | 'de' | 'pt' | 'it';

export interface AuthStatus {
  authenticated: boolean;
  shop?: string;
}

// Add generic app types here
export interface Plan {
  key: string;
  name: string;
  price: number;
  features: string[];
}