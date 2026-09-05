/** One-time repair of questions quarantined on 2026-09-05. Run with --apply. */
import { getServiceClient } from './lib/db';
import { isEligibleForPublication } from './lib/content-audit';
import type { Explanation, QuestionBody, QuestionType } from '@/types/db';

type Repair = { id: string; type: QuestionType; body: QuestionBody; explanation: Explanation };
const text = (value: string): Explanation => ({ blocks: [{ type: 'text', value }] });

const repairs: Repair[] = [
  { id: '0905afa1-32ef-4b0e-89a4-69976fbc7f02', type: 'single', body: { stem: 'Если пара чисел $(x;y)$ является решением системы уравнений $\\begin{cases}3x + 4y = 11\\\\x - 2y = -5\\end{cases}$, то найдите значение выражения $(x + y)$', options: [{ id: 'a', content: '$-1$' }, { id: 'b', content: '$\\frac{14}{5}$' }, { id: 'c', content: '1' }, { id: 'd', content: '4' }], correct: 'b' }, explanation: text('Из второго уравнения $x=2y-5$. Тогда $3(2y-5)+4y=11$, откуда $10y=26$ и $y=\\frac{13}{5}$. Следовательно, $x=\\frac{1}{5}$, поэтому $x+y=\\frac{14}{5}$.') },
  { id: '400e393b-4423-4a71-ac3d-997187b9aee7', type: 'single', body: { stem: 'Что будет выведено на экран?\n\nx = 3\ny = 2\nz = 0\nwhile True:\n    x += 4\n    y *= 2\n    z = x * y\n    if y > 15:\n        break\nprint(x, y, z)', options: [{ id: 'a', content: '15 32 480' }, { id: 'b', content: '15 16 240' }, { id: 'c', content: '7 4 28' }, { id: 'd', content: '19 64 1216' }], correct: 'b' }, explanation: text('После первой итерации: $x=7$, $y=4$, $z=28$; после второй: $x=11$, $y=8$, $z=88$. На третьей итерации получаем $x=15$, $y=16$, $z=240$. Условие $y>15$ истинно, цикл завершается после этих присваиваний.') },
  { id: '644eba3d-5d0a-4503-8c01-ee0a060c3db7', type: 'single', body: { stem: 'По горизонтальной поверхности движется тело массой m = 8 кг. На тело действуют две силы: F₁ = 48 Н вправо и F₂ = 16 Н влево. Коэффициент трения между телом и поверхностью μ = 0,25. Найдите ускорение тела (g = 10 м/с²)', options: [{ id: 'a', content: '2,5 м/с²' }, { id: 'b', content: '1,5 м/с²' }, { id: 'c', content: '3,5 м/с²' }, { id: 'd', content: '4 м/с²' }], correct: 'b' }, explanation: text('Равнодействующая приложенных сил равна $48-16=32$ Н. Сила трения $F_\\text{тр}=\\mu mg=0{,}25\\cdot8\\cdot10=20$ Н. Поэтому $F=32-20=12$ Н и $a=F/m=12/8=1{,}5$ м/с².') },
  { id: '275e5cb3-3ede-45a0-b99d-7dc9db46c16c', type: 'matching', body: { stem: 'Решите уравнение $||3x - 2| - 5| = 7$.\n\nУстановите соответствие между приведенными ниже данными', left: [{ id: '1', content: 'произведение корней уравнения' }, { id: '2', content: 'сумма корней уравнения' }], right: ['$-\\frac{140}{9}$', '$\\frac{4}{3}$', '-4', '8', '10'], correct: { '1': '$-\\frac{140}{9}$', '2': '$\\frac{4}{3}$' } }, explanation: text('Пусть $t=|3x-2|$. Тогда $|t-5|=7$, откуда $t=12$; значение $t=-2$ невозможно. Поэтому $3x-2=12$ или $3x-2=-12$, то есть корни $\\frac{14}{3}$ и $-\\frac{10}{3}$. Их произведение $-\\frac{140}{9}$, сумма $\\frac{4}{3}$.') },
  { id: 'e50576df-70c7-448c-8101-87f2fe27427b', type: 'single', body: { stem: 'Высота пирамиды равна 18 см, в основании лежит ромб со стороной 14 см и острым углом 30°. Найдите объём пирамиды.', options: [{ id: 'a', content: '588 см³' }, { id: 'b', content: '1176 см³' }, { id: 'c', content: '1470 см³' }, { id: 'd', content: '1764 см³' }], correct: 'a' }, explanation: text('Площадь ромба $S=14^2\\sin30°=196\\cdot\\frac12=98$ см². Тогда объём пирамиды $V=\\frac13Sh=\\frac13\\cdot98\\cdot18=588$ см³.') },
  { id: '4afb9329-54ef-4bcb-8981-41b24cb985eb', type: 'single', body: { stem: 'Вычислите: $\\sqrt{245} + \\sqrt{80} - \\sqrt{405} + \\sqrt{125}$', options: [{ id: 'a', content: '$7\\sqrt{5}$' }, { id: 'b', content: '$0$' }, { id: 'c', content: '$2\\sqrt{5}$' }, { id: 'd', content: '$-\\sqrt{5}$' }], correct: 'a' }, explanation: text('$\\sqrt{245}=7\\sqrt5$, $\\sqrt{80}=4\\sqrt5$, $\\sqrt{405}=9\\sqrt5$, $\\sqrt{125}=5\\sqrt5$. Поэтому $(7+4-9+5)\\sqrt5=7\\sqrt5$.') },
  { id: 'f02a00c3-14d7-4960-8711-7a3e3182cb9a', type: 'single', body: { stem: 'Электродвигатель мощностью 3 кВт поднимает груз со скоростью 0,5 м/с. Масса груза 150 кг. Найдите КПД. $(g = 10\\text{ м/с}^2)$', options: [{ id: 'a', content: '25%' }, { id: 'b', content: '50%' }, { id: 'c', content: '55%' }, { id: 'd', content: '45%' }], correct: 'a' }, explanation: text('Полезная мощность $P_\\text{пол}=mgv=150\\cdot10\\cdot0{,}5=750$ Вт. Подводимая мощность равна $3000$ Вт, поэтому $\\eta=750/3000=0{,}25=25\\%$.') },
  { id: '68c92c5b-d6d5-46b3-bdfe-0de56d1cf5d3', type: 'single', body: { stem: 'Представьте произведение в виде суммы: $\\cos\\left(\\frac{\\pi}{6} + \\alpha\\right) \\cdot \\cos\\left(\\frac{\\pi}{6} - \\alpha\\right)$', options: [{ id: 'a', content: '$\\frac{1}{2}\\cos 2\\alpha + \\frac{1}{4}$' }, { id: 'b', content: '$\\frac{1}{2}\\cos 2\\alpha - \\frac{3}{8}$' }, { id: 'c', content: '$\\frac{3}{4}\\cos 2\\alpha - \\frac{1}{4}$' }, { id: 'd', content: '$\\frac{1}{2}\\sin 2\\alpha + \\frac{3}{8}$' }], correct: 'a' }, explanation: text('По формуле $\\cos A\\cos B=\\frac12[\\cos(A-B)+\\cos(A+B)]$ получаем $\\frac12[\\cos2\\alpha+\\cos\\frac\\pi3]=\\frac12\\cos2\\alpha+\\frac14$.') },
  { id: '9bbb20fd-3cae-46e1-b34f-0f39422fc6b7', type: 'matching', body: { stem: 'Числа $t_1$ и $t_2$ являются критическими точками функции $g(t) = \\frac{t^3}{3} + t^2 - 6t + 4$. Установите соответствие.', left: [{ id: '1', content: '$t_1 + t_2$' }, { id: '2', content: '$t_1^2 + t_2^2$' }, { id: '3', content: '$t_1^3 + t_2^3$' }, { id: '4', content: '$t_1 \\cdot t_2$' }], right: ['-2', '16', '-44', '-6', '40'], correct: { '1': '-2', '2': '16', '3': '-44', '4': '-6' } }, explanation: text('Критические точки удовлетворяют $g\'(t)=t^2+2t-6=0$. По Виету $t_1+t_2=-2$, $t_1t_2=-6$. Тогда $t_1^2+t_2^2=(-2)^2-2(-6)=16$, а $t_1^3+t_2^3=(-2)^3-3(-6)(-2)=-44$.') },
  { id: '8acb6e52-dda0-4578-97d5-93b15c80ec06', type: 'multi', body: { stem: 'Грузовик массой 3500 кг движется со скоростью 54 км/ч. Если сила тяги его двигателя составляет 1750 Н, то', options: [{ id: 'a', content: 'его кинетическая энергия: 312,5 кДж' }, { id: 'b', content: 'его кинетическая энергия: 393,75 кДж' }, { id: 'c', content: 'его кинетическая энергия: 525 кДж' }, { id: 'd', content: 'его кинетическая энергия: 625 кДж' }, { id: 'e', content: 'выполненная работа за 15 с: 2,0 МДж' }, { id: 'f', content: 'выполненная работа за 15 с: 0,39375 МДж' }, { id: 'g', content: 'выполненная работа за 15 с: 3,5 МДж' }, { id: 'h', content: 'выполненная работа за 15 с: 4,2 МДж' }], correct: ['b', 'f'] }, explanation: text('$54$ км/ч $=15$ м/с. Кинетическая энергия $E_k=\\frac{mv^2}{2}=\\frac{3500\\cdot15^2}{2}=393750$ Дж $=393{,}75$ кДж. За $15$ с путь $s=15\\cdot15=225$ м, работа $A=Fs=1750\\cdot225=393750$ Дж $=0{,}39375$ МДж.') },
  { id: 'd0e3718c-e835-41c9-99fb-916c287b087f', type: 'single', body: { stem: 'Какой закон описывает утверждение: «отношение излучательной способности тела к его поглощательной способности для данной длины волны и температуры одинаково для всех тел и равно излучательной способности абсолютно чёрного тела»?', options: [{ id: 'a', content: 'Закон Кирхгофа для теплового излучения' }, { id: 'b', content: 'Закон Стефана–Больцмана' }, { id: 'c', content: 'Закон смещения Вина' }, { id: 'd', content: 'Принцип суперпозиции полей' }], correct: 'a' }, explanation: text('Это закон Кирхгофа для теплового излучения: $\\frac{R_{\\lambda,T}}{a_{\\lambda,T}}=R_{\\text{ч},\\lambda,T}$.') },
];

