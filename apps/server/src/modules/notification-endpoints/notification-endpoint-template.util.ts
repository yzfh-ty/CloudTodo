export type NotificationDeliveryKind = 'wecom_robot' | 'standard_webhook';

export function inferNotificationDeliveryKind(targetUrl: string): NotificationDeliveryKind {
  return targetUrl.includes('weixin.qq.com/cgi-bin/webhook/send')
    ? 'wecom_robot'
    : 'standard_webhook';
}

export function defaultPayloadTemplate(kind: NotificationDeliveryKind): string {
  if (kind === 'wecom_robot') {
    return JSON.stringify(
      {
        msgtype: 'text',
        text: {
          content: [
            'CloudTodo 提醒通知',
            '任务：{{todo_title}}',
            '状态：{{todo_status}}',
            '优先级：{{todo_priority}}',
            '提醒时间：{{scheduled_for}}',
            '触发时间：{{triggered_at}}',
            '补充信息：{{payload_text}}',
          ].join('\n'),
        },
      },
      null,
      2,
    );
  }

  return JSON.stringify(
    {
      source: 'cloudtodo',
      endpoint_id: '{{endpoint_id}}',
      endpoint_name: '{{endpoint_name}}',
      delivery_id: '{{delivery_id}}',
      reminder_event_id: '{{reminder_event_id}}',
      channel: '{{channel}}',
      scheduled_for: '{{scheduled_for}}',
      triggered_at: '{{triggered_at}}',
      user: {
        id: '{{user_id}}',
        timezone: '{{user_timezone}}',
      },
      payload: '{{payload_json}}',
    },
      null,
      2,
    ).replace('"{{payload_json}}"', '{{payload_json}}');
}

export function renderPayloadTemplate(
  template: string,
  variables: Record<string, unknown>,
): string {
  return template.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (_, key: string) => {
    const value = variables[key];

    if (key.endsWith('_json')) {
      return JSON.stringify(value ?? null);
    }

    if (key.endsWith('_text')) {
      return stringifyTextValue(value);
    }

    return escapeJsonString(stringifyTextValue(value));
  });
}

function stringifyTextValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'string') {
    return value;
  }

  return JSON.stringify(value);
}

function escapeJsonString(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
}
