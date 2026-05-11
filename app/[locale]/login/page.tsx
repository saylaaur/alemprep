import { useTranslations } from 'next-intl';
import { signInWithGoogle } from '@/lib/supabase/auth-actions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { GraduationCap } from 'lucide-react';

export default function LoginPage() {
  const tAuth = useTranslations('auth');
  const tBrand = useTranslations('brand');

  async function action() {
    'use server';
    await signInWithGoogle('/dashboard');
  }

  return (
    <main className="grid min-h-dvh place-items-center px-6">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <div className="grid h-10 w-10 place-items-center rounded-md bg-primary text-primary-foreground">
            <GraduationCap className="h-6 w-6" />
          </div>
          <CardTitle className="mt-3 text-xl">{tBrand('name')}</CardTitle>
          <CardDescription>{tAuth('signInDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={action}>
            <Button type="submit" className="w-full" size="lg">
              {tAuth('signInWithGoogle')}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
