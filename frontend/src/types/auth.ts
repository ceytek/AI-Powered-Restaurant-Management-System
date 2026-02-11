export interface LoginRequest {
  company_code: string;
  email: string;
  password: string;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export interface UserResponse {
  id: string;
  company_id: string;
  email: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
  roles: string[];
  permissions: string[];
}

export interface CompanyResponse {
  id: string;
  code: string;
  name: string;
  logo_url: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  is_active: boolean;
  created_at: string;
}

export interface LoginResponse {
  user: UserResponse;
  company: CompanyResponse;
  tokens: TokenResponse;
}
