export type Role = "viewer" | "scanner" | "admin";

export type AllowedUser = {
  email: string;
  role: Role;
  invited_at: string;
};

export type Book = {
  id: string;
  isbn: string | null;
  title: string;
  author: string | null;
  cover_url: string | null;
  thumbnail_url: string | null;
  category: string | null;
  total_copies: number;
  created_at: string;
};

export type Claim = {
  id: string;
  book_id: string;
  user_email: string;
  note: string | null;
  claimed_at: string;
};

export type BookWithClaims = Book & {
  claims: Claim[];
};
