'use client';

import { useState, type PointerEvent } from 'react';
import { Clock, RefreshCw } from 'lucide-react';
import { MathText } from '@/components/math/MathText';
import type { StudyCard } from '@/lib/cards/content';
import { CardArt, CardOrbit } from './CardArt';
import styles from './collectible.module.css';

export type CollectibleCardLabels = {
  /** aria-label невидимой кнопки поверх карты */
  flip: string;
  answer: string;
  flipHint: string;
  /** описание иллюстрации для скринридеров */
  art: string;
  /** «ЕНТ» в подвале карты */
  exam: string;
};

type Tilt = { rx: number; ry: number; gx: number; gy: number };
const REST: Tilt = { rx: 0, ry: 0, gx: 50, gy: 30 };

/**
 * Коллекционная карта: наклоняется за мышкой, переворачивается по клику,
 * радужный блик едет за курсором. Только внешний вид — вся логика у родителя.
 */
export function CollectibleCard({
  card,
  number,
  total,
  title,
  kicker,
  flipped,
  onFlip,
  labels,
}: {
  card: StudyCard;
  number: number;
  total: number;
  title: string;
  kicker: string;
  flipped: boolean;
  onFlip: () => void;
  labels: CollectibleCardLabels;
}) {
  const [tilt, setTilt] = useState<Tilt>(REST);

  const onMove = (e: PointerEvent<HTMLButtonElement>) => {
    if (e.pointerType === 'touch') return;
    const r = e.currentTarget.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    setTilt({ rx: (0.5 - py) * 22, ry: (px - 0.5) * 26, gx: px * 100, gy: py * 100 });
  };

  const holoPos = `${Math.round(tilt.gx)}% ${Math.round(tilt.gy)}%`;
  const glare = `radial-gradient(circle at ${Math.round(tilt.gx)}% ${Math.round(tilt.gy)}%, rgb(255 255 255 / 0.2), rgb(255 255 255 / 0) 50%)`;

  return (
    <div className={styles.root}>
      <div className={styles.scene}>
        <div className={styles.shadow} aria-hidden="true" />
        <div className={styles.float}>
          <div className={styles.tilt} style={{ transform: `rotateX(${tilt.rx.toFixed(1)}deg) rotateY(${tilt.ry.toFixed(1)}deg)` }}>
            <div className={styles.flipper} style={{ transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)' }}>
              {/* лицо: вопрос */}
              <div className={styles.face} aria-hidden={flipped}>
                <div className={styles.inner}>
                  <div className={styles.head}>
                    <span className={styles.title}>{title}</span>
                    <span className={styles.badge}>{number}</span>
                  </div>
                  <div className={styles.art}>
                    <CardArt art={card.art} label={labels.art} />
                    <div className={styles.holo} style={{ backgroundPosition: holoPos }} />
                  </div>
                  <div className={styles.strip}>
                    <span>{kicker}</span>
                    <span>
                      {number} / {total}
                    </span>
                  </div>
                  <div className={styles.question}>
                    <MathText text={card.front} />
                  </div>
                  <div className={styles.foot}>
                    <span>
                      <RefreshCw style={{ width: '1em', height: '1em' }} aria-hidden="true" />
                      {labels.flipHint}
                    </span>
                    <span>
                      <Clock style={{ width: '1em', height: '1em' }} aria-hidden="true" />
                      {labels.exam}
                    </span>
                  </div>
                  <div className={styles.glare} style={{ background: glare }} />
                </div>
              </div>

              {/* оборот: ответ */}
              <div className={`${styles.face} ${styles.back}`} aria-hidden={!flipped}>
                <div className={styles.inner}>
                  <div className={styles.orbit}>
                    <CardOrbit />
                  </div>
                  <div className={styles.head}>
                    <span className={styles.label}>{labels.answer}</span>
                    <span className={styles.badge}>{number}</span>
                  </div>
                  <div className={styles.answer}>
                    <MathText text={card.back} />
                  </div>
                  <div className={styles.holo} style={{ backgroundPosition: holoPos, opacity: 0.28 }} />
                </div>
              </div>
            </div>
          </div>
        </div>
        <button
          type="button"
          data-sound="off"
          className={styles.hit}
          aria-label={labels.flip}
          aria-pressed={flipped}
          onClick={onFlip}
          onPointerMove={onMove}
          onPointerLeave={() => setTilt(REST)}
        />
      </div>
    </div>
  );
}