async function main(): Promise<void> {
  for (const repair of repairs) {
    const eligibility = isEligibleForPublication(repair);
    if (!eligibility.eligible) {
      throw new Error(`Repair ${repair.id} still has audit issue: ${eligibility.reason}`);
    }
  }

  const apply = process.argv.includes('--apply');
  const verify = process.argv.includes('--verify');
  if (!apply && !verify) {
    console.log(`Dry run: ${repairs.length} repairs. Re-run with --apply to update Supabase drafts.`);
    return;
  }
  const supabase = getServiceClient();
  if (verify) {
    const { data, error } = await supabase
      .from('questions')
      .select('id, type, body, explanation, is_published')
      .in('id', repairs.map((repair) => repair.id));
    if (error || !data || data.length !== repairs.length) {
      throw new Error(`Could not read every repaired draft: ${error?.message ?? 'unexpected row count'}`);
    }
    for (const question of data) {
      if (question.is_published) throw new Error(`Repaired question ${question.id} was unexpectedly published`);
      const eligibility = isEligibleForPublication({
        type: question.type,
        body: question.body as QuestionBody,
        explanation: question.explanation as Explanation,
      });
      if (!eligibility.eligible) throw new Error(`Repaired question ${question.id} failed audit: ${eligibility.reason}`);
    }
    console.log(`Verified ${data.length} repaired unpublished questions: no publication-blocking audit issues.`);
    return;
  }
  for (const repair of repairs) {
    const { data: current, error: currentError } = await supabase
      .from('questions')
      .select('id, is_published')
      .eq('id', repair.id)
      .maybeSingle();
    if (currentError || !current || current.is_published) {
      throw new Error(`Refusing to repair ${repair.id}: it must exist and remain unpublished`);
    }
    const { error } = await supabase
      .from('questions')
      .update({ type: repair.type, body: repair.body, explanation: repair.explanation })
      .eq('id', repair.id);
    if (error) throw new Error(`Repair failed for ${repair.id}: ${error.message}`);
  }
  console.log(`Repaired ${repairs.length} unpublished questions.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
