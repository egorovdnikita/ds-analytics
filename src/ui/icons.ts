/**
 * Иконки плагина — единственный список.
 *
 * Иконки приходят из дизайн-системы Box UI (набор Solar, стиль linear), но
 * не целиком: один стиль весит 640 KB, а бюджет всего UI-бандла — 500 KB.
 * Скрипт `npm run sync:box-ui` читает этот список и вырезает из Box UI
 * геометрию ровно этих иконок. Новая иконка = строка здесь + пересинхронизация.
 */
export const ICON_NAMES = [
  'magnifer',
  'refresh',
  'copy',
  'close-circle',
  'danger-triangle',
  'check-circle',
  'info-circle',
  'alt-arrow-right',
  'widget',
  'palette',
  'graph-up',
  'library',
  'map-point',
  'lightbulb',
  'stop-circle',
  'play',
  'link-broken',
  'clipboard',
] as const;

export type IconName = (typeof ICON_NAMES)[number];
