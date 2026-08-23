import { useEffect, useState } from 'react';
import type { MainMessage, UiMessage } from '../shared/messages';

/** В ui/ нет доступа к `figma.*` — только сообщения через parent.postMessage. */
function send(message: UiMessage): void {
  parent.postMessage({ pluginMessage: message }, '*');
}

export function App(): JSX.Element {
  const [fileName, setFileName] = useState<string | null>(null);

  useEffect(() => {
    function onMessage(event: MessageEvent<{ pluginMessage?: MainMessage }>): void {
      const message = event.data.pluginMessage;
      if (message === undefined) return;
      if (message.type === 'main/booted') setFileName(message.fileName);
    }
    window.addEventListener('message', onMessage);
    send({ type: 'ui/ready' });
    return () => {
      window.removeEventListener('message', onMessage);
    };
  }, []);

  return (
    <main className="p-4 text-sm">
      <h1 className="font-medium">Design System Auditor</h1>
      <p className="mt-2 text-neutral-500">
        {fileName === null ? 'Подключение…' : `Файл: ${fileName}`}
      </p>
      <p className="mt-4 text-neutral-500">
        Правила не подключены. Следующий шаг — блок A аудита (валидация сигнала).
      </p>
    </main>
  );
}
