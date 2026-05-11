// Сгенерируется командой:
//   npx supabase gen types typescript --project-id <id> > types/db.ts
// после миграций на Шаге 2.

export type Database = {
  public: {
    Tables: Record<string, never>;
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
};
