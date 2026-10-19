/**
 * Иконка Box UI.
 *
 * Повторяет контракт `<Icon>` из `@box-ui/icons`: геометрия 24×24 красится
 * `currentColor`, размер — токен `size/base/*`, без `title` иконка скрыта от
 * экранного диктора. Разница одна: геометрия не грузится динамически, а
 * вшита — однофайловая сборка Figma не умеет догружать чанки, поэтому здесь
 * только иконки из src/ui/icons.ts.
 */
import type { SVGProps } from 'react';
import type { IconName } from '../icons';
import bodies from '../vendor/box-ui/icons.json';

/** Токены `size/base/*` Box UI. Самый мелкий — 16px. */
export type IconSize = 'min' | '2xs' | 'xs' | 's' | 'm';

const BODIES: Readonly<Record<string, string>> = bodies;

export function Icon({
  name,
  size = 'min',
  title,
  style,
  ...rest
}: Omit<SVGProps<SVGSVGElement>, 'name'> & {
  name: IconName;
  size?: IconSize;
  title?: string;
}): JSX.Element {
  const box = `var(--size-${size})`;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={box}
      height={box}
      role={title === undefined ? undefined : 'img'}
      aria-label={title}
      aria-hidden={title === undefined ? true : undefined}
      focusable="false"
      data-icon={name}
      style={{ display: 'block', flex: 'none', width: box, height: box, ...style }}
      // Геометрия — из вендорной копии Box UI, не из пользовательского ввода.
      dangerouslySetInnerHTML={{ __html: BODIES[name] ?? '' }}
      {...rest}
    />
  );
}
