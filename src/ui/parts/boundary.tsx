/**
 * Перехват ошибок отрисовки.
 *
 * Без него исключение в любом компоненте оставляет пустую белую панель:
 * плагин выглядит сломанным намертво, и пользователю нечего сделать,
 * кроме как закрыть его. Здесь он хотя бы видит, что случилось, и может
 * вернуться к началу.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Icon } from './icon';

interface Props {
  readonly children: ReactNode;
  readonly onReset: () => void;
}

interface State {
  readonly message: string | null;
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { message: null };

  static getDerivedStateFromError(error: unknown): State {
    return { message: error instanceof Error ? error.message : String(error) };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // Консоль плагина — единственное место, где это можно потом прочитать.
    console.error('Ошибка отрисовки отчёта', error, info.componentStack);
  }

  override render(): ReactNode {
    if (this.state.message === null) return this.props.children;

    return (
      <div className="flex h-screen flex-col items-center justify-center bg-canvas px-6 text-center">
        <div className="w-full max-w-xs rounded-card bg-surface p-5">
          <span
            className="mx-auto mb-3 block w-fit text-status-ink"
            data-box-control=""
            data-status="negative"
          >
            <Icon name="danger-triangle" size="xs" />
          </span>
          <p className="text-body-l font-medium">Отчёт не отрисовался</p>
          <p className="mt-2 text-caption-l leading-relaxed text-ink-faint">{this.state.message}</p>
          <button
            className="mt-4 rounded-pill bg-accent px-4 py-2 text-body-m font-medium text-accent-on"
            onClick={() => {
              this.setState({ message: null });
              this.props.onReset();
            }}
          >
            Начать заново
          </button>
        </div>
      </div>
    );
  }
}
