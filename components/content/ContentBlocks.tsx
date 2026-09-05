'use client';

import { MathText } from '@/components/math/MathText';
import { normalizeExplanationBlocks } from '@/lib/explanation';

export function ContentBlocks({ blocks }: { blocks: unknown }) {
  const content = normalizeExplanationBlocks({ blocks });

  return (
    <div className="space-y-3">
      {content.map((block, index) => {
        if (block.type === 'table') {
          return (
            <div key={index} className="overflow-x-auto rounded-lg border">
              <table className="min-w-full border-collapse text-sm">
                <thead className="bg-muted/60 text-left">
                  <tr>
                    {block.columns.map((column, columnIndex) => (
                      <th key={columnIndex} className="border-b px-3 py-2 font-medium text-foreground">
                        <MathText text={column} />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {block.rows.map((row, rowIndex) => (
                    <tr key={rowIndex} className="border-b last:border-b-0">
                      {row.map((cell, cellIndex) => (
                        <td key={cellIndex} className="px-3 py-2 align-top">
                          <MathText text={cell} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }

        if (block.type === 'image') {
          // Dynamic assets can be Supabase Storage or a project-relative path.
          // eslint-disable-next-line @next/next/no-img-element
          return <img key={index} src={block.value} alt="Материал задания" className="max-w-full rounded-lg border" />;
        }

        return (
          <p key={index}>
            <MathText text={block.value} display={block.type === 'latex'} />
          </p>
        );
      })}
    </div>
  );
}
